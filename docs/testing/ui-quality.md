# UI quality checks

Use this workflow when changing layout, styling, controls, or screenshot baselines.
The regular frontend checks in AGENTS.md still apply. This suite adds rendered
evidence; unit tests and a clean source-code critique do not establish visual quality.

## Run and inspect

Run commands from `frontend/` after the locked dependency install:

1. Run `pnpm typecheck:ui`. For fast local layout/accessibility feedback, install
   Chromium once with `pnpm exec playwright install chromium`, then run
   `pnpm test:ui:checks`. Done: all configured widths and themes pass.
2. Start Docker Desktop with Linux containers and run `pnpm test:ui:container`.
   This uses the same versioned Playwright Ubuntu image as CI, including its
   browser and fonts. It isolates Linux dependencies from the host and caches
   downloads in the `lut-builder-ui-pnpm-store` Docker volume. Done: all checks
   and screenshot comparisons pass with the committed baselines.
3. Open `pnpm test:ui:report` after failures. Inspect actual/expected/difference
   images and traces. Fix unintended changes, then rerun affected tests.
4. Review screenshots for every changed component in all configured widths and
   themes, including its relevant collapsed, expanded, focus, invalid, and
   long-label states. Use the project-local Impeccable skill for design critique
   or polish when available, inspecting rendered images rather than source alone.
   Check alignment, balanced spacing, wrapping, contrast, overflow, and whether
   the selected control is obvious. Done: each visible defect is fixed or reported
   explicitly; a green diff against an old image is not a design assessment.

The project matrix and exact settings live in
[playwright.config.ts](../../frontend/playwright.config.ts). Tests live in
[workspace.spec.ts](../../frontend/tests/ui/workspace.spec.ts). Each test gets a
fresh browser context; palette edits do not affect the user's dev-server storage.
The suite starts its own Pages-mode Vite server on port 4187 and stops it afterward.

Routine coverage uses two representative phone browser viewports from Playwright's
device registry: iPhone 13 at 390×664 CSS pixels and iPhone 14 Pro Max at 430×740,
plus a 1280×900 desktop viewport. Both themes run at each size. These phone widths
span compact and large contemporary layouts, with common 412px Android widths
between them. The suite uses Chromium with mobile/touch behavior; matching an
iPhone viewport does not establish Safari or physical-device coverage. Screenshots
use device scale factor 1 for reproducibility. Do not add a full project for every
phone model or retain 320px as a routine legacy-device case without a concrete need.
Keep enlarged-text checks: larger text is an ordinary accessibility preference,
not an additional device model. See [Playwright emulation](https://playwright.dev/docs/emulation).

Focused examples:

```sh
pnpm test:ui:checks --project=390-dark --grep disclosures
pnpm test:ui:container --project=390-dark --grep '@visual'
```

During editing, select the changed test and one phone/desktop layout before running
the full gate. For example, this checks recovery without Docker:

```sh
pnpm test:ui:checks --project=390-light --project=1280-light --grep 'corrupt sessions|starting over'
```

Use `--list` first to inspect the selection. A focused pass is feedback,
not release acceptance; CI still runs the complete gate. For theme/contrast changes,
include both themes. For responsive changes, include both phone widths and desktop.

Only tests tagged `@behavior` omit repeated themes and the second phone width:
corrupt-session recovery and starting over/camera export compatibility. They retain
390-light and 1280-light to exercise both navigation layouts. Keep all screenshot,
geometry, enlarged-text and axe accessibility tests in the complete six-project
matrix; do not tag them `@behavior` to shorten CI.

Native `pnpm test:ui` skips image comparisons on Windows/macOS; use the container
for the complete gate. Linux screenshot comparisons are authoritative only in the
versioned image, because OS, browser and fonts affect rendering. Existing optional
cross-browser/media checks remain documented in [integration.md](integration.md).
Emulation supplements occasional real-phone scrolling, keyboard and screen-reader
checks; report those separately when not performed.

## Intentional appearance changes

For an intentional visual change, generate only the affected candidates:

```sh
pnpm test:ui:container --grep '@visual' --update-snapshots=changed
```

Narrow further with `--project=390-dark` or a test name when appropriate. Inspect
every changed PNG under `frontend/tests/ui/screenshots/` before accepting it.
Describe the intended appearance change and reviewed states in the handoff/PR.
Then run `pnpm test:ui:container` without update flags to prove the baselines match.
CI uses `updateSnapshots: 'none'`: missing or changed images fail instead of being
silently accepted. Keep comparison tolerances strict; fix unstable content or
explicitly isolate genuinely nondeterministic regions with a documented reason.

When the local Linux container is unavailable, dispatch the UI-quality workflow
with `suite=visual` for the canonical screenshot states alone. Its report artifact
retains explicit captures even for a missing baseline. Inspect those candidates,
update the corresponding files deliberately, then dispatch the default `all` suite
to pass the complete gate. Both modes keep snapshot updates disabled and pixel
tolerance at zero; the visual-only run does not replace full acceptance.

When changing the UI, extend the relevant test with the new state or a small
layout assertion when the expectation is measurable. Existing regression rules
cover compact disclosures, minimum clickable height, one-axis exposure legends,
side-by-side selectors, visible channel tracks, focus and horizontal overflow.
Wrapped labels may grow: test balance and containment rather than imposing a
fixed box height. Accessibility scans cover default, expanded and invalid states;
fix violations rather than broadly disabling rules to make the suite pass.

## CI and maintenance

[UI quality](../../.github/workflows/ui-quality.yml) runs through the Pages
workflow when a pull request affects the frontend, UI tests or shared/unknown
boundaries, and always on pushes to `main`. Published-manual-only and Python-only
PRs use their relevant checks instead; see [CI selection](ci.md). Only `main` can
deploy Pages, and deployment waits for the complete gate. Development
backup pushes do not validate automatically: open/update a PR or dispatch the
Pages workflow on `development` for the full checks. Python runs once through
Pages rather than also starting an independent push/PR workflow.

The UI gate splits individual tests across three parallel jobs using Playwright
sharding and `fullyParallel`. Each shard keeps one worker and the pinned container
for stable screenshots. All shards must pass; one failure does not cancel the
others. Each `ui-quality-report-1`, `-2` and `-3` artifact contains its own HTML/JSON
report, failure screenshots and traces, retained for 14 days. Inspect all three
reports for full-suite results. Manual full/visual runs use the same sharding.
Repository branch protection is a
separate GitHub setting; this change does not configure it.

Keep `@playwright/test` pinned and update the workflow container image to the same
version when upgrading it. The local container launcher derives the image version
from the package manifest. Review all baseline changes after an upgrade and run a
second comparison without update flags. Keep axe pinned through the lockfile.
Adding new controls or states requires extending coverage; this suite does not
automatically explore every application state.

No hosted visual-testing account or uploaded customer media is required. Use
synthetic/default test data so committed screenshots and CI traces contain no
private setup or media data.

### Assessed accessibility exception

The scan includes WCAG 2.2 AA. Dense exposure-graph handles can overlap because
their positions encode exposure. Only `target-size` findings for the known Stops
center/edge handles use the [WCAG 2.5.8 Equivalent exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
the same page provides numeric position and total-width controls. The test checks
that each corresponding field is visible, enabled, and at least 24×24 CSS pixels
before accepting that finding. The gradient's add-on-bar target uses the same
exception only while its separate full-size **Add color** button is available.
All other findings remain failures. Reassess this
exception if graph operations or their equivalent controls change.

Fill presets can likewise place separators closer than 24 pixels at narrow
widths. Their equivalent numeric boundary fields and full-size band color-picker
buttons are checked for visibility, enabled state, and minimum 24×24 size before
accepting only those spatial-control findings under the same Equivalent exception.

## Why this setup

The [research note](../research/ui-detail-quality-tools.md) compares alternatives.
Playwright provides [screenshot comparisons](https://playwright.dev/docs/test-snapshots)
and [axe integration](https://playwright.dev/docs/accessibility-testing). Explicit
geometry checks catch known layout mistakes even before a baseline is approved;
visual review catches judgments that those rules cannot encode.
