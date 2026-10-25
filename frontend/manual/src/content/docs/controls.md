---
title: Controls and colors
description: What each configuration, band, graph, palette, and warning control does.
---

## Finding your controls

Use **Presets**, **Edit**, **Preview**, and **Settings** in the bottom navigation on
a phone or side navigation on desktop. **Edit** contains **Bands** and **Palette**.
**Preview** contains the photo illustration and camera verification. **Settings**
contains camera, output, imported looks and saved setups. Frequently used choices
stay visible; advanced settings and explanations expand in place. **Export LUT**
opens from the header and uses **Close** to return.

**Presets** shows separate **IRE**, **Fill**, and **Stops** sections at every width,
with a colored exposure-strip preview for each choice. Stops use a −7 to +7 scale;
IRE uses a 0–100 camera-log scale for your selected camera. The mode choices in
**Edit → Bands** also show examples alongside their labels.
Tap a preset’s **Use** button to apply it directly. Standard and Detailed options
reuse the existing arrangements; **Undo last band edit** in Bands restores your
previous bands and mode. Arrangement replacement belongs in Presets rather than
inside the band editor.

The phone exposure graph scrolls with **Bands**. **Palette** has a compact preview;
other tasks use the full screen without the exposure stage above their controls.

## Configuration

| Control | What it changes |
| --- | --- |
| Camera recording | The input log decoder and camera gamut. Match both to the recording/export path. See [profiles](../profiles/). |
| Target display | Rec.709 or SDR Rec.2020 diagnostic output. This is not the source gamut. |
| LUT output | Groups cube size, base-image, range, and filename settings. All fields stay visible in Settings at every width. |
| Cube size | 17³, 33³, or 65³ samples. Larger cubes better resolve narrow bands; host interpolation still softens boundaries. |
| Monochrome base | Makes uncovered portions of the base image gray. Disabled in Fill because zones cover the image. |
| Output range: Full / Data or Video / Legal | Full uses 0–1 (10-bit-equivalent codes 0–1023); Legal packs output into 64–940. Does not change input range or warning thresholds. Avoid a second legal-range conversion in the host. |
| Output range help | Opens the guidance below for matching the device applying the LUT. |
| Output filename template | `%inputgamma%`, `%targetgamma%`, and `%id%` expand to profile, target, and a settings-derived ID. A fixed name also works. |
| Use automatic filename | Restores the built-in template. The ID is stable for the same settings; it is not a unique camera or media identifier. |

### Choosing output range

Match the monitor or device applying the LUT. Your camera model alone cannot
determine this setting. Camera HDMI range and monitor input range must also agree;
those settings are separate from LUT output range. Avoid a second level conversion
if your device already converts levels.

Check the device's LUT instructions. For example,
[SmallHD has LUT data-range settings](https://guide.smallhd.com/a/1753041-look-3d-lut),
while [Atomos Legalize is an input conversion](https://support.atomos.com/hc/en-us/articles/10342509794959-Input-Menu).
Validate a known grayscale ramp and gray patch through your actual camera and
monitor setup. LUT output packing does not correct a mismatched incoming signal.

## Exposure bands

| Choose | Measures / divides | Best starting point |
| --- | --- | --- |
| Stops | Scene-linear luminance relative to 18% gray | Compare exposure differences |
| IRE | Camera-log encoded luma for new setups | Mark encoded-signal intervals |
| Fill | Continuous zones separated by stop boundaries | Color every exposure zone |

:::note[Imported IRE setups]
Older setups can retain target-display IRE. Check the **Legacy setup** label before comparing their numbers with a new camera-log IRE setup.
:::

**Stops** marks scene exposure relative to 18% gray. New **IRE** selections measure camera-log encoded RGB luma before the viewing conversion, on a full-code-range percentage scale. Older imported setups can retain target-display IRE; the editor labels them **Legacy setup**. **Switch to camera-log IRE** replaces their bands with fresh camera-centered presets and can be undone. **Fill** assigns a color to every exposure zone; the browser's Fill mode uses stops.

| Control | How to use it |
| --- | --- |
| Exposure diagram | Shows band geometry and palette colors. It is not a measurement of uploaded footage or a test of the exported cube. |
| Current exposure bands | Shows applied bands or the active palette draft. The desktop preview stays beside editing; the phone preview scrolls with its task. It does not measure uploaded footage. |
| Band center / colored area | Select a band; drag to move its center. Double-click a band or zone to open its color picker. |
| Band edges | Drag an edge to change width. Numeric fields are the alternative to dragging. |
| Fill dividers | Move a boundary between neighboring colors. At the boundary, the higher zone wins. The final zone fills the rest. |
| Add band | Adds a band or color zone. Fill retains at least two colors. |
| Undo last band edit | Restores the last band edit and selection, including a drag as one edit. Unrelated configuration changes are preserved. No redo or long history. |
| Presets → Standard / Detailed → Use | Replaces the arrangement and colors. Each named option has an exposure preview. Undo restores the previous arrangement. |
| All band widths / All total widths | Sets every ordinary band's **total** width. “Mixed” means the individual widths differ. |
| Movement increment | Visible choices select 1, ½, or ¼ stop movement. IRE editing uses its own increment. |
| Graph view → Visible range | Enter 1–20 for the ± Stops diagram viewport, not the LUT. Values outside it remain editable in numeric fields. |
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

Band swatches, warning colors and gradient points share two color models:
**OKLCH · perceptual** uses lightness, chroma and hue sliders; **HSV triangle**
uses a hue ring and a rotating saturation/brightness triangle. Drag the ring to
choose a hue, then move within the triangle to mix that hue with white and black.
Numeric fields and six-digit `#RRGGBB` entry remain available in both modes.
Switching models keeps the current color. The bundled named swatches remain
available as starting colors. Invalid colors must be corrected before applying.
Escape closes the picker and returns focus. See [keyboard controls](../keyboard/)
for alternatives to pointing.

## Palettes and gradients

**Recolor all bands** changes colors without moving the bands. Editing a single swatch remains available if you want to keep the other colors.

> **Geometry and color are separate.** A palette changes the labels on your existing bands. Applying an arrangement preset replaces positions and colors.

| Control | Meaning |
| --- | --- |
| Start with a preset | Sets band mode, positions, widths, and colors together. Three-band Exposure marks −2, 0, and +2 stops with 0.6-stop bands; Contrast Checker fills five zones split at −1.5, −0.5, +0.5, and +1.5 stops; Reference emphasis fills seven zones with bright green centered on zero stops; Camera-log IRE creates seven profile-matched bands. Camera, output, and warning settings are preserved. Undo restores the previous bands and mode. |
| Choose a starting palette | Recolors the current arrangement. Standard false color applies fixed exposure thresholds immediately and supports undo. Exposure zones, Reference emphasis and Dark → Bright create blended gradient drafts. Dark → Bright reuses Contrast Checker's colors with increasing OKLCH lightness and a direct blend. |
| Shape your gradient | Edit the gradient dots and blend controls. |
| What does the reference mean? / legend | Explains the reference and the low-to-high exposure colors. Green is a chosen reference, not universally correct exposure. |
| Gradient dots | New custom gradients start with two endpoint colors. Add, select, move, or remove any dot; keep at least two colors. The exposure reference is a scale guide, not a locked color point. Named palettes retain their predefined colors. |
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
| Save and reuse palettes | Opens the browser-local palette library; see [saving](../save-and-apply/#palettes-and-setups-are-different). |

Starting exposure palettes anchor the reference at zero stops or the selected profile's neutral camera-log IRE value. Legacy target-IRE setups retain the neutral target reference. Their end colors extend beyond the palette scale. Changing cameras updates the reference and palette scale; existing band numbers remain user edits until a preset is applied. Older saved custom gradients can instead span the current band range; their center is not necessarily the exposure reference. In Fill, colors cover whole zones.

### Task presets

Choose these in **Presets** to apply their bands and colors together:

| Preset | Exposure layout |
| --- | --- |
| Portrait contrast | Nine half-stop zones centered from −2 to +2 stops, with a neutral-gray zero zone. Outer colors extend beyond the scale. |
| Wide contrast | Nine one-stop zones centered from −4 to +4 stops, with a neutral-gray zero zone. Outer colors extend beyond the scale. |
| Highlight placement | One-stop-wide markers centered at +2, +3, +4 and +5 stops. |
| Shadow placement | One-stop-wide markers centered at −5, −4, −3 and −2 stops. |

Placement presets leave the rest of the image monochrome, or preserve the
confirmed imported look. These are exposure guides; their colors do not establish
sensor clipping or a noise floor. Camera, output settings and recorded-signal
warnings stay unchanged. Band-edit undo restores the previous arrangement.

## Recorded-signal warnings

Each checkbox enables one warning; its color picker changes only the indicator color. Neither control edits the numeric profile threshold. Read [how the limits are calculated](../signal-limits/) for purple/red interpretation, precedence, and cube-size tolerance.

## Remaining panels

The header's **01 Configure**, **02 Edit bands**, and **03 Download** jump to those sections. **Help / Manual** opens this manual in a new tab. **Keyboard shortcuts (?)** opens the shortcut dialog.

For **Saved LUT setups**, **Download LUT**, JSON import/export, and progress messages, see [Save, export, and apply](../save-and-apply/). For camera media, source interpretation, video frame controls, pixel inspection, and checked-cube downloads, see [Verify camera media](../verification/). For error and warning recovery, see [Troubleshooting](../troubleshooting/).
