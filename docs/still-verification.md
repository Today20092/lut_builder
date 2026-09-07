# Camera-matched still verification

In the Workbench, choose **Camera-matched**, select a supported still, select the source transfer function, gamut and range, then confirm the recording/export facts. Choose **Verify still**. The full frame is processed on the local Python server at its original resolution. No browser-decoded camera pixels enter the LUT.

This verifies the declared source interpretation against the serialized LUT. It does not identify the recording profile, certify physical sensor exposure, or reproduce another application's display configuration.

## Supported inputs

| Input | Contract |
| --- | --- |
| PNG | Non-interlaced, 16-bit RGB, no alpha, animation, EXIF orientation or color tags. Local FFmpeg decodes to `rgb48le`; unsigned codes are divided by 65535 into float64. No matrix, transfer or range conversion is requested. |
| PFM | RGB `PF`, positive width/height, scale exactly `-1` for little-endian or `+1` for big-endian float32. Three-line header, bottom-up rows, RGB interleaved. No comments or extra bytes. Values and excursions are preserved; rows are reversed to top-left origin. |

Limit: 4,194,304 pixels and 48 MiB plus 1 KiB header. One verification job and one result are retained per workspace. Upload has a 30-second total deadline, including partial uploads. A new check replaces the old result. Cancel discards the result and stops work at the next processing boundary. PNG decode has a 30-second timeout; cube generation and a running PNG decode finish before cancellation is observed. Temporary cubes are deleted after reading. Source/result memory is released when replaced, cancelled, invalidated by the browser, or the local workspace exits. Nothing is uploaded to a cloud service.

For PNG, install FFmpeg on PATH and restart the workspace. PFM needs no extra decoder. The supported PNG path was tested against every uint16 code, with different values in each RGB channel and rows. JPEG, 8-bit PNG, RAW, TIFF, video, and display/graded images are unsupported in this still checker. Video extraction is a separate integration.

Export the still from a workflow that preserves the camera's RGB code values. Disable automatic input/display transforms and output grading. Do not strip color tags from a graded image to bypass validation. `iCCP`, `sRGB`, `gAMA`, `cHRM`, `cICP`, `mDCv` and `cLLi` tags are rejected. An untagged file still cannot prove that its samples are camera-encoded, so the explicit confirmation is required.

Transfer and gamut must exactly match the selected LUT camera profile. The range option means normalized camera codes in the convention consumed by the existing log decoder. It does **not** mean that legal transport values should be expanded by this checker. Any YCbCr matrix/chroma/range decoding must already have been resolved before the still was exported. Unknown or mismatched interpretation prevents verification. Float32 storage does not identify the bit depth of the original recording.

## Cube and display contracts

`engine.serialize_lut(setup)` calls the existing `generate_lut` export, then reads its bytes. Both normal download and verification use this helper. Verification writes those bytes to a temporary `.cube`, reads it with `colour.read_LUT`, and passes `colour.algebra.table_interpolation_tetrahedral` explicitly to `LUT3D.apply`. The default interpolator is not used. The **Download checked cube** action returns the exact checked bytes. Ordinary generation has a timestamped header, so a later export can have a different SHA-256 even if its numerical table is identical.

Source channels outside `[0, 1]` remain intact in the source samples. They are clamped at the cube's declared `[0, 1]` input boundary, counted and reported. The pixel inspector shows the original source value as well as the numerical cube result. It never samples the resized display image.

Export mathematics are unchanged: per-channel log decoding, source-gamut luminance, target transform, bands/monochrome/fill, half-grid encoded-signal warnings with high priority, legal/full output and float32 sampling all remain in the existing engine. Authored Rec.709 overlay hex triplets remain stored directly. Rec.2020 overlays retain the existing sRGB-to-target conversion, including its small matrix-rounding differences. Stored code-value equality is not a promise of identical displayed hex colors.

The explicit SDR viewing policy supports Rec.709 and SDR Rec.2020 in either output range:

1. For legal output only, expand `(value - 64/1023) / (876/1023)` in the display path. Numerical cube output stays legal. The export's inward float32 endpoints can leave sub-micro display differences from ideal endpoints.
2. Apply BT.1886 with ideal black `L_B=0` and normalized white `L_W=1`, equivalent to `V**2.4`. This emulates an ideal SDR display response, not inverse scene OETF reconstruction.
3. Convert linear Rec.2020 primaries to BT.709/sRGB primaries. Rec.709 already shares sRGB primaries and D65. Use the accurate BT.709 matrices instead of rounded sRGB matrices for this display conversion.
4. Clip display gamut to `[0, 1]`, apply the sRGB transfer function, and round to 8 bits only when encoding the lossless, sRGB-tagged display PNG. No HDR tone mapping is performed.

The view is always the unblended LUT result at 100% strength. Original/Split comparison is disabled because there is no established camera-to-SDR reference viewing transform. Raw log interpreted as sRGB would be misleading. Demonstration remains a separate mode, with its own illustration/opacity controls, and is never substituted after a verification failure.

The UI invalidates a result immediately after source, interpretation or setup changes. In-flight responses must match both the request identity and current input snapshot. Cancellation, late replies, invalid sources and failed decoding leave no verified image. Provenance includes source name/hash/storage/decoder facts, confirmed interpretation, normalized setup/hash, actual cube hash/size, interpolation, output interpretation, viewing policy, clamp count and numerical-library versions.

## Reuse from video extraction

Call `verification.verify_rgb(rgb, setup, interpretation, check_cancelled=...)` after decoding a selected frame. `rgb` is a finite `numpy.ndarray`, shape `height × width × 3`, float32 or float64, top-left origin, RGB order, within the same pixel limit. It must contain normalized camera code values with decoder excursions intact.

`interpretation` must contain `transfer` and `gamut` matching `PROFILE_CATALOG.source(setup.profile_name).log/gamut`, `range="camera-code-values"`, `confirmed=True`, and a nonempty `decoding` string documenting the resolved matrix, range, chroma and other decoding facts. Do not pass the demonstration PNG or display RGB. The still HTTP adapter uses the fixed decoding confirmation `RGB; no color transform or range scaling`; the shared core accepts the video decoder's explicit description.

The result is `VerificationResult(source_rgb, output_rgb, display_rgb, cube, provenance)`. `source_rgb` is a preserved copy. `output_rgb` is float64 interpolation of the serialized cube, still in its declared output range. `display_rgb` is floating sRGB before display quantization. `cube` contains the exact export bytes. Add frame identity, actual timestamp and decode metadata to `provenance["source"]`. `display_png(result.display_rgb)` encodes the browser image. `check_cancelled` raises to stop processing; it is checked before/after export and between 65,536-pixel chunks.

The still endpoints use the existing launch-token header and JSON boundary: `/verify` accepts `request_id`, `source: {name, data}` with base64 file bytes, `setup`, and `interpretation`. `/verify-pixel` takes `request_id`, integer `x`, `y`; `/verify-cube` downloads the retained artifact; `/verify-cancel` releases a matching result or cancels that job. Results expire on replacement. These endpoints do not need to become the video transport API.

## Numerical evidence

Tests are in `tests/test_verification.py`, `tests/test_verification_web.py` and `frontend/tests/verification.test.mjs`. Expected display values and the neutral analytical transform use independent published equations, not the application function under test.

Measured on Windows with Colour 0.4.7, NumPy 2.4.2, and FFmpeg 8.1.2 from the Gyan full build. The live browser check covered upload, verification, original-resolution pixel inspection, expanded-view focus return and no horizontal overflow at 1440 × 1000 and 390 × 844. The displayed image is sRGB software output; the monitor was not calibrated or measured.

| Check | Measured result and tolerance |
| --- | --- |
| Serialized cube application | Independent red-fastest text reader and a barycentric linear-system solve over four tetrahedron vertices. Neutral nodes, asymmetric colors, six channel orderings, excursions, threshold neighborhoods and seeded random points, in stops/IRE/fill at 17/33/65. Maximum error `6.72e-15`; tolerance `1e-12` allows floating-point solve error. |
| Analytical neutral nodes | Independent Sony S-Log3 inverse and BT.709 OETF. Maximum error `4.58e-8`; bound `8.1e-8` comes from float32 half-ULP `2^-25` plus seven-decimal serialization `5e-8`. |
| Narrow-band analytical difference | A 0.001-stop band at middle grey misses the neutral nodes in a 17³ cube. Measured max difference from analytical red `0.587104`. This expected sampling limitation has no tiny global equality tolerance. |
| Display conversion | Ideal BT.1886 followed by sRGB maps 0.5 to exactly 0.4725; primaries/black/white and legal/full agree within `1e-12` before quantization. Existing Rec.2020 authored-white rounding is tested separately within `4e-5` in display RGB. |
| PNG precision | All 65,536 uint16 codes round-trip exactly through the decoder, with RGB and row ordering checked. |
| Display PNG | Independent FFmpeg decode of the served PNG matches `[121, 53, 20]` for the stored Rec.709 `#804020` overlay. The expected values come from rounding `1.055 * [128,64,32] - 0.055 * 255`. |
| Supported combinations | All six camera profiles × both SDR targets × full/legal output, plus warnings, finite-value rejection, malformed/tagged inputs, missing decoder, busy/cancel and expired results. |

Browser tests cover required unknowns, source mismatch, confirmation reset, settings/source invalidation, late responses, cancellation, failure without demonstration fallback, pixel inspection and dialog focus restoration. Numerical correctness is established separately from browser layout. No destination-application or calibrated-monitor comparison is claimed.

## Ticket #36 integration handoff

Working branch: `codex/workbench-ticket-4`, based on `c944573fe15fbdecfd25b6632b83518a956fbfbc`. No merge to main or issue closure was performed. The independent original checkout was not modified.

Files changed: `src/lut_builder/verification.py` adds the decoded-RGB core, PNG/PFM decoding and SDR rendering; `engine.py` shares export serialization; `web.py` adds the token-protected verification, pixel, checked-cube and cancellation endpoints. `frontend/src/CameraVerification.tsx` adds the connected UI; `App.tsx` adds the mode switch. Python tests are `tests/test_verification.py` and `tests/test_verification_web.py`; the UI test is `frontend/tests/verification.test.mjs`. The production assets and static index were rebuilt. README and this document explain support and reuse.

Final checks: 127 Python tests passed; 28 frontend tests passed, with the verification test rerun after lifecycle cleanup. `tsc -b`, Vite production build, Ruff on the changed Python files, targeted `ty check`, and ESLint on the new UI/test pass. Repository-wide `ty check` reports seven existing diagnostics in `cli.py`, `test_diagnostic_semantics.py`, `test_setup.py` and `test_smoke.py`. Full ESLint reports four existing Fast Refresh export warnings in `App.tsx` and one existing `prefer-const` violation in `editor.ts`. Those unrelated failures were not changed.

Review: Standards found no blocking issue. Spec review found an unbounded partial-upload wait; the final code uses a total upload deadline and a socket-level regression confirms that the next request can verify successfully. Both axes found no remaining blocking issue after that fix and completed-result cleanup.

## Sources

- [Preview fidelity investigation](research/preview-fidelity.md)
- [Colour LUT3D API](https://colour.readthedocs.io/en/v0.4.7/generated/colour.LUT3D.html) and [tetrahedral interpolation](https://colour.readthedocs.io/en/master/_modules/colour/algebra/interpolation.html)
- [Colour BT.1886 API](https://colour.readthedocs.io/en/v0.4.7/generated/colour.models.eotf_BT1886.html)
- [PFM format](https://www.pauldebevec.com/Research/HDR/PFM/)
- [Sony S-Log3 technical summary](https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf)
