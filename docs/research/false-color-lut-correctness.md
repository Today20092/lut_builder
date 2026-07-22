# False-color LUT correctness audit

Research date: 2026-07-22

Scope: `src/lut_builder/engine.py`, `data.py`, `presets.py`, and the generated Adobe/IRIDAS `.cube` files. This is a standards-and-primary-source audit, not an application-code change.

> [!NOTE]
> The findings below describe the implementation reviewed on the research date and remain as historical evidence. The disposition table describes the current repository state.

## Current disposition

| Original recommendation | Current status | Coverage or follow-up |
|---|---|---|
| Select each configured camera decoder and verify documented middle grey | Corrected. Camera generation uses the configured decoder, with table-driven numerical coverage. | [Decoder regressions](../../tests/test_smoke.py), [issue #3](https://github.com/Today20092/lut_builder/issues/3) |
| Describe the product as a diagnostic scene-exposure LUT | Corrected in the CLI and contributor documentation. | [Diagnostic semantics regressions](../../tests/test_diagnostic_semantics.py), [issue #4](https://github.com/Today20092/lut_builder/issues/4) |
| Use encoded-signal threshold terminology instead of claiming sensor clipping | Corrected. Warnings describe channel-level encoded-signal boundaries and explicitly do not claim physical sensor clipping. | [Warning regressions](../../tests/test_diagnostic_semantics.py), [issue #4](https://github.com/Today20092/lut_builder/issues/4) |
| Define full/legal-range semantics and verify black, middle grey, and white | Partially corrected. Endpoint semantics have regression coverage; bounding all gamut and transfer excursions to the legal range remains open. | [Range regressions](../../tests/test_diagnostic_semantics.py), [issue #10](https://github.com/Today20092/lut_builder/issues/10) |
| Convert authored sRGB overlay colors into the selected target gamut | Corrected for Rec.709 and Rec.2020 outputs. | [Overlay regressions](../../tests/test_engine.py), [issue #5](https://github.com/Today20092/lut_builder/issues/5) |
| Verify finite-grid threshold and interpolation behavior | Corrected with neutral-ramp coverage at 17-, 33-, and 65-point sizes. Host applications may still choose different interpolation algorithms. | [Interpolation regressions](../../tests/test_engine.py), [issue #5](https://github.com/Today20092/lut_builder/issues/5) |
| Validate and dispatch every configured transfer function, including optional log output | Pending. Shipped camera decoding is corrected, but catalog validation and the optional log-output encoder still need end-to-end dispatch coverage. | [Issue #11](https://github.com/Today20092/lut_builder/issues/11) |

## Original findings (historical)

## Executive verdict

The audited implementation was **not exposure-accurate**. Its first operation silently decoded every supported camera as Cineon, so all downstream scene-linear luminance, stop bands, gamut conversion, monochrome rendering, and IRE values were based on the wrong signal. This historical defect has since been corrected; see the current disposition above.

After that fix, the broad ordering of operations is defensible—decode log, calculate linear-light exposure, convert gamut, encode the output, then apply false color—but four more semantics need tightening: the output is an OETF-encoded signal rather than a complete display rendering transform; “IRE” needs explicit full/legal-range semantics; clip indicators cannot be advertised as sensor clipping; and overlay colors are authored as sRGB values even for Rec.2020 output.

## Findings, in priority order

### 1. Critical at audit time: every camera was decoded as Cineon

The code calls:

```python
colour.models.log_decoding(samples, method=profile["log"])
```

In Colour 0.4.7, `log_decoding(value, function="Cineon", **kwargs)` selects the decoder with the `function` argument. `method` is only forwarded as a decoder-specific optional keyword. Consequently the selector remains its default, Cineon; Colour's dispatcher filters unsupported keywords before calling the selected function, so this does not fail loudly. The same incorrect keyword is used by startup validation, which therefore validates Cineon repeatedly rather than the configured camera curve. See Colour's [0.4.7 API signature](https://colour.readthedocs.io/en/develop/generated/colour.log_decoding.html) and [dispatcher source](https://colour.readthedocs.io/en/develop/_modules/colour/models/rgb/transfer_functions.html).

Required correction: select the curve with `function=profile["log"]` in both generation and validation. Add one numerical check per profile (at minimum, each manufacturer's documented middle-grey code must decode to approximately `0.18`). Merely asserting that a `.cube` file was created, as the current smoke test does, cannot detect this failure.

This bug invalidates every current stop threshold because stops are calculated from the wrongly decoded values. It also invalidates the subsequent source-to-target RGB conversion, since those RGB values are not actually scene-linear camera RGB.

### 2. High: stop math is structurally correct once decoding is corrected

The formula `log2(Y / 0.18)` correctly expresses exposure differences: one stop is a doubling or halving of exposure. Canon describes exposure latitude in exactly those terms and uses an 18% neutral grey reference ([Canon sensitometric white paper](https://downloads.canon.com/nw/learn/white-papers/cinema-eos/WhitePaper_sensitometric.pdf)).

Calculating `Y` from **linear** camera-gamut RGB using the Y row of that RGB colourspace's RGB-to-XYZ matrix is also the right category of operation. Applying Rec.709's nonlinear luma equation directly to S-Gamut3.Cine, V-Gamut, etc. would not be correct. BT.709 defines its own primaries, OETF, and nonlinear signal equations ([ITU-R BT.709-6](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.709-6-201506-I%21%21PDF-E.pdf)); BT.2020 separately defines different primaries and coefficients ([ITU-R BT.2020](https://www.itu.int/rec/R-REC-BT.2020/en)).

Qualification: negative decoded RGB values and wide-gamut colors can yield non-positive Y. Flooring Y at `1e-6` prevents NaNs, but it assigns all such inputs an arbitrary finite stop value. That is a practical LUT-domain guard, not a physically meaningful exposure measurement, and should be documented as such.

### 3. High: the Rec.709/Rec.2020 result is not a complete display transform

The engine converts scene-linear camera RGB directly into target primaries and applies the target OETF. BT.709's OETF maps scene light to a nonlinear production signal; a reference display uses an EOTF and the end-to-end system includes viewing/rendering behavior. ITU distinguishes OETF, EOTF, and OOTF explicitly ([ITU-R BT.2087-0](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2087-0-201510-I%21%21PDF-E.pdf)).

Therefore `target_name = "Rec.709"` currently means roughly “matrix into Rec.709 primaries and apply the BT.709 OETF,” not “camera log to a finished Rec.709 viewing transform.” There is no highlight roll-off, tone mapping, exposure placement, or output rendering transform before clipping to `[0,1]`. This may be acceptable for a diagnostic false-color LUT, especially when fill mode replaces every output, but the neutral/background image and IRE bands should not be described as matching a manufacturer or Resolve display transform.

### 4. High: IRE math is reasonable for full-range R'G'B', but range semantics are mixed

After target OETF encoding, using the target's nonlinear luma coefficients to calculate Y' is the correct form of luma calculation. BT.709 and BT.2020 define Y' from nonlinear R'G'B', not from linear-light RGB ([BT.709-6](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.709-6-201506-I%21%21PDF-E.pdf), [BT.2020](https://www.itu.int/rec/R-REC-BT.2020/en)). Thus `dot(final_data, target_weights) * 100` is a coherent **full-range normalized signal percentage** before legal scaling.

However, studio/video-range coding maps nominal 10-bit R'G'B'/Y' black and white to codes 64 and 940. ITU gives the normalized coding equation equivalent to `64 + 876*E'` for 10-bit video range ([ITU-R BT.2087-0](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2087-0-201510-I%21%21PDF-E.pdf)). The code computes IRE before applying its 64–940 scaling, so an “IRE” band means full-range signal percent regardless of the selected output range. That is internally consistent only if clearly documented. If users expect waveform IRE on the encoded legal-range output, the measurement and labeling need one explicit convention and tests at black, middle grey, and white.

The final affine scaling to `[64/1023, 940/1023]` is numerically the nominal 10-bit video-range mapping, but `.cube` stores floating-point transforms without signaling whether the host will interpret input/output as data/full or video/legal. Range behavior is commonly controlled by the host/media pipeline, so baking range conversion into LUT values can double-scale when the host also performs legal/full conversion. Make this option explicitly a signal-range conversion LUT, with host setup instructions, rather than a generic “legal” property of the cube.

### 5. High: “sensor clipping” cannot be inferred from these LUT inputs

The cube receives processed log-encoded RGB, not raw photosite values. A manufacturer log curve describes how camera-linear values are encoded, but the sensor saturation point varies with camera model, exposure index, recording mode, and processing. Canon explicitly notes that the Canon Log 2 curve extends beyond the sensor saturation point, while Canon Log 3's encoded extent and sensor saturation coincide in the discussed configuration ([Canon HDR white paper, Part 2](https://downloads.canon.com/nw/learn/white-papers/cinema-eos/WhitePaper_Deep-Dive-HDR-Part2.pdf)). Panasonic's own false-color documentation says V-Log white clip changes with EI and main codec ([VariCam LT false-color guide](https://pro-av.panasonic.net/jp/cinema_camera_varicam_eva/products/varicam_lt/html_manual/chapter07_03_06.htm)).

Accordingly, one fixed `log_floor`/`log_ceiling` per curve cannot represent physical sensor clipping across cameras and modes. Several current values are also presented as exact without support strong enough for that meaning (notably Canon Log 3 `0.04/0.90` and ARRI LogC3 `0.03/0.91`). Rename these as configurable **encoded-signal thresholds** unless they are keyed by specific camera/mode/EI and backed by manufacturer values.

The channel rules have another semantic problem: `min(R,G,B) <= floor` marks a saturated color with one low channel as “crushed black,” while `max(R,G,B) >= ceiling` marks any single high channel as white clipping. These can be useful per-channel gamut/signal warnings, but they are not neutral-luminance exposure clipping or proof of sensor clipping.

Finally, expanding thresholds by half a LUT grid step changes the requested threshold by about 0.0156 for a 33-point cube. That is a sampling workaround, not a physical tolerance. Normal 3D-LUT interpolation already blends between lattice entries, so clip colors near discontinuities will also interpolate unless the threshold region spans sufficient nodes.

### 6. Medium: manufacturer grey/false-color values show why one generic IRE palette is only a UI default

Official reference levels differ by encoding:

- Sony gives S-Log3 middle grey at 41% and 90% white at 61% ([Sony FS5 shooting guidance](https://pro.sony/ue_US/insight/filmmaking-tips/broadcast-fs5-shooting-tips)).
- Panasonic's V-Log false-color bands place 18% grey at 40.5–43.6%, one stop over at 48.7–51.8%, and state that white clip varies by EI/codec ([VariCam LT guide](https://pro-av.panasonic.net/jp/cinema_camera_varicam_eva/products/varicam_lt/html_manual/chapter07_03_06.htm)).
- Canon specifies Canon Log 3 18% grey at 34.3% and 90% white at 56.4% ([Canon Log exposure guide](https://downloads.canon.com/nw/home/products/camera/Firmware-Canon-Log.pdf)).

The repo's `_IRE_THRESHOLDS` are merely suggested display colors, not exposure standards. That is fine if labeled as palette defaults. IRE bands applied **after** a custom output transform cannot be compared directly with manufacturer IRE guidance for the original camera-log signal.

### 7. Medium: overlay RGB triplets have an implicit sRGB meaning

`#RRGGBB` colors are converted to normalized, already-encoded RGB triplets and written directly over target-encoded values. This gives the intended appearance for a Rec.709/sRGB-like target, but the same triplets in Rec.2020 primaries represent different chromaticities. For Rec.2020 output, author colors in a declared source color space (currently sRGB is implied), decode them to linear light, convert their primaries to the selected target, then apply the target encoding. Otherwise the colors are valid numeric triplets but not colorimetrically consistent selections.

The optional monochrome base is otherwise conceptually sound: target-linear Y replicated into RGB is neutral before applying a channel-identical OETF.

### 8. Medium: `.cube` domain and serialization are sound; discontinuities remain resolution-dependent

Adobe's Cube specification says omitted `DOMAIN_MIN`/`DOMAIN_MAX` default to `0 0 0` and `1 1 1`; it defines `LUT_3D_SIZE` and the ordering of lattice values ([Adobe Cube LUT Specification 1.0 mirror](https://kono.phpage.fr/images/a/a1/Adobe-cube-lut-specification-1.0.pdf)). Colour's writer emits `LUT_3D_SIZE`, `DOMAIN_MIN`, `DOMAIN_MAX`, and serializes the `LUT3D` table according to that format ([Colour IRIDAS Cube writer source](https://colour.readthedocs.io/en/develop/_modules/colour/io/luts/iridas_cube.html)). Initializing `colour.LUT3D(size=N)`, reshaping its table, restoring the same shape, and letting Colour write it therefore avoids hand-written channel-order mistakes.

The format does not prescribe a universal host interpolation algorithm. A false-color LUT intentionally contains sharp discontinuities, while trilinear or tetrahedral interpolation blends lattice outputs between nodes. A 33-point cube can visibly shift/soften narrow bands, especially diagonal color transitions. The minimum validation should render neutral ramps and saturated RGB sweeps through the same interpolation used by target hosts, at 17/33/65 sizes, and quantify threshold error. Do not claim exact sub-grid IRE or stop boundaries from a finite 3D LUT.

## Minimal correction/verification sequence

1. Replace `method=` with `function=` in generation and validation.
2. Add a table-driven numerical check: each official middle-grey log code decodes to about `0.18`; prove each profile selects a distinct decoder.
3. Decide and name the product semantics: diagnostic scene exposure LUT versus a camera-to-display viewing LUT. If diagnostic, avoid claiming the base image is a finished Rec.709/2020 rendering.
4. Rename clip values as encoded-signal thresholds, or make them camera/mode/EI-specific with first-party citations.
5. Define IRE/range convention and test black/grey/white under both full and legal settings in the intended host.
6. Convert overlay colors from declared sRGB into the target color space when Rec.2020 is selected.
7. Add a neutral-ramp host/interpolation fixture before tuning cube size or half-grid tolerances.

## What is already right

- The intended log → linear → gamut conversion → output encoding order is correct in principle.
- Stops relative to 18% grey via `log2(Y/0.18)` are correct in principle.
- Linear-light CIE Y uses the source gamut's matrix rather than hard-coded Rec.709 weights.
- Display-domain Y' uses target-specific coefficients after nonlinear encoding.
- Legal-range scaling uses the nominal 10-bit 64–940 endpoints.
- Delegating `.cube` domain/order serialization to Colour is safer than hand-writing it.

At audit time, those points were contingent on fixing decoder selection. That camera-decoding correction and its numerical regressions are now in place; see the current disposition above. The broader transfer-dispatch work remains tracked in [issue #11](https://github.com/Today20092/lut_builder/issues/11).
