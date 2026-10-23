import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

export const checks = ["python", "build", "frontend", "ui", "browser", "manual"]
const repositoryGuides = new Set(["AGENTS.md", "CONTEXT.md", "Contributing.md", "DESIGN.md", "PRODUCT.md", "README.md", "THIRD_PARTY.md"])

export function selectChecks(eventName, files) {
  const selected = Object.fromEntries(checks.map((check) => [check, false]))
  const enable = (...names) => names.forEach((name) => { selected[name] = true })
  const full = () => enable(...checks)
  if (eventName !== "pull_request") {
    full()
    return { mode: "full", ...selected }
  }

  const frontendSource = files.some((path) => path.startsWith("frontend/src/") || path.startsWith("frontend/public/") || path === "frontend/index.html")
  const manualSource = files.some((path) => path.startsWith("frontend/manual/src/") || path.startsWith("frontend/manual/public/"))
  for (const path of files) {
    if (path.startsWith("frontend/manual/src/") || path.startsWith("frontend/manual/public/")) {
      enable("build", "manual")
      if (/\.tsx?$/.test(path)) enable("frontend")
    } else if (path === "frontend/tests/manual-browser.mjs") {
      enable("build", "manual")
    } else if ((path.startsWith("docs/") && path.endsWith(".md")) || repositoryGuides.has(path) || path === "frontend/tests/ui/screenshots/README.md") {
      // Repository guides are not published; the manual is handled above.
      continue
    } else if (path.startsWith("frontend/tests/ui/") && !path.endsWith(".md")) {
      enable("ui")
      if (/\.tsx?$/.test(path)) enable("build", "frontend")
    } else if (path.startsWith("src/lut_builder/static/docs/") && manualSource) {
      enable("build", "manual")
    } else if (path.startsWith("src/lut_builder/static/") && frontendSource) {
      enable("build", "frontend", "ui", "browser", "manual")
    } else if (/^(src\/lut_builder\/(?!static\/).*\.py|tests\/.*\.py)$/.test(path)) {
      enable("python")
    } else if (path.startsWith("frontend/src/") || path.startsWith("frontend/public/") || path === "frontend/index.html") {
      enable("build", "frontend", "ui", "browser", "manual")
      // Plain TypeScript contains calculation, setup/storage and worker contracts.
      // Unfamiliar runtime data/scripts also keep Python compatibility coverage.
      if (!/\.(tsx|css|svg|png|jpe?g|webp|ico|html)$/.test(path)) enable("python")
    } else if (/^frontend\/tests\/.*\.test\.mjs$/.test(path)) {
      enable("build", "frontend")
    } else if (path.startsWith("frontend/tests/")) {
      // Fixtures and browser helpers can cross Python, export and UI boundaries.
      full()
    } else {
      // Dependencies, build/CI configuration, generated assets and new paths fail closed.
      full()
    }
  }
  return { mode: "selective", ...selected }
}

export function changedFiles(event, sha, git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })) {
  const base = event.pull_request?.base?.sha
  if (![base, sha].every((value) => typeof value === "string" && /^[a-f0-9]{40,64}$/i.test(value))) {
    throw new Error("Missing or invalid pull-request base/merge SHA; refusing to skip checks")
  }
  // Compare the tested merge source with the event's base, without API file limits.
  // Disabling rename detection includes both removed and added paths.
  return git("diff", "--no-renames", "--name-only", "-z", base, sha, "--").split("\0").filter(Boolean)
}

export function verifyResults(needs) {
  if (needs.select?.result !== "success") throw new Error("Check selection did not succeed")
  if (!["full", "selective"].includes(needs.select.outputs.mode)) throw new Error("Invalid selection mode")
  for (const name of checks) {
    if (!["true", "false"].includes(needs.select.outputs[name])) throw new Error(`Invalid selection for ${name}`)
    if (needs.select.outputs.mode === "full" && needs.select.outputs[name] !== "true") throw new Error(`Full release requires ${name}`)
  }
  if (["frontend", "browser", "manual"].some((name) => needs.select.outputs[name] === "true") && needs.select.outputs.build !== "true") {
    throw new Error("Frontend and acceptance checks require the build job")
  }
  for (const name of ["python", "build", "ui"]) {
    const expected = needs.select.outputs[name] === "true" ? "success" : "skipped"
    if (needs[name]?.result !== expected) throw new Error(`${name}: expected ${expected}, received ${needs[name]?.result}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "verify") {
    const needs = JSON.parse(process.env.CHECK_RESULTS)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## CI results\n\n| Job | Result |\n| --- | --- |\n${["select", "python", "build", "ui"].map((name) => `| ${name} | ${needs[name]?.result ?? "missing"} |`).join("\n")}\n`)
    verifyResults(needs)
    console.log("All selected checks passed")
  } else {
    const eventName = process.env.GITHUB_EVENT_NAME
    const files = eventName === "pull_request"
      ? changedFiles(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")), process.env.GITHUB_SHA)
      : []
    const selection = selectChecks(eventName, files)
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selection).map(([name, value]) => `${name}=${value}\n`).join(""))
    const explanation = selection.mode === "full"
      ? "Main pushes and manual runs validate the complete release."
      : "PR checks follow Python, frontend and published-manual boundaries. Configuration, dependencies and unfamiliar paths select everything; internal guides need only this selection gate."
    const summary = `## CI selection: ${selection.mode}\n\n${explanation}\n\n${files.length} changed paths examined. Rules: docs/testing/ci.md.\n\n| Check | Selected |\n| --- | --- |\n${checks.map((name) => `| ${name} | ${selection[name] ? "Run" : "Skip"} |`).join("\n")}\n`
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
    console.log(summary)
  }
}
