# Architecture refactor acceptance

Issues: [51](https://github.com/Today20092/lut_builder/issues/51),
[52](https://github.com/Today20092/lut_builder/issues/52),
[53](https://github.com/Today20092/lut_builder/issues/53),
[54](https://github.com/Today20092/lut_builder/issues/54).
Integration branch: `codex/architecture-51-54`.
Starting commit: `965fcdf6609925c49b4814d53a697facac91b535`.
Implementation and review fixes integrated at `90cf37811f176206326fe941bb18b0000439b4c4`.

## Ownership

- `workspaceRuntime.ts` owns local/browser execution, validation/normalization,
  generation, progress, transport errors and interruption. Presentation consumes
  explicit capabilities rather than assuming feature parity.
- `previewMedia.ts` owns active display-media acquisition, source/frame identity,
  replacement, interruption and server resource cleanup. Shared video types no
  longer point back into the application entry module.
- `verifiedResult.ts` provides actual local/browser result adapters for pixel
  inspection, exact checked-cube retrieval and release. Presentation consumes
  domain results rather than fabricated browser HTTP responses.
- `setupReplacement.ts` owns setup replacement, winning-load identity, recovery,
  status and ancillary resets. Edits during a pending load invalidate that load.
  Previous-setup recovery remains separate from band-edit undo.

No LUT algorithms, color semantics, source-confirmation requirements, supported
formats or visual layout were intentionally changed. Bundled browser assets were
rebuilt and committed.

## Verification on Windows, 2026-10-19

- Locked frontend install, lint, TypeScript, UI typecheck, production/manual build
  and whitespace checks passed. Final frontend suite: **93 passed**.
- Native Chromium layout/accessibility suite: **48 passed**, covering 320, 390 and
  1280 CSS pixels in light and dark themes. Captured and reviewed native screenshots
  at all six width/theme combinations; no screenshot baselines changed.
- Browser/Python parity check passed across all sampled camera, target and
  diagnostic configurations (`frontend/tests/python-parity.mjs`).
- Real mobile Vite/StrictMode browser check passed camera PFM verification, pixel
  inspection and checked-cube download. The review found and fixed premature
  result release during StrictMode effect rehearsal; automated regression
  coverage also checks exact bytes, invalidation and re-verification.
- Real packaged local-workspace browser check passed setup import/normalization
  and recovery, generation, PFM inspection, checked-cube SHA-256 identity, and
  FFmpeg-backed VFR video upload, exact/adjacent frame selection and release.
- Separate Standards and Spec reviews cleared their findings after fixes. The
  Standards finding was deferred bundled assets; the Spec finding was the
  StrictMode result lifetime. Both are resolved.

## Limits and existing harness failure

Docker's Linux engine was unavailable despite attempting Docker Desktop startup;
the authoritative container screenshot comparison could not run. Native checks
and screenshot review supplement rather than replace that comparison. No real
phone or additional-browser audit was performed.

The older optional `frontend/tests/workbench-browser.mjs` stopped at its initial
`table.top < 1100` assertion. Both the untouched starting checkout and the final
integration produced identical measurements: table 1239.6875, palette 1408.6875.
This is a pre-existing acceptance-harness mismatch, not evidence of a refactor
regression. It remains unchanged; focused real local workflows above were tested
separately. Its later keyboard-only pass was not reached.

Python implementation files were unchanged. Full Python quality/test suites were
not rerun; the cross-language parity and actual Python-workspace/media checks did
run. Existing jsdom warnings and the build's large-bundle advisory remain.
