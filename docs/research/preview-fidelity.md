# Trustworthy still-frame LUT previews

Research for [Define trustworthy demonstration and exported-LUT preview behavior](https://github.com/Today20092/lut_builder/issues/31), 2026-09-06. Inspected UI revision `698512a4aa818a56bd90408a1c10597e8bba3ceb`. This is a proposed contract, not an implemented or measured accuracy claim.

## Recommendation

Keep the existing React interface and Python colour-science dependency. Offer **Exposure-color demonstration** and **Camera-matched LUT check**. For the latter, apply the actual serialized `.cube` in Python with an explicitly chosen interpolator. Keep numerical LUT output separate from browser display conversion. No new GPU stack is necessary for selecting and checking a still frame.

The dependency already supplies `read_LUT`, `LUT3D.apply`, and tetrahedral interpolation. Its default 3D interpolation is trilinear, so specify the method rather than relying on a default. Recommend tetrahedral initially, record it with results, and compare using the same method in the destination application. FFmpeg's `lut3d` supports `.cube` and both methods; if FFmpeg is used for extraction, it is a useful independent reference, not a required replacement for Python. [Dependencies](../../pyproject.toml), [Colour API](https://colour.readthedocs.io/en/v0.4.7/generated/colour.LUT3D.html), [Colour source](https://colour.readthedocs.io/en/v0.4.7/_modules/colour/io/luts/lut.html#LUT3D.apply), [tetrahedral interpolation](https://colour.readthedocs.io/en/develop/generated/colour.algebra.table_interpolation_tetrahedral.html), [FFmpeg lut3d](https://ffmpeg.org/ffmpeg-filters.html#lut3d-1).

## Current behavior and gaps

The graph traced `WorkspaceHandler.do_POST → _generate_download → generate_lut`, and the separate `exposure_preview → _preview_payload → LutImagePreview` data path. Indexed files had no recorded parse gaps; a freshness warning was checked against disk: all five cited application/dependency files matched the inspected Git revision.

| Stage | Current behavior and consequence |
| --- | --- |
| Browser source | `LutImagePreview` draws an image into a default 640×360 canvas, scales to cover and crops, then reads 8-bit pixels. This is already a resized/display-interpreted image, not preserved camera samples. |
| Approximate exposure | For log images, frontend Rec.709-weighted encoded RGB is mapped through a 256-value neutral-ramp exposure table. Decoding a weighted log signal is not the export's per-channel decoding followed by source-gamut luminance calculation. Colored subjects can differ even when neutral samples agree. |
| IRE | Browser display mode uses encoded sRGB-weighted luma × 100. Its log mode's IRE lookup is also simply code value × 100. Export instead computes target-encoded luma after gamut conversion, optional monochrome and target transfer, before overlays and legal scaling. These are different measurements. |
| Warnings | Preview draws band overlays without engine warning masks. Export flags any input channel near low/high encoded thresholds, with half a LUT-grid-step tolerance. High warning wins when both warnings apply. These indicate encoded signal, not proven sensor clipping. |
| Monochrome | Display mode writes linear luminance straight into encoded canvas bytes; it lacks sRGB re-encoding. Log mode writes its weighted encoded luma. Export computes target-linear luminance then applies the target transfer. |
| Export | Decodes camera log per RGB channel; derives stops from source CIE Y relative to 0.18; converts gamut; optionally desaturates; encodes target; maps bands/warnings; scales legal output if selected; clips and serializes a float32 sampled cube. |

Sources: [image preview](../../frontend/src/App.tsx#L123), [exposure lookup](../../src/lut_builder/setup.py#L149), [warning precedence](../../src/lut_builder/setup.py#L116), [payload](../../src/lut_builder/web.py#L87), [export](../../src/lut_builder/engine.py#L28).

## Promises for the two modes

**Demonstration:** show how chosen bands and colors organize a graded sRGB photo. Explicitly label derived stops as illustrative values relative to image-linear 18%, not recovered camera exposure. Grading, clipping and tone mapping are not inverted by decoding sRGB; the original scene is underdetermined. Camera profile changes should not pretend to identify the photo's original recording. This follows from the current demonstration computation and the separate camera gamma/gamut definitions. [Preview source](../../frontend/src/App.tsx#L123), [Sony gamma/color modes](https://helpguide.sony.net/di/pp/v1/en/contents/TP0000909109.html).

**Camera-matched check:** show the output of this exported LUT on a selected frame with confirmed source interpretation. Record source gamma and gamut separately from codec/container, decoded range/matrix, frame timestamp, LUT size, interpolation, output target/range and display policy. Metadata can propose values; missing or ambiguous metadata must remain unknown until confirmed. A source/profile mismatch must be visible. This verifies the declared pipeline, not the physical exposure or clipping of a sensor.

Use 100% LUT strength for verification. An opacity blend may be retained as an explicitly labeled comparison, but it is not the LUT output. Fit the full frame by default and preserve an original-resolution pixel sample path; cropping or resizing before measurement can mix neighboring exposures across a band threshold. These are proposed UI rules derived from the current crop/readback behavior.

## Minimal source → cube → display contract

1. Decode one requested frame on the local backend. Preserve high-bit-depth or floating-point RGB in the confirmed camera encoding. Resolve codec YCbCr matrix and range conversion once; do not apply a viewing transform before the LUT. The companion extraction investigation recommends an internal planar-float RGB buffer with dimensions, plane order, endian and profile described explicitly, and explicit matrix/range/chroma decoding. Float storage alone does not prove the decoder preserved excursions: test negative RGB and superwhite. Unsigned 16-bit PNG cannot carry every float excursion. The extraction implementation and representative camera samples still need validation.
2. Generate the same `.cube` used for download, read it back with `colour.read_LUT`, and apply it to preserved input RGB with explicit tetrahedral interpolation. Record the serialized artifact identity. Reuse existing setup validation and export; do not duplicate the engine in TypeScript.
3. Keep those numerical output samples as the verification result. For legal output, undo the declared 64/1023–940/1023 encoding only in the display path; do not feed compressed legal values directly to an sRGB canvas or expand twice. Input transport range and output LUT range are different settings.
4. Convert the declared output to an explicitly sRGB display image, after selecting the output-viewing policy below. Return that image to the browser. Display-scale the processed image, while pixel inspection references preserved samples.

The browser default is sRGB with an unsigned normalized 8-bit backing store. Drawing converts source colors into the canvas color space, and canvas rendering converts to the output device. Untagged input is interpreted as sRGB. Thus ordinary `Image → canvas → getImageData` must not be advertised as preserving arbitrary log-file code values. The standard defines float16 contexts, but implementation support and source preservation still require testing; higher canvas precision alone does not solve source interpretation. [HTML canvas standard](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element).

## Output-viewing policy remains a real choice

Numerical cube agreement is distinct from **analytical-transform agreement** and from **display appearance**:

- Analytical evaluation samples the mathematical transformation at the input RGB directly. The cube samples it on a finite grid and interpolates. Narrow bands and discontinuous warnings can therefore blend, shift or disappear between nodes. The existing half-grid warning expansion is part of export behavior and must be preserved in a faithful check.
- A check using the same serialized cube and interpolation can match its numbers without matching a destination application's display rendering, range settings or color management.
- The export is documented as a diagnostic scene-exposure transform, not a finished viewing transform. Inverting its target OETF to linear and encoding sRGB illustrates its scene-linear construction; emulating an HDTV monitor uses a display EOTF, a different promise. BT.1886 specifically defines a reference HDTV display EOTF. Choose and label one display policy before claiming visual agreement. Recommend an explicitly named SDR reference view for the initial checked-frame workflow; it needs specified EOTF/black assumptions and destination settings. [Export](../../src/lut_builder/engine.py), [existing correctness research](false-color-lut-correctness.md), [ITU BT.1886](https://www.itu.int/rec/R-REC-BT.1886/en).

There is also an existing overlay convention to preserve: `_srgb_overlay_to_target` returns authored hex triplets directly for BT.709, while non-BT.709 targets receive a decoded-sRGB/gamut/target-encoding conversion. Existing research describes direct triplets as intended for a Rec.709/sRGB-like target, and regression tests encode target-specific expected values. Do not silently change this in the preview. Decide separately whether authored colors promise stored code-value equality or display-color equality under the chosen viewing policy. [Helper](../../src/lut_builder/engine.py#L15), [regressions](../../tests/test_engine.py), [existing analysis](false-color-lut-correctness.md).

## Validation proposal — not yet measured

Keep one focused parameterized check covering each supported source profile and output target, full/legal output, monochrome/fill, stops/IRE, overlapping bands and both warnings. Use neutral camera-encoded samples corresponding to 0.18 and several ±stops; primary/secondary and asymmetric RGB samples; cube nodes; cell interiors; deterministic random samples; and samples just below/at/above band and warning boundaries, including one channel low while another is high.

Separate these assertions and reports:

| Comparison | Proposed criterion, to establish with measurements |
| --- | --- |
| Serialized cube at its nodes vs exported table | Start with maximum absolute channel error ≤ 1e-6; adjust only for measured serialization precision with evidence. |
| Python vs independent FFmpeg application of identical cube and interpolation | Start at ≤ 1e-5 in normalized float output, before display conversion. Establish actual decoder/pixel-format contribution separately. These are candidate tolerances, not achieved results. |
| Analytical vs sampled output | Report max/percentile channel error and changed classifications; separate interiors from cells crossing discontinuities. Do not impose a tiny global tolerance that hides expected finite-grid behavior. Compare supported cube sizes. |
| Output range | Assert declared numerical endpoints and ensure display expansion occurs exactly once. |
| Browser presentation | Compare a known sRGB test image's unscaled 8-bit readback against expected quantized pixels, initially within one code value. This is a software rendering test, not monitor calibration or proof of physical appearance. |

Record library versions, extraction conversion settings, interpolation and output-viewing policy with fixtures. Compare at least one selected frame in the user's destination software with matching range/interpolation/display settings before advertising visual agreement. No numerical benchmark, browser compatibility matrix or destination-application comparison was run for this research.

Remaining choices: the named output-viewing policy; code-value versus displayed-color meaning of authored overlays; and extraction-supported formats, confirmed RGB range convention, precision and metadata fallback. Video playback is outside the agreed scope; selecting a frame is included.
