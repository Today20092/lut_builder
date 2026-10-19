---
title: Save, export, and apply
description: Keep editable backups, understand local storage, and use the cube in the correct monitoring path.
---

## Generate a cube

:::tip[Keep a pair of files]
Save the **cube** for the device applying the transformation and **setup JSON** for future edits. A cube cannot be imported as an editable setup.
:::

The **Generate LUT** panel shows the profile, target, cube size, and resolved output filename. Choose **Generate LUT** to download a `.cube`. While the browser worker is generating, progress appears and **Cancel** can stop the job. Correct any validation error before trying again.

The download uses applied band colors. A palette draft must be accepted with **Use palette** first. A separate **Download checked .cube** action in camera verification retains the exact bytes used for that check; use it when you need that identity.

The browser controls the download folder and may append a suffix for a repeated filename. The filename's settings-derived ID is not a cryptographic proof of a checked artifact. Verification provenance supplies the cube's SHA-256 for that purpose.

## Export and import JSON

**Export JSON** saves the editable LUT setup: profile, target, bands and their applied colors, IRE interpretation, warnings, range, cube size, and filename settings. Keep this beside your cube so you can revise it later.

**Import JSON** loads a saved setup into the editor. Check the profile, range, IRE interpretation, bands, and output name after loading. An invalid file produces an error; correct the file or choose a known-good export. Importing a cube as JSON is not supported.

JSON does not back up your entire saved-palette library, uploaded media, or an unaccepted palette draft. Applied band colors are preserved.

## Palettes and setups are different

| Saved item | Includes | Where it lives |
| --- | --- | --- |
| Named palette | Color draft, anchor positions, blend and adjustment settings | This browser's palette library |
| Named LUT setup | Complete LUT settings | Browser app's **Saved LUT setups** library |
| Exported JSON | Complete applied LUT settings | A file you save and can transfer |
| Exported cube | Sampled transformation for a compatible host | A file; not an editable setup |

Under **Save and reuse palettes**, choose a saved palette to load its draft. **Palette name** names it; **Save new palette** creates a library entry, **Replace saved palette** overwrites the selected entry with the draft, **Rename saved palette** changes its name, and **Delete saved palette** removes it. Saving a draft does not apply it to bands. Names must be valid and distinct; the library is limited to 100 palettes.

In the browser app, enter a **Preset name** and choose **Save current setup**. Select a **Saved setup**, then **Load setup** to use it, or **Delete setup** to remove it. Pay attention to any replacement or load confirmation shown. Named setups and named palettes are independent.

Browser storage is tied to the browser, profile, and site address. The hosted app and `http://127.0.0.1:8765/` have different libraries. Private browsing, blocked storage, clearing site data, or browser cleanup can remove or prevent saves. Export JSON before closing or clearing storage; saving is not cloud synchronization.

> **Saved locally is not backed up.** Export JSON before clearing browser data or moving to another device. It preserves applied settings, not the entire palette library.

## Apply the cube

| Stage | Must agree with |
| --- | --- |
| Signal entering the LUT | Selected camera log **and** gamut |
| LUT output | Selected display target and Full / Legal handling |
| Receiving host | Supported cube dimensions and import requirements |
| Final check | Known camera samples in the actual display path |

1. Check the host's supported cube dimensions, file naming, and LUT import procedure.
2. Place the LUT where it receives the selected camera log and gamut. Do not feed it a Rec.709 viewing transform when it expects camera log.
3. Match the output target and full/legal handling. Avoid packing legal output twice.
4. Avoid an extra creative look or display transform that changes the diagnostic colors.
5. Test with known camera samples and a reference exposure. Confirm the result on the actual display before relying on the color labels.

A color-managed editor may automatically transform clips before or after a LUT node. Inspect that signal path rather than choosing a node location by habit. Device-specific menu names and calibration procedures belong to the device's manual.

This LUT intentionally replaces image regions with diagnostic colors. Preserve an unaffected monitoring or review path when you need to judge the normal appearance of the image.
