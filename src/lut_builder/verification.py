"""Preserved camera RGB -> serialized cube -> separately declared SDR view."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib

import colour
import numpy as np

from .data import PROFILE_CATALOG
from .engine import serialize_lut
from .setup import LutSetup


MAX_PIXELS = 4_194_304
MAX_SOURCE_BYTES = MAX_PIXELS * 12 + 1024
SDR_TARGETS = {"Rec.709": "ITU-R BT.709", "Rec.2020": "ITU-R BT.2020"}
VIEW_POLICY = "SDR BT.1886, ideal black=0, white=1; target primaries to sRGB; display gamut clipped"
COMPARISON_UNAVAILABLE = (
    "Source comparison unavailable: no camera-to-SDR reference viewing transform "
    "is established. Raw log is not an sRGB original."
)


@dataclass
class VerificationResult:
    source_rgb: np.ndarray
    output_rgb: np.ndarray
    display_rgb: np.ndarray
    cube: bytes
    provenance: dict


def decode_still(data: bytes) -> tuple[np.ndarray, dict]:
    """Decode a narrow still contract without an input color transform."""
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError(
            "Still is too large. Limit: 4,194,304 pixels and 48 MiB plus header."
        )
    if data.startswith(b"PF\n") or data.startswith(b"PF\r\n"):
        stream = io.BytesIO(data)
        stream.readline(128)
        try:
            width, height = map(int, stream.readline(128).split())
            scale = float(stream.readline(128))
        except ValueError as error:
            raise ValueError(
                "Invalid PFM header. Use RGB PFM with scale +1 or -1."
            ) from error
        if (
            not 0 < width * height <= MAX_PIXELS
            or width <= 0
            or height <= 0
            or abs(scale) != 1
        ):
            raise ValueError(
                "PFM needs positive dimensions up to 4,194,304 pixels and scale +1 or -1."
            )
        offset = stream.tell()
        if len(data) - offset != width * height * 12:
            raise ValueError("PFM pixel data is truncated or contains extra bytes.")
        rgb = np.frombuffer(data, dtype="<f4" if scale < 0 else ">f4", offset=offset)
        rgb = rgb.reshape(height, width, 3)[::-1].astype(np.float32)
        return rgb, {
            "storage": "float32 RGB PFM",
            "byte_order": "little" if scale < 0 else "big",
            "decoding": "RGB; no color transform or range scaling",
        }
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(
            "Unsupported still. Choose untagged 16-bit RGB PNG or float32 RGB PFM; JPEG, RAW, video and 8-bit images are not camera-verification inputs."
        )
    offset = 8
    width = height = 0
    saw_end = False
    while offset < len(data):
        if len(data) - offset < 12:
            raise ValueError("Truncated PNG chunk.")
        size, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + 12 + size
        if end > len(data):
            raise ValueError("Truncated PNG data.")
        chunk = data[offset + 8 : offset + 8 + size]
        crc = struct.unpack_from(">I", data, offset + 8 + size)[0]
        if zlib.crc32(kind + chunk) != crc:
            raise ValueError("PNG checksum failed. Export the still again.")
        if kind in {b"iCCP", b"sRGB", b"gAMA", b"cHRM", b"cICP", b"mDCv", b"cLLi"}:
            raise ValueError(
                "Color-tagged PNG is unsupported. Export unchanged camera RGB without a viewing transform; do not merely remove tags from a graded image."
            )
        if kind == b"IHDR":
            if offset != 8 or size != 13:
                raise ValueError("Invalid PNG header.")
            width, height, depth, color_type, compression, filtering, interlace = (
                struct.unpack(">IIBBBBB", chunk)
            )
            if depth != 16 or color_type != 2 or compression or filtering or interlace:
                raise ValueError(
                    "Choose non-interlaced 16-bit RGB PNG without alpha. Other PNG encodings are unsupported."
                )
            if not 0 < width * height <= MAX_PIXELS:
                raise ValueError("PNG must contain 1 to 4,194,304 pixels.")
        elif not width or not height:
            raise ValueError("PNG must start with its image header.")
        if kind in {b"acTL", b"eXIf", b"tRNS"}:
            raise ValueError(
                "Animated, orientation-tagged or transparent PNG is unsupported. Export plain RGB."
            )
        if kind == b"IEND":
            saw_end = True
            if size or end != len(data):
                raise ValueError("Unexpected data after PNG end.")
        offset = end
    if not saw_end:
        raise ValueError("PNG is missing its end marker.")
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-f",
        "image2pipe",
        "-c:v",
        "png",
        "-i",
        "pipe:0",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb48le",
        "-threads",
        "1",
        "pipe:1",
    ]
    try:
        decoded = subprocess.run(
            command, input=data, capture_output=True, timeout=30, check=True
        )
    except FileNotFoundError as error:
        raise ValueError(
            "PNG decoding needs FFmpeg on PATH. Install FFmpeg, restart the workspace, or use RGB PFM."
        ) from error
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise ValueError(
            "PNG decoding failed or exceeded 30 seconds. Export a plain 16-bit RGB PNG again."
        ) from error
    if len(decoded.stdout) != width * height * 6:
        raise ValueError("PNG decoder returned unexpected dimensions or precision.")
    rgb = (
        np.frombuffer(decoded.stdout, dtype="<u2")
        .reshape(height, width, 3)
        .astype(np.float64)
        / 65535
    )
    return rgb, {
        "storage": "uint16 RGB PNG",
        "byte_order": "big in PNG; rgb48le decoded",
        "decoding": "FFmpeg PNG -> rgb48le; divide by 65535; no color transform or range scaling",
    }


def display_png(rgb: np.ndarray) -> bytes:
    """Lossless 8-bit sRGB display delivery, after numerical verification."""
    height, width, _ = rgb.shape
    pixels = np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    scanlines = b"".join(b"\0" + row.tobytes() for row in pixels)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"sRGB", b"\0")
        + chunk(b"IDAT", zlib.compress(scanlines))
        + chunk(b"IEND", b"")
    )


def sdr_view(rgb: np.ndarray, setup: LutSetup) -> np.ndarray:
    """Display-only conversion. Never modify the numerical LUT result."""
    if setup.target_name not in SDR_TARGETS:
        raise ValueError("Unsupported SDR view. Choose Rec.709 or SDR Rec.2020.")
    signal = np.asarray(rgb, dtype=np.float64)
    if setup.legal_range:
        signal = (signal - 64 / 1023) / ((940 - 64) / 1023)
    # BT.1886 with ideal black and unit white is V**2.4. No tone mapping.
    linear = colour.models.eotf_BT1886(np.clip(signal, 0, 1), L_B=0, L_W=1)
    # BT.709 and sRGB share primaries/white. Avoid approximate matrix round trips.
    if setup.target_name != "Rec.709":
        linear = colour.RGB_to_RGB(
            linear,
            colour.RGB_COLOURSPACES[SDR_TARGETS[setup.target_name]],
            colour.RGB_COLOURSPACES["ITU-R BT.709"],
        )
    return colour.cctf_encoding(np.clip(linear, 0, 1), function="sRGB")


def verify_rgb(
    rgb: np.ndarray,
    setup: LutSetup,
    interpretation: Mapping,
    *,
    check_cancelled: Callable[[], None] = lambda: None,
) -> VerificationResult:
    """Verify already-decoded floating RGB in confirmed normalized camera codes.

    Top-left H x W x RGB; float32/64, no input viewing transform. Decoders must
    resolve their own matrix/range first and describe that in ``decoding``.
    Excursions survive until the explicitly reported [0, 1] cube boundary.
    """
    profile = PROFILE_CATALOG.source(setup.profile_name)
    if interpretation.get("confirmed") is not True:
        raise ValueError(
            "Confirm unchanged camera encoding, transfer, gamut and decoding first."
        )
    if (
        interpretation.get("transfer") != profile.log
        or interpretation.get("gamut") != profile.gamut
    ):
        raise ValueError(
            "Source transfer/gamut does not match the LUT camera profile. Correct the source or LUT profile."
        )
    if interpretation.get("range") != "camera-code-values":
        raise ValueError(
            "Confirm normalized camera code values; unknown or unexpanded transport range is unsupported."
        )
    decoding = interpretation.get("decoding")
    if not isinstance(decoding, str) or not decoding.strip() or len(decoding) > 1000:
        raise ValueError(
            "Describe the confirmed RGB decoding, including any matrix and range conversion."
        )
    if setup.target_name not in SDR_TARGETS:
        raise ValueError("Unsupported SDR view. Choose Rec.709 or SDR Rec.2020.")
    if (
        not isinstance(rgb, np.ndarray)
        or rgb.dtype.kind != "f"
        or rgb.dtype.itemsize not in (4, 8)
    ):
        raise ValueError("Decoded RGB must retain float32 or float64 precision.")
    if (
        rgb.ndim != 3
        or rgb.shape[2] != 3
        or not 0 < rgb.shape[0] * rgb.shape[1] <= MAX_PIXELS
    ):
        raise ValueError(f"Choose an RGB still with 1 to {MAX_PIXELS:,} pixels.")
    if not np.isfinite(rgb).all():
        raise ValueError(
            "Source contains NaN or infinity. Export finite camera RGB samples."
        )
    settings = setup.to_config()
    settings_json = json.dumps(settings, sort_keys=True, allow_nan=False)
    check_cancelled()
    cube = serialize_lut(setup)
    check_cancelled()
    with tempfile.TemporaryDirectory(prefix="lut-check-") as directory:
        path = Path(directory) / "checked.cube"
        path.write_bytes(cube)
        lut = colour.read_LUT(str(path))
    if not isinstance(lut, colour.LUT3D) or not np.array_equal(
        lut.domain, [[0, 0, 0], [1, 1, 1]]
    ):
        raise ValueError("The exported artifact is not a supported [0, 1] 3D cube.")
    source = np.array(rgb, copy=True)
    flat = source.reshape(-1, 3)
    output = np.empty(flat.shape, dtype=np.float64)
    display = np.empty(flat.shape, dtype=np.float64)
    # ponytail: one bounded CPU job; chunking bounds interpolation scratch memory.
    for start in range(0, len(flat), 65_536):
        check_cancelled()
        stop = start + 65_536
        output[start:stop] = lut.apply(
            np.clip(flat[start:stop], 0, 1),
            interpolator=colour.algebra.table_interpolation_tetrahedral,
        )
        display[start:stop] = sdr_view(output[start:stop], setup)
    check_cancelled()
    if not np.isfinite(output).all() or not np.isfinite(display).all():
        raise ValueError(
            "Processing produced non-finite RGB. Check the source interpretation and LUT settings."
        )
    excursions = int(np.count_nonzero((source < 0) | (source > 1)))
    provenance = {
        "settings": settings,
        "settings_sha256": hashlib.sha256(settings_json.encode()).hexdigest(),
        "cube_sha256": hashlib.sha256(cube).hexdigest(),
        "cube_size": setup.cube_size,
        "interpolation": "tetrahedral",
        "interpretation": dict(interpretation),
        "input_domain": {
            "policy": "clamp at cube boundary to [0, 1]",
            "clamped_channels": excursions,
        },
        "output": {
            "target": setup.target_name,
            "transfer": PROFILE_CATALOG.target(setup.target_name).transfer,
            "gamut": SDR_TARGETS[setup.target_name],
            "range": "legal 64-940 / 1023" if setup.legal_range else "full 0-1",
        },
        "viewing_policy": VIEW_POLICY,
        "comparison_unavailable": COMPARISON_UNAVAILABLE,
        "versions": {"colour": colour.__version__, "numpy": np.__version__},
        "warnings": (
            [
                f"{excursions} source channels outside [0, 1] were clamped only at the cube boundary."
            ]
            if excursions
            else []
        ),
    }
    return VerificationResult(
        source,
        output.reshape(source.shape),
        display.reshape(source.shape),
        cube,
        provenance,
    )
