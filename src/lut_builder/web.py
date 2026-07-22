"""Loopback-only browser workspace for LUT Builder."""

from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import secrets
import tempfile
import threading
from urllib.parse import unquote, urlsplit
import webbrowser

from .colors import TAILWIND_COLORS
from .data import PROFILE_CATALOG, oklch_to_hex
from .engine import generate_lut
from .presets import WIDTH_PRESETS, suggest_color_for_stop
from .setup import LutSetup, exposure_preview


STATIC_ROOT = Path(__file__).with_name("static")
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
    basename = str(value or DEFAULT_SETUP["output"]).replace("\\", "/").rsplit("/", 1)[-1]
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
    if setup.fill_mode and (setup.monochrome or any(band["width"] for band in setup.bands)):
        preview["warnings"].append("Fill mode ignores band widths and monochrome.")
    return preview


def _generate_download(payload: dict) -> tuple[bytes, str]:
    setup = _setup_from_payload(payload)
    filename = safe_output_name(setup.output_filename)
    with tempfile.TemporaryDirectory(prefix="lut-builder-") as directory:
        output = generate_lut(
            replace(setup, output_filename=str(Path(directory) / filename))
        )
        return output.read_bytes(), filename


class WorkspaceHandler(BaseHTTPRequestHandler):
    token = ""

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
        if self.path not in {"/preview", "/generate"}:
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
            if not 0 <= length <= 1_000_000:
                raise ValueError("Request body is too large")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
            if self.path == "/preview":
                self._send_json(200, _preview_payload(payload))
                return
            cube, filename = _generate_download(payload)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self._send_json(400, {"error": str(error)})
            return
        except Exception as error:
            self._send_json(500, {"error": f"LUT generation failed: {error}"})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/x-cube")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(cube)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(cube)

    def _send_json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def create_server() -> tuple[ThreadingHTTPServer, str, str]:
    token = secrets.token_urlsafe(32)
    handler = type("LaunchHandler", (WorkspaceHandler,), {"token": token})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    server.daemon_threads = True
    url = f"http://127.0.0.1:{server.server_port}/"
    return server, url, token


def launch_workspace() -> None:
    server, url, _ = create_server()
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
