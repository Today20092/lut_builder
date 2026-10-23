# CI selection and release checks

Pages CI always starts on PRs targeting `development` or `main`, on `main` pushes,
and on manual dispatch. It does not use workflow-level path filters: those can
leave required checks pending. Instead, an inexpensive **Select checks** job
chooses work, and a stable **CI checks** job checks the results even when work
was intentionally skipped. Use **CI checks** as the required status when
configuring branch protection; protection remains a separate repository setting.

## Pull requests

The selector examines every changed path between the event's base commit and
the tested PR merge commit. It uses Git rather than a paginated/truncated file
list. Removed files and both sides of renames count. Changed paths are combined,
so a PR touching Python and the manual runs both sets of checks.

| Affected paths | Validation |
| --- | --- |
| Python implementation or Python tests | Python format/lint/types, full Python tests including media, and browser/Python numerical parity including imported looks |
| Frontend components, styles, public assets or entry HTML | Frontend lint/unit/build, Chromium/Firefox/WebKit export and manual acceptance, and all three UI shards |
| Plain TypeScript logic under `frontend/src/` | The frontend checks above plus Python/parity, covering calculation, worker, setup and storage contracts |
| Published manual source/assets or its browser test | Production build and manual links/navigation/accessibility in Chromium, Firefox and WebKit |
| UI tests or screenshot baselines | UI type checks and all three UI shards; TypeScript test changes also retain frontend lint/unit/build |
| Frontend unit tests | Frontend lint/unit/build; live Python parity runs separately in the Python job |
| Known repository Markdown guides | Selector tests and aggregate status only; these guides are not deployed |
| Dependencies, CI/build configuration, shared fixtures/helpers, unknown paths | Complete suite |

Bundled `src/lut_builder/static/` changes accompanying frontend source use the
frontend checks, without forcing unrelated Python tests. Manual-only changes
under the bundled `docs/` directory accompany manual source in the same way.
Generated-only edits select the complete suite. New runtime data/script formats
under frontend source also retain Python compatibility coverage. These are
deliberately conservative boundaries rather than a growing list of individual
component/test relationships.
TypeScript changes within the manual also retain frontend lint/unit checks.
The standalone `python-parity.mjs` and `imported-lut-parity.mjs` suites run once
in the Python job, rather than duplicating expensive live comparisons in frontend
unit tests. Changing either parity suite conservatively selects all checks.
The frontend-only suite currently has 111 tests; numerical parity adds three
separate tests. From the repository root, run the latter after `uv sync --locked`:

```sh
node --experimental-strip-types --test frontend/tests/python-parity.mjs frontend/tests/imported-lut-parity.mjs
```

The workflow summary lists selected checks and final job results. A failed
selector, missing history, malformed output, cancelled job or skipped selected
job fails the aggregate gate. An intentional skip is not presented as a test
pass. The selector's own tests always run, including on documentation-only PRs.

## Releases and manual runs

Every `main` push and manual Pages run selects the complete suite. Deployment
requires a successful aggregate gate and full selection on `main`. PR validation
never deploys; manual runs on another branch validate without deploying. No
tested-artifact reuse across different commits bypasses the release gate.

This gives focused PR feedback followed by one complete check of the combined
release before publication. Shared/configuration changes deliberately receive a
complete PR check too. Development backup pushes do not duplicate PR validation.
Cancel-in-progress keeps only the latest workflow for a ref.

## Local feedback and maintenance

During editing, run the affected Python test file or frontend unit/UI test before
the broader checks required by [AGENTS.md](../../AGENTS.md). Use
[UI quality guidance](ui-quality.md) for representative viewport/theme selection
and screenshot review. Focused local results do not replace release acceptance.

Run the selection/gate tests without installing project dependencies:

```sh
node --test .github/scripts/select-checks.test.mjs
```

The implementation lives in
[select-checks.mjs](../../.github/scripts/select-checks.mjs) and
[deploy-pages.yml](../../.github/workflows/deploy-pages.yml). When introducing a
new shared contract or moving runtime code, update the selector tests first.
Keep unknown paths conservative. Do not narrow UI viewport/theme, screenshot or
accessibility coverage merely to shorten a run.

The job/required-check design follows GitHub's
[conditional job guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions),
[dependency semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds),
and [path-filter behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).
PR workflows retain `pull_request`, read-only repository permissions and the
default tested merge checkout; no `pull_request_target` execution is introduced.
