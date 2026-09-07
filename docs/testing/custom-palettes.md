# Custom palettes, ticket 35

Implemented on `codex/workbench-ticket-3` from `702ec292d59131d28775013a0d08ed77eacad86f`, with the Workbench and precise-band editing blockers integrated. Scope is [ticket 35](https://github.com/Today20092/lut_builder/issues/35) under [specification 33](https://github.com/Today20092/lut_builder/issues/33).

## Behavior

The palette editor provides editable preset colors, 2 to 32 ordered anchors, keyboard-operated reorder/remove actions, separate brightness progression and color intensity, and immediate draft-ramp feedback. Invalid hex input disables saving and application without changing the setup. The old maximum-color buttons are removed. The original threshold-based false-color assignment remains available as a separate explicit application action.

Apply colors reuses the existing OKLab interpolation and gamut mapping, samples across current band positions, and changes only colors through `editSetup`. The existing one-step undo restores the previous band colors, including manual overrides. Status text distinguishes an applied draft from pending changes and explains replacement of individual overrides. Saturated anchor colors may be reduced by the existing gamut mapper; this ticket does not change export mathematics.

Named palettes are stored in `localStorage` under `lut-builder.palettes.v1`, in the current browser and origin only. Save, rename, replace, delete, and reload/reuse preserve the active setup. Names are trimmed, limited to 80 characters, and unique ignoring case. Storage accepts up to 100 palettes and validates anchor colors, anchor count, brightness, intensity, and names on read. A corrupt collection produces a recoverable message rather than loading invalid values. Failed writes preserve the draft, active setup, and current saved list; users can retry. A successful later save replaces an unreadable collection. Named palettes do not travel in setup JSON; applied band colors do.

## Files

- `frontend/src/PaletteEditor.tsx`: draft controls and browser palette persistence.
- `frontend/src/App.tsx`: replace the old ramp controls and route application through existing undo.
- `frontend/tests/exposure-graph.test.mjs`: rendered editor workflow and generation-request assertions.
- `tests/test_web.py`: setup round trip, real server preview, and generated cube data assertions.
- `src/lut_builder/static/index.html` and hashed JS/CSS assets: production build.
- This verification record.

## Verification on 2026-09-07

- Production build, including `tsc -b`: passed.
- Frontend suite: 30 passed. The palette workflow additionally covers immediate brightness/intensity feedback, invalid input, add/remove/reorder, manual overrides, one-step undo, corrupt stored data, failed save/retry, duplicate names, rename/replace/delete, browser remount/reuse, and geometry preservation in stops, IRE, and fill modes.
- Python suite: 60 passed. The new real-server test confirms serialized colors survive reload and changes to those colors change numerical cube rows.
- `uvx ruff check tests/test_web.py` and `uvx ty check tests/test_web.py --output-format concise`: passed.
- `git diff --check`: passed.
- Independent standards and spec reviews: no remaining actionable findings after restoring original false-color assignment and expanding behavior checks.

Headless Chromium against the actual Python server and rebuilt assets passed keyboard reordering, save/reload/reuse, explicit application, JSON export/import, and a real 17-cube download with the exported band colors in its request. No page errors occurred. There was no document overflow at 1600, 640, or 390 CSS pixels or at a 1280-pixel viewport with 200% root text. Narrow and enlarged-text screenshots were visually inspected. This was Chromium QA, not a full cross-browser accessibility audit.

## Existing quality findings and integration

Repository-wide ESLint still reports four existing `react-refresh/only-export-components` errors in `App.tsx` and one existing `prefer-const` error in `editor.ts`. Repository-wide ty still reports two existing CLI return-type errors and five existing colour-library union-attribute errors in tests. Ruff format still flags the pre-existing formatting in `tests/test_web.py`; the added test follows Ruff's layout. No toolchain migration was made.

The graph indexing service timed out, so discovery fell back to local source inspection. Python environment installation initially hit a Windows hardlink resource error; retry succeeded and all Python tests ran.

Integration should retain the `PaletteEditor` import and its `editSetup` callback when combining concurrent `App.tsx` edits, then rebuild production assets. This work does not modify preview behavior, merge main, close issues, or modify the independent Documents checkout.
