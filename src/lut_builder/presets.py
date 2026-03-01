# src/lut_builder/presets.py
#
# Two things live here:
#
#   1. STOP_COLOR_MAP  — suggests a Tailwind color for a given stop value,
#      following the industry-standard false color convention:
#      deep blue (crushed) → blue → cyan → green (middle grey) →
#      yellow → orange → red (clipped)
#
#   2. WIDTH_PRESETS — named band widths with plain-English descriptions
#      of how much of a typical image will be painted in false color.
#
# Both are used by cli.py as suggestions — the user can always override.

from .data import oklch_to_hex
from .colors import TAILWIND_COLORS


# ---------------------------------------------------------------------------
# Stop → color suggestion
# ---------------------------------------------------------------------------
#
# Thresholds are stop values (relative to middle grey = 0.0).
# Each entry is (max_stop, tailwind_family, tailwind_shade).
# The list is checked in order — first match wins.
#
# Convention mirrors standard cinema false color tools (e.g. SmallHD, Teradek):
#   Very dark  → deep blue/purple
#   Dark       → blue
#   Slightly under → cyan/sky
#   Middle grey zone → green
#   Slightly over  → yellow
#   Bright     → orange
#   Near clip  → red

_STOP_THRESHOLDS: list[tuple[float, str, str]] = [
    (-3.0, "violet", "800"),  # ≤ -3.0 stops — deep underexposure
    (-2.0, "blue", "600"),  # -3.0 to -2.0 — underexposed
    (-1.0, "sky", "400"),  # -2.0 to -1.0 — slightly under
    (-0.3, "teal", "400"),  # -1.0 to -0.3 — just under middle grey
    (0.3, "green", "500"),  #  ±0.3 stops  — correct exposure / middle grey
    (1.0, "lime", "400"),  #  0.3 to  1.0 — slightly over
    (2.0, "yellow", "400"),  #  1.0 to  2.0 — bright
    (3.0, "orange", "500"),  #  2.0 to  3.0 — very bright
]
_FALLBACK = ("red", "600")  #  > 3.0 stops — near clipping


def suggest_color_for_stop(stop: float) -> tuple[str, str, str]:
    """
    Returns (tailwind_family, tailwind_shade, hex_string) for a given stop value.
    Used by the CLI to pre-fill the color prompt with a sensible default.
    """
    for threshold, family, shade in _STOP_THRESHOLDS:
        if stop <= threshold:
            L, C, H = TAILWIND_COLORS[family][shade]
            return family, shade, oklch_to_hex(L, C, H)

    family, shade = _FALLBACK
    L, C, H = TAILWIND_COLORS[family][shade]
    return family, shade, oklch_to_hex(L, C, H)


# ---------------------------------------------------------------------------
# IRE → color suggestion
# ---------------------------------------------------------------------------
#
# IRE thresholds for display signal levels on the final output curve.
# Mirrors the same blue-to-red convention as stops but in the 0–100 IRE
# domain.  Middle grey (18% reflectance) lands at ~42 IRE in Rec.709.

_IRE_THRESHOLDS: list[tuple[float, str, str]] = [
    (10, "violet", "800"),  # ≤ 10 IRE — near black
    (25, "blue", "600"),  # 10–25 IRE — deep shadows
    (35, "sky", "400"),  # 25–35 IRE — shadows
    (38, "teal", "400"),  # 35–38 IRE — just under middle grey
    (46, "green", "500"),  # 38–46 IRE — middle grey zone (~42 IRE)
    (55, "lime", "400"),  # 46–55 IRE — slightly bright
    (65, "yellow", "400"),  # 55–65 IRE — skin tones / bright
    (80, "orange", "500"),  # 65–80 IRE — highlights
]
_IRE_FALLBACK = ("red", "600")  # > 80 IRE — near clip


def suggest_color_for_ire(ire: float) -> tuple[str, str, str]:
    """
    Returns (tailwind_family, tailwind_shade, hex_string) for a given IRE value.
    """
    for threshold, family, shade in _IRE_THRESHOLDS:
        if ire <= threshold:
            L, C, H = TAILWIND_COLORS[family][shade]
            return family, shade, oklch_to_hex(L, C, H)

    family, shade = _IRE_FALLBACK
    L, C, H = TAILWIND_COLORS[family][shade]
    return family, shade, oklch_to_hex(L, C, H)


# ---------------------------------------------------------------------------
# Width presets — Stops mode
# ---------------------------------------------------------------------------
#
# Each preset is a dict with:
#   label       — shown in the selection menu
#   width       — the ± stop value passed to the engine
#   description — what the image will look like at this width
#
# "Coverage" notes refer to a typical scene with a roughly normal exposure
# distribution. Very thin bands will only paint a narrow slice; most of
# the image remains clean Rec.709.

WIDTH_PRESETS: list[dict] = [
    {
        "label": "Razor   ±0.05 stops",
        "width": 0.05,
        "description": "Hair-thin lines. ~5% of a well-exposed image is painted. "
        "Ideal for monitoring while recording — image looks almost "
        "completely clean, false color appears as faint waves.",
    },
    {
        "label": "Thin    ±0.10 stops",
        "width": 0.10,
        "description": "Very subtle bands. ~10% coverage. Still looks like a normal "
        "image at a glance but exposure structure is clearly visible.",
    },
    {
        "label": "Narrow  ±0.20 stops",
        "width": 0.20,
        "description": "Visible but restrained. ~20% coverage. Good balance between "
        "readability and keeping the image usable.",
    },
    {
        "label": "Standard ±0.30 stops",
        "width": 0.30,
        "description": "Default. ~30% coverage. Clear false color, comfortable for "
        "exposure checking in a dedicated monitoring context.",
    },
    {
        "label": "Wide    ±0.50 stops",
        "width": 0.50,
        "description": "Broad bands. ~50% coverage. Best for quick on-set checks "
        "when you need to see the full exposure map at a glance.",
    },
    {
        "label": "Custom",
        "width": None,
        "description": "Enter any value manually.",
    },
]


# ---------------------------------------------------------------------------
# Width presets — IRE mode
# ---------------------------------------------------------------------------
#
# IRE widths are absolute display signal percentages, not logarithmic stops.
# ±5 IRE around 42 IRE covers roughly the same visual range as ±0.30 stops
# around middle grey.

IRE_WIDTH_PRESETS: list[dict] = [
    {
        "label": "Razor    ±1 IRE",
        "width": 1.0,
        "description": "Hair-thin lines. Only the exact target IRE shows color.",
    },
    {
        "label": "Thin     ±2 IRE",
        "width": 2.0,
        "description": "Very subtle bands. Useful for precision monitoring.",
    },
    {
        "label": "Narrow   ±3 IRE",
        "width": 3.0,
        "description": "Visible but restrained. Good for checking specific levels.",
    },
    {
        "label": "Standard ±5 IRE",
        "width": 5.0,
        "description": "Default. Clear bands that cover a comfortable range.",
    },
    {
        "label": "Wide     ±8 IRE",
        "width": 8.0,
        "description": "Broad bands. Best for quick on-set checks.",
    },
    {
        "label": "Custom",
        "width": None,
        "description": "Enter any value manually (in IRE).",
    },
]
