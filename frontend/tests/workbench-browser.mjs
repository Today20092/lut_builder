// Optional connected acceptance check. Set PLAYWRIGHT_MODULE to an installed
// Playwright entry point; no browser-test dependency is added to the application.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const output = process.env.WORKBENCH_EVIDENCE || join(tmpdir(), "workbench-acceptance")
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const context = await browser.newContext({ viewport: { width: 1265, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(15000)
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
let server
async function start() {
  // Exercise production launch, suppressing only the external browser opener.
  server = spawn("uv", ["run", "python", "-u", "-c", "import webbrowser; webbrowser.open = lambda url: False; from lut_builder.web import launch_workspace; launch_workspace()"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] })
  let log = ""
  server.stdout.on("data", (data) => { log += data })
  server.stderr.on("data", (data) => { log += data })
  await Promise.race([
    new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (log.includes("running locally")) { clearInterval(poll); resolve() }
        else if (server.exitCode !== null) { clearInterval(poll); reject(new Error(log)) }
      }, 50)
      setTimeout(() => { clearInterval(poll); reject(new Error(`Server startup timeout: ${log}`)) }, 15000).unref()
    }),
    once(server, "error").then(([error]) => { throw error }),
  ])
}
async function stop() {
  if (!server || server.exitCode !== null) return
  const exited = once(server, "exit")
  server.stdin.end("\n")
  await exited
}
const button = (name) => page.getByRole("button", { name, exact: true })
async function download(name, filename) {
  const pending = page.waitForEvent("download")
  await button(name).click()
  const result = await pending
  const path = join(output, filename)
  await result.saveAs(path)
  return readFile(path, "utf8")
}
async function visibleText(text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible" })
}
async function disclosure(text) {
  const summary = page.locator("summary").filter({ hasText: text })
  if (!(await summary.evaluate((node) => node.parentElement.open))) await summary.click()
}
async function layout(name, width, text = 16) {
  await page.setViewportSize({ width, height: 1000 })
  await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}px` }, text)
  await page.evaluate(() => window.scrollTo(0, 0))
  const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(metrics.scroll <= width + 1, `${name}: document overflow ${JSON.stringify(metrics)}`)
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
  return metrics
}

async function keyTo(locator) {
  for (let count = 0; count < 300; count++) {
    if (await locator.evaluate((node) => node === document.activeElement)) return
    await page.keyboard.press("Tab")
    const hidden = await page.evaluate(() => {
      const node = document.activeElement
      const box = node.getBoundingClientRect()
      return node.tagName === "INPUT" && (box.width <= 1 || box.height <= 1)
    })
    assert.equal(hidden, false, "Invisible keyboard tab stop")
  }
  throw new Error(`Keyboard cannot reach ${await locator.getAttribute("aria-label") || await locator.textContent()}`)
}
async function keyButton(name) { await keyTo(button(name)); await page.keyboard.press("Enter") }
async function keyText(locator, value) {
  await keyTo(locator)
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type(value)
  await page.keyboard.press("Tab")
}
async function keySelect(locator, value) {
  const index = await locator.locator("option").evaluateAll((options, wanted) => options.findIndex((option) => option.value === wanted), value)
  assert.ok(index >= 0, value)
  await keyTo(locator)
  await page.keyboard.press("Home")
  for (let step = 0; step < index; step++) await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  assert.equal(await locator.inputValue(), value)
}

try {
  await start()
  await page.goto("http://127.0.0.1:8765/")
  await page.getByLabel("Band 1 stops", { exact: true }).waitFor()
  const token = await page.evaluate(() => window.LUT_BUILDER_TOKEN)
  const geometry = await page.evaluate(() => ({
    table: document.querySelector("table").getBoundingClientRect().top,
    palette: document.querySelector('[aria-label="Band colors"]').getBoundingClientRect().top,
  }))
  assert.ok(geometry.table < geometry.palette)
  assert.ok(geometry.table < 1100, JSON.stringify(geometry))
  assert.deepEqual(await page.locator("input.sr-only[type=file]").evaluateAll((inputs) => inputs.map((input) => input.tabIndex)), [-1, -1, -1])
  await page.getByRole("combobox", { name: "Cube size", exact: false }).selectOption("17")
  await button("Add band").click()
  await button("Undo last band edit").click()
  await page.getByLabel("Band 1 stops", { exact: true }).fill("0.5")
  await page.getByLabel("Band 1 total width", { exact: true }).fill("1.2")
  await page.getByLabel("Band 1 total width", { exact: true }).press("Tab")
  await button("Remove band 1").click()
  await button("Confirm remove band 1").click()
  assert.equal(await page.getByLabel("Band 1 stops", { exact: true }).count(), 0)
  await button("Undo last band edit").click()
  await button("Apply preset").click()
  assert.equal(await page.locator("tbody tr").count(), 7)
  await button("Undo last band edit").click()
  const before = JSON.parse(await download("Export JSON", "before.json"))
  await disclosure("Edit custom colors")
  const anchor = page.getByLabel("Anchor 1 hex color", { exact: true })
  await anchor.fill("bad")
  assert.equal(await button("Apply colors").isDisabled(), true)
  await anchor.fill("#123456")
  await button("Move color 1 later").focus()
  await page.keyboard.press("Enter")
  await button("Add color").click()
  await button("Remove color 10").click()
  await page.getByRole("radio", { name: "Dark to light", exact: true }).check()
  await disclosure("Save and reuse palettes")
  await page.getByLabel("Palette name", { exact: true }).fill("Restart acceptance")
  await button("Save new palette").click()
  await visibleText("Palette saved in this browser.")
  await button("Apply colors").click()
  const applied = JSON.parse(await download("Export JSON", "applied.json"))
  assert.deepEqual(applied.bands.map(({ stop, width }) => [stop, width]), before.bands.map(({ stop, width }) => [stop, width]))
  assert.notDeepEqual(applied.bands.map(({ color }) => color), before.bands.map(({ color }) => color))
  await button("Undo last band edit").click()
  const undone = JSON.parse(await download("Export JSON", "undone.json"))
  assert.deepEqual(undone.bands, before.bands)
  await stop()
  await start()
  await page.reload()
  await page.getByLabel("Band 1 stops", { exact: true }).waitFor()
  assert.equal(new URL(page.url()).origin, "http://127.0.0.1:8765")
  assert.notEqual(await page.evaluate(() => window.LUT_BUILDER_TOKEN), token)
  await disclosure("Save and reuse palettes")
  await page.getByLabel("Reuse saved palette", { exact: true }).selectOption("Restart acceptance")
  await page.getByLabel("Palette name", { exact: true }).fill("Renamed acceptance")
  await button("Rename saved palette").click()
  await button("Replace saved palette").click()
  await page.getByLabel("Import setup JSON file", { exact: true }).setInputFiles(join(output, "applied.json"))
  await visibleText("Imported applied.json.")
  const cube = await download("Generate LUT", "generated.cube")
  assert.match(cube, /LUT_3D_SIZE 17/)
  const roundtrip = JSON.parse(await download("Export JSON", "roundtrip.json"))
  assert.deepEqual(roundtrip, applied)
  await button("Delete saved palette").click()
  assert.equal(await page.getByLabel("Reuse saved palette", { exact: true }).locator("option").count(), 1)
  console.log("PASS palette draft, geometry, undo, JSON, generation and same-browser server restart", geometry)

  await button("Expand preview").click()
  await page.getByRole("dialog").waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  assert.equal(await button("Expand preview").evaluate((node) => node === document.activeElement), true)
  await page.getByLabel("Choose demonstration still image").setInputFiles(join(root, "frontend/src/assets/lut-preview-reference.jpg"))
  await page.getByRole("radio", { name: "Original", exact: true }).check()
  await page.getByRole("radio", { name: "Split view", exact: true }).check()
  await page.getByRole("radio", { name: "Band colors", exact: true }).check()
  await layout("desktop", 1265)
  await layout("narrow", 390)
  await button("Remove band 1").focus()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")
  const focused = await button("Remove band 1").evaluate((node) => {
    const bounds = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return { active: node === document.activeElement, left: bounds.left, right: bounds.right, outline: style.outlineStyle }
  })
  assert.ok(focused.active && focused.left >= 0 && focused.right <= 390, JSON.stringify(focused))
  assert.equal(focused.outline, "solid")
  await page.screenshot({ path: join(output, "narrow-keyboard-focus.png") })
  await layout("text-200", 1280, 32)
  await page.emulateMedia({ colorScheme: "dark" })
  await layout("dark", 1600)
  await page.emulateMedia({ colorScheme: "light" })
  await page.getByRole("checkbox", { name: "High recorded-signal warning", exact: true }).focus()
  await page.keyboard.press("Space")
  assert.equal(await page.getByRole("checkbox", { name: "High recorded-signal warning", exact: true }).isChecked(), true)
  await page.keyboard.press("Space")
  console.log("PASS demonstration, dialog focus, desktop/narrow/200% text/dark layout")

  const pfm = Buffer.alloc(3 * 4 * 4)
  for (let index = 0; index < 12; index++) pfm.writeFloatLE([0.2, 0.41, 0.6][index % 3], index * 4)
  await writeFile(join(output, "samples.pfm"), Buffer.concat([Buffer.from("PF\n2 2\n-1\n"), pfm]))
  await page.getByRole("radio", { name: "Camera-matched", exact: true }).check()
  await page.getByLabel("Choose camera still").setInputFiles(join(output, "samples.pfm"))
  await page.getByRole("combobox", { name: /^Source transfer function/ }).selectOption("S-Log3")
  await page.getByRole("combobox", { name: /^Source gamut/ }).selectOption("S-Gamut3.Cine")
  await page.getByRole("combobox", { name: /^RGB range convention/ }).selectOption("camera-code-values")
  await page.getByRole("checkbox", { name: "I confirm unchanged", exact: false }).check()
  await button("Verify still").click()
  await visibleText("Verified against the serialized cube.")
  await button("Inspect pixel").click()
  await visibleText("Cube output RGB:")
  await disclosure("Verification provenance")
  const provenance = JSON.parse(await page.locator("pre").innerText())
  const checked = await download("Download checked cube", "checked.cube")
  const { createHash } = await import("node:crypto")
  assert.equal(createHash("sha256").update(checked).digest("hex"), provenance.cube_sha256)
  await button("Expand verified image").click()
  await page.keyboard.press("Escape")
  assert.equal(await button("Expand verified image").evaluate((node) => node === document.activeElement), true)
  await page.getByLabel("Legal/video range", { exact: false }).check()
  await visibleText("previous result is no longer current")
  assert.equal(await button("Download checked cube").count(), 0)
  await button("Verify still").click()
  await visibleText("Verified against the serialized cube.")
  await layout("verified-still", 1265)
  await page.getByRole("combobox", { name: /^Source transfer function/ }).selectOption("V-Log")
  await visibleText("Source interpretation does not match")
  assert.equal(await button("Verify still").isDisabled(), true)
  await page.getByRole("combobox", { name: /^Source transfer function/ }).selectOption("S-Log3")
  console.log("PASS real PFM, declared interpretation, pixel inspection, checked cube identity, legal-range invalidation")

  const clip = join(output, "known.mp4")
  const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=32x24:rate=10:duration=0.7", "-vf", "select=eq(n\\,0)+eq(n\\,1)+eq(n\\,3)+eq(n\\,6),setpts=PTS+5/TB", "-fps_mode", "passthrough", "-c:v", "libx264", "-bf", "2", "-color_range", "tv", "-colorspace", "bt709", clip], { encoding: "utf8" })
  assert.equal(made.status, 0, made.stderr)
  await page.getByRole("radio", { name: "Video", exact: true }).check()
  await page.getByLabel("Choose local camera video", { exact: true }).setInputFiles(clip)
  await visibleText("Selected 0.000000 s")
  await page.getByLabel("Requested relative time in seconds").fill("0.11")
  await button("Select frame").click()
  await visibleText("Selected 0.300000 s")
  await button("Previous frame").click()
  await visibleText("Selected 0.100000 s")
  await button("Next frame").click()
  await visibleText("Selected 0.300000 s")
  for (const [label, value] of [["YCbCr matrix", "bt709"], ["Signal range", "limited"], ["Chroma location", "left"], ["Component bit depth", "8"], ["Source transfer function", "S-Log3"], ["Source gamut", "S-Gamut3.Cine"]]) {
    await page.getByRole("combobox", { name: new RegExp(`^${label}`) }).selectOption(value)
  }
  await page.getByRole("checkbox", { name: "I confirm the recording", exact: false }).check()
  await button("Verify selected frame").click()
  await visibleText("Verified against the serialized cube.")
  await disclosure("Verification provenance")
  await download("Download checked cube", "video-checked.cube")
  await button("Inspect pixel").click()
  await visibleText("Cube output RGB:")
  await layout("verified-video-narrow", 390)
  await page.getByLabel("Requested relative time in seconds").fill("9")
  await button("Select frame").click()
  await page.getByRole("alert").first().waitFor()
  await button("Release video").click()
  assert.equal(await button("Verify selected frame").count(), 0)
  console.log("PASS real VFR video exact/adjacent frames, confirmed decoding, cube verification, beyond-end error, release")

  // End-to-end keyboard pass: no click, fill, selectOption or focus calls.
  // FileChooser.setFiles supplies the fixture after Enter opens the native chooser.
  await page.setViewportSize({ width: 1265, height: 1000 })
  await page.reload()
  await page.getByLabel("Band 1 stops", { exact: true }).waitFor()
  await keySelect(page.getByRole("combobox", { name: /^Cube size/ }), "17")
  await keyButton("Add band")
  await keyButton("Undo last band edit")
  await keyText(page.getByLabel("Band 1 stops", { exact: true }), "0.5")
  await keyText(page.getByLabel("Band 1 total width", { exact: true }), "1.2")
  await keyButton("Open Band 1 color picker")
  await keyText(page.getByLabel("Band 1 color hex color", { exact: true }), "#345678")
  await page.keyboard.press("Escape")
  await keyButton("Apply preset")
  await keyButton("Undo last band edit")
  await keyTo(page.locator("summary").filter({ hasText: "Edit custom colors" }))
  await page.keyboard.press("Enter")
  await keyText(page.getByLabel("Anchor 1 hex color", { exact: true }), "#abcdef")
  await keyButton("Move color 1 later")
  await keyButton("Apply colors")
  await keyTo(page.locator("summary").filter({ hasText: "Save and reuse palettes" }))
  await page.keyboard.press("Enter")
  await keyText(page.getByLabel("Palette name", { exact: true }), "Keyboard palette")
  await keyButton("Save new palette")
  await visibleText("Palette saved in this browser.")
  await keyTo(page.getByRole("checkbox", { name: "High recorded-signal warning", exact: true }))
  await page.keyboard.press("Space")
  let pendingDownload = page.waitForEvent("download")
  await keyButton("Export JSON")
  await (await pendingDownload).saveAs(join(output, "keyboard.json"))
  let chooser = page.waitForEvent("filechooser")
  await keyButton("Import JSON")
  await (await chooser).setFiles(join(output, "keyboard.json"))
  await visibleText("Imported keyboard.json.")
  pendingDownload = page.waitForEvent("download")
  await keyButton("Generate LUT")
  await (await pendingDownload).saveAs(join(output, "keyboard.cube"))
  await keyButton("Expand preview")
  await keyTo(page.getByRole("radio", { name: "Split view", exact: true }))
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("Escape")
  assert.equal(await button("Expand preview").evaluate((node) => node === document.activeElement), true)
  await keyTo(page.getByRole("radio", { name: "Demonstration", exact: true }))
  await page.keyboard.press("ArrowRight")
  chooser = page.waitForEvent("filechooser")
  await keyTo(page.getByLabel("Choose camera still"))
  await page.keyboard.press("Enter")
  await (await chooser).setFiles(join(output, "samples.pfm"))
  await keySelect(page.getByRole("combobox", { name: /^Source transfer function/ }), "S-Log3")
  await keySelect(page.getByRole("combobox", { name: /^Source gamut/ }), "S-Gamut3.Cine")
  await keySelect(page.getByRole("combobox", { name: /^RGB range convention/ }), "camera-code-values")
  await keyTo(page.getByRole("checkbox", { name: "I confirm unchanged", exact: false }))
  await page.keyboard.press("Space")
  await keyButton("Verify still")
  await visibleText("Verified against the serialized cube.")
  await keyButton("Inspect pixel")
  await visibleText("Cube output RGB:")
  await keyButton("Expand verified image")
  await page.keyboard.press("Escape")
  assert.equal(await button("Expand verified image").evaluate((node) => node === document.activeElement), true)
  console.log("PASS keyboard-only configuration, band/color/palette editing, save, import/export/generation, preview and camera still verification")
  assert.deepEqual(errors, [])
  console.log(`PASS no page errors; screenshots and downloads: ${output}`)
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true })
  throw error
} finally {
  await stop()
  await browser.close()
}
