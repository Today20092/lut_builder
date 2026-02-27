# lut-builder

A command-line tool for generating **false color exposure LUTs** for professional cameras.

Load the `.cube` file into DaVinci Resolve, FCPX, Premiere, or directly onto your camera's monitor via LUT View Assist, and every stop of exposure is painted a distinct color — so you can nail exposure on set without guessing.

```
╭──────────────────────────────────────╮
│   Welcome to the Custom LUT Builder  │
╰──────────────────────────────────────╯

Camera Source:
   1  Sony S-Log3
   2  Panasonic V-Log
   3  Canon Log 3
   4  ARRI LogC3
   5  RED Log3G10
```

---

## What it does

- Decodes your camera's log format (S-Log3, V-Log, LogC3, etc.) back to scene-linear light
- Maps each exposure stop to a color you choose — using either a hex code or the full Tailwind v4 color palette
- Optionally highlights crushed blacks and clipped whites in distinct colors
- Writes a standards-compliant `.cube` file you can drop into any NLE or monitor

The false color is computed from **perceptual luminance** (ITU-R BT.709 weighting), not a simple RGB average, so the stops you see match what your eye actually perceives.

---

## Supported cameras

| Camera | Log Format | Gamut |
|--------|-----------|-------|
| Sony FX3 / FX6 / FX9 / A7S III / Venice | S-Log3 | S-Gamut3.Cine |
| Panasonic S5 II / GH6 / BGH1 | V-Log | V-Gamut |
| Canon C70 / C300 III / C500 II | Canon Log 3 | Cinema Gamut |
| ARRI Alexa / AMIRA / LF | LogC3 | ARRI Wide Gamut 3 |
| RED V-RAPTOR / KOMODO / MONSTRO | Log3G10 | REDWideGamutRGB |

Adding more cameras is straightforward — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Requirements

- Python 3.14+
- [uv](https://docs.astral.sh/uv/) (recommended) — or pip

---

## Installation

**Clone and install with uv:**

```bash
git clone https://github.com/your-username/lut-builder.git
cd lut-builder
uv sync
```

**Or install with pip:**

```bash
git clone https://github.com/your-username/lut-builder.git
cd lut-builder
pip install -e .
```

---

## Usage

```bash
uv run lut-builder
```

The tool walks you through everything interactively:

1. **Camera source** — pick your camera's log format
2. **Target display** — Rec.709 or Rec.2020
3. **Cube size** — 17 (fast preview), 33 (standard), 65 (maximum accuracy)
4. **False color bands** — enter stops as a comma-separated list, e.g. `-2, -1, 0, 1, 2`
   - For each stop, pick a color from the **Tailwind v4 palette** or enter a hex code
   - Set the band width in stops (default ±0.3)
5. **Clipping indicators** — optional colors for crushed blacks and blown highlights
6. **Output filename** — defaults to something sensible like `SonyS-Log3_Rec709.cube`

### Example: a standard false color setup

```
Stops to monitor:   -2, -1, 0, 1, 2
-2.0 stops:  blue-800    (#1e40af)  — deep underexposure
-1.0 stops:  sky-400     (#38bdf8)  — underexposed
 0.0 stops:  green-500   (#22c55e)  — middle grey (correct exposure)
+1.0 stops:  yellow-400  (#facc15)  — bright
+2.0 stops:  orange-500  (#f97316)  — near clipping
Highlights:  red-600     (#dc2626)  — clipped whites
Blacks:      violet-600  (#7c3aed)  — crushed shadows
```

### Loading the LUT

**DaVinci Resolve:** Color page → LUTs panel → right-click → "Open LUT Folder" → paste your `.cube` file → refresh

**Panasonic Lumix (LUT View Assist):** Copy the `.cube` to your SD card under `PRIVATE/PANA_GRP/LUMIX/CUSTOMLUT/`, then assign it in Camera Menu → LUT View Assist

**FCPX / Premiere:** Import as a custom LUT in your color workspace

---

## Project structure

```
lut-builder/
├── src/lut_builder/
│   ├── __init__.py
│   ├── cli.py        # Interactive CLI — prompts, color picker, Tailwind integration
│   ├── colors.py     # Tailwind v4 color palette (OKLCH values from official docs)
│   ├── data.py       # Camera profiles, target profiles, OKLCH→hex conversion
│   └── engine.py     # LUT generation — log decode, gamut transform, false color
├── pyproject.toml
├── README.md
└── CONTRIBUTING.md
```

---

## How the conversion works

```
Log values (e.g. S-Log3)
        ↓  log_decoding()          colour-science decodes the log curve
Scene-linear RGB
        ↓  dot(LUMA_WEIGHTS)       BT.709 luminance weighting
Stops from middle grey             log2(luma / 0.18)
        ↓  band matching           paint stops with chosen colors
Linear RGB (target gamut)
        ↓  oetf()                  apply display transfer function
Rec.709 / Rec.2020 output
        ↓  write_LUT()             save as .cube file
```

The Tailwind color picker converts OKLCH values to sRGB hex at runtime using `colour.models.Oklab_to_XYZ` → `colour.XYZ_to_sRGB` — no networkx or internet connection required.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| [colour-science](https://www.colour-science.org/) | Log decoding, gamut transforms, LUT I/O |
| [numpy](https://numpy.org/) | Vectorized LUT math |
| [rich](https://rich.readthedocs.io/) | Terminal UI, color swatches |
| [typer](https://typer.tiangolo.com/) | CLI entry point |

---

## License

MIT