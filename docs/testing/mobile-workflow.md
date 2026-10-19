# Mobile workflow (ticket 45)

The workflow is load/import → configure → edit bands → optional photo preview →
optional save/export → generate. Palette and gradient editing are explicit choices;
the existing per-band swatches remain available. A visible-range selector offers
±1 through ±20 stops and changes only the graph view.

`paletteWorkflow.ts` owns method, draft recipe and audition transitions. Committed
bands stay in `reduceEditor`; applying is one undoable band edit. Import increments
the editor revision and remounts the palette workflow, discarding earlier drafts
and gestures. Output summaries, setup export/save and generation use committed
settings. Generation and setup loading temporarily disable editing. Obsolete setup
loads and sample results cannot replace newer state.

On touch layouts, gradient positions and OKLCH channels use tap buttons; a selector
also reaches crowded stops. Vertical or diagonal scrolling over the bar, handles
and adjustments does not edit values. Pointer sliders and handle dragging remain
available on desktop. The sticky band preview is the palette decision surface;
cancel restores the initiating control with `preventScroll` and compensates for
layout movement at the browser boundary.

## Reference photos and provenance

The bundled files are unmodified copies from the
[scikit-image v0.25.2 data directory](https://github.com/scikit-image/scikit-image/tree/v0.25.2/skimage/data).
Redistribution evidence is recorded in the upstream
[data documentation](https://scikit-image.org/docs/0.25.x/api/skimage.data.html).
The files were inspected with Pillow/ImageCms on 2026-10-19; embedded ICC profile
descriptions were read directly, not inferred from their appearance or filenames.

| File | Scene / attribution | Rights | Encoding |
| --- | --- | --- | --- |
| `astronaut.png` | Portrait of Eileen Collins / NASA | Public domain | 512×512, 8-bit RGB PNG, full range; embedded sRGB IEC61966-2.1 (sRGB primaries and transfer) |
| `chelsea.png` | Chelsea the cat / Stefan van der Walt | CC0 | 451×300, 8-bit RGB PNG, full range; embedded sRGB IEC61966-2.1; orientation 1 |
| `rocket.jpg` | Dusk launch / SpaceX | Public domain | 640×427, 8-bit JPEG; embedded Adobe RGB (1998), Adobe RGB primaries and gamma 563/256; browser JPEG decode to full-range RGB |

SHA-256 of the bundled source files:

```text
astronaut.png 88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5
chelsea.png   596aa1e7cb875eb79f437e310381d26b338a81c2da23439704a73c4651e8c4bb
rocket.jpg    c2dd0de7c538df8d111e479619b129464d0269d0ae5fd18ca91d33a7fdfea95c
```

The browser's ICC-aware image decode draws to an explicitly sRGB canvas, capped
at 384×256 pixels. Samples are inverse-sRGB-linearized, transformed from linear
sRGB/Rec.709 primaries into the selected camera gamut by the inverse of the
existing source-to-Rec.709 matrix, and approximately log-encoded by interpolating
the bundled 65-node decoder table in reverse. Values outside the camera table are
clamped. The selected setup's actual serialized cube is generated in the existing
worker, parsed and applied with the existing tetrahedral sampler. Output uses the
existing legal-range unpacking and ideal-black BT.1886-to-sRGB display conversion.

This is explicitly an **illustration**, not recovered scene radiometry: a developed
photo has already lost scene exposure information, highlight latitude and camera
processing history. No display photo is fed directly to a camera-log LUT. The
approximate encoder is unsuitable for camera-profile calibration. The original
camera-media path retains its transfer/gamut confirmations and decoder validation.
User photos use browser color management; untagged user photos explicitly rely on
browser defaults. No user photo is uploaded to a service.

## Verification

Run `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, and `pnpm build` from `frontend`.
The focused tests are `palette-workflow.test.mjs`, `reference-preview.test.mjs`,
`editor.test.mjs`, and `exposure-graph.test.mjs`.

For optional connected acceptance, serve the app and run:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/playwright/index.mjs'
$env:LUT_BUILDER_URL = 'http://127.0.0.1:4175/'
node tests/mobile-workflow.mjs
```

This uses Chromium at 320, 390 and 1280 CSS pixels and WebKit at 390, with touch
enabled for phone layouts. It exercises repeated cancel/focus, range invariance,
gradient choices and taps, native Chromium touch-scroll gestures, import/export,
sample switching, output summary isolation and real cube downloads. Screenshots
are saved to the OS temporary directory under `lut-mobile-45`.

Emulation does not replace physical Android/iPhone checks or calibrated-display
inspection. Physical devices and assistive-technology speech output are unavailable
in this environment; those checks remain manual.

### Results, 2026-10-19

- Locked dependency installation, ESLint, TypeScript and the production build pass.
- All 65 frontend tests pass, including the existing Python-reference LUT parity
  tests and focused workflow, import reset and sample conversion coverage.
- Connected Chromium at 320, 390 and 1280 pixels and WebKit at 390 pixels pass the
  acceptance script. The repeated cancel checks use actual touchscreen taps in
  phone contexts. Chromium uses native touch events for vertical/diagonal scrolling.
  Screenshot inspection confirms readable narrow-screen photo and output layouts.
- Separate standards and specification reviews have zero remaining blockers after
  fixing Safari tap-origin capture, the initial local camera-media mode and feedback
  beside Save current setup.
- The exact ticket-only snapshot was installed, built and tested separately because
  another task was editing the manual, dependencies, Python server and shared App
  help links concurrently. Those changes are excluded from this ticket's commit.
  Rebuilt application assets correspond to this ticket-only source snapshot.

No Python implementation changed for this ticket, so the standalone Python suite
was not rerun. Existing camera-source validation tests ran in the frontend suite;
new physical-camera/FFmpeg media acceptance was not performed.
# PR integration verification

Integrated main at `44ef7c1` before merging PR #46. Preserved camera-log IRE
semantics and the responsive band settings from main. The combined frontend passes
67 tests, lint, TypeScript and production build. Cancellation restores scroll
after the parent preview collapses; the WebKit acceptance check covers this timing.
