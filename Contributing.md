# Contributing to lut-builder

Thanks for contributing! This guide covers the two most common contributions: adding a camera profile and adding a target display profile. It also explains how the codebase is structured so you can find your way around quickly.

---

## Table of contents

- [Adding a camera profile](#adding-a-camera-profile)
- [Adding a target display profile](#adding-a-target-display-profile)
- [How the startup validator works](#how-the-startup-validator-works)
- [Pull request guidelines](#pull-request-guidelines)
- [Profile field reference](#profile-field-reference)

---

## Adding a camera profile

All camera profiles live in `src/lut_builder/data.py` inside `CAMERA_PROFILES`.

### Step 1 — Find the exact colour-science string names

The `"gamut"` and `"log"` fields must match the strings that the `colour-science` library uses internally. A mismatch is caught immediately on startup by the validator (see [below](#how-the-startup-validator-works)), but it's better to get it right upfront.

Open a Python shell inside the project environment:

```bash
uv run python
```

Then run:

```python
import colour

# All valid gamut (colour space) names
list(colour.RGB_COLOURSPACES.keys())

# All valid log decoding method names
list(colour.LOG_DECODINGS.keys())
```

Search the output for your camera's log format and wide gamut name. Some examples of correct string pairs:

| Camera | `"gamut"` | `"log"` |
|--------|-----------|---------|
| Sony S-Log3 | `"S-Gamut3.Cine"` | `"S-Log3"` |
| Panasonic V-Log | `"V-Gamut"` | `"V-Log"` |
| Canon Log 3 | `"Cinema Gamut"` | `"Canon Log 3"` |
| ARRI LogC3 | `"ARRI Wide Gamut 3"` | `"ARRI LogC3"` |
| Nikon N-Log | `"NIKON N-Gamut"` | `"N-Log"` |
| Fujifilm F-Log2 | `"F-Gamut"` | `"F-Log2"` |
| Blackmagic Film Gen 5 | `"Blackmagic Wide Gamut"` | `"Blackmagic Film Generation 5"` |

> If your camera's log format is not in `colour.LOG_DECODINGS` at all, open an issue rather than approximating with a similar curve. Accuracy matters for an exposure tool.

---

### Step 2 — Find the clip stop values and log range

`"white_clip_stops"` and `"black_clip_stops"` are hardware properties — where the sensor physically runs out of data. `"log_floor"` and `"log_ceiling"` are the corresponding raw log code values at those extremes. All four must come from an official manufacturer source, not estimation.

Every major manufacturer publishes a technical white paper or product spec for their log format. Search for:

> `[Brand] [Log format] white paper PDF`

What you are looking for is:
- The **dynamic range in stops** above and below 18% middle grey (for clip stops)
- The **log code values** (0–1 normalised) at those clip points (for floor/ceiling)

| Manufacturer | Where to find specs |
|---|---|
| Sony | [pro.sony](https://pro.sony) → product page → technical documents |
| Panasonic | [pro-av.panasonic.net](https://pro-av.panasonic.net) → support → white papers |
| Canon | [usa.canon.com](https://usa.canon.com) → learning center → camera technical guides |
| ARRI | [arri.com](https://www.arri.com) → learn & help → white papers |
| RED | [red.com](https://www.red.com) → download center → white papers |
| Nikon | Nikon download center → firmware & manuals |
| Fujifilm | [fujifilm.com](https://www.fujifilm.com) → support → technical documents |
| Blackmagic | [blackmagicdesign.com](https://www.blackmagicdesign.com) → support → camera manuals |

If you cannot find an official figure, say so clearly in your PR and add a comment in the code:

```python
"white_clip_stops": 7.5,   # TODO: verify — sourced from forum discussion, not official spec
```

An approximate value with a warning is better than a confidently wrong one.

---

### Step 3 — Add the entry to `data.py`

A complete profile looks like this:

```python
"Nikon N-Log": {
    "gamut": "NIKON N-Gamut",        # exact colour.RGB_COLOURSPACES key
    "log": "N-Log",                  # exact colour.LOG_DECODINGS key
    "white_clip_stops": 7.5,         # stops above 18% grey where highlights clip
    "black_clip_stops": -7.0,        # stops below 18% grey at the noise floor
    "log_floor": 0.12,               # log code at black clip (0-1 normalised)
    "log_ceiling": 0.91,             # log code at white clip (0-1 normalised)
    "sources": [
        "https://link-to-official-nikon-nlog-whitepaper.pdf",
    ],
},
```

- Add a URL to `"sources"` for every document you used. These appear in `uv run lut-builder list` so anyone can verify the figures.
- `log_floor` and `log_ceiling` are used by the engine for physical clipping detection — they must correspond to the same exposure limits as the stop values.

---

### Step 4 — Verify

Run the tool. The validator fires on import, before any LUT is generated:

```bash
uv run lut-builder
```

If your camera appears in the source selection menu and the tool proceeds normally, the strings are valid. If there's a mismatch you'll see a clear error message pointing to exactly which field is wrong and what command to run to find the correct name.

You can also confirm your profile appears in the list command:

```bash
uv run lut-builder list
```

---

## Adding a target display profile

Target profiles live in `src/lut_builder/data.py` inside `TARGET_PROFILES`.

The structure is slightly different from camera profiles — targets use `"encoding": "oetf"` for standard display outputs (Rec.709, Rec.2020) because those use an optical-to-electrical transfer function, not a log encoding:

```python
"Rec.2100 HLG": {
    "gamut": "ITU-R BT.2020",        # colour.RGB_COLOURSPACES key
    "gamma": "HLG",                  # passed to colour.models.oetf()
    "encoding": "oetf",
},
```

To find valid OETF function names:

```python
import colour
list(colour.OETFS.keys())
```

For log-encoded targets (e.g. outputting to a log-capable monitor):

```python
"Sony S-Log3 Monitor": {
    "gamut": "S-Gamut3.Cine",
    "gamma": "S-Log3",
    "encoding": "log",               # uses colour.models.log_encoding() instead
},
```

---

## How the startup validator works

`validate_profiles()` in `data.py` runs automatically every time the module is imported. It checks every `"gamut"` string against `colour.RGB_COLOURSPACES`, and test-fires the decoding/encoding function for every `"log"` and `"gamma"` string with dummy data.

If anything is wrong you'll see output like:

```
ValueError: Invalid profile entries found in data.py — fix these before running:

  [Nikon N-Log] Unknown log method: 'NLog'
    Run: list(colour.LOG_DECODINGS.keys()) to see valid names.
```

This means the validator will catch your typo before it ever silently generates a wrong LUT.

---

## Pull request guidelines

- **One camera per PR** where possible — it keeps reviews focused and makes it easy to revert if a value turns out to be wrong.
- **Include the source URL** for your clip stop and log floor/ceiling values in both the `"sources"` list and the PR description.
- **If updating an existing profile** with more accurate values, explain what the previous value was based on and why yours is more accurate.
- **Do not approximate** log curves or gamut matrices. If your camera isn't in `colour-science`, open an issue and we'll track the upstream request there.

---

## Profile field reference

### Camera profiles (`CAMERA_PROFILES`)

| Field | Type | Unit | What it means |
|-------|------|------|---------------|
| `gamut` | `str` | — | The wide colour space the camera records in. Used for the gamut-to-display matrix transform and for computing CIE Y luminance. Must be a key in `colour.RGB_COLOURSPACES`. |
| `log` | `str` | — | The logarithmic transfer function the camera uses. Used to decode log values back to scene-linear light. Must be a key in `colour.LOG_DECODINGS`. |
| `white_clip_stops` | `float` | stops above 18% grey | The maximum stop the sensor can encode before highlights clip to solid white. A pixel above this threshold has no recoverable detail. |
| `black_clip_stops` | `float` | stops below 18% grey | The noise floor of the sensor. A pixel below this threshold is crushed to unrecoverable black. |
| `log_floor` | `float` | 0–1 normalised log code | The raw log code corresponding to `black_clip_stops`. Used by the engine for physical clipping detection. |
| `log_ceiling` | `float` | 0–1 normalised log code | The raw log code corresponding to `white_clip_stops`. Used by the engine for physical clipping detection. |
| `sources` | `list[str]` | — | URLs to official manufacturer documents that back the clip stop and log range values. Displayed by `lut-builder list`. |

**Middle grey (0.18 linear / 18%)** is a universal photographic constant and does not need to be specified per camera. The `colour-science` library handles this automatically when decoding any log format.

**Stops** are computed as `log2(luminance / 0.18)`:
- `+1 stop` → luminance = 0.36
- ` 0 stops` → luminance = 0.18 (middle grey)
- `-1 stop` → luminance = 0.09
