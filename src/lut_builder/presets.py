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
# Width presets
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
