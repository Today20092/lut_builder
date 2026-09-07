"""Loopback-only browser workspace for LUT Builder."""

import base64
from collections import deque
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import secrets
import socket
import threading
import time
from urllib.parse import parse_qs, unquote, urlsplit
import webbrowser

from .colors import TAILWIND_COLORS
from .data import PROFILE_CATALOG, oklch_to_hex
from .engine import serialize_lut
from .presets import WIDTH_PRESETS, suggest_color_for_stop
from .setup import LutSetup, exposure_preview
from .video import MAX_UPLOAD, VideoStore
from .verification import (
    MAX_SOURCE_BYTES,
    VerificationResult,
    decode_still,
    display_png,
    verify_rgb,
)


STATIC_ROOT = Path(__file__).with_name("static")
UPLOAD_TIMEOUT_SECONDS = 30
STANDARD_STOP_WIDTH = next(
    preset["width"]
    for preset in WIDTH_PRESETS
    if preset["label"].startswith("Standard")
)
DEFAULT_SETUP = {
    "profile": "Sony S-Log3",
    "target": "Rec.709",
    "cube_size": 65,
    "bands": [
        {
            "stop": 0.0,
            "color": suggest_color_for_stop(0)[2],
            "width": STANDARD_STOP_WIDTH,
        }
    ],
    "band_mode": "stops",
    "fill_mode": False,
    "low_signal_warning": False,
    "low_signal_hex": suggest_color_for_stop(-99)[2],
    "high_signal_warning": False,
    "high_signal_hex": suggest_color_for_stop(99)[2],
    "monochrome": True,
    "legal_range": False,
    "output": "SonySLog3_Rec709.cube",
}
CATALOG = {
    "profiles": list(PROFILE_CATALOG.source_names()),
    "source_interpretations": {
        name: {
            "transfer": PROFILE_CATALOG.source(name).log,
            "gamut": PROFILE_CATALOG.source(name).gamut,
        }
        for name in PROFILE_CATALOG.source_names()
    },
    "targets": list(PROFILE_CATALOG.target_names()),
    "palette": [
        {"name": f"{family}-{shade}", "hex": oklch_to_hex(*oklch)}
        for family, shades in TAILWIND_COLORS.items()
        for shade, oklch in shades.items()
    ],
}
LEGACY_FIELDS = {
    "black_clip": "low_signal_warning",
    "black_hex": "low_signal_hex",
    "white_clip": "high_signal_warning",
    "white_hex": "high_signal_hex",
}
CONFIG_FIELDS = {*DEFAULT_SETUP, *LEGACY_FIELDS, "version"}


def safe_output_name(value: object) -> str:
    basename = (
        str(value or DEFAULT_SETUP["output"]).replace("\\", "/").rsplit("/", 1)[-1]
    )
    stem = basename.rsplit(".", 1)[0]
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_-") or "lut"
    return f"{stem}.cube"


def _setup_from_payload(payload: dict) -> LutSetup:
    unsupported = payload.keys() - CONFIG_FIELDS
    if unsupported:
        raise ValueError(f"Unsupported fields: {', '.join(sorted(unsupported))}")
    if payload.get("version", 1) != 1:
        raise ValueError("Only version-1 configurations are supported")
    config = {**DEFAULT_SETUP, **payload}
    for legacy, current in LEGACY_FIELDS.items():
        if legacy in payload and current not in payload:
            config[current] = payload[legacy]
    return LutSetup.from_config(config)


def _preview_payload(payload: dict) -> dict:
    setup = _setup_from_payload(payload)
    profile = PROFILE_CATALOG.source(setup.profile_name)
    preview = exposure_preview(setup)
    preview["setup"] = setup.to_config()
    preview["legend"] = []
    if setup.low_signal_warning:
        preview["legend"].append(
            {
                "kind": "low",
                "color": setup.low_signal_hex,
                "label": f"Low encoded signal ≤ {profile.encoded_signal_floor:.3f}",
            }
        )
    for band in setup.bands:
        unit = "IRE" if setup.band_mode == "ire" else "stops"
        suffix = "fill zone" if setup.fill_mode else f"±{band['width']:g} {unit}"
        preview["legend"].append(
            {
                "kind": "band",
                "color": band["color"],
                "label": f"{band['stop']:g} {unit} · {suffix}",
            }
        )
    if setup.high_signal_warning:
        preview["legend"].append(
            {
                "kind": "high",
                "color": setup.high_signal_hex,
                "label": f"High encoded signal ≥ {profile.encoded_signal_ceiling:.3f}",
            }
        )
    preview["warnings"] = []
    if not setup.bands:
        preview["warnings"].append("No exposure bands are configured.")
    if setup.fill_mode and (
        setup.monochrome or any(band["width"] for band in setup.bands)
    ):
        preview["warnings"].append("Fill mode ignores band widths and monochrome.")
    return preview


def _generate_download(payload: dict) -> tuple[bytes, str]:
    setup = _setup_from_payload(payload)
    filename = safe_output_name(setup.output_filename)
    return serialize_lut(setup), filename


class VerificationSession:
    """One bounded job/result per local workspace, shared by request handlers."""

    def __init__(self):
        self.busy = threading.Lock()
        self.lock = threading.Lock()
        self.cancelled: deque[str] = deque(maxlen=32)
        self.result: tuple[str, VerificationResult] | None = None
        self.video_source = None

    def cancel(self, request_id: str) -> None:
        with self.lock:
            self.cancelled.append(request_id)
            if self.result and self.result[0] == request_id:
                self.result = None
                self.video_source = None

    def get(self, request_id: str) -> VerificationResult:
        with self.lock:
            if self.result is None or self.result[0] != request_id:
                raise ValueError(
                    "Verification expired or was cancelled. Verify the current source and settings again."
                )
            if self.video_source:
                session, frame = self.video_source
                session.check()
                if session.selected is None or session.selected["frame"] != frame:
                    self.result = None
                    raise ValueError("Selected video frame changed. Verify again.")
            return self.result[1]

    def verify_video(self, payload, request_id, videos):
        with self.lock:
            self.result = None
            self.video_source = None
        interpretation = payload.get("interpretation")
        if not isinstance(interpretation, dict) or not isinstance(
            payload.get("setup"), dict
        ):
            raise ValueError("Verification needs interpretation and setup objects.")
        session = videos.get(payload.get("source_id"))
        name = payload.get("name", "Selected video")
        if not isinstance(name, str) or not 0 < len(name) <= 255:
            raise ValueError("Choose a video with a name of 1 to 255 characters.")

        def check_cancelled():
            session.check()
            with self.lock:
                if request_id in self.cancelled:
                    raise ValueError("Verification cancelled.")

        with session.operation():
            check_cancelled()
            if (
                session.selected is None
                or payload.get("frame") != session.selected["frame"]
            ):
                raise ValueError(
                    "Selected video frame changed. Select and verify again."
                )
            rgb, conversion = session.decode_confirmed(interpretation, check_cancelled)
            resolved = {**interpretation, "decoding": conversion}
            result = verify_rgb(
                rgb,
                _setup_from_payload(payload["setup"]),
                resolved,
                check_cancelled=check_cancelled,
            )
            result.provenance["source"] = {
                "name": name,
                **session.selected["source"],
                "frame": session.selected["frame"],
                "facts": session.selected["facts"],
                "tools": session.versions,
                "stream_index": session.stream["index"],
                "storage": "native planar YCbCr to float32 RGB",
                "decoding": conversion,
                "range_conversion_applied": True,
            }
            session.invalidate_verification = lambda: self.cancel(request_id)
            return self.publish(
                result, request_id, (session, session.selected["frame"])
            )

    def verify(self, payload: dict, request_id: str) -> dict:
        def check_cancelled():
            with self.lock:
                if request_id in self.cancelled:
                    raise ValueError("Verification cancelled.")

        with self.lock:
            self.result = None
            self.video_source = None
        check_cancelled()
        source = payload.get("source")
        interpretation = payload.get("interpretation")
        config = payload.get("setup")
        if (
            not isinstance(source, dict)
            or not isinstance(interpretation, dict)
            or not isinstance(config, dict)
        ):
            raise ValueError(
                "Verification needs source, interpretation and setup objects."
            )
        name, encoded = source.get("name"), source.get("data")
        if (
            not isinstance(name, str)
            or not 0 < len(name) <= 255
            or not isinstance(encoded, str)
        ):
            raise ValueError("Choose a named RGB PNG or PFM still.")
        if len(encoded) > ((MAX_SOURCE_BYTES + 2) // 3) * 4:
            raise ValueError("Still file exceeds the 48 MiB limit.")
        try:
            data = base64.b64decode(encoded, validate=True)
        except ValueError as error:
            raise ValueError(
                "Could not read the uploaded still. Select the file again."
            ) from error
        rgb, facts = decode_still(data)
        check_cancelled()
        # PFM/PNG already contain RGB. A caller cannot request a second range/matrix conversion.
        if interpretation.get("decoding") != "RGB; no color transform or range scaling":
            raise ValueError(
                "For stills, confirm RGB with no color transform or range scaling."
            )
        setup = _setup_from_payload(config)
        result = verify_rgb(rgb, setup, interpretation, check_cancelled=check_cancelled)
        result.provenance["source"] = {
            "name": name,
            "sha256": hashlib.sha256(data).hexdigest(),
            "width": rgb.shape[1],
            "height": rgb.shape[0],
            **facts,
        }
        return self.publish(result, request_id)

    def publish(self, result, request_id, video_source=None):
        image = (
            "data:image/png;base64,"
            + base64.b64encode(display_png(result.display_rgb)).decode()
        )
        with self.lock:
            if request_id in self.cancelled:
                raise ValueError("Verification cancelled.")
            if video_source:
                video_source[0].check()
            self.result = request_id, result
            self.video_source = video_source
        return {
            "request_id": request_id,
            "width": result.source_rgb.shape[1],
            "height": result.source_rgb.shape[0],
            "image": image,
            "provenance": result.provenance,
        }


class WorkspaceHandler(BaseHTTPRequestHandler):
    token = ""
    videos: VideoStore
    verification: VerificationSession

    def do_GET(self) -> None:
        request_path = unquote(urlsplit(self.path).path)
        if request_path == "/":
            page = STATIC_ROOT.joinpath("index.html").read_text(encoding="utf-8")
            body = (
                page.replace("__TOKEN__", json.dumps(self.token))
                .replace("__SETUP__", json.dumps(DEFAULT_SETUP))
                .replace("__CATALOG__", json.dumps(CATALOG))
                .encode()
            )
            self._send(200, body, "text/html; charset=utf-8")
            return
        if not request_path.startswith("/assets/"):
            self.send_error(404)
            return

        asset = (STATIC_ROOT / request_path.lstrip("/")).resolve()
        if not asset.is_relative_to(STATIC_ROOT.resolve()) or not asset.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        self._send(200, asset.read_bytes(), content_type)

    def do_POST(self) -> None:
        if urlsplit(self.path).path.startswith("/video/"):
            self._video_request()
            return
        if self.path in {"/verify", "/verify-video"}:
            self.connection.settimeout(UPLOAD_TIMEOUT_SECONDS)
        # Acquire before reading a large upload, so only one source is resident.
        acquired = self.path in {
            "/verify",
            "/verify-video",
        } and self.verification.busy.acquire(blocking=False)
        if self.path in {"/verify", "/verify-video"} and not acquired:
            self._send_json(
                409,
                {
                    "error": "Verification is busy. Cancel the current check or retry shortly."
                },
            )
            return
        try:
            self._handle_post()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Browser cancellation/disconnection; temporary files are scoped to the job.
        finally:
            if acquired:
                self.verification.busy.release()

    def _handle_post(self) -> None:
        if self.path not in {
            "/preview",
            "/generate",
            "/verify",
            "/verify-video",
            "/verify-pixel",
            "/verify-cube",
            "/verify-cancel",
        }:
            self.send_error(404)
            return
        if self.headers.get_content_type() != "application/json":
            self._send_json(415, {"error": "Content-Type must be application/json"})
            return
        supplied_token = self.headers.get("X-LUT-Builder-Token", "")
        if not secrets.compare_digest(supplied_token, self.token):
            self._send_json(403, {"error": "Invalid launch token"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            maximum = (
                ((MAX_SOURCE_BYTES + 2) // 3) * 4 + 1_000_000
                if self.path == "/verify"
                else 1_000_000
            )
            if not 0 <= length <= maximum:
                raise ValueError("Request body is too large")
            if self.path in {"/verify", "/verify-video"}:
                deadline = time.monotonic() + UPLOAD_TIMEOUT_SECONDS
                body = bytearray()
                while len(body) < length:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError
                    self.connection.settimeout(remaining)
                    chunk = self.rfile.read1(min(65_536, length - len(body)))
                    if not chunk:
                        raise ValueError(
                            "Still upload ended early. Select the file again."
                        )
                    body.extend(chunk)
                self.connection.settimeout(UPLOAD_TIMEOUT_SECONDS)
                payload = json.loads(body)
            else:
                payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
            if self.path == "/preview":
                self._send_json(200, _preview_payload(payload))
                return
            if self.path.startswith("/verify"):
                request_id = payload.get("request_id")
                if not isinstance(request_id, str) or not re.fullmatch(
                    r"[A-Za-z0-9_-]{1,100}", request_id
                ):
                    raise ValueError("A unique verification request_id is required.")
                if self.path == "/verify-cancel":
                    self.verification.cancel(request_id)
                    self._send_json(200, {"request_id": request_id, "cancelled": True})
                    return
                if self.path == "/verify":
                    self._send_json(200, self.verification.verify(payload, request_id))
                    return
                if self.path == "/verify-video":
                    self._send_json(
                        200,
                        self.verification.verify_video(
                            payload, request_id, self.videos
                        ),
                    )
                    return
                result = self.verification.get(request_id)
                if self.path == "/verify-pixel":
                    x, y = payload.get("x"), payload.get("y")
                    height, width, _ = result.source_rgb.shape
                    if (
                        type(x) is not int
                        or type(y) is not int
                        or not (0 <= x < width and 0 <= y < height)
                    ):
                        raise ValueError(
                            "Pixel coordinates must be integers inside the original image, starting at 0."
                        )
                    self._send_json(
                        200,
                        {
                            "request_id": request_id,
                            "x": x,
                            "y": y,
                            "source_rgb": result.source_rgb[y, x].tolist(),
                            "output_rgb": result.output_rgb[y, x].tolist(),
                            "display_rgb": result.display_rgb[y, x].tolist(),
                        },
                    )
                    return
                cube = result.cube
                filename = safe_output_name(result.provenance["settings"]["output"])
            else:
                cube, filename = _generate_download(payload)
        except TimeoutError:
            self._send_json(
                408,
                {"error": "Still upload timed out. Select the file again and retry."},
            )
            return
        except (
            json.JSONDecodeError,
            UnicodeDecodeError,
            ValueError,
            TypeError,
            KeyError,
        ) as error:
            self._send_json(400, {"error": str(error)})
            return
        except Exception as error:
            self._send_json(500, {"error": f"LUT processing failed: {error}"})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/x-cube")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(cube)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(cube)

    def _video_request(self) -> None:
        if not secrets.compare_digest(
            self.headers.get("X-LUT-Builder-Token", ""), self.token
        ):
            self._send_json(403, {"error": "Invalid launch token"})
            return
        path = urlsplit(self.path)
        session = None
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if path.path == "/video/upload":
                if self.headers.get_content_type() != "application/octet-stream":
                    raise ValueError("Video upload requires application/octet-stream.")
                if not 0 < length <= MAX_UPLOAD:
                    raise ValueError("Choose a video up to 256 MB.")
                source_id = parse_qs(path.query).get("source_id", [""])[0]
                session = self.videos.get(source_id)
                with session.operation():
                    if session.frames:
                        raise ValueError("Start a new source before replacing a video.")
                    self.connection.settimeout(2)
                    deadline = time.monotonic() + 60
                    with (session.root / "input").open("wb") as output:
                        remaining = length
                        while remaining:
                            session.check()
                            if time.monotonic() > deadline:
                                raise ValueError("Upload exceeded the 60-second limit.")
                            data = self.rfile.read1(min(remaining, 1024 * 1024))
                            if not data:
                                raise ValueError("Video upload was interrupted.")
                            output.write(data)
                            remaining -= len(data)
                    session.probe()
                    result = session.select({"time": "0"})
            else:
                if (
                    self.headers.get_content_type() != "application/json"
                    or not 0 < length <= 4096
                ):
                    raise ValueError(
                        "Video controls require a JSON object up to 4096 bytes."
                    )
                self.connection.settimeout(2)
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("JSON body must be an object.")
                if path.path == "/video/start":
                    result = self.videos.start()
                elif path.path == "/video/cancel":
                    self.videos.cancel(payload.get("source_id"))
                    result = {"cancelled": True}
                elif path.path == "/video/frame":
                    session = self.videos.get(payload.get("source_id"))
                    with session.operation():
                        result = session.select(payload)
                else:
                    raise ValueError("Unknown video operation.")
            self._send_json(200, result)
        except (ValueError, KeyError, TypeError, ZeroDivisionError, OSError) as error:
            if session and path.path == "/video/upload":
                session.cancel()
            self._send_json(400, {"error": str(error)})
        except Exception:
            if session:
                session.cancel()
            self._send_json(
                500, {"error": "Video processing failed. Choose the source again."}
            )

    def _send_json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (ConnectionError, TimeoutError):
            pass  # A cancelled browser request may disconnect before the reply.

    def log_message(self, format: str, *args: object) -> None:
        return


class WorkspaceServer(ThreadingHTTPServer):
    videos: VideoStore
    # Windows address reuse can let two listeners bind the same origin.
    allow_reuse_address = not hasattr(socket, "SO_EXCLUSIVEADDRUSE")
    allow_reuse_port = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def server_close(self):
        if hasattr(self, "videos"):
            self.videos.close()
        super().server_close()


WORKSPACE_PORT = 8765


def create_server(port: int = 0) -> tuple[WorkspaceServer, str, str]:
    token = secrets.token_urlsafe(32)
    handler = type(
        "LaunchHandler",
        (WorkspaceHandler,),
        {"token": token, "verification": VerificationSession()},
    )
    server = WorkspaceServer(("127.0.0.1", port), handler)
    handler.videos = VideoStore()
    server.videos = handler.videos
    server.daemon_threads = True
    url = f"http://127.0.0.1:{server.server_port}/"
    return server, url, token


def launch_workspace() -> None:
    try:
        server, url, _ = create_server(port=WORKSPACE_PORT)
    except OSError as error:
        raise SystemExit(
            f"Cannot open http://127.0.0.1:{WORKSPACE_PORT}/: {error}. "
            "Close the other workspace or application using this port and retry. "
            "The port stays fixed so saved browser palettes remain available."
        ) from None
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"LUT Builder is running locally at {url}")
    print("Press Enter or Ctrl+C to stop it.")
    webbrowser.open(url)
    try:
        input()
    except (KeyboardInterrupt, EOFError):
        print()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
        print("LUT Builder stopped.")
