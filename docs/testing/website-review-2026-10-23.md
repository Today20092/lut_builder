# Website review — 23 October 2026

## Result

The editor already has a coherent visual system, a useful first-run flow,
responsive task navigation, a searchable manual, local setup recovery, and
substantial accessibility coverage. Its main website-completeness gaps were
project identity, About/support discovery, and browser/share metadata. Those
gaps are addressed in this change without adding a separate marketing homepage
between visitors and the builder.

Implementation integrity: **pass within the reviewed scope**. New UI uses the
existing neutral tokens, Lucide icons, shared buttons, and WorkspaceSheet.
LUT calculations, export formats, and saved-setup contracts are unchanged.
The Impeccable source detector reported no deterministic findings in the changed
UI files; its source scan uses regex checks and cannot certify rendered quality.

These scores describe the reviewed implementation, not independent certification:

| Dimension | Score | Assessment |
| --- | --- | --- |
| Accessibility | 3/4 | Automated checks and keyboard recovery; physical-device and screen-reader checks remain open. |
| Performance | 2/4 | Production build succeeds, but the main JavaScript chunk exceeds Vite's warning threshold. |
| Theming | 3/4 | Both themes reviewed; a light-theme destructive-action contrast failure was corrected. |
| Responsive design | 3/4 | Representative 390px/430px phone and 1280px desktop coverage, enlarged-text checks, and emulated touch coverage. |
| Implementation integrity | 4/4 | Existing components and domain behavior reused; no new dependency or tracking integration. |
| Total | **15/20** | **Good; release evidence and performance deserve follow-up.** |

## Changes made

- Added a layered SVG favicon matching the existing Layers brand mark, in both
  the builder and generated manual. Paths work at `/` and `/lut_builder/`.
- Added description, theme-color, and basic Open Graph metadata to the builder.
- Added a semantic footer visible during onboarding and throughout the workspace:
  About, Manual, GitHub, and Support this project. External project links identify
  their new-tab behavior to assistive technology.
- Added a searchable About page in the existing manual. It explains diagnostic
  LUTs, local processing and browser storage, the MIT license, help, contributions,
  and optional financial support.
- Linked the exact supplied GitHub project and Ko-fi account. Support copy invites
  a donation or purchase on Ko-fi. No payment widget or account requirement was added.
- Moved removal out of each band's bottom/table action cell into the selected-band
  action group beside Add band and Undo. Phones retain a compact, named trash icon;
  desktop includes a visible Remove label.
- Unified toolbar and graph Delete/Backspace requests through the existing modal
  sheet. Opening it does not edit the LUT. Cancel, Close, Escape, and browser Back
  preserve the band and restore focus; confirmed removal remains undoable.
- Preserved the graph's two-color minimum for Fill in the toolbar. Empty selections
  and busy workspaces disable removal.
- Removed obsolete table-action layout rules so position and width/coverage remain
  aligned. In the narrow imported-look view, the compact preview link now has its
  own row so it cannot cover the new removal control.
- Darkened the shared light-theme destructive token after axe found a 4:1 text
  contrast ratio in the confirmation action. Dark-theme colors are unchanged.

The implementation reaches the application shell, selected-band toolbar, graph
shortcut callback, band table, shared color token, keyboard help, manual navigation,
HTML metadata, browser assets, and corresponding unit/browser acceptance checks.

## Prioritized remaining findings

Unresolved: **0 P0, 0 P1, 2 P2, 1 P3** within this review's scope.

### Resolved during promotion — Linux screenshot references

Location: `frontend/playwright.config.ts`, `docs/testing/ui-quality.md`.

Docker Desktop's Linux engine remains unavailable locally. Canonical candidates
were instead captured and reviewed in the pinned GitHub Linux environment using
[run 39992738099](https://github.com/Today20092/lut_builder/actions/runs/39992738099),
source `c47dfb7d228e1724b4e4feebcf7cbd59481a6828`. All 66 current references were
reviewed; 64 match the preceding capture byte for byte, and the two new 430px
initial-workspace captures were reviewed separately. No Windows captures were
adopted as Linux references.

Accepted intentional differences:
the footer, removal toolbar/dialog, three-column band table, aligned phone fields,
destructive-action contrast, and imported-view preview-link positioning. Other
pixel changes need separate explanation. The `ui-quality-report` artifact is
`12517769923`, digest
`sha256:599c83b5fec04c680ebc8b50a18ef1166b9ab1a928caa31bc4cfd54837893491`.
The complete UI-quality gate remains required before merging; its final result is
recorded in the promotion PR. The visual capture run deliberately failed on the
old/missing references and is not itself a passing gate.

Suggested follow-up: `$impeccable polish` after canonical screenshot review.

### P2 — Initial JavaScript payload deserves measurement

Location: the production `assets/index-*.js` chunk, originating in
`frontend/src/App.tsx` and its imports.

The main bundle is approximately 694 kB minified / 224 kB gzip. Vite warns above
500 kB. This can affect first use on slower phones and connections. The optional
FFmpeg WASM asset is roughly 32 MB; its build output size alone does not establish
that it blocks initial loading.

Measure cold-load performance on a representative phone/network before choosing
split points. Consider loading verification/import functionality only when needed
if measurements identify it as a startup cost. This pass does not claim measured
Core Web Vitals or introduce speculative bundle refactoring.

Suggested follow-up: `$impeccable optimize` with a loading trace.

### P2 — Compact preview link can cover the graph's range summary

Location: the phone `.workspace-stage` persistent-preview positioning rule in
`frontend/src/index.css`.

The default 430px screenshot shows the right side of the graph's range/reference
summary underneath the absolutely positioned preview link. The graph's ticks and
editable values remain available, but visitors cannot read the entire summary in
that position. The imported-look toolbar overlap is fixed in this change; moving
the default compact preview link into normal flow deserves a separate small layout
pass rather than treating a passing overflow check as proof that labels are clear.

Suggested follow-up: `$impeccable layout`, followed by `$impeccable polish`.

### P3 — Rich sharing and home-screen artwork are still basic

Location: `frontend/index.html`, `frontend/public/favicon.svg`.

The favicon and text sharing metadata now establish identity. There is no custom
Open Graph preview image or PNG Apple touch icon, so social previews and some
phone shortcuts may still use platform fallbacks. A manifest/service worker is
not required for the requested website additions and should only be added with
an explicit install/offline product requirement.

Suggested follow-up: `$impeccable polish` if branded share/home-screen artwork is
desired. Use an absolute deployed image URL for social previews.

## Verification and evidence

Routine phone coverage was revised at the owner's request: 320px is no longer a
standard project. The suite and manual checks use Playwright's 390×664 and 430×740
phone browser viewports and 1280×900 desktop. These are layout samples, not claims
about device market share or Safari support. Enlarged-text coverage remains.
The picker stability test compares content positions after accounting for normal
keyboard-driven scrolling in the shorter phone viewport. Existing 320px goldens
are historical; new 430px and changed-height candidates require Linux review.

- Locked frontend dependency install completed; no dependency changes.
- Frontend lint, application TypeScript build, UI TypeScript checks, and production
  build passed.
- Frontend unit suite: **113 passed**.
- Native Chromium layout/accessibility suite: **170 applicable checks passed**
  across the main run and targeted correction reruns; 10 phone-only cases were
  skipped in desktop projects. The initial run caught an overlap in the 320px
  imported-look toolbar, which was corrected. On the revised matrix, the main run
  passed 168 checks and the two corrected picker assertions passed their rerun.
- Production manual acceptance passed for **both** root/local and GitHub Pages
  builds: 10 pages, internal links/fragments/assets, favicons, diagrams, keyboard
  scrolling, search, navigation, contextual help, and return links.
- About-page axe scans passed in light/dark at 390/430/1280px in both builds.
- New footer and removal tests check the supplied URLs, icon response/type,
  grouping, accessibility, cancellation, focus, browser Back, Undo, and the graph
  shortcut.
- Reviewed screenshots include the footer and confirmation at the configured
  widths/themes, phone Fill-field alignment, and About in all six width/theme
  combinations. Native evidence is under `frontend/test-results/` and
  `.scratch/site-review/{local,pages,ui-current,ui-picker}/`; these are local
  evidence directories.

The Ko-fi URL is used exactly as supplied. Automated fetching of that external
page was unavailable; no donation or purchase was attempted. The public GitHub
repository confirms the diagnostic-LUT purpose and MIT license.

Squirrel was not installed. The local review used the repository's Playwright and
axe infrastructure and Impeccable instead. Docker repair, physical-phone testing
and assistive-technology testing were not performed. Linux references were updated
through CI during promotion; Python CI passed on the capture source revision.
Python implementation and media semantics did not change. Deployment and final
merge-gate results are tracked in the promotion PR.

## Maintenance notes

The Impeccable loader reported that `.impeccable/design.json` is older than
`DESIGN.md`; the authored design guidance was followed. The `document` command can
refresh the sidecar separately. A newer Impeccable version, 4.7.0, is available;
updating the skill was left outside this website change.
