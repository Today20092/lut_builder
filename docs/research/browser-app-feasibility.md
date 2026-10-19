# Browser LUT Builder feasibility study

## Implementation decision, October 18, 2026

The browser release uses the existing TypeScript engine and a dedicated Web Worker.
The Python/Colour implementation remains the numerical reference and the local
workspace remains available. Generated grid-decoding and matrix data are reused;
the browser port is checked with independent fixture nodes and a full-node Python
comparison. See [support and measured acceptance](../browser-support.md) for the
actual tested scope, tolerance, timings and outstanding device evidence.

Effect 4.0.5 is now the repository standard for maintained application-side async
code. It handles worker/FileReader lifetimes, AbortSignal cancellation, typed
failures and setup/API schemas. Pure editor transitions and LUT calculations stay
plain TypeScript. This adds library weight and a maintenance convention; it does
not improve the numerical engine by itself. The measured Pages build is about
508 kB of main JavaScript (161 kB gzip), a 42 kB worker, 45 kB CSS, and a 1.4 MB
bundled demonstration image. No Python runtime download is required.

The earlier Pyodide option was not benchmarked and is not claimed inferior in
numerical accuracy. Its dependency/runtime integration remains unverified here;
changing engines would require repeating parity and resource measurements. The
chosen implementation reuses the already implemented TypeScript path and avoids
adding a second runtime. Actual FFmpeg-based still/video verification stays in the
local workspace pending [#39](https://github.com/Today20092/lut_builder/issues/39).

Current API references consulted: [Effect 4 callback cancellation and cleanup](https://effect.website/docs/v4/getting-started/creating-effects),
[Effect 4 schema decoding](https://effect.website/docs/v4/schema/getting-started),
[Playwright emulation](https://github.com/microsoft/playwright/blob/main/docs/src/emulation.md),
and [GitHub job dependencies](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs).

## Original feasibility review

Date: 2026-09-07. Status: source and documentation review; recommended direction, not an approved implementation plan. No browser engine, performance benchmark, or hardware validation was performed.

## Finding

Yes. A free website that lets people choose a camera profile, customize stop-based false colors, and download a LUT is technically feasible on GitHub Pages. Visitors would open a link and download their resulting LUT, without installing Python or a command-line application.

The existing UI already uses React and TypeScript. Keep that investment. The change is where the LUT calculation runs: the current application uses a local Python server; a self-contained website needs the calculation inside the browser.

GitHub Pages serves static HTML, CSS, and JavaScript and is available for public repositories on GitHub Free. It does not provide a running Python application server. Browser computation fits that hosting model. Published sites have a 1 GB limit and a soft monthly bandwidth limit of 100 GB, so free hosting is subject to limits. [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [hosting limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## What exists and what can be reused

Inspection covered `main` at `550a3d3` and `prototype/lut-ui` at `6314603`, plus the existing planning issues. The prototype branch has diverged from main; it should be treated as an interaction reference, not copied over current numerical fixes.

| Part | Existing implementation | Browser migration |
|---|---|---|
| Editor and layout | React, TypeScript, Vite, Tailwind | Reuse components, interactions, and styling |
| Generation interface | Local Python HTTP server; `/generate` and `/preview` | Replace calls with a browser worker and local file downloads |
| LUT engine | NumPy and Colour, with Python validation and setup handling | Port the supported operations or trial Pyodide |
| Camera catalog | Six named log/gamut pairs | Reuse data and preserve each curve's parameters |
| Palettes and saved settings | Existing colors and setup serialization | Preserve compatibility; keep local browser persistence |
| Trustworthy camera-media preview | Current Python server integrates video and verification helpers; its specification requires high-precision processing and FFmpeg | Separate feasibility decision; not an automatic browser substitution |

The Python pipeline constructs an RGB grid, decodes each channel from the selected camera log curve, derives scene-linear luminance from the source gamut, and calculates `log2(Y / 0.18)` with numerical protection near zero. It then performs the relevant output conversion, applies exposure colors and signal warnings, handles output range, and serializes the cube.

This is bounded numerical work. A 33-point cube has 35,937 RGB entries; a 65-point cube has 274,625. That supports a browser implementation in principle, but does not establish generation time or memory use on phones.

Evidence: [engine](../../src/lut_builder/engine.py), [setup semantics](../../src/lut_builder/setup.py), [profile catalog](../../src/lut_builder/data.py), [Python dependencies](../../pyproject.toml), and [UI reference branch](https://github.com/Today20092/lut_builder/tree/6314603/frontend).

## Architecture choices

| Choice | GitHub Pages alone? | Main benefit | Main cost | Assessment |
|---|---|---|---|---|
| Existing React UI + TypeScript engine in a Web Worker | Yes | No Python runtime download; computation and user media can remain local | Must reproduce and maintain the supported mathematics accurately | Recommended production direction |
| Existing React UI + Python core through Pyodide in a worker | Potentially | Reuses more Python numerical code | Runtime/package download, startup, memory, and package compatibility need measurement | Worth a bounded trial if engine reuse is the priority |
| Existing React UI + hosted Python API | Frontend only | Most direct reuse of server-side generation and media processing | Separate hosting, service operations, resource limits, and uploads | Feasible fallback if precise media preview is mandatory immediately |

Pyodide supports Python in WebAssembly, NumPy interoperability, package loading, and Web Workers. That establishes an available route, not compatibility of this application's complete dependency set. Test the actual NumPy/Colour versions and export path before choosing it. [Pyodide worker documentation](https://github.com/pyodide/pyodide/blob/main/docs/usage/webworker.md), [package loading](https://github.com/pyodide/pyodide/blob/main/docs/usage/loading-packages.md).

For a TypeScript implementation, port only the operations used by supported profiles. Preserve the Python implementation as a reference, generate fixtures from it, and compare browser results. Do not port the entire Colour library or replace it with an unverified generic log approximation. Check source licenses and attribution when reusing implementation code or tables.

The app would load a static catalog and presets, send a validated setup to a worker, receive the cube, and offer a download. Keep the existing framework. No accounts, database, or new UI framework are needed for that workflow.

## Exposure behavior and proposed defaults

An input profile is a log transfer function plus a source gamut and its relevant parameters. A camera brand is not enough. The current catalog includes Sony S-Log3/S-Gamut3.Cine, Panasonic V-Log/V-Gamut, Canon Log 3/Cinema Gamut, ARRI LogC3/AWG3, RED Log3G10/REDWideGamutRGB, and Blackmagic Film Gen5/Blackmagic Wide Gamut. These are mathematical profile implementations, not proof that every listed manufacturer's camera accepts the output LUT.

Keep two separate selections in the UI: the input signal profile and the destination camera or monitor preset. The second governs file size, range conventions, and loading instructions after device validation.

For stops, 0 is 18% scene-linear luminance; +1 doubles it and -1 halves it. A face, dark fabric, and a grey card need not occupy the same stop interval. The LUT cannot identify the subject or decide whether the photographer intended a dark image. Label regions by measured stops, and allow an explicit subject target or exposure-reference offset if that workflow is wanted.

Proposed first-use behavior, subject to user feedback:

- Open in Fill mode, with a permanent numerical legend and editable colors.
- Show whole-stop regions centered at -3, -2, -1, 0, +1, +2, and +3. Interior boundaries lie halfway between the centers. The 0 region is [-0.5, +0.5); outer colors extend to the ends.
- Use a sequential dark-to-bright progression through cool shadow colors, green at 0, and warm highlight colors. Retain existing palette choices where suitable. Confirm adjacent colors remain distinguishable; hue alone must not carry the legend.
- Keep banded mode available for isolated targets. The existing ±0.3-stop width is a starting point, subject to exported-LUT interpolation checks.
- Keep encoded-signal floor/ceiling warnings distinct from the ordinary darkest and brightest stop regions.

These are proposed UI regions, not an instruction to reinterpret existing saved setup values. Current Fill code uses explicit upper boundaries, while the README incorrectly describes nearest-color centers. For entries at -1, 0, and +1, the first color applies below -1, the second from -1 to 0, and the last at or above 0. The last entry's stop does not create another boundary. Reconcile that documentation and preserve saved-setup semantics before mapping centered regions into a new preset. Test exact boundary and tie behavior.

The current workspace also starts in Stops mode with one green 0-stop band and a 65-point cube. Fill-first behavior and destination-aware cube sizing would therefore be intentional product changes, not merely a hosting change.

Neither the camera log curve alone nor an encoded-signal warning establishes the sensor's clipping point or usable shadow floor. Those depend on the camera and operating conditions. Existing research already distinguishes these concepts. [Sensor-clipping research](sensor-clipping-monitoring-lut.md).

## Accuracy and compatibility risks

**The finite cube matters.** A camera interpolates between LUT samples, so sharp false-color transitions can soften or mix. A 17- or 33-point cube cannot guarantee perfectly hard, arbitrarily narrow bands. Preview the serialized cube with an explicitly stated interpolation method; do not present an ideal mathematical overlay as proof of exported behavior.

**Input interpretation matters.** Decode each RGB channel using the selected camera transfer curve before deriving source-gamut luminance. Applying a log lookup to Rec.709-weighted encoded brightness is not equivalent, especially for saturated colors. Some prototype preview logic uses that shortcut; it must not become the browser engine's reference.

**Range and processing order matter.** Match the input signal presented at the LUT stage, source gamut, output encoding, and full/video-range handling. A display-converted signal cannot be treated as untouched camera log. Avoid double range conversion.

**Device support is model-specific.** For example, the Sony FX3 guide accepts 17- or 33-point `.cube` files and specifies filename and card-directory requirements. That is evidence for that model, not all Sony cameras. [Sony FX3 user LUT guide](https://helpguide.sony.net/ilc/2210/v1/en/contents/TP1000888940.html).

**Monitoring and recording are different uses.** Panasonic's Real Time LUT guide explicitly describes applying LUTs to recorded footage. A diagnostic LUT intended for monitoring should not accidentally be baked into the recording. Provide destination-specific instructions once models are selected. [Panasonic Real Time LUT guide](https://www.panasonic.com/uk/consumer/cameras-camcorders/lumix-expert-advice-learn/lumix-expert-advice/using-real-time-luts.html).

**An imported browser image is not automatically camera data.** A demonstration image can explain colors. Accurate camera verification additionally requires known source interpretation, suitable decoding precision, and control over transformations. Video introduces codec support and frame-selection requirements. Previous research and the current implementation specification require more than a canvas overlay. [Preview-fidelity research](preview-fidelity.md), [video-frame research](video-frame-preview.md), [Implement the Workbench UI and trustworthy LUT preview](https://github.com/Today20092/lut_builder/issues/33).

## Smallest useful feasibility proof

Before committing to a full migration, connect the existing UI to one browser worker that generates a Sony S-Log3 or Panasonic V-Log cube in Fill mode. Include a stop ramp and download. Compare its numerical table against Python for the same setup, including neutral and saturated samples, boundary-adjacent values, warnings, and range handling. Then extend parity coverage to every supported profile and mode.

Read the exported cube back for preview checks. Verify axis ordering and serialization as well as colors. Exercise 17, 33, and 65 grids, while offering only sizes supported by a selected destination. Measure cold load, generation, cancellation, and peak memory on at least a desktop and a representative phone. Set acceptance budgets before measuring; this study supplies no measured performance claim.

Finally load the generated file onto one named camera and one named external monitor. Check a controlled exposure ramp and confirm monitor-only use. Hardware checks validate the actual device path, which numerical agreement alone cannot establish.

## Wayfinder decisions still open

The existing map, [Make the LUT Builder interface precise and its preview trustworthy](https://github.com/Today20092/lut_builder/issues/29), already covers UI and preview decisions. Its local Python/FFmpeg assumptions need reconsideration if deployment becomes fully static. Do not silently supersede that scope or create duplicate implementation tickets.

The immediate questions presented to the user are whether the first browser release requires uploaded-camera-image preview and whether fully local processing on GitHub Pages is a firm target. Those answers determine whether the next research question is limited to browser generation or includes precise media decoding.

After those scope choices, the next decisions are: TypeScript versus a measured Pyodide reuse path; which camera/monitor models establish first-release compatibility; the Fill palette and reference-offset behavior; and how any retained media preview satisfies the existing accuracy requirements. Exact palette selection needs human feedback, and device qualification needs named hardware.

Recommendation: proceed toward a static browser LUT builder using the existing React/TypeScript UI. Keep trustworthy camera-media preview as an explicit scope decision, preserve Python as the reference engine, and validate generated LUTs before promising device compatibility. No application code, issues, or deployments were changed by this study.
