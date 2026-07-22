# Contributing to lut-builder

Thanks for contributing! This guide covers the two most common contributions: adding a camera profile and adding a diagnostic output encoding. It also explains how the codebase is structured so you can find your way around quickly.

Keep product language diagnostic: the generated LUT is a scene-exposure aid, not a finished Rec.709/Rec.2020 viewing transform. Do not describe its encoded-signal warnings as proof of physical sensor clipping; processed RGB cannot establish that.

---

## Table of contents

- [Adding a camera profile](#adding-a-camera-profile)
- [Adding a diagnostic output encoding](#adding-a-diagnostic-output-encoding)
- [How catalog validation works](#how-catalog-validation-works)
- [Pull request guidelines](#pull-request-guidelines)
- [Profile field reference](#profile-field-reference)

---

## Adding a camera profile

All camera profiles live in `src/lut_builder/data.py` inside `_SOURCE_DATA`.

### Step 1 — Find the exact colour-science string names

The `"gamut"` and `"log"` fields must match the strings that the `colour-science` library uses internally. A mismatch is caught by catalog validation (see [below](#how-catalog-validation-works)), but it's better to get it right upfront.

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

### Step 2 — Choose encoded-signal warning thresholds

`"encoded_signal_floor"` and `"encoded_signal_ceiling"` are normalized code-value thresholds (0–1) for optional monitoring warnings. They are camera/mode/EI dependent and do not represent universal sensor saturation limits.

Every major manufacturer publishes a technical white paper or product spec for their log format. Search for:

> `[Brand] [Log format] white paper PDF`

What you are looking for is:
- Documented encoded-signal values suitable for low/high monitoring warnings in the specific camera mode and EI.

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
"encoded_signal_ceiling": 0.91,  # TODO: verify — sourced from forum discussion
```

An approximate value with a warning is better than a confidently wrong one.

---

### Step 3 — Add the entry to `data.py`

A complete profile looks like this:

```python
"Nikon N-Log": {
    "gamut": "NIKON N-Gamut",        # exact colour.RGB_COLOURSPACES key
    "log": "N-Log",                  # exact colour.LOG_DECODINGS key
    "encoded_signal_floor": 0.12,    # low encoded-signal warning threshold
    "encoded_signal_ceiling": 0.91,  # high encoded-signal warning threshold
    "sources": [
        "https://link-to-official-nikon-nlog-whitepaper.pdf",
    ],
},
```

- Add a URL to `"sources"` for every document you used. These appear in `uv run lut-builder list` so anyone can verify the figures.

---

### Step 4 — Verify

Validate the catalog explicitly before running the tool:

```bash
uv run python -c "from lut_builder.data import PROFILE_CATALOG; PROFILE_CATALOG.validate()"
```

If your camera appears in the source selection menu and the tool proceeds normally, the strings are valid. If there's a mismatch you'll see a clear error message pointing to exactly which field is wrong.

You can also confirm your profile appears in the list command:

```bash
uv run lut-builder list
```

---

## Adding a diagnostic output encoding

Target profiles live in `src/lut_builder/data.py` inside `_TARGET_DATA`.

The structure is slightly different from camera profiles: Rec.709 and Rec.2020 diagnostic outputs use `"encoding": "oetf"` to encode the transformed scene signal. This does not add an output rendering transform, tone mapping, or highlight roll-off.

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

For a log-encoded diagnostic output:

```python
"Sony S-Log3 Monitor": {
    "gamut": "S-Gamut3.Cine",
    "gamma": "S-Log3",
    "encoding": "log",               # uses colour.models.log_encoding() instead
},
```

---

## How catalog validation works

`PROFILE_CATALOG.validate()` explicitly checks gamut, log, transfer, encoding, and encoded-signal threshold fields. Importing `data.py` does not run validation; catalog lookup, listing, and generation validate before returning profile facts.

If anything is wrong you'll see output like:

```
ValueError: Invalid profile catalog:
- source [Nikon N-Log] log 'NLog' is not supported
```

This means the validator will catch your typo before it ever silently generates a wrong LUT.

---

## Pull request guidelines

- **One camera per PR** where possible — it keeps reviews focused and makes it easy to revert if a value turns out to be wrong.
- **Include the source URL** for encoded-signal warning thresholds in both the `"sources"` list and the PR description.
- **If updating an existing profile** with more accurate values, explain what the previous value was based on and why yours is more accurate.
- **Do not approximate** log curves or gamut matrices. If your camera isn't in `colour-science`, open an issue and we'll track the upstream request there.

---

## Profile field reference

### Camera profiles (`_SOURCE_DATA`)

| Field | Type | Unit | What it means |
|-------|------|------|---------------|
| `gamut` | `str` | — | The wide colour space the camera records in. Used for the gamut-to-display matrix transform and for computing CIE Y luminance. Must be a key in `colour.RGB_COLOURSPACES`. |
| `log` | `str` | — | The logarithmic transfer function the camera uses. Used to decode log values back to scene-linear light. Must be a key in `colour.LOG_DECODINGS`. |
| `encoded_signal_floor` | `float` | 0–1 normalised code | Low warning threshold. A warning fires when any encoded RGB channel is at or below it. |
| `encoded_signal_ceiling` | `float` | 0–1 normalised code | High warning threshold. A warning fires when any encoded RGB channel is at or above it. |
| `sources` | `list[str]` | — | URLs to documents that support the encoded-signal warning thresholds. Displayed by `lut-builder list`. |

**Middle grey (0.18 linear / 18%)** is a universal photographic constant and does not need to be specified per camera. The `colour-science` library handles this automatically when decoding any log format.

For IRE documentation and tests, state the range convention explicitly: full range uses code 0 = 0 IRE and code 1023 = 100 IRE; legal range uses code 64 = 0 IRE and code 940 = 100 IRE.

**Stops** are computed as `log2(luminance / 0.18)`:
- `+1 stop` → luminance = 0.36
- ` 0 stops` → luminance = 0.18 (middle grey)
- `-1 stop` → luminance = 0.09
