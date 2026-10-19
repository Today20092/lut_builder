"""Bounded 3D Iridas imports and their explicitly confirmed output interpretation."""

import hashlib
import re
from collections.abc import Mapping

import colour
import numpy as np

MAX_CUBE_BYTES = 16 * 1024 * 1024
# JSON may encode one text byte as a six-byte Unicode escape.
MAX_SETUP_BYTES = MAX_CUBE_BYTES * 6 + 1_000_000
OUTPUT_TRANSFERS = {"gamma2.2", "gamma2.4", "sRGB", "BT.709"}
NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")


def parse_cube(text: str) -> colour.LUT3D:
    """Validate before allocating; red varies fastest, finite output excursions survive."""
    if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_CUBE_BYTES:
        raise ValueError("Imported LUT must be UTF-8 text up to 16 MiB.")
    size = None
    domain = np.array([[0.0] * 3, [1.0] * 3])
    seen = set()
    rows = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        tokens = line.split()
        directive = tokens[0]
        if directive in {"TITLE", "LUT_3D_SIZE", "DOMAIN_MIN", "DOMAIN_MAX"}:
            if directive in seen or rows:
                raise ValueError(f"Duplicate or misplaced {directive} header.")
            seen.add(directive)
            if directive == "TITLE":
                if not re.fullmatch(r'TITLE\s+"[^"\r\n]*"', line):
                    raise ValueError("TITLE must contain a quoted name.")
            elif directive == "LUT_3D_SIZE":
                if (
                    len(tokens) != 2
                    or not re.fullmatch(r"[0-9]+", tokens[1])
                    or not 2 <= int(tokens[1]) <= 65
                ):
                    raise ValueError(
                        "Imported 3D cube size must be an integer from 2 to 65."
                    )
                size = int(tokens[1])
            else:
                if len(tokens) != 4 or not all(NUMBER.fullmatch(t) for t in tokens[1:]):
                    raise ValueError(f"{directive} needs exactly three finite numbers.")
                domain[0 if directive == "DOMAIN_MIN" else 1] = [
                    float(t) for t in tokens[1:]
                ]
            continue
        if directive.startswith("LUT_1D") or "SHAPER" in directive:
            raise ValueError(
                "1D and combined shaper LUTs are unsupported. Export a single baked 3D .cube LUT."
            )
        if (
            size is None
            or len(tokens) != 3
            or not all(NUMBER.fullmatch(t) for t in tokens)
        ):
            raise ValueError(
                "Use a single 3D .cube with three finite numbers per row; unsupported directive or data."
            )
        rows.append([float(t) for t in tokens])
        if len(rows) > size**3:
            raise ValueError("Imported LUT has extra table rows.")
    if size is None or len(rows) != size**3:
        raise ValueError(
            "Imported LUT table is missing or truncated; expected size³ RGB rows."
        )
    table = np.asarray(rows)
    if (
        not np.isfinite(table).all()
        or not np.isfinite(domain).all()
        or not np.all(domain[1] > domain[0])
    ):
        raise ValueError(
            "LUT values must be finite and DOMAIN_MAX must exceed DOMAIN_MIN on every channel."
        )
    if np.any(np.abs(table) > np.finfo(np.float32).max):
        raise ValueError(
            "LUT output exceeds finite float32 export precision; rescale the source LUT."
        )
    with np.errstate(over="ignore"):
        if not np.isfinite(domain[1] - domain[0]).all():
            raise ValueError("LUT domain span exceeds finite float64 precision.")
    return colour.LUT3D(table.reshape((size, size, size, 3), order="F"), domain=domain)


def validate_imported_lut(
    value: Mapping,
    profile: str,
    target: str,
    legal_range: bool,
    monochrome: bool,
    ire_basis: str,
) -> dict:
    fields = {
        "version",
        "name",
        "cube",
        "source_profile",
        "output_gamut",
        "output_transfer",
        "output_range",
        "sha256",
    }
    if (
        not isinstance(value, Mapping)
        or set(value) != fields
        or value.get("version") != 1
    ):
        raise ValueError(
            "Imported LUT needs all version-1 identity and interpretation fields; reattach the original .cube."
        )
    if (
        not isinstance(value["name"], str)
        or not 0 < len(value["name"]) <= 255
        or any(ord(c) < 32 for c in value["name"])
    ):
        raise ValueError("Imported LUT needs a name up to 255 characters.")
    if value["source_profile"] != profile or value["output_gamut"] != target:
        raise ValueError(
            "Imported LUT source/output interpretation does not match configuration. Reconfirm the LUT interpretation."
        )
    if (
        not isinstance(value["output_transfer"], str)
        or not isinstance(value["output_range"], str)
        or value["output_transfer"] not in OUTPUT_TRANSFERS
        or value["output_range"] not in {"full", "legal"}
    ):
        raise ValueError("Confirm an SDR output transfer and full/legal output range.")
    if (value["output_range"] == "legal") != legal_range:
        raise ValueError("Imported LUT output range does not match configuration.")
    if monochrome or ire_basis != "camera":
        raise ValueError(
            "Imported looks require source-camera IRE and monochrome off to preserve the look."
        )
    parse_cube(value["cube"])
    digest = hashlib.sha256(value["cube"].encode("utf-8")).hexdigest()
    if value["sha256"] != digest:
        raise ValueError(
            "Imported LUT identity check failed. Reattach the original .cube; no substitute was used."
        )
    return dict(value)


def encode_output(linear: np.ndarray, transfer: str) -> np.ndarray:
    if transfer.startswith("gamma"):
        return np.sign(linear) * np.abs(linear) ** (1 / float(transfer[5:]))
    if transfer == "sRGB":
        return colour.cctf_encoding(linear, function="sRGB")
    return colour.models.oetf(linear, function="ITU-R BT.709")


def decode_output(signal: np.ndarray, transfer: str) -> np.ndarray:
    if transfer.startswith("gamma"):
        return np.sign(signal) * np.abs(signal) ** float(transfer[5:])
    if transfer == "sRGB":
        return colour.cctf_decoding(signal, function="sRGB")
    return colour.models.oetf_inverse(signal, function="ITU-R BT.709")


def overlay_in_output(hex_code: str, imported: Mapping) -> np.ndarray:
    srgb = np.array([int(hex_code[i : i + 2], 16) / 255 for i in (1, 3, 5)])
    linear = colour.cctf_decoding(srgb, function="sRGB")
    if imported["output_gamut"] == "Rec.2020":
        linear = colour.RGB_to_RGB(
            linear,
            colour.RGB_COLOURSPACES["ITU-R BT.709"],
            colour.RGB_COLOURSPACES["ITU-R BT.2020"],
        )
    encoded = encode_output(linear, imported["output_transfer"])
    return (
        encoded * (876 / 1023) + 64 / 1023
        if imported["output_range"] == "legal"
        else encoded
    )
