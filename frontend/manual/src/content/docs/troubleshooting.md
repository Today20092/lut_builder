---
title: Troubleshooting and limitations
description: Recover from unexpected colors, invalid files, missing saves, and browser limits.
---

## Purple or red covers more than expected

Check whether that color belongs to an exposure band or an enabled recorded-signal warning. Any single low/high RGB channel can trigger a warning. Saturated colors can cross a limit even when overall brightness seems ordinary. The exporter also uses a half-grid tolerance and the host interpolates between nodes. Read [warning calculations](../signal-limits/) and the [profile's evidence limits](../profiles/).

Do not infer sensor clipping from the color alone. Disabling the warning can help isolate which overlay you are seeing, but does not fix the source signal.

## Exposure colors look wrong

Check the log curve **and** gamut, any preceding camera-to-display transform, and the input range. A proxy may already be display-rendered despite its filename. **Full / Data** versus **Video / Legal** only changes LUT output; it cannot repair an input mismatch.

New IRE selections measure camera-log encoded luma on a full-code-range percentage scale. Older setups can retain target-display IRE and are labeled Legacy setup. Check that basis before comparing values; neither interpretation promises an identical reading on every waveform. Green is a chosen reference, not a universal skin-tone target. Rec.2020 output needs an appropriate downstream interpretation; it is not HDR.

## A band is missing or its edge looks soft

Check its position, total width, overlap with a higher-position band, and warning overrides. An out-of-view band still exists; use its table row or expand the visible graph range. Very narrow bands can fall between cube samples. Try a supported larger cube or a wider band, then test the actual host's interpolation.

Fill uses boundaries and covers every zone. Its width fields are intentionally absent. Applying a preset replaces both positions and colors; undo is one band edit deep.

## My download does not use the preview colors

Choose **Use palette** to commit the draft. A palette audition or a saved draft does not change the exported colors until applied. The Generate panel warns when a preview is pending. A verification result also becomes stale after settings change: run it again and download its checked cube.

## A control is disabled or a field rejects input

Read the nearby message. Invalid colors need six hexadecimal digits; positions and widths must be finite numbers, widths cannot be negative, and IRE positions are limited to 0–100. A numeric draft commits on Enter or blur; Escape discards it. Fill keeps at least two colors and disables monochrome base. Undo requires a previous band edit. Generation is disabled during generation or while the setup is invalid.

Palette apply/save requires valid anchors and an appropriate name; applying needs bands to color. Saved-item operations need a selection. Correct the underlying field rather than repeatedly pressing the disabled control.

## Verification is disabled or fails

Confirm source transfer/gamut, range, and recording/export facts. For video, inspect first, select a valid frame, and confirm matrix, range, chroma location, and bit depth. Changing source/settings clears confirmation or invalidates results.

Check [format and resource limits](../verification/). JPEG, RAW, tagged/8-bit/alpha PNG, unsupported video layouts, rotation, or oversized files cannot be used in the browser verifier. If reported transfer/primaries disagree, establish whether the proxy was transformed. Do not check a confirmation box merely to dismiss the warning.

If the decoder cannot load, check the connection and browser blocking rules, then retry. If memory is exhausted or the tab is evicted, release the source and use a smaller supported test export that preserves camera encoding. A file being accepted does not prove its camera identity.

## Saved work disappeared

Check the browser profile and exact site address. Hosted and local workspaces have separate storage. Private browsing, cleared site data, or storage restrictions can lose presets and palettes. Import a setup JSON backup to recover its applied settings. The app does not sync saves or guarantee restoration of unsaved edits after reload or tab eviction.

## Download or generation problems

Keep the tab open while generating, check browser download permissions and the Downloads folder, and read the status message. Cancel and retry if needed. Start with a smaller supported cube on a constrained device. A second download may have a browser-added filename suffix. A camera may reject an otherwise valid cube because it requires a different size or naming convention.

## Browser and accessibility limits

The manual supports narrow-screen navigation and keyboard access. Browser-engine tests and emulated phone widths are not physical phone testing. Real device file pickers, download/share behavior, touch input, memory pressure, and background/resume behavior can differ. See the [support matrix](https://github.com/Today20092/lut_builder/blob/main/docs/browser-support.md#deferred-physical-device-checks).

Use numeric fields instead of dragging, and the [keyboard reference](../keyboard/) to navigate. The wide band table can scroll within its panel on a small screen. Manual search requires JavaScript and the generated search assets; topic navigation remains usable without search.

## Report a reproducible problem

Open a [GitHub issue](https://github.com/Today20092/lut_builder/issues). Include the browser/device, hosted or local URL, steps, expected and actual result, exact message, profile/gamut/range, cube size, and an exported setup if you can share it. For media problems, include codec/pixel format and interpretation facts. Share camera media only if you are comfortable making it available; it is not needed for every report.
