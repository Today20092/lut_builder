# Browser app support

This matrix describes the static [GitHub Pages app](https://today20092.github.io/lut_builder/) introduced for [issue #9](https://github.com/Today20092/lut_builder/issues/9). It generates LUTs on-device and does not run the Python workspace.

| Feature | Browser build |
| --- | --- |
| Camera profiles and output gamuts | Six supported profiles; Rec.709 and Rec.2020 |
| Exposure editor | Stops and IRE bands, Fill zones, overlap priority, palette and setup controls |
| LUT generation | On-device worker; 17, 33, and 65 point `.cube` downloads |
| Setup JSON | Import and export remain available |
| Named setup presets | Saved in this browser only; storage may be cleared and does not sync between devices. Export JSON for backup or transfer. |
| Exposure diagram | Editable local Stops/IRE graph and Fill zones; describes band settings, not verification of the sampled cube |
| Camera-exposure media preview | Not included in the static build; see [follow-up #39](https://github.com/Today20092/lut_builder/issues/39) |
| Camera-matched still verification | Not available in the static build; see [follow-up #39](https://github.com/Today20092/lut_builder/issues/39) |
| Camera-matched video verification | Not available in the static build; see [follow-up #39](https://github.com/Today20092/lut_builder/issues/39) |

The demonstration image is illustrative. It does not apply the exported LUT and is not a verification result. The static app does not send setup data, LUTs, or media to a calculation service.

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

Remaining release evidence: physical phone/tablet touch and usable downloads,
representative low-memory devices, worker/peak-memory measurements, and deployed
acceptance of this new commit. Emulation does not establish these. JavaScript and
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
standards or implementation/spec findings after fixes. The release-evidence gaps
listed above remain open; issue #9 is not represented as fully complete.

## Release

The [Pages workflow](../.github/workflows/deploy-pages.yml) builds at the
`/lut_builder/` repository subpath. Deployment requires both the browser build and
three-engine acceptance job and the reusable Python checks/parity job to succeed.
Failed checks block deployment. The bundled local-workspace assets are built with
the default `/` base; CI rebuilds with the Pages base. The live URL above refers to
the earlier release until this commit is pushed and its deployment succeeds.
