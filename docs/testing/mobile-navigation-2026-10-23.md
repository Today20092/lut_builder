# Mobile navigation implementation — 2026-10-23

The approved [navigation direction](../plans/mobile-navigation-direction.md) is
implemented in the architecture-integration checkout on
`codex/workspace-composition-55-56`.

## Result

- Presets, Edit, Media and Settings use the same order and labels on desktop and
  mobile. Edit contains the Bands / Palette switch. The More layer is removed.
- Camera and display are directly available in Settings. Output options, imported
  looks, signal warnings, saved setups and palette tools expand in place. Root
  destinations have no Back control or repeated task title.
- Export and import confirmation share one native modal sheet, centered on desktop
  and anchored to the bottom on mobile. Close, Escape and browser Back dismiss it;
  focus and scroll return to its opening context. Motion respects reduced motion.
- Destination changes preserve mounted editor/media state, inline disclosures and
  per-section scroll. Existing import validation, setup recovery and generation
  compatibility remain intact.
- Mobile navigation reserves safe-area space. Settings actions wrap with enlarged
  text; the four destinations remain reachable at 320px and 200% text.

## Verification

Locked dependency installation succeeded. All 113 unit tests passed with Node's
test concurrency set to one; concurrent esbuild launches were unreliable on this
Windows host. ESLint and UI TypeScript checks passed. The navigation components
and stylesheet produced no findings in the Impeccable detector.

The browser matrix covers 320, 390 and 1280px in light and dark themes, including
navigation, inline settings, browser Back, import confirmation, export, focus,
large text, touch editing, session recovery, media-state continuity, downloaded
LUT bytes and accessibility. Final matrix and build results are recorded below.
The new navigation scan excludes the existing spatial exposure graph; its dense
handles and equivalent numeric controls remain covered by the existing
`workspace.spec.ts` checks and the documented WCAG 2.5.8 Equivalent assessment.

Final results:

- The 144-case sweep finished with 127 passes, 8 expected desktop skips and 9
  failures. These exposed narrow enlarged-text overflow, inherited disclosure
  margins, desktop tests that still assumed warning controls were always open,
  and the graph-equivalence assessment missing from the new navigation scan.
- After fixes, the affected 30-case matrix returned 26 passes, 2 expected skips
  and 2 remaining 320px enlarged-text failures. Fixing the Edit switch's minimum
  column width resolved those: the final enlarged-text matrix passed all 4 phone
  cases, with 2 expected desktop skips. Every failed case has a passing rerun.
- ESLint, UI TypeScript, the production TypeScript/Vite build and the manual build
  passed. Bundled assets in `src/lut_builder/static/` were regenerated. Vite still
  reports the existing large-chunk advisory; no dependency or bundling changes
  were introduced for this navigation work.
- Reviewed native Settings, import-confirmation and export screenshots at every
  configured width/theme, plus the final enlarged Edit captures at both phone
  widths/themes. Checked wrapping, alignment, selected destinations, disclosure
  chevrons, modal focus, touch targets, containment and light/dark contrast.

This evidence combines a full sweep and focused reruns; it is not a single clean
full-suite run or canonical Linux visual acceptance.

## Remaining acceptance limits

Docker's Linux engine is unavailable (`dockerDesktopLinuxEngine` pipe missing),
so the canonical Linux screenshot comparison and baseline refresh remain pending.
No canonical PNGs were replaced on Windows. The intended changes affect workspace,
settings, setup, import-confirmation and navigation screenshots: four destinations,
shared screen headings, inline disclosures and modal sheets replace the old More
and task-screen hierarchy.

Native screenshots are review evidence, not substitutes for the Linux gate.
Real iPhone Safari, physical keyboard/screen-reader use and S5IIX hardware loading
were not checked. Python source and LUT mathematics were unchanged in this step.

The dev server runs from this checkout at <http://127.0.0.1:5173/>. The browser tool
blocked reopening the user's preview tab, so the link must be opened manually.
