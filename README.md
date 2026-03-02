# lut-builder

A command-line tool for generating **false color exposure LUTs** for professional cameras.

Load the `.cube` file into DaVinci Resolve, FCPX, Premiere, or directly onto your camera's monitor via LUT View Assist, and every stop of exposure is painted a distinct color — so you can nail exposure on set without guessing.

```
╭──────────────────────────────────────╮
│          LUT Builder                 │
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
- Maps each exposure stop — or IRE display level — to a color you choose, using either a hex code or the full Tailwind v4 palette
- Optionally desaturates the underlying image to monochrome so only the false color bands are visible
- Optionally highlights crushed blacks and clipped whites in distinct colors
- Writes a standards-compliant `.cube` file you can drop into any NLE or monitor
- Saves your setup to a JSON config for one-command regeneration later

The false color is computed from **CIE Y luminance** using the camera's own gamut matrix (not a fixed BT.709 approximation), so the stops you see match what your eye actually perceives regardless of camera.

---

## Supported cameras

| Camera | Log Format | Gamut |
|--------|-----------|-------|
| Sony FX3 / FX6 / FX9 / A7S III / Venice | S-Log3 | S-Gamut3.Cine |
| Panasonic S5 II / GH6 / BGH1 | V-Log | V-Gamut |
| Canon C70 / C300 III / C500 II | Canon Log 3 | Cinema Gamut |
| ARRI Alexa / AMIRA / LF | LogC3 | ARRI Wide Gamut 3 |
| RED V-RAPTOR / KOMODO / MONSTRO | Log3G10 | REDWideGamutRGB |

Adding more cameras is straightforward — see [Contributing.md](Contributing.md).

---

## Requirements

- Python 3.12+
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

### Interactive mode

```bash
uv run lut-builder
```

The tool walks you through ten steps, and you can press `b` at any prompt to go back:

1. **Camera source** — pick your camera's log format
2. **Target display** — Rec.709 or Rec.2020
3. **Cube size** — 17 (fast preview), 33 (standard), 65 (recommended — sharper band edges)
4. **Band mode** — *Stops* (relative to 18% middle grey) or *IRE* (target display signal level 0–100)
5. **False color bands** — enter stop or IRE values as a comma-separated list, e.g. `-2, -1, 0, 1, 2`
   - For each value, pick a color from the **Tailwind v4 palette** or enter a hex code
   - Set the band width using named presets: Razor / Thin / Narrow / **Standard** / Wide / Custom
6. **Crushed blacks** — optional color for pixels below the sensor noise floor
7. **Clipped whites** — optional color for blown highlights
8. **Monochrome base** — desaturate everything outside the false color bands (default: yes)
9. **Legal / full range** — output 64–940 (broadcast) or 0–1023 (full range, default)
10. **Output filename** — defaults to something like `SonyS-Log3_Rec709.cube`

After generating you're offered the option to save your setup as a JSON config file.

### List supported cameras

```bash
uv run lut-builder list
```

Prints every camera profile and its source documentation URLs.

### Non-interactive mode (config file)

```bash
uv run lut-builder --config my_setup.json
uv run lut-builder --config my_setup.json --output-dir ~/luts
```

Pass a previously saved JSON config to regenerate the LUT without any prompts. `--output-dir` controls where the `.cube` file is written (created if it doesn't exist).

---

### Example: a standard false color setup

```
Band mode:    Stops
Stops:        -2, -1, 0, 1, 2
-2.0 stops:   blue-800    (#1e40af)  — deep underexposure
-1.0 stops:   sky-400     (#38bdf8)  — underexposed
 0.0 stops:   green-500   (#22c55e)  — middle grey (correct exposure)
+1.0 stops:   yellow-400  (#facc15)  — bright
+2.0 stops:   orange-500  (#f97316)  — near clipping
Highlights:   red-600     (#dc2626)  — clipped whites
Blacks:       violet-600  (#7c3aed)  — crushed shadows
Width preset: Standard (±0.3 stops)
Monochrome:   yes
```

### Loading the LUT

**DaVinci Resolve:** Color page → LUTs panel → right-click → "Open LUT Folder" → paste your `.cube` file → refresh

**Panasonic Lumix (LUT View Assist):** Copy the `.cube` to your SD card under `PRIVATE/PANA_GRP/LUMIX/CUSTOMLUT/`, then assign it in Camera Menu → LUT View Assist

**FCPX / Premiere:** Import as a custom LUT in your color workspace

> **Note:** Ensure your camera or monitor HDMI/SDI output is set to **Data / Full Range** (0–1023) unless you generated with the legal range option, in which case set it to **Legal / Video Range**.

---

## Project structure

```
lut-builder/
├── src/lut_builder/
│   ├── __init__.py
│   ├── cli.py        # Interactive CLI — prompts, color picker, config save/load
│   ├── colors.py     # Tailwind v4 color palette (OKLCH values from official docs)
│   ├── data.py       # Camera profiles, target profiles, OKLCH→hex conversion
│   ├── engine.py     # LUT generation — log decode, gamut transform, false color
│   └── presets.py    # Color suggestions and band-width presets per stop / IRE value
├── pyproject.toml
├── README.md
└── Contributing.md
```

---

## How the conversion works

```
Log values (e.g. S-Log3)
        ↓  log_decoding()          colour-science decodes the log curve
Scene-linear RGB (camera gamut)
        ↓  dot(RGB→XYZ matrix)     gamut-specific CIE Y luminance
Stops from middle grey             log2(Y / 0.18)
        ↓  band matching           paint stops with chosen colors
Linear RGB (camera gamut)
        ↓  gamut transform         camera gamut → display gamut (Rec.709 / Rec.2020)
        ↓  oetf()                  apply display transfer function
Rec.709 / Rec.2020 output
        ↓  write_LUT()             save as .cube file
```

CIE Y is derived from the camera's own RGB→XYZ matrix (wide gamut such as S-Gamut3.Cine or V-Gamut), not the fixed BT.709 coefficients, which would give wrong results for wide-gamut sources.

The Tailwind color picker converts OKLCH values to sRGB hex at runtime using `colour.models.Oklab_to_XYZ` → `colour.XYZ_to_sRGB` — no internet connection required.

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
