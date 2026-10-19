# Frontend critique, targeted improvements and audit

Date: 2026-10-19. Target: `frontend/src/App.tsx`, including the browser-only build used by GitHub Pages.

## Outcome

Completed an independent two-agent critique, implemented focused improvements, and audited the result. The critique scored **28/40** on Nielsen heuristics. The subsequent technical audit scores **16/20** using a different rubric; these scores are not a before/after comparison.

Changes are local and have not been committed, pushed or deployed.

## Improvements

- Phone band rows stack color, position/boundary, width/coverage and removal together. Desktop retains the comparison table. Mobile band controls have a measured minimum 44×44px target, with contextual field labels and native table semantics retained in the Chromium accessibility tree.
- Loading or importing a setup retains the immediately previous setup in memory, with a visible **Restore previous setup** action outside the collapsed load controls. Failed imports leave both the current setup and recovery snapshot intact. This recovery is separate from one-step band-edit undo, and lasts only for this page session.
- Deleting a saved setup requires a second explicit confirmation, includes a **Keep setup** escape, and cancels confirmation when selection changes. Saving an existing name explicitly says **Replace saved setup**, with an overwrite explanation; matching remains case-insensitive.
- Load, save, band and generation messages have separate local status regions. A save result is no longer repeated under Generate LUT; band messages appear beside the graph/table.
- **View photo result** and **Back to band editing** links reduce navigation effort without replacing the existing layout. A persistent side-by-side preview remains outside this pass.
- Signal-warning and save-section titles are semantic headings. Removed the redundant header eyebrow.

## Technical audit

**Implementation integrity: pass within the tested scope.** The existing neutral workbench identity, field components, validation, band undo and LUT calculations are preserved. The final Impeccable detector returned exit 0 and `[]`; no deterministic findings or false positives.

| Dimension | Score /4 | Evidence and limits |
| --- | ---: | --- |
| Accessibility | 3 | Contextual field names, keyboard field editing, visible 2px focus outline, table semantics and headings checked. Local status delivery tested. No actual screen-reader certification. |
| Performance | 2 | Worker generation succeeds, but the main bundle remains approximately 586.5kB minified / 187kB gzip and triggers Vite's 500kB warning. No throttled-device benchmark. |
| Theming | 4 | Light and dark screenshots inspected; new styling uses existing tokens. Neutral muted text on card/background calculates to 6.08–7.37:1. This sample is not a whole-app contrast certification. |
| Responsive design | 3 | No document overflow measured at 320, 390 and 820px; desktop inspected at 1280px. Phone numeric controls fit and measure at least 44×44px. Fill mode checked at 320px. Physical touch and cross-engine behavior remain untested. |
| Implementation integrity | 4 | Focused existing-component changes, regression coverage, clean detector and whitespace check. No new dependencies or changes to numerical semantics. |
| **Total** | **16/20** | **Good** |

### Remaining findings

No P0 or P1 issues were established by the final bounded checks. Three P2 follow-ups remain:

1. **P2 — Main bundle size.** Location: the built `assets/index-*.js` and `frontend/src/App.tsx` import surface. Category: performance. A roughly 187kB compressed entry bundle may cost startup time on slower devices. Measure on a throttled device before deciding which optional features to split. Suggested command: `optimize`, followed by `polish`.
2. **P2 — Dense mobile graph labels and precision.** Location: `ExposureGraph` in `frontend/src/App.tsx`. Category: responsive design. The full exposure axis remains dense at 320–390px, and narrow graph handles are not the best touch editing path. The now-visible numeric controls provide an equivalent alternative. Consider sparse mobile tick labels and separately test real touch gestures. No WCAG target-size violation is asserted because equivalent controls exist. Suggested command: `adapt`, followed by `polish`.
3. **P2 — Edit/result separation is reduced, not eliminated.** Location: the band editor and `#photo-result` in `frontend/src/App.tsx`. Category: workflow/implementation. Jump links work, but users still cannot see the photo while adjusting a distant band. A compact persistent preview would require a further layout decision. Suggested command: `layout`, followed by `polish`.

The main recurring constraint is a dense technical editor on a narrow display. Preserve precise numeric alternatives and contextual labels when changing graph interactions. Positive patterns to keep include progressive disclosure, explicit units, diagnostic-color legends, one-step band undo, source interpretation caveats and local worker generation.

## Verification

- `pnpm install --frozen-lockfile`: passed, dependencies already current.
- `pnpm lint`: passed.
- `pnpm test`: **66 passed, 0 failed, 0 skipped**. New rendered-App coverage exercises load and import recovery, invalid-import preservation, confirmation cancellation and deletion, explicit duplicate-name replacement, and single local feedback. Existing tests include numerical reference comparisons, worker cancellation and source-verification state behavior.
- `pnpm build`: passed TypeScript, Vite and manual generation. `LUT_BUILDER_PAGES=true pnpm build` also passed. The final on-disk assets were rebuilt in the repository's default mode; CI still builds the Pages prefix explicitly. Obsolete hashed assets were removed by the build.
- `git diff --check`: passed.
- Impeccable detector: zero findings before and after the changes.
- Native in-app Chromium checks: desktop/light and phone/dark screenshots; 320/390/820px overflow measurements; keyboard width change and focus styling; photo navigation round trip; Fill selection via keyboard and stacked Fill rows at 320px.
- Production Pages-prefix preview at `/lut_builder/`: successful actual 17³ download, **4,913 finite RGB triples**, correct size declaration, and no recorded browser error logs at that check.
- Sample neutral contrast calculation uses OKLCH chroma 0, whose relative luminance is L³: light muted/card 6.54:1, light muted/background 6.08:1, dark muted/card 6.91:1, dark muted/background 7.37:1.

The test suite emits jsdom navigation/scroll stubs and existing asynchronous React `act` warnings; all tests pass. The build emits a main-chunk size warning and the manual's existing 404 content notice.

## Evidence and run accounting

- Critique snapshot: [initial independent critique](../../.impeccable/critique/2026-10-19T16-30-19Z__frontend-src-app-tsx.md). First run for slug `frontend-src-app-tsx`; no trend yet. Snapshot closed after its scoped fixes were processed.
- Method: independent A `/root/design_review` and B `/root/technical_review`. B findings were withheld until A completed. The parent supplied browser screenshots because both child runtimes reported no browser availability.
- Ignore file: absent. Detector: successful. Parent browser: available; no injected overlay or overlay live server. Read-only inspection plus normal UI interaction provided browser evidence.
- Before screenshots: `.scratch/impeccable-review/before-desktop.jpg` and `before-mobile.jpg`.
- After screenshots: `.scratch/impeccable-review/after-desktop-light.jpg` and `after-mobile.jpg`.
- Temporary critique body deleted. Both parent-owned Vite servers (ports 5178 and 5179) stopped. Browser viewport and media overrides reset, and the temporary tab closed.
- B's attempted fallback Playwright process timed out before producing evidence. It returned no PID/profile identifier; its cleanup cannot be confirmed, and unrelated browser processes were not terminated.
- An initial context-mode test invocation failed because that sandbox resolved Node to a nonexistent Git installation path. The complete suite then ran successfully through the normal project shell.

## Limits

No physical-device touch test, actual screen-reader pass, Firefox/WebKit pass, 200% text-zoom pass, exhaustive contrast audit, throttled performance benchmark, FFmpeg media acceptance or Python suite was run. Python and LUT numerical implementation were unchanged. Browser viewport emulation is not touch-gesture evidence. No public GitHub Pages deployment occurred.

![Mobile band fields after the improvements](../../.scratch/impeccable-review/after-mobile.jpg)

![Desktop band table in the light theme](../../.scratch/impeccable-review/after-desktop-light.jpg)
