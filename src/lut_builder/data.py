# src/lut_builder/data.py

import colour
import numpy as np

# ---------------------------------------------------------------------------
# Universal Constants
# ---------------------------------------------------------------------------

MIDDLE_GREY = 0.18

# ITU-R BT.709 luminance coefficients.
LUMA_WEIGHTS = np.array([0.2126, 0.7152, 0.0722])

# ---------------------------------------------------------------------------
# Camera Profiles
# ---------------------------------------------------------------------------

CAMERA_PROFILES = {
    "Sony S-Log3": {
        "gamut": "S-Gamut3.Cine",
        "log": "S-Log3",
        "white_clip_stops": 6.0,
        "black_clip_stops": -9.0,
        "log_ceiling": 0.94,  # ~94 IRE — S-Log3 hard digital ceiling
        "log_floor": 0.035,  # ~3.5 IRE — S-Log3 noise floor / digital black
    },
    "Panasonic V-Log": {
        "gamut": "V-Gamut",
        "log": "V-Log",
        "white_clip_stops": 6.5,   # derived: log2(linear_clip / 0.18), clip = 911/1023
        "black_clip_stops": -8.0,
        "log_ceiling": 0.8906,  # Varicam 35 clip = 10-bit code 911 → 911/1023 (~96.7 IRE legal)
        "log_floor": 0.1251,    # 0% reflectance = 10-bit code 128 → 128/1023
    },
    "Canon Log 3": {
        "gamut": "Cinema Gamut",
        "log": "Canon Log 3",
        "white_clip_stops": 7.0,
        "black_clip_stops": -7.5,
        "log_ceiling": 0.90,  # Canon Log 3 hard ceiling
        "log_floor": 0.04,  # Canon Log 3 digital black
    },
    "ARRI LogC3": {
        "gamut": "ARRI Wide Gamut 3",
        "log": "ARRI LogC3",
        "white_clip_stops": 7.5,
        "black_clip_stops": -7.0,
        "log_ceiling": 0.91,  # LogC3 hard ceiling (EI 800)
        "log_floor": 0.03,  # LogC3 digital black
    },
    "RED Log3G10": {
        "gamut": "REDWideGamutRGB",
        "log": "Log3G10",
        "white_clip_stops": 10.0,
        "black_clip_stops": -8.0,
        "log_ceiling": 1.0,  # Log3G10 uses the full 0–1 code range
        "log_floor": 0.0,  # Log3G10 has no raised digital black
    },
}

TARGET_PROFILES = {
    "Rec.709": {
        "gamut": "ITU-R BT.709",
        "gamma": "ITU-R BT.709",
        "encoding": "oetf",
    },
    "Rec.2020": {
        "gamut": "ITU-R BT.2020",
        "gamma": "ITU-R BT.2020",
        "encoding": "oetf",
    },
}

# ---------------------------------------------------------------------------
# Color Helpers
# ---------------------------------------------------------------------------


def hex_to_rgb(hex_code: str) -> list[float]:
    """Converts '#RRGGBB' to a [r, g, b] list of 0.0-1.0 floats."""
    hex_code = hex_code.lstrip("#")
    if len(hex_code) != 6:
        raise ValueError("Hex code must be 6 characters long.")
    return [int(hex_code[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]


def oklch_to_hex(L: float, C: float, H: float) -> str:
    """
    Converts an OKLCH color to the nearest sRGB hex string.

    Uses direct colour-science functions instead of colour.convert() to avoid
    requiring the optional networkx dependency (colour.convert uses a graph
    router that needs networkx installed).

    Conversion path:
      OKLCH → OKLab (manual trig)
      OKLab → XYZ D65  (colour.models.Oklab_to_XYZ)
      XYZ D65 → sRGB   (colour.XYZ_to_sRGB, applies OETF internally)

    Out-of-gamut values are clipped to 0-1, matching browser behavior when
    displaying wide-gamut OKLCH colors on an sRGB display.
    """
    # OKLCH → OKLab
    H_rad = np.deg2rad(H)
    a = C * np.cos(H_rad)
    b = C * np.sin(H_rad)
    oklab = np.array([L, a, b])

    # OKLab → XYZ D65
    xyz = colour.models.Oklab_to_XYZ(oklab)

    # XYZ D65 → sRGB (gamma-encoded, not linear)
    rgb = colour.XYZ_to_sRGB(xyz)
    rgb = np.clip(rgb, 0.0, 1.0)

    r, g, b_ch = (int(round(x * 255)) for x in rgb)
    return f"#{r:02x}{g:02x}{b_ch:02x}"


def oklch_to_rgb(L: float, C: float, H: float) -> list[float]:
    """Returns OKLCH as a [r, g, b] list of 0.0-1.0 floats."""
    return hex_to_rgb(oklch_to_hex(L, C, H))


# ---------------------------------------------------------------------------
# Startup Validation
# ---------------------------------------------------------------------------


def validate_profiles() -> None:
    """
    Validates gamut and log strings against the colour-science library.
    Runs automatically on import so typos are caught before generation.
    """
    errors = []

    for name, profile in CAMERA_PROFILES.items():
        if profile["gamut"] not in colour.RGB_COLOURSPACES:
            errors.append(
                f"  [{name}] Unknown gamut: '{profile['gamut']}'\n"
                f"    Run: list(colour.RGB_COLOURSPACES.keys()) to see valid names."
            )
        try:
            colour.models.log_decoding(
                np.array([[0.5, 0.5, 0.5]]), method=profile["log"]
            )
        except Exception:
            errors.append(
                f"  [{name}] Unknown log method: '{profile['log']}'\n"
                f"    Run: list(colour.LOG_DECODINGS.keys()) to see valid names."
            )

    for name, target in TARGET_PROFILES.items():
        if target["gamut"] not in colour.RGB_COLOURSPACES:
            errors.append(
                f"  [{name}] Unknown target gamut: '{target['gamut']}'\n"
                f"    Run: list(colour.RGB_COLOURSPACES.keys()) to see valid names."
            )
        if target["encoding"] == "oetf":
            try:
                colour.models.oetf(
                    np.array([[0.5, 0.5, 0.5]]), function=target["gamma"]
                )
            except Exception:
                errors.append(
                    f"  [{name}] Unknown OETF function: '{target['gamma']}'\n"
                    f"    Run: list(colour.OETFS.keys()) to see valid names."
                )
        else:
            try:
                colour.models.log_encoding(
                    np.array([[0.5, 0.5, 0.5]]), method=target["gamma"]
                )
            except Exception:
                errors.append(
                    f"  [{name}] Unknown log encoding: '{target['gamma']}'\n"
                    f"    Run: list(colour.LOG_ENCODINGS.keys()) to see valid names."
                )

    if errors:
        raise ValueError(
            "Invalid profile entries found in data.py — fix these before running:\n\n"
            + "\n".join(errors)
        )


validate_profiles()
