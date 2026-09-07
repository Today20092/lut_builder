# Workbench ticket 34 verification

Implemented on `codex/workbench-ticket-1`, from integration baseline `7423b5425c293f4ee2f9b8835815f9056f8c9d22`.
Scope: [ticket 34](https://github.com/Today20092/lut_builder/issues/34), under [specification 33](https://github.com/Today20092/lut_builder/issues/33).

## Delivered

- Workbench docks the demonstration beside the editor when its container has at least 64rem available, and below it otherwise. Field grids also adapt to text size. Arrangement and band-color actions have distinct groups. Related buttons and fields use the same 36px default height.
- The graph has its own isolated stacking context. Its warnings cannot paint over the preview. The band table remains horizontally scrollable at narrow sizes, with its off-screen label contained inside that scroll region.
- Original, Split view, and Band colors are visible native radio choices. Opacity affects only the illustration. A zero-opacity view preserves original pixels, including with the monochrome base enabled.
- The native expanded dialog supports keyboard navigation and Escape, has a close button and accessible title, and restores focus to Expand preview. Image and comparison choices survive expansion.
- The demonstration explains that graded images cannot verify original camera exposure and that it does not apply the exported cube. The previous unverified camera-log selection is removed.
- Still-image replacement validates type and a 25 MB file limit, reports reading/decoding errors, preserves the previous image on failure, and ignores stale image selections. Images remain in the browser session. The image fits the canvas without cropping.

## Files

- `frontend/src/App.tsx`: layout, demonstration, image handling, warning containment.
- `frontend/src/components/ui/button.tsx`: shared default/small button height.
- `frontend/tests/exposure-graph.test.mjs`: demonstration interaction and pixel checks using existing Node/jsdom tools.
- `src/lut_builder/static/index.html` and hashed CSS/JavaScript assets: rebuilt production application. The unchanged reference JPEG is reused.
- This verification record.

## Checks on 2026-09-07

- `npm run build`: passed, including `tsc -b` and Vite production build.
- `npm run typecheck`: passed.
- `npm test`: 27 passed.
- `uv run pytest -q`: 59 passed.
- `git diff --check`: passed.
- Two independent code reviews, standards and ticket scope, found no actionable issues. Both reviewed the subsequent text-sizing refinement too.

Headless Chromium exercised the actual local Python server and rebuilt production assets, using the bundled Playwright runtime without adding a repository dependency:

- At 1600x1100, the preview sits beside the editor and arrangement actions measure 36px high.
- The enabled High signal label stays within the isolated graph bounds, separated from the preview.
- At 390x844 and 640x800, the preview follows the editor with no document-level horizontal overflow. The 640px viewport also represents the reduced CSS space available when zooming a desktop window.
- At 1280x1000 with root text enlarged to 200%, fields reflow and the preview stacks. Screenshots were inspected after correcting cramped controls in the first pass.
- Enter opens the dialog, Tab does not focus background controls, Escape closes it, and focus returns to Expand preview. Expanded content fits each tested viewport.
- Original/Band colors selection, invalid PNG feedback, valid JPEG replacement, and restoration of the reference photo pass.
- Export JSON downloads a setup; importing that file succeeds; generating a 17-cube through the real server downloads a `.cube` file. No page errors occurred.

The committed jsdom check verifies split pixels against explicit original/red samples, original and zero-opacity output, unchanged setup data, comparison persistence, dialog-close focus return, failed decode preservation, successful replacement, and reference restoration. Native browser focus containment and CSS layout were checked separately in Chromium.

## Existing quality-tool findings

These checks remain nonzero on unchanged baseline code. This ticket does not migrate the separate Astral workflow work:

- ESLint: four `react-refresh/only-export-components` findings for existing exported preview helpers in `App.tsx`; one `prefer-const` finding in `editor.ts`.
- `uvx ruff check .`: twelve E402 findings in `cli.py`, one unused import in `tests/test_smoke.py`.
- `uvx ruff format --check .`: eleven existing Python files would be reformatted.
- `uvx ty check --output-format concise`: two invalid return types in `cli.py`; five LUT union-attribute diagnostics in existing Python tests.

## Limits and integration

This is an sRGB demonstration at 960x540, not numerical camera verification. Browser-supported still images are accepted up to 25 MB. Video and serialized-cube verification belong to their assigned tickets. Browser QA covered Chromium, not a cross-browser accessibility audit or calibrated display accuracy.

Band numeric edits, undo hooks, palette implementation, setup serialization, and generation handlers were preserved for the sibling tasks. Integration must retain those hooks when resolving overlapping `App.tsx` changes and rebuild the hashed production assets after combining branches. No main merge, issue closure, or modification of the independent Documents checkout was performed.
