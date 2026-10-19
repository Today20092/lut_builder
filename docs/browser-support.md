# Browser app support

This matrix describes the static [GitHub Pages app](https://today20092.github.io/lut_builder/) introduced for [issue #9](https://github.com/Today20092/lut_builder/issues/9). It generates LUTs on-device and does not run the Python workspace.

| Feature | Browser build |
| --- | --- |
| Camera profiles and output gamuts | Six supported profiles; Rec.709 and Rec.2020 |
| Exposure editor | Stops and camera-log IRE bands, Fill zones, overlap priority, OKLCH gradient palettes, sticky palette audition with apply/cancel, setup controls, and keyboard shortcuts |
| LUT generation | On-device worker; 17, 33, and 65 point `.cube` downloads |
| Setup JSON | Import and export remain available |
| Named setup presets | Saved in this browser only; storage may be cleared and does not sync between devices. Export JSON for backup or transfer. |
| Exposure diagram | Editable local Stops/IRE graph and Fill zones; describes band settings, not verification of the sampled cube |
| Camera-exposure media preview | Not included |
| Camera-matched still verification | On-device for untagged, non-interlaced 16-bit RGB PNG and float32 RGB PFM; maximum 4,194,304 pixels |
| Camera-matched video verification | On-device for H.264, HEVC, ProRes 422 and FFV1 in supported planar 4:2:0 8/10-bit or 4:2:2 10-bit formats; choose a frame from an inspected one-second interval |

Still and video verification apply the exact serialized cube used for download, with tetrahedral interpolation and the documented SDR display policy. Original/Split comparison remains unavailable because no camera-to-SDR reference viewing transform is established. Source interpretation must be confirmed; reported metadata is shown separately, and a file cannot prove its camera profile. Verification is diagnostic and does not certify sensor exposure.

Still uploads are limited to 48 MiB plus header. Video is limited to 512 MiB, five minutes, progressive square-pixel sources, and 4,194,304 decoded pixels; HDR, rotation, RAW, JPEG, and unsupported pixel layouts are rejected. The 32 MiB WebAssembly decoder is fetched from this site only when verification starts. Source media and LUTs stay in the browser and are not sent to a processing service. The demonstration image is illustrative and never used as a verification fallback.

## Exposure editor update, October 19, 2026

New IRE selections use camera-log encoded luma and the selected profile's neutral
gray reference. Existing saved setups retain target-based IRE unless explicitly
switched. Output Full/Legal packing is a separate setting. See [camera-log IRE](camera-log-ire.md)
and the [range guide](output-range-guide.md) for conventions and limits.

The mobile layout includes visual mode choices, a persistent exposure preview,
responsive band rows, and a scrollable gradient editor. Selecting a palette
auditions it; Use palette commits its colors, and Cancel keeps the current bands.
The [palette guide](exposure-palettes.md) and [keyboard reference](keyboard-shortcuts.md)
describe editing behavior. Earlier dated acceptance below records the version
tested at that time; it does not establish physical phone support for this update.

## Camera verification acceptance, October 18, 2026

The production browser build inspected and verified a selected frame from a local
10-bit HEVC 4:2:0, 2048×1080 Lumix proxy. The selected frame's native YUV bytes
matched an independent FFmpeg decode exactly, and an original-resolution RGB
sample matched FFmpeg's independent matrix/range/chroma conversion within
`3e-8`. Verification applied the serialized 65³ cube and returned provenance,
pixel inspection, and the checked-cube download entirely in the browser.

The standalone browser parity harness also passed every 16-bit PNG code, FFV1
4:2:0 at 8 and 10 bits, FFV1 4:2:2 at 10 bits, H.264, HEVC, and ProRes 422.
Its independent native-FFmpeg comparisons covered matrix, full/limited range,
and left/center/top-left chroma settings with maximum RGB error below `2e-6`.
These synthetic fixtures establish decoder parity; they do not identify the
camera profile of a real recording.

This clip reports BT.709 transfer and primaries while its owner identifies the
recording as V-Log/V-Gamut. That evidence confirms decoder parity and the browser
workflow; it does not establish the clip's true camera encoding. The browser UI
shows reported transfer/primaries and warns when they conflict with the confirmed
source interpretation. Confirm the original recording/export path before trusting
the false-color result.

## Editor decisions

The configuration-first Workbench from #23/#33 remains the baseline, superseding
#19's older graph-first layout. The graph and editable rows are available without
a Python preview response. The graph uses a fixed -7 to +7 Stops viewport or 0 to
100 IRE viewport; out-of-view Stops values stay editable and have edge indicators.
Movement increments remain 1, 1/2 and 1/4 stop, with independently editable widths.

#20's wheel-editing requirement is retired: wheel events scroll, and Ctrl/Meta-wheel
remain available to the browser. Use drag, arrow keys or numeric fields to edit.
This preserves the existing deliberate protection against accidental wheel edits.

## Earlier deployed verification

- Python reference nodes cover all six profiles and both target gamuts. Additional fixtures cover Stops overlap and an inclusive band edge, IRE, Fill boundary selection, warning precedence, legal range, and R-fastest cube serialization; the browser engine is compared within `0.000001` per channel.
- The three supported cube sizes were generated and downloaded in the Codex in-app browser on this Windows desktop. The observed click-to-download round trip was under one second for each size; this includes browser automation overhead and is not a device benchmark.
- The deployed app loaded at the repository subpath and generated/downloaded a 17-point `.cube` file in the in-app browser. The [Pages workflow run](https://github.com/Today20092/lut_builder/actions/runs/39179887256) passed its build and deployment jobs.
- Named setup save/load and keyboard tab navigation were smoke-checked in the same browser. Existing frontend tests cover JSON setup compatibility, editing and keyboard/pointer band interactions.
- That earlier browser tool did not expose engine versions or a phone-sized viewport.

## Local acceptance, October 18, 2026

The updated production Pages build was tested on Windows with an AMD Ryzen 9 3950X
and approximately 32 GiB RAM. These are Playwright browser builds, not claims about
all shipping Chrome, Firefox, Safari, Android or iOS versions.

| Browser engine | Viewports | Touch |
| --- | --- | --- |
| Chromium 156.0.8078.4 | 1280×900, 390×844, 820×1180 | Emulated at the two smaller sizes |
| Firefox 153.0 | 1280×900, 390×844, 820×1180 | Pointer/keyboard; no touch emulation |
| WebKit 26.5 | 1280×900, 390×844, 820×1180 | Emulated at the two smaller sizes |

The repeatable [browser check](../frontend/tests/browser-only.mjs) exercises camera
selection, numeric edits, all movement increments, graph keyboard and pointer
editing, independent width, edge indicators, fixed IRE bounds, wheel defaults,
preset save/reload, JSON export/import and invalid-import recovery, 17/33/65 cube
downloads, cancellation, and page overflow. It rejects non-GET requests and
cross-origin requests. Downloaded files must have the chosen filename and the
correct number of three-channel cube rows. Numerical correctness is checked
separately against Python, not inferred from screenshots or row counts.

On the desktop Chromium run, startup-to-editor was 173–258 ms; click-to-download
was 150–167 ms (17), 309–421 ms (33), and 721–814 ms (65). These are single-run,
local-server observations including automation overhead, not network or mobile
benchmarks. Reported main-thread JavaScript heap after downloads was approximately
16–28 MB. This is neither peak process memory nor worker memory; Firefox/WebKit
do not expose this measurement through the same API. Do not derive a mobile memory
limit from it. The script prints per-engine timings for reproducible comparisons.

The current Python engine is also compared at every 17-cube node for all six
profiles and both output gamuts, plus the existing diagnostic-mode fixture setups,
within 0.000001 per channel. Independent checked-in fixture assertions cover
boundaries, overlaps, warning priority, range, neutral/colored samples and ordering.

Physical phone/tablet and representative low-memory-device evidence remains
deferred by the maintainer on October 18, 2026; it is not a blocker for this release.
Emulation does not establish those results. JavaScript and
Web Workers are required; startup failures provide an actionable browser/local
workspace message. Export setup JSON for backup, especially in private browsing.

### Reproduce

From `frontend`, install locked dependencies, build with `LUT_BUILDER_PAGES=true`,
and serve using `pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort`.
Run `node tests/browser-only.mjs` with an installed Playwright package available.
`PLAYWRIGHT_MODULE` may point to its `index.mjs`; `CHROME_PATH` may select an installed
Chromium executable. Set `BROWSER=firefox` or `BROWSER=webkit` for the other engines.
`LUT_BUILDER_URL` selects another local port or the deployed Pages URL.

Run `node --experimental-strip-types --test frontend/tests/python-parity.mjs` from
the repository root after `uv sync --locked` for the live Python comparison.

The full Python run produced 144 passes and one failure in the unchanged Windows
video deadline-cleanup test (`test_invalid_media_and_processing_deadline_cleanup[True]`):
`command.err` remained locked after simulated tree-termination failure. The focused
rerun reproduced it. FFmpeg/FFprobe were available; media tests were not skipped.

Frontend lint, TypeScript/build, all 49 frontend tests, full-node Python parity,
Ruff format/lint and ty pass. The connected local Workbench check also passes:
palette persistence, keyboard-only editing, JSON/generation, narrow and enlarged
text layouts, real PFM verification, pixel inspection, checked-cube identity, and
real VFR video selection/verification/cancellation. This checks that the browser
delivery changes preserve the existing local workflow.

Independent code review against starting commit `6273229` found no remaining
standards or implementation/spec findings after fixes.

## Deployed acceptance, October 18, 2026

Commit `05c9241` was pushed to `main` and [deployed successfully](https://github.com/Today20092/lut_builder/actions/runs/39192592255).
The Python suite/parity gate and three-engine browser gate both passed on Linux.
The live page served the expected `/lut_builder/assets/index-CV9kK91q.js` bundle.
The complete browser acceptance script then passed against the public URL in all
three engines and all three viewport sizes listed above. Desktop and narrow live
screenshots were inspected; controls remained visible without page overflow.

| Live engine | Startup to editor | 17-cube download | 33-cube download | 65-cube download |
| --- | --- | --- | --- | --- |
| Chromium 156.0.8078.4 | 223–393 ms | 167–243 ms | 430–437 ms | 810–841 ms |
| Firefox 153.0 | 262–748 ms | 151–185 ms | 403–436 ms | 736–772 ms |
| WebKit 26.5 | 249–332 ms | 280–411 ms | 437–731 ms | 804–1314 ms |

These are single-run ranges across the three emulated viewport sizes on the same
desktop and connection, including automation overhead. They are not phone timings.

The optional [Windows memory check](../frontend/tests/browser-memory.mjs) sampled
CDP-reported Chromium processes, including renderers containing worker execution,
during a live 65-cube generation. Summed working sets were 484,491,264 bytes before
generation and at most 598,327,296 bytes across three samples. This includes browser
overhead, can double-count shared memory, and can miss brief peaks. It is a desktop
observation, not unique allocated RAM, a precise peak, or a minimum device requirement.
Run it from the repository root with the same `PLAYWRIGHT_MODULE`, `CHROME_PATH`
and optional `LUT_BUILDER_URL` settings as the browser check.

### Deferred physical-device checks

- On an actual iPhone/iPad with Safari and Android phone/tablet with Chrome, use
  touch to drag band centers and width handles, edit numbers with the on-screen
  keyboard, and repeat in portrait/landscape without losing access to controls.
- Use native file pickers to import/export setup JSON and native download/share
  flows to save 17/33/65 `.cube` files. Reopen or transfer the saved files and verify
  their names, contents and row counts, rather than just observing a download UI.
- Save a named preset, reload/restart the browser, and check normal versus private
  browsing/storage restrictions. Confirm JSON backup/restore remains usable.
- On representative lower-memory hardware, measure startup and generation time,
  memory pressure, UI responsiveness and cancellation for 65-cube generation;
  check background/resume and OS tab eviction without claiming automatic recovery
  of unsaved edits.

No physical-device result or universal mobile-browser support is claimed.

## Release

The [Pages workflow](../.github/workflows/deploy-pages.yml) builds at the
`/lut_builder/` repository subpath. Deployment requires both the browser build and
three-engine acceptance job and the reusable Python checks/parity job to succeed.
Failed checks block deployment. The bundled local-workspace assets are built with
the default `/` base; CI rebuilds with the Pages base. The live URL now includes the
restored editor, validation/cancellation changes and the deployment gates described
here. Physical-device checks are deferred as listed above.
