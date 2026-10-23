import assert from "node:assert/strict"
import test from "node:test"
import { changedFiles, checks, selectChecks, verifyResults } from "./select-checks.mjs"

const selected = (files, event = "pull_request") => {
  const selection = selectChecks(event, files)
  return checks.filter((name) => selection[name])
}

test("main pushes and manual runs always select every check", () => {
  for (const event of ["push", "workflow_dispatch", "unexpected"]) assert.deepEqual(selected([], event), checks)
})

test("PR selection respects application boundaries", () => {
  const cases = [
    [["README.md", "docs/testing/ui-quality.md"], []],
    [["frontend/manual/src/content/docs/about.md"], ["build", "manual"]],
    [["frontend/manual/public/favicon.svg"], ["build", "manual"]],
    [["frontend/manual/src/content.config.ts"], ["build", "frontend", "manual"]],
    [["frontend/tests/manual-browser.mjs"], ["build", "manual"]],
    [["frontend/src/SiteFooter.tsx"], ["build", "frontend", "ui", "browser", "manual"]],
    [["frontend/src/index.css"], ["build", "frontend", "ui", "browser", "manual"]],
    [["frontend/src/SiteFooter.tsx", "src/lut_builder/static/index.html", "src/lut_builder/static/assets/index-old.js", "src/lut_builder/static/assets/index-new.js"], ["build", "frontend", "ui", "browser", "manual"]],
    [["frontend/manual/src/content/docs/about.md", "src/lut_builder/static/docs/about/index.html"], ["build", "manual"]],
    [["frontend/src/setupSchema.ts"], checks],
    [["frontend/src/lutEngine.ts"], checks],
    [["frontend/src/lutEngine.ts", "src/lut_builder/static/assets/index.js"], checks],
    [["frontend/src/session.ts"], checks],
    [["src/lut_builder/engine.py", "tests/test_engine.py"], ["python"]],
    [["frontend/tests/ui/site.spec.ts", "frontend/tests/ui/screenshots/390-light/workspace.png"], ["build", "frontend", "ui"]],
    [["frontend/tests/ui/screenshots/390-light/workspace.png"], ["ui"]],
    [["frontend/tests/editor.test.mjs"], ["build", "frontend"]],
    [["frontend/tests/imported-lut-parity.mjs"], checks],
    [["src/lut_builder/engine.py", "frontend/manual/src/content/docs/controls.md"], ["python", "build", "manual"]],
  ]
  for (const [files, expected] of cases) assert.deepEqual(selected(files), expected, files.join(", "))
})

test("dependencies, configuration, shared fixtures, generated or unfamiliar paths select everything", () => {
  for (const path of ["uv.lock", "pyproject.toml", "frontend/pnpm-lock.yaml", "frontend/package.json", "frontend/vite.config.ts", "frontend/playwright.config.ts", ".github/workflows/python.yml", ".github/scripts/select-checks.mjs", "frontend/tests/fixtures/reference.json", "frontend/tests/python-parity.mjs", "src/lut_builder/static/index.html", "future/new-calculation.rs", "future/new-feature.md", "src/lut_builder/camera-data.md", "frontend/src/profiles.json", "frontend/src/new-engine.js"]) {
    assert.deepEqual(selected([path]), checks, path)
  }
})

test("diff uses complete base-to-tested-merge comparison with NUL paths and old/new rename sides", () => {
  const base = "a".repeat(40)
  const merge = "b".repeat(40)
  const files = changedFiles({ pull_request: { base: { sha: base } } }, merge, (...args) => {
    assert.deepEqual(args, ["diff", "--no-renames", "--name-only", "-z", base, merge, "--"])
    return "frontend/src/old.ts\0docs/renamed.md\0docs/with\nnewline.md\0"
  })
  assert.deepEqual(files, ["frontend/src/old.ts", "docs/renamed.md", "docs/with\nnewline.md"])
  assert.deepEqual(selected(files), checks)
})

test("missing base and diff failures cannot silently skip checks", () => {
  assert.throws(() => changedFiles({}, "b".repeat(40)), /base\/merge SHA/)
  assert.throws(() => changedFiles({ pull_request: { base: { sha: "a".repeat(40) } } }, "b".repeat(40), () => { throw new Error("missing history") }), /missing history/)
})

function results(files) {
  const outputs = Object.fromEntries(Object.entries(selectChecks("pull_request", files)).map(([name, value]) => [name, String(value)]))
  return { select: { result: "success", outputs }, ...Object.fromEntries(["python", "build", "ui"].map((name) => [name, { result: outputs[name] === "true" ? "success" : "skipped" }])) }
}

test("aggregate gate accepts intentional skips and rejects missing, failed or cancelled selected jobs", () => {
  for (const files of [[], ["README.md"], ["src/lut_builder/engine.py"], ["frontend/src/App.tsx"], ["uv.lock"]]) verifyResults(results(files))
  for (const name of ["select", "python", "build", "ui"]) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const needs = results(["uv.lock"])
      needs[name].result = result
      assert.throws(() => verifyResults(needs), name)
    }
  }
  const invalid = results([])
  delete invalid.select.outputs.python
  assert.throws(() => verifyResults(invalid), /Invalid selection/)
  const incompleteRelease = results(["README.md"])
  incompleteRelease.select.outputs.mode = "full"
  assert.throws(() => verifyResults(incompleteRelease), /Full release requires/)
  const missingBuild = results(["frontend/tests/editor.test.mjs"])
  missingBuild.select.outputs.build = "false"
  assert.throws(() => verifyResults(missingBuild), /require the build job/)
})
