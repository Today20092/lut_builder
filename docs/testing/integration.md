# Integrated Workbench acceptance

Ticket [27](https://github.com/Today20092/lut_builder/issues/27), specification
[33](https://github.com/Today20092/lut_builder/issues/33), working branch
`codex/workbench-ticket-7`. Integration baseline: `21057d7e399d1c660a519e55a9868c6dc207f093`.
The blocking tickets 34, 25, 35 and 38 were closed and present before implementation.
The preferred prototype A supplied layout guidance; its simulated verification was not used as production evidence.

## Final integration changes

- The graph and band table precede palette editing. At a 1265-pixel viewport with the launch setup, the table starts at 862.7 pixels, versus the coordinator's 2168.7-pixel observation. Custom anchors and saved-palette management use native, keyboard-operable disclosures. Draft validity, application status and storage failures remain visible outside them.
- Production launch uses `http://127.0.0.1:8765/`. Named palettes survive server restarts in the same browser because the origin stays fixed. An occupied port produces an actionable exit message, never an alternate origin. Windows uses exclusive socket binding; reuse of an active listening port is disabled. Server tests may explicitly request port zero.
- Hidden demonstration-image, video and JSON upload inputs have `tabIndex=-1`; visible proxy buttons retain their keyboard operation. The camera-still native chooser remains focusable.
- Focus outlines use foreground contrast in both themes. Verification warning text uses the same light/dark warning colors as the editor. The recorded-signal warning's explanation is available in a disclosure; the visible description states that it cannot establish physical sensor clipping.
- The approved original-checkout Astral changes are integrated. Frontend lint helpers were moved unchanged out of the React component module. The invalid pnpm esbuild build-permission placeholder is now `true`. Production assets were rebuilt.

## Reproduce

From the repository root:

```sh
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run ty check
uv run pytest -q
uv run lut-builder workspace
```

The last command opens [the stable workspace](http://127.0.0.1:8765/). Enter or Ctrl+C stops it.
Close any other process using port 8765 before launch. Use the same browser and address
to recover saved palettes. Storage remains browser-local, not a disk-side palette account.
Old development/ephemeral origins do not migrate automatically. Applied colors remain in exported setup JSON.

From `frontend`:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc -b
pnpm test
pnpm build
```

The optional connected browser check is `node frontend/tests/workbench-browser.mjs`
from the root. It requires an installed Playwright and Chromium, plus FFmpeg/FFprobe.
Set `PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs` when it is outside normal
Node resolution. `CHROME_PATH` optionally selects a browser binary. `WORKBENCH_EVIDENCE`
selects the output directory, otherwise the check uses the OS temporary directory's
`workbench-acceptance` folder. No Playwright dependency is added to production.

The check starts and stops the actual `launch_workspace` twice. It suppresses only
opening an unrelated external browser window; all server requests, decoding,
verification, serialization and downloads are real. It uses an isolated browser
context and requires the production port to be free. Its synthetic camera samples
test declared interpretation, not the provenance of manufacturer footage.

## Results on Windows, 2026-09-07

- Locked uv sync, Ruff formatting, Ruff lint and ty pass. Full Python suite: **145 passed**, no skipped tests, in 88.27 seconds. This includes actual FFmpeg/FFprobe tests.
- Locked pnpm install, ESLint, TypeScript build, production Vite build and the **33 frontend tests** pass. The optional browser check is separate from that count.
- Connected Chromium: palette draft/invalid input/reorder/add/remove/apply, geometry preservation, band numeric edits/removal/arrangement/undo, save/restart/reuse/rename/replace/delete, JSON round trip and real 17-cube generation pass.
- Demonstration image replacement and Original/Split/Band colors choices pass. Expanded dialogs close with Escape and restore focus. Warning toggle works with Space. A focused offscreen table action is scrolled into view at 390 pixels and has a solid focus outline.
- The connected keyboard-only pass uses Tab, arrows, text keys, Space and Enter from configuration through band/manual-color/palette edits, saving, setup import/export, generation, demonstration comparison and camera-still verification. It does not use pointer clicks, direct value assignment or programmatic focus. File fixtures are supplied only after Enter opens the native chooser.
- Desktop 1265, narrow 390, 1280 with 200% root text, and dark 1600 layouts have no document horizontal overflow. The detailed table scrolls within its own container at small widths. Screenshots were inspected; the preview remains in normal layout flow beside or below the editor.
- Real float32 PFM upload, required source facts, full-frame cube verification, pixel inspection, checked-cube SHA-256 identity, legal-range change invalidation and source mismatch rejection pass.
- Real H.264 VFR video with nonzero starting PTS: request 0.11 seconds selects 0.3 seconds, Previous selects 0.1 and Next returns 0.3. Confirmed YCbCr decoding, actual serialized-cube verification, pixel inspection, checked-cube download, beyond-end error and release pass. No browser page errors.

## Specification acceptance map

Numbers below refer to specification 33's user stories. These checks exercise the
integrated implementation, supplemented by numerical/server tests rather than
using screenshots to claim numerical correctness.

| Stories | Acceptance and evidence |
| --- | --- |
| 1–6 | Single Workbench layout, preview placement/expansion, confined graph labels, common control scale and visible choices. Connected responsive/focus screenshots and `exposure-graph.test.mjs`. |
| 7–11 | Separate arrangement/colors, add/select/remove, total widths, numeric and arrow-key changes, one-step undo and valid intermediate input. Connected editor actions, `editor.test.mjs`, `exposure-graph.test.mjs` and `test_web.py`. |
| 12–18 | Preset swatches, ordered anchors, brightness/intensity, draft ramp/status, explicit geometry-preserving application, manual colors, undo and named browser palettes. Connected restart/management workflows; frontend tests additionally cover failed storage retry, corrupt storage, duplicate names and manual overrides in stops/IRE/fill modes. |
| 19–21 | Demonstration labeling, image replacement and visible Original/Split/Band colors. Connected browser and rendered-pixel frontend tests. Opacity remains a viewing-only control. |
| 22–25 | Local selected video, exact actual time/adjacent frames, metadata facts distinct from suggestions, required transfer/gamut/matrix/range/chroma/depth confirmation. Connected VFR workflow, `test_video.py`, `test_video_verification.py` and frontend verification tests. |
| 26–28 | Actual serialized cube, explicit tetrahedral interpolation and SDR viewing provenance, exact checked-artifact download, source/settings invalidation and stale-response rejection. Connected checked-cube hash and invalidation; `test_verification.py`, `test_verification_web.py`, `test_video_verification.py`, `verification.test.mjs`. |
| 29–30 | Progress/status/error labels, cancellation, supported-input failures, keyboard focus and accessible dialogs. Connected success/error/focus workflows; public server tests cover missing tools, invalid media, timeouts, cancellation, replacement and cleanup; rendered frontend tests cover cancellation and stale responses. |
| 31 | Existing setup/generation and numerical behavior retained. Connected JSON/generation round trip; complete CLI, engine, diagnostic-semantics, setup, smoke, catalog and preview suites. |

## Astral preservation inventory

The original `C:/Users/User/Documents/lut_builder` remained read-only. Its tracked
patch was applied with three-way merging; all Python/configuration files applied
cleanly. README's single conflict combined both the Astral checks and Workbench
build instructions, correcting the frontend install command to the tracked pnpm lockfile.

| Original changed files | Preserved work |
| --- | --- |
| `AGENTS.md` | Complete uv/Ruff/ty workflow instructions. |
| `Contributing.md`, `README.md` | Original formatting and Astral development commands; README retains the additional Workbench documentation. |
| `pyproject.toml`, `uv.lock` | Ruff 0.16.6 and ty 0.0.78 locked, Python 3.12 target, original lint rule selection and CLI import-order exception. |
| `.github/workflows/python.yml` | Original uv 0.9.3/Python 3.12 Linux CI, locked sync, format/lint/type/test commands. |
| `src/lut_builder/cli.py` | Enum-backed BACK sentinel, typed navigation returns, original formatting; Workbench command retained. |
| `src/lut_builder/data.py`, `engine.py`, `setup.py` | Original formatting changes; integration's serialized-cube and preview additions retained. No numerical algorithm change. |
| `tests/test_cli.py`, `test_diagnostic_semantics.py`, `test_engine.py`, `test_setup.py`, `test_smoke.py` | Original navigation regression, typed test corrections and formatting retained alongside integrated tests. |

AST comparison of every definition changed by the original Python patch against
this branch found **zero missing or different definitions**. Ruff additionally
formatted integration-only additions in `test_cli.py`, `test_setup.py`, `test_web.py`
and the changed server. No original source changes were omitted. The original
untracked `frontend/` and its `node_modules` were not copied.
The coordinator's saved original patch still passes `git apply --reverse --check`
against the original checkout after this work.

## Supported limits and reconciliation

The detailed contracts remain in [still verification](../still-verification.md),
[video selection](video-frames.md), [video verification](video-verification.md)
and [palettes](custom-palettes.md). Earlier leaf-ticket statements that lint/type
failures remain, camera verification is excluded, or video verification awaits a
later ticket are historical handoffs, superseded by this integration report and spec 33.
The prototype's layout switcher, mock camera mode and browser seeking are not production features.

Still verification accepts the documented untagged 16-bit RGB PNG or float32 RGB
PFM, up to 4,194,304 pixels and 48 MiB plus header. Video accepts the documented
MP4/MOV/Matroska, H.264/HEVC/ProRes/FFV1 combinations with supported YCbCr pixel
formats; limits are 256 MiB, 1920×1080, 120 seconds and 10,000 frames. See the
linked reports for decoder, timeout, precision and cleanup boundaries.

The initial view supports SDR Rec.709/Rec.2020. A source-derived neutral comparison
cannot be established by the current exported false-color transform, so verified
Original/Split comparisons are disabled with an explanation. The unblended result,
numerical pixels and checked artifact remain available. No HDR tone mapping,
physical exposure reconstruction, manufacturer-media certification, continuous
video playback, cross-browser audit or calibrated-display claim is made.
Numerical tolerances and cube-boundary sampling differences remain those documented
in the verification reports; this ticket does not redefine export mathematics.

## Review

The independent standards review found one committed README conflict marker. It
was removed while retaining the Astral formatting instructions and correcting the
frontend instructions to the pnpm lockfile. No other actionable standards findings.

The independent specification review requested a complete keyboard-only workflow
check beyond isolated focus/activation checks. The connected browser script now
includes that pass. No other concrete specification defects were found.

Both reviewers rechecked the corrections and cleared them: **0 remaining standards
findings, 0 remaining specification findings**. The complete connected browser
check passed again, including the keyboard-only pass. The branch is ready for the
coordinator's merge decision with the supported limits above.

Main merge, parent-issue changes, packaging and branch deletion remain the
coordinator's separate actions.
