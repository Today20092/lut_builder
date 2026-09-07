# Deepen the band-edit transaction

## Agreed outcome

Preserve all current editing behavior while concentrating band identity, selection, gesture grouping and one-step undo in the editor module. The user confirmed behavior preservation during the architecture interview. No further product decisions remain.

Domain terms are defined in `/CONTEXT.md`.

## Implementation scope

Use plain state transitions with the existing React state owner. Reuse the geometry and identity helpers in `frontend/src/editor.ts`. Concentrate setup, selection, undo and gesture state so App no longer reconstructs selection or assembles recovery rules. App retains rendering, requests and removal-confirmation presentation.

Preserve these distinctions:

- Band transactions include mode changes, presets, bulk widths, graph edits, table edits, add/remove and palette application.
- Unrelated configuration patches bypass band undo. Undo restores band mode, fill mode and monochrome only when the undone transaction changed those fields.
- No-op edits retain the previous undo. Reordering preserves selected identity; removal or replacement uses the existing index fallback. Adding selects the new band.
- Pointer start records the initial setup and selection. Pointer up, cancellation and lost capture end grouping. Cancellation does not roll back the edit.
- Successful import replaces setup, clears undo and selects index zero. Failed import preserves state. Preserve current behavior for gesture and removal-confirmation state during import.
- Keep removal-confirmation clearing on selection, undo and confirmed removal.

## Evidence and verification

The current coordination is in `frontend/src/App.tsx` at `editSetup`, `undoEdit`, `addBand`, `importFile` and graph gesture callbacks. Identity and ordering helpers live in `frontend/src/editor.ts`.

Keep the existing App behavior checks in `frontend/tests/exposure-graph.test.mjs`, particularly the band-edit recovery scenario. Add a compact direct transaction check covering selection after reordering, grouped undo, preservation of unrelated settings and no-op undo retention. Preserve existing geometry tests.

Run frontend tests, lint and the TypeScript/Vite build. Inspect the build diff because Vite emits the packaged frontend assets. No Python implementation changes are expected.

## Implementation result

Implemented through `createEditorState` and `reduceEditor` in `frontend/src/editor.ts`. App dispatches edits and lifecycle actions instead of coordinating snapshots and selection recovery. The packaged UI was rebuilt.

Validation passed: 35 frontend tests, ESLint, TypeScript project build, Vite production build and packaged asset reference checks. The npm script shell resolved Node to a missing Git directory; the equivalent commands succeeded when invoked directly with the installed Node executable.

### Standards review

No documented-standard violations or actionable baseline smells. Selection, gesture grouping and undo have locality in the editor module, and tests exercise the same interface as App.

### Spec review

No missing requirements, scope creep or demonstrated behavior regressions. The review checked edit paths, undo, identity, import, gesture ordering and removal-confirmation behavior.

Review baseline: `550a3d31ff383025b663e0e14229b33433fa7e78`. Findings: Standards 0; Spec 0.
