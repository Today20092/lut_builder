# LUT Builder

LUT Builder makes diagnostic false-color LUTs. They color a camera's log signal by scene exposure and flag recorded-signal limits.

## Language

### Camera input

**Camera profile**:
A supported camera log encoding paired with its gamut, together with the encoded-signal floor and ceiling for that encoding.
_Avoid_: camera, log format, color space

**Input domain**:
The convention that maps a camera's recorded code values to the 0–1 values the LUT receives: full range (`code / 1023`) or video-level expansion (`(code − 64) / 876`).
_Avoid_: input range, data levels, legal/full (without saying which convention)

**Clip level**:
The highest encoded value a particular camera actually records in a given mode. It depends on the camera body, ISO/EI and recording mode, not only on the log encoding.
_Avoid_: clipping point, sensor clip, white point

### Diagnostic output

**Cube**:
The exported 3D LUT file (`.cube`), which samples the input domain on a regular grid of 17³, 33³ or 65³ nodes.
_Avoid_: LUT file, table

**Exposure band**:
An authored range of exposure, in stops or IRE, that the LUT paints a single color.
_Avoid_: zone (outside Fill mode), stripe

**Encoded-signal warning**:
A color that overrides exposure bands where any one input channel reaches the camera profile's floor or ceiling. It flags the recorded signal, not proven sensor clipping.
_Avoid_: clipping warning, sensor warning, zebra

**Low warning**:
The encoded-signal warning for a channel at or below the floor. Purple by default.
_Avoid_: black clip, crush warning

**High warning**:
The encoded-signal warning for a channel at or above the ceiling. Red by default. When both warnings apply, the high warning wins.
_Avoid_: white clip, highlight warning

**Floor**:
The camera profile's encoded value for zero light, which sets the low warning.
_Avoid_: black point, low threshold

**Ceiling**:
The camera profile's encoded value at, or just below, the clip level, which sets the high warning.
_Avoid_: clipping point, high threshold, max

### Band editing

**Band edit**:
A change to the exposure-band configuration that can be undone as one action. A continuous drag is one band edit.

**Band selection**:
The band currently chosen for editing. Selection follows the same band when its position in the band ordering changes.

**Band-edit undo**:
Recovery of the most recent band edit and its prior selection. Unrelated settings changed afterward are preserved; recovery is one step deep.
