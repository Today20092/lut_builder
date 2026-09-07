"""Bounded, cancellable local frame extraction. No LUT processing lives here."""

import base64
from contextlib import contextmanager
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import secrets
import re
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import zlib

import numpy as np

MAX_UPLOAD = 256 * 1024 * 1024
MAX_SECONDS = 120
MAX_FRAMES = 10_000
COMMAND_SECONDS = 60
IDLE_SECONDS = 15 * 60
PIXELS = {"yuv420p": (8, 1.5), "yuv420p10le": (10, 3), "yuv422p10le": (10, 4)}
FACT_FIELDS = (
    "codec_name",
    "profile",
    "width",
    "height",
    "pix_fmt",
    "bits_per_raw_sample",
    "color_range",
    "color_space",
    "color_transfer",
    "color_primaries",
    "chroma_location",
    "sample_aspect_ratio",
    "field_order",
    "tags",
    "side_data_list",
)


def png(rgb: np.ndarray) -> bytes:
    """Encode the clipped 8-bit illustration, never the retained source."""
    height, width, _ = rgb.shape
    pixels = np.round(np.clip(rgb, 0, 1) * 255).astype(np.uint8)

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    rows = b"".join(b"\0" + row.tobytes() for row in pixels)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"sRGB", b"\0")
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


class VideoSession:
    def __init__(self):
        self.id = secrets.token_urlsafe(24)
        self.directory = tempfile.TemporaryDirectory(prefix="lut-builder-video-")
        self.root = Path(self.directory.name)
        self.cancelled = threading.Event()
        self.lock = threading.Lock()
        self.touched = time.monotonic()
        self.stream = {}
        self.frames = []
        self.time_base = Fraction(1)
        self.selected = None
        self.versions = {}
        self.container = {}
        self.invalidate_verification = lambda: None

    def check(self):
        if self.cancelled.is_set():
            raise ValueError("Video operation cancelled. Choose the video again.")

    @contextmanager
    def operation(self):
        if not self.lock.acquire(blocking=False):
            raise ValueError("A video operation is already running. Cancel it or wait.")
        try:
            self.check()
            self.touched = time.monotonic()
            yield
            self.check()
        finally:
            self.touched = time.monotonic()
            if self.cancelled.is_set():
                self.directory.cleanup()
            self.lock.release()

    def cancel(self):
        self.cancelled.set()
        self.invalidate_verification()
        # Active work checks cancellation and owns cleanup until it exits.
        if self.lock.acquire(blocking=False):
            try:
                self.directory.cleanup()
            finally:
                self.lock.release()

    def run(self, tool, args, *, limit=16 * 1024 * 1024, check_cancelled=lambda: None):
        self.check()
        executable = shutil.which(tool)
        if not executable:
            raise ValueError(
                f"{tool} is missing. Install FFmpeg with FFprobe and zscale, then try again."
            )
        output = self.root / "command.out"
        errors = self.root / "command.err"
        with output.open("wb") as stdout, errors.open("wb") as stderr:
            try:
                process = subprocess.Popen(
                    [executable, "-v", "error", "-max_alloc", "67108864", *args],
                    stdin=subprocess.DEVNULL,
                    stdout=stdout,
                    stderr=stderr,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except OSError as error:
                raise ValueError(f"Could not start {tool}.") from error
            deadline = time.monotonic() + COMMAND_SECONDS
            try:
                while True:
                    self.check()
                    check_cancelled()
                    if time.monotonic() > deadline:
                        raise ValueError(
                            f"{tool} exceeded the {COMMAND_SECONDS}-second processing limit."
                        )
                    if (
                        output.stat().st_size > limit
                        or errors.stat().st_size > 1024 * 1024
                    ):
                        raise ValueError("Video exceeds the decoded-data limit.")
                    if process.poll() is not None:
                        break
                    self.cancelled.wait(0.05)
            finally:
                try:
                    if process.poll() is None and os.name == "nt":
                        # Chocolatey executables can be launchers. Kill the decoder
                        # descendants too, before closing/deleting their output files.
                        subprocess.run(
                            [
                                str(
                                    Path(os.environ["SystemRoot"])
                                    / "System32"
                                    / "taskkill.exe"
                                ),
                                "/PID",
                                str(process.pid),
                                "/T",
                                "/F",
                            ],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NO_WINDOW,
                            timeout=5,
                        )
                except (OSError, subprocess.TimeoutExpired):
                    pass  # Still reap the launched process if tree termination fails.
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.wait()
        if process.returncode:
            detail = errors.read_text(errors="replace").replace(
                str(self.root), "<video>"
            )[:800]
            raise ValueError(
                f"{tool} could not decode this video. Required decoder or zscale may be unavailable. {detail}"
            )
        return output.read_bytes()

    def decode_confirmed(self, interpretation, check_cancelled):
        """Convert retained native YUV once; caller holds operation() throughout verification."""
        if self.selected is None:
            raise ValueError("Select a video frame again before verification.")
        source = self.selected["source"]
        matrix = interpretation.get("matrix")
        signal_range = interpretation.get("signal_range")
        chroma = interpretation.get("chroma_location")
        if (
            interpretation.get("confirmed") is not True
            or matrix not in {"bt709", "bt470bg", "smpte170m", "bt2020nc"}
            or signal_range not in {"limited", "full"}
            or chroma not in {"left", "center", "topleft"}
            or type(interpretation.get("bit_depth")) is not int
            or interpretation["bit_depth"] != source["precision_bits"]
        ):
            raise ValueError(
                "Confirm matrix, signal range, chroma location and the decoded component bit depth."
            )
        return self.decode_rgb(matrix, signal_range, chroma, check_cancelled)

    def decode_rgb(self, matrix, signal_range, chroma, check_cancelled=lambda: None):
        """Native planar samples to float RGB, without transfer or gamut conversion."""
        width, height = self.stream["width"], self.stream["height"]
        conversion = f"zscale=matrixin={matrix}:rangein={signal_range}:chromalin={chroma}:matrix=gbr:range=full:filter=bilinear,format=gbrpf32le"
        raw = self.run(
            "ffmpeg",
            [
                "-nostdin",
                "-threads",
                "1",
                "-filter_threads",
                "1",
                "-protocol_whitelist",
                "file",
                "-f",
                "rawvideo",
                "-pixel_format",
                self.stream["pix_fmt"],
                "-video_size",
                f"{width}x{height}",
                "-i",
                str(self.root / "source.raw"),
                "-vf",
                conversion,
                "-frames:v",
                "1",
                "-c:v",
                "rawvideo",
                "-threads",
                "1",
                "-f",
                "rawvideo",
                "pipe:1",
            ],
            limit=32 * 1024 * 1024,
            check_cancelled=check_cancelled,
        )
        if len(raw) != width * height * 12:
            raise ValueError("Decoder did not return one complete float RGB frame.")
        rgb = (
            np.frombuffer(raw, dtype="<f4")
            .reshape(3, height, width)[[2, 0, 1]]
            .transpose(1, 2, 0)
        )
        return rgb, conversion

    def probe(self):
        if not shutil.which("ffmpeg"):
            raise ValueError(
                "ffmpeg is missing. Install FFmpeg with zscale, then try again."
            )
        media = str(self.root / "input")
        for tool in ("ffmpeg", "ffprobe"):
            self.versions[tool] = (
                self.run(tool, ["-version"]).decode(errors="replace").splitlines()[0]
            )
        data = json.loads(
            self.run(
                "ffprobe",
                [
                    "-protocol_whitelist",
                    "file",
                    "-format_whitelist",
                    "mov,matroska,webm",
                    "-show_streams",
                    "-show_format",
                    "-of",
                    "json",
                    media,
                ],
            )
        )
        streams = [
            s
            for s in data.get("streams", [])
            if s.get("codec_type") == "video"
            and not s.get("disposition", {}).get("attached_pic")
        ]
        if not streams:
            raise ValueError("No supported video stream was found.")
        stream = streams[0]
        self.container = data.get("format", {})
        self.container.pop("filename", None)
        if stream.get("codec_name") not in {"h264", "hevc", "prores", "ffv1"}:
            raise ValueError("Supported codecs are H.264, HEVC, ProRes 422 and FFV1.")
        width, height = stream.get("width", 0), stream.get("height", 0)
        if not (
            0 < width <= 1920 and 0 < height <= 1080 and width % 2 == height % 2 == 0
        ):
            raise ValueError("Video must have even dimensions, at most 1920 × 1080.")
        if stream.get("pix_fmt") not in PIXELS:
            raise ValueError(
                "Supported pixels are planar 4:2:0 8/10-bit or 4:2:2 10-bit YCbCr."
            )
        if stream.get("sample_aspect_ratio", "1:1") not in {"1:1", "0:1", "N/A"}:
            raise ValueError("Only square-pixel video is supported.")
        if stream.get("field_order", "unknown") not in {"progressive", "unknown"}:
            raise ValueError("Interlaced video is unsupported.")
        if (
            any(s.get("rotation", 0) != 0 for s in stream.get("side_data_list", []))
            or stream.get("tags", {}).get("rotate", "0") != "0"
        ):
            raise ValueError("Rotated video is unsupported. Use an unrotated source.")
        duration = data.get("format", {}).get("duration")
        if duration and Fraction(duration) > MAX_SECONDS + abs(
            Fraction(stream.get("start_time", "0"))
        ):
            raise ValueError(f"Video exceeds the {MAX_SECONDS}-second duration limit.")
        self.stream = stream
        self.time_base = Fraction(stream["time_base"])
        if self.time_base <= 0:
            raise ValueError("Video has an invalid time base.")
        frame_data = json.loads(
            self.run(
                "ffprobe",
                [
                    "-threads",
                    "2",
                    "-protocol_whitelist",
                    "file",
                    "-format_whitelist",
                    "mov,matroska,webm",
                    "-select_streams",
                    str(stream["index"]),
                    "-show_frames",
                    "-show_entries",
                    "frame=pts,width,height,pix_fmt,interlaced_frame,color_range,color_space,color_transfer,color_primaries,chroma_location,sample_aspect_ratio:frame_side_data",
                    "-of",
                    "json",
                    media,
                ],
            )
        )
        frames = frame_data.get("frames", [])
        if not frames or len(frames) > MAX_FRAMES:
            raise ValueError(f"Video must contain 1–{MAX_FRAMES} decoded frames.")
        previous = None
        for frame in frames:
            pts = frame.get("pts")
            if not isinstance(pts, int) or (previous is not None and pts <= previous):
                raise ValueError(
                    "Video has missing or non-increasing presentation timestamps."
                )
            previous = pts
            if any(
                frame.get(k) != stream[k] for k in ("width", "height", "pix_fmt")
            ) or frame.get("interlaced_frame"):
                raise ValueError("Changing frame format or interlacing is unsupported.")
            if any(
                "DOVI" in str(s) or "HDR Dynamic" in str(s)
                for s in frame.get("side_data_list", [])
            ):
                raise ValueError("Dynamic HDR / Dolby Vision is unsupported.")
        if (frames[-1]["pts"] - frames[0]["pts"]) * self.time_base > MAX_SECONDS:
            raise ValueError(f"Video exceeds the {MAX_SECONDS}-second duration limit.")
        self.frames = frames

    def select(self, payload):
        self.invalidate_verification()
        if not self.frames:
            raise ValueError("Upload a video first.")
        if ("time" in payload) == ("index" in payload):
            raise ValueError(
                "Specify exactly one relative time or decoded-frame index."
            )
        if "index" in payload:
            index = payload["index"]
            if type(index) is not int or not 0 <= index < len(self.frames):
                raise ValueError("No adjacent frame exists at this end of the clip.")
        else:
            try:
                value = str(payload["time"])
                if not re.fullmatch(
                    r"[+-]?\d{1,12}(?:\.\d{1,12})?(?:[eE][+-]?\d{1,2}|/\d{1,12})?",
                    value,
                ):
                    raise ValueError("Invalid time")
                requested = Fraction(value)
            except (ValueError, ZeroDivisionError):
                raise ValueError(
                    "Enter a finite, nonnegative relative time in seconds."
                ) from None
            if requested < 0:
                raise ValueError("Relative time must be nonnegative.")
            index = next(
                (
                    i
                    for i, f in enumerate(self.frames)
                    if (f["pts"] - self.frames[0]["pts"]) * self.time_base >= requested
                ),
                -1,
            )
            if index < 0:
                raise ValueError(
                    "Requested time is beyond the last presentation frame."
                )
        frame = self.frames[index]
        self.selected = None
        (self.root / "selected.json").unlink(missing_ok=True)
        width, height, fmt = (self.stream[k] for k in ("width", "height", "pix_fmt"))
        native = self.run(
            "ffmpeg",
            [
                "-nostdin",
                "-threads",
                "2",
                "-filter_threads",
                "1",
                "-copyts",
                "-noautorotate",
                "-protocol_whitelist",
                "file",
                "-format_whitelist",
                "mov,matroska,webm",
                "-i",
                str(self.root / "input"),
                "-map",
                f"0:{self.stream['index']}",
                "-vf",
                f"select=eq(n\\,{index})",
                "-frames:v",
                "1",
                "-fps_mode",
                "passthrough",
                "-pix_fmt",
                "+" + fmt,
                "-c:v",
                "rawvideo",
                "-threads",
                "1",
                "-f",
                "rawvideo",
                "pipe:1",
            ],
            limit=32 * 1024 * 1024,
        )
        if len(native) != int(width * height * PIXELS[fmt][1]):
            raise ValueError("Decoder did not return one complete source frame.")
        (self.root / "source.raw").write_bytes(native)
        # Only the demonstration uses fallback decoding. Native samples retain
        # their full original precision for later confirmed matrix/range decoding.
        facts = {k: frame.get(k, self.stream.get(k)) for k in FACT_FIELDS}
        matrix = (
            facts["color_space"]
            if facts["color_space"] in {"bt709", "bt470bg", "smpte170m", "bt2020nc"}
            else "bt709"
        )
        signal_range = {"tv": "limited", "pc": "full"}.get(
            facts["color_range"], "limited"
        )
        chroma = (
            facts["chroma_location"]
            if facts["chroma_location"] in {"left", "center", "topleft"}
            else "left"
        )
        rgb, conversion = self.decode_rgb(matrix, signal_range, chroma)
        (self.root / "demonstration.gbrpf32le").write_bytes(
            rgb.transpose(2, 0, 1)[[1, 2, 0]].astype("<f4").tobytes()
        )
        if not np.isfinite(rgb).all():
            raise ValueError("Decoder returned nonfinite color samples.")
        identity = {
            "source_id": self.id,
            "index": index,
            "pts": str(frame["pts"]),
            "time_base": str(self.time_base),
            "first_pts": str(self.frames[0]["pts"]),
            "relative_time": str(
                (frame["pts"] - self.frames[0]["pts"]) * self.time_base
            ),
            "seconds": float((frame["pts"] - self.frames[0]["pts"]) * self.time_base),
            "count": len(self.frames),
        }
        self.selected = {
            "frame": identity,
            "facts": {
                "container": self.container,
                "stream": {k: self.stream.get(k) for k in FACT_FIELDS},
                "frame": {k: frame.get(k) for k in FACT_FIELDS},
            },
            "source": {
                "sha256": hashlib.sha256(native).hexdigest(),
                "pixel_format": fmt,
                "precision_bits": PIXELS[fmt][0],
                "width": width,
                "height": height,
                "file": "source.raw",
                "layout": "planar Y, Cb, Cr; little endian for 10-bit; native subsampling",
                "range_conversion_applied": False,
            },
            "provenance": {
                "tools": self.versions,
                "stream_index": self.stream["index"],
                "lut_applied": False,
                "selection": "sequential decoded ordinal; original presentation timestamps",
                "matrix": matrix,
                "range": signal_range,
                "chroma_location": chroma,
                "interpretation_confirmed": False,
                "conversion": conversion,
                "float_file": "demonstration.gbrpf32le",
                "float_layout": "planar G,B,R float32 little endian",
                "view": "Encoded RGB clipped to [0,1], quantized to 8-bit and treated as sRGB. No transfer/gamut transform. Illustration only.",
            },
        }
        (self.root / "selected.json").write_text(
            json.dumps(self.selected), encoding="utf-8"
        )
        self.check()
        return {
            **self.selected,
            "source_id": self.id,
            "display": "data:image/png;base64," + base64.b64encode(png(rgb)).decode(),
        }


class VideoStore:
    """One source per launch, including all tabs. Replacing it cancels old work."""

    def __init__(self):
        self.session = None
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.reaper = threading.Thread(target=self._expire, daemon=True)
        self.reaper.start()

    def start(self):
        with self.lock:
            if self.session:
                self.session.cancel()
                if not self.session.lock.acquire(timeout=5):
                    raise ValueError(
                        "Previous video is still stopping. Try again shortly."
                    )
                self.session.lock.release()
            self.session = VideoSession()
            return {"source_id": self.session.id}

    def get(self, source_id):
        with self.lock:
            if not self.session or source_id != self.session.id:
                raise ValueError(
                    "Video source was replaced or expired. Choose the video again."
                )
            self.session.check()
            return self.session

    def cancel(self, source_id):
        with self.lock:
            if self.session and self.session.id == source_id:
                self.session.cancel()

    def _expire(self):
        while not self.stopped.wait(30):
            with self.lock:
                if (
                    self.session
                    and time.monotonic() - self.session.touched > IDLE_SECONDS
                ):
                    self.session.cancel()

    def close(self):
        self.stopped.set()
        with self.lock:
            if self.session:
                self.session.cancel()
                if self.session.lock.acquire(timeout=5):
                    self.session.lock.release()
        self.reaper.join(timeout=5)
