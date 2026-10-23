# Imported LUT composition

Import a single camera-to-display creative/viewing `.cube`, confirm its actual
camera input and SDR output, and export a combined look with source-exposure
diagnostics. For example: Panasonic V-Log / V-Gamut → Rec.709 primaries, gamma 2.2,
full range. The filename does not establish any of these facts.

Place the combined LUT **instead of** the original viewing LUT. Its input must be
the original camera-coded RGB expected by that LUT. Do not apply the original look
first, feed the resulting Rec.709 into this LUT, or invert an arbitrary grade to
guess its original exposure. This measures recorded log exposure, not physical
sensor saturation.

## Supported import

- UTF-8 Iridas `.cube`, a single `LUT_3D_SIZE` integer from 2 through 65 inclusive.
  Export sizes remain 17, 33, and 65.
- Up to 16 MiB of cube text; exactly N³ finite RGB triples, red varying fastest.
  Decimal/scientific numeric notation is supported. Empty lines, comments,
  a quoted `TITLE`, and optional three-channel `DOMAIN_MIN` / `DOMAIN_MAX` headers
  before the table are supported. Duplicate/misplaced headers and unknown directives
  fail visibly. 1D LUTs and combined shapers require a single baked 3D export first.
- Domain bounds must be finite and strictly increasing, with a finite span.
  Sampling normalizes each channel `(x-min)/(max-min)` and clamps at this domain.
  No extrapolation is claimed. The combined exported cube has input domain [0,1].
- Finite output excursions outside [0,1] are retained, without a second encoding
  or legal-range packing. Samples beyond finite float32 export range are rejected.
- Output primaries: Rec.709 or Rec.2020. Output transfer: gamma 2.2, gamma 2.4,
  sRGB, or BT.709 OETF. Output range: full [0,1] or legal 64–940 / 1023. The LUT is
  assumed already to produce this declared encoding and range.
- Input is normalized camera code values. Resolve any YCbCr transport matrix,
  chroma reconstruction, and limited/full transport expansion before evaluating
  the LUT, exactly once. The imported LUT must expect those same camera codes.

The existing camera workflows without an imported look retain their original
encoding, overlay and display behavior. Imported mode requires monochrome off,
matching source/target/output range, and source-camera IRE. Changing interpretation
requires explicit reconfirmation rather than silently altering the imported look.

## Mathematics

For original encoded camera RGB **x**, decode its declared log transfer and compute
CIE Y using the camera gamut's RGB-to-XYZ Y row. Stops are
`log2(max(Y, 1e-6) / 0.18)`. Nonpositive finite Y uses that deterministic floor.
Unknown profiles, invalid data and nonfinite imported samples fail; they do not
select an approximate camera curve.

Evaluate the imported LUT directly on **x**, using **tetrahedral interpolation**.
Do not feed scene-linear RGB to an imported LUT expecting log. Exposure classification
is independent of this look, including its clipping, channel mixing and roll-off.

Source IRE is `100 * dot(x, camera-gamut Y coefficients)` in normalized camera-code
convention: 0 = code 0, 100 = code 1023. It is an RGB-derived encoded metric, not
display luma or a promise of a particular waveform reading for colored pixels.
Limited transport values must already have been resolved; output legal packing
does not move these source thresholds. Legacy target-IRE setups remain readable
outside imported mode.

Overlay priority stays unchanged: ordered bands (last matching band wins), or fill
zones; then low encoded-channel warning; then high warning. The warning tolerance
remains half an export-grid step. Imported point markers require a positive finite
half-width; a mathematically zero-width point would commonly miss every sample.

Diagnostic hex colors mean **display sRGB**. Decode sRGB to linear BT.709 primaries,
convert to the declared output primaries, apply its declared transfer once, and pack
legal output once if requested. Gamma curves use signed power, sRGB uses its
piecewise transfer, BT.709 uses its OETF. The base imported output bypasses all
of these additional transforms. For viewing only, expand declared legal output,
invert the confirmed transfer, convert target primaries to BT.709, clip display
gamut and encode sRGB. Stored LUT excursions remain intact.

## Preview, verification and persistence

The camera exposure reference uses original neutral camera-code patches. Its
diagnostic view samples the **actual serialized combined cube** in a cancellable
worker. Its Look view evaluates the imported cube directly on the same camera
codes. Labels state the actual stops represented by those samples, rather than
inventing camera input by reversing a graded photograph.

Still/video verification preserves the original camera RGB, applies the exact
serialized combined cube tetrahedrally, and builds a Look comparison using the same
source RGB with a separately serialized diagnostic-free look. Both local Python
and browser verification use the confirmed output transfer for display. The
**Look / Look + diagnostics** toggle is viewing-only. Numerical inspection and
**Download checked cube** always retain diagnostics. Source, setup, look or
interpretation changes invalidate the result. Keep the checked bytes and provenance
together; normal downloads have timestamped headers and may differ in file hash.

Portable setup **version 3** embeds the exact cube text, version-1 imported metadata,
and its SHA-256 digest. No-look browser setups remain version 1; existing Python
version-2 configurations stay readable. Version 3 without its
imported cube is an explicit recovery error. Unknown versions, damaged/missing text
and identity mismatches require reattaching the original file or a valid backup;
no standard look is silently substituted. The named-setup storage envelope is also
versioned so older applications cannot unknowingly discard imported transforms.
Full embedded setups pass through session restoration and explicit setup downloads.
Browser storage quota/blocking failures are visible: export the portable setup
before closing if saving fails. Large 65³ imports may exceed localStorage quota.

## Numerical evidence and finite-grid limits

`tests/test_imported_lut.py` covers strict parsing, domain/axis handling, independent
Colour tetrahedral sampling, V-Log middle-gray diagnostics, source interpretation,
nonlinear looks with excursions, all four output transfers in both gamuts/ranges,
and actual serialized-node checks at 17/33/65. For ordinary [0,1] values, the
float32 + seven-decimal export tolerance is approximately `5.1e-8 + 6e-8*abs(value)`.
This is a **nodal** bound; resampling a nonlinear look between export nodes adds a
separate approximation error. Large supported excursions require relative tolerance.

`frontend/tests/imported-lut-parity.mjs` compares every serialized channel in
19 Python/browser cases: a 33³ nonlinear base, all four transfers × both gamuts
× full/legal with overlapping bands and warnings, plus 33³/65³ finite markers.
Measured maximum absolute channel
difference: **1.000000001e-7**. Display-color checks use independent sRGB equations and tolerances
up to 5e-7 for normalized outputs. No new color-science dependency is introduced.

A neutral V-Log sweep of 20,001 camera-code samples measured the support above 1%
white for a white marker centered at 0 stops, half-width 0.25, over a black look:

| Export size | Requested interval | Sampled/interpolated support in stops |
| --- | --- | --- |
| 17³ | -0.25 to +0.25 | -0.6964 to +1.0815 |
| 33³ | -0.25 to +0.25 | -0.7008 to +0.6444 |
| 65³ | -0.25 to +0.25 | -0.4728 to +0.4248 |

The same experiment at half-width **0.001 stop hit zero neutral grid nodes at all
three sizes**. A finite cube cannot promise an infinitely sharp IRE/stop marker.
The sampled preview exposes those misses rather than displaying ideal analytic
bands as if they were the exported result. Wider markers and larger grids can help;
verify the actual artifact on known camera samples. Boundaries depend on the input
direction and marker geometry, so the table is an example, not a universal bound.

References: [Colour LUT3D domain and apply API](https://colour.readthedocs.io/en/master/_modules/colour/io/luts/lut.html),
[tetrahedral interpolation](https://colour.readthedocs.io/en/master/generated/colour.algebra.table_interpolation_tetrahedral.html),
[Panasonic V-Log / V-Gamut technical reference](https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf).
