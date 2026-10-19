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

Focused examples:

```sh
pnpm test:ui:checks --project=390-dark --grep disclosures
pnpm test:ui:container --project=390-dark --grep '@visual'
```

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

When changing the UI, extend the relevant test with the new state or a small
layout assertion when the expectation is measurable. Existing regression rules
cover compact disclosures, minimum clickable height, one-axis exposure legends,
side-by-side selectors, visible channel tracks, focus and horizontal overflow.
Wrapped labels may grow: test balance and containment rather than imposing a
fixed box height. Accessibility scans cover default, expanded and invalid states;
fix violations rather than broadly disabling rules to make the suite pass.

## CI and maintenance

[UI quality](../../.github/workflows/ui-quality.yml) runs through the Pages
workflow on pull requests and main pushes; Pages deployment waits for it. Its
report artifact contains failure screenshots and traces and is retained for 14
days. It can also be dispatched manually. Repository branch protection is a
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

## Why this setup

The [research note](../research/ui-detail-quality-tools.md) compares alternatives.
Playwright provides [screenshot comparisons](https://playwright.dev/docs/test-snapshots)
and [axe integration](https://playwright.dev/docs/accessibility-testing). Explicit
geometry checks catch known layout mistakes even before a baseline is approved;
visual review catches judgments that those rules cannot encode.
