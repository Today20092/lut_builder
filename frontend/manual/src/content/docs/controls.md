---
title: Controls and colors
description: What each configuration, band, graph, palette, and warning control does.
---

## Configuration

| Control | What it changes |
| --- | --- |
| Camera recording | The input log decoder and camera gamut. Match both to the recording/export path. See [profiles](../profiles/). |
| Target display | Rec.709 or SDR Rec.2020 diagnostic output. This is not the source gamut. |
| Output settings | Opens cube size, base-image, range, and filename settings. |
| Cube size | 17³, 33³, or 65³ samples. Larger cubes better resolve narrow bands; host interpolation still softens boundaries. |
| Monochrome base | Makes uncovered portions of the base image gray. Disabled in Fill because zones cover the image. |
| Output range: Full / Data or Video / Legal | Full uses 0–1 (10-bit-equivalent codes 0–1023); Legal packs output into 64–940. Does not change input range or warning thresholds. Avoid a second legal-range conversion in the host. |
| Which should I use? | Explains how to match the device applying the LUT, distinguish input conversion from LUT output packing, and test a grayscale ramp. |
| Customize output filename | Opens the filename template. `%inputgamma%`, `%targetgamma%`, and `%id%` expand to profile, target, and a settings-derived ID. A fixed name also works. |
| Use automatic filename | Restores the built-in template. The ID is stable for the same settings; it is not a unique camera or media identifier. |

## Exposure bands

**Stops** marks scene exposure relative to 18% gray. New **IRE** selections measure camera-log encoded RGB luma before the viewing conversion, on a full-code-range percentage scale. Older imported setups can retain target-display IRE; the editor labels them **Legacy setup**. **Switch to camera-log IRE** replaces their bands with fresh camera-centered presets and can be undone. **Fill** assigns a color to every exposure zone; the browser's Fill mode uses stops.

| Control | How to use it |
| --- | --- |
| Exposure diagram | Shows band geometry and palette colors. It is not a measurement of uploaded footage or a test of the exported cube. |
| Current exposure bands | Sticky summary of applied bands or the active palette draft while you scroll. It does not measure uploaded footage. |
| Band center / colored area | Select a band; drag to move its center. Double-click a band or zone to open its color picker. |
| Band edges | Drag an edge to change width. Numeric fields are the alternative to dragging. |
| Fill dividers | Move a boundary between neighboring colors. At the boundary, the higher zone wins. The final zone fills the rest. |
| Add band | Adds a band or color zone. Fill retains at least two colors. |
| Undo last band edit | Restores the last band edit and selection, including a drag as one edit. Unrelated configuration changes are preserved. No redo or long history. |
| Band setup & graph settings | Opens arrangement presets, shared width, drag step, and graph range. |
| Band preset / Fill preset + Apply preset | Replaces the arrangement and colors with Standard or Detailed. Choosing a preset alone does not apply it. Undo restores the previous arrangement. |
| All band widths / All total widths | Sets every ordinary band's **total** width. “Mixed” means the individual widths differ. |
| Drag step | Selects 1, ½, or ¼ stop movement. IRE editing uses its own increment. |
| Visible range | Changes only the Stops diagram viewport, not the LUT. Values outside it remain editable in the table. |
| Color | Opens the individual band's color picker. |
| Position / Boundary to next color | Sets the band center or Fill boundary. |
| Total width | Full span, not ± width. Width 0.6 means ±0.3. Fill has coverage labels instead. |
| Remove / Confirm remove | Removes the row after confirmation. Graph Delete removes directly; undo can restore it. |

Overlapping ordinary bands are applied from low to high position; the higher-position band wins. Equal positions retain their ordering. Recorded-signal warnings take priority over both bands and Fill zones.

### Worked exposure examples

For decoded source-gamut luminance `Y`, stops are `log2(Y / 0.18)`. Thus `Y = 0.09`, `0.18`, and `0.36` represent −1, 0, and +1 stop. The source gamut's RGB-to-XYZ matrix supplies the luminance weights; this is not an average of the recorded RGB channels.

In a new camera-log IRE setup, a band at 50 with total width 10 covers encoded input luma from 45 to 55. Neutral 50 corresponds to code 511.5 on the full 10-bit-equivalent input scale. Changing output range does not change this measurement. The source gamut supplies the weights applied to encoded RGB; colored subjects need not rank the same way as scene-linear Stops. This scale does not promise an identical reading on every camera waveform or monitor.

The neutral 18% reference depends on the camera: approximately 41.1 for Sony, 42.3 for Panasonic, 34.3 for Canon, 39.1 for ARRI, 33.3 for RED, and 38.4 for Blackmagic. These use the existing profile curve defaults. Legacy target-display IRE instead uses target-encoded luma with a neutral reference around 40.9. JSON preserves the chosen interpretation. See the [camera-log IRE reference](https://github.com/Today20092/lut_builder/blob/main/docs/camera-log-ire.md). Neither interpretation supplies a universal skin-tone target.

## Color picker

Click a band or warning swatch. Use the saturation/value area and hue control, numeric color controls where shown, or enter a six-digit `#RRGGBB` value. The bundled named swatches provide another starting point. Invalid colors must be corrected before they can be applied. Escape closes the picker and returns focus. See [keyboard controls](../keyboard/) for alternatives to pointing.

## Palettes and gradients

**Recolor all bands** changes colors without moving the bands. Editing a single swatch remains available if you want to keep the other colors.

| Control | Meaning |
| --- | --- |
| Choose a starting palette | Select Exposure zones or Reference emphasis to create a draft. |
| Shape your gradient | Edit the gradient dots and blend controls. |
| What does the reference mean? / legend | Explains the reference and the low-to-high exposure colors. Green is a chosen reference, not universally correct exposure. |
| Gradient dots | Change the anchor colors and their positions. Add, select, move, or remove editable dots using the shown controls. The exposure reference remains fixed in position. |
| Blend: Colorful · OKLCH | Blends around a hue circle; colors are fitted to sRGB. |
| Hue path | Shorter or longer route around the hue circle. Only applies to Colorful. |
| Blend: Direct · OKLab | Blends directly between colors and may pass through gray. |
| Advanced: adjust all colors | Opens whole-palette lightness and strength adjustments. |
| Keep chosen lightness | Retains each dot's chosen lightness. |
| Dark to light | Assigns increasing lightness across the palette. |
| Same lightness | Uses the dots' average lightness. |
| Overall color strength / Color intensity | 100% keeps chosen chroma, 0% makes gray, 200% requests twice the chroma. sRGB fitting can limit the visible increase. |
| Reset adjustments | Restores chosen lightness and 100% strength. |
| Use palette | Applies the valid draft to the bands, replacing individual color overrides. |
| Cancel preview | Discards the audition and keeps applied colors. A download during an audition uses applied colors. |
| Apply false color by exposure | Uses the standard exposure-color mapping instead of the draft gradient; it can be undone. |
| Save and reuse palettes | Opens the browser-local palette library; see [saving](../save-and-apply/#palettes-and-setups-are-different). |

Starting exposure palettes anchor the reference at zero stops or the selected profile's neutral camera-log IRE value. Legacy target-IRE setups retain the neutral target reference. Their end colors extend beyond the palette scale. Changing cameras updates the reference and palette scale; existing band numbers remain user edits until a preset is applied. Older saved custom gradients can instead span the current band range; their center is not necessarily the exposure reference. In Fill, colors cover whole zones.

## Recorded-signal warnings

Each checkbox enables one warning; its color picker changes only the indicator color. Neither control edits the numeric profile threshold. Read [how the limits are calculated](../signal-limits/) for purple/red interpretation, precedence, and cube-size tolerance.

## Remaining panels

The header's **01 Configure**, **02 Edit bands**, and **03 Download** jump to those sections. **Help / Manual** opens this manual in a new tab. **Keyboard shortcuts (?)** opens the shortcut dialog.

For **Saved LUT setups**, **Generate LUT**, JSON import/export, and progress messages, see [Save, export, and apply](../save-and-apply/). For camera media, source interpretation, video frame controls, pixel inspection, and checked-cube downloads, see [Verify camera media](../verification/). For error and warning recovery, see [Troubleshooting](../troubleshooting/).
