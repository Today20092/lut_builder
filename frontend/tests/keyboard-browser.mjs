// Optional real-browser checks. Use the same Playwright prerequisites as workbench-browser.mjs.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const server = spawn("uv", ["run", "python", "-u", "-c", "import webbrowser; webbrowser.open = lambda url: False; from lut_builder.web import launch_workspace; launch_workspace()"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] })
let log = ""
server.stdout.on("data", (data) => { log += data })
server.stderr.on("data", (data) => { log += data })
const errors = []
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
page.on("pageerror", (error) => errors.push(error.message))
page.setDefaultTimeout(10000)
const button = (name) => page.getByRole("button", { name, exact: true })
const graph = page.getByRole("group", { name: /^Editable exposure graph/ })
const centers = graph.locator("[data-band-center]")
async function tabTo(locator) {
  for (let i = 0; i < 180; i++) {
    if (await locator.evaluate((node) => node === document.activeElement)) return
    await page.keyboard.press("Tab")
  }
  throw new Error(`Control not reachable by Tab: ${locator}`)
}
try {
  for (let i = 0; !log.includes("running locally"); i++) {
    if (server.exitCode !== null || i > 200) throw new Error(log || "Server startup timed out")
    await new Promise((done) => setTimeout(done, 100))
  }
  await page.goto("http://127.0.0.1:8765/")
  await centers.first().waitFor()
  const count = await centers.count()
  assert.ok(count >= 1)
  await tabTo(centers.first())
  const index = await centers.first().getAttribute("data-band-center")
  await page.keyboard.press("Delete")
  assert.equal(await centers.count(), count - 1)
  assert.ok(await graph.evaluate((node) => node.contains(document.activeElement)))
  await page.keyboard.press("Control+z")
  assert.equal(await centers.count(), count)
  await tabTo(centers.first())
  await page.keyboard.press("?")
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" })
  await help.waitFor()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab")
    assert.ok(await help.evaluate((node) => node.contains(document.activeElement) || document.activeElement === document.body))
    await page.keyboard.press("Control+z")
    assert.equal(await centers.count(), count)
  }
  await page.keyboard.press("Escape")
  assert.equal(await help.isVisible(), false)
  assert.equal(await page.locator(":focus").getAttribute("data-band-center"), index)
  if (count > 1) {
    await page.keyboard.press("Alt+ArrowRight")
    assert.equal(await page.locator(":focus").getAttribute("data-band-center"), "1")
  }
  await tabTo(page.getByRole("textbox", { name: "Band 1 stops", exact: true }))
  await page.keyboard.press("Control+a")
  await page.keyboard.type("-")
  await page.keyboard.press("Delete")
  await page.keyboard.press("?")
  assert.equal(await centers.count(), count)
  assert.equal(await help.isVisible(), false)
  await page.keyboard.press("Escape")
  await tabTo(button("Expand exposure preview"))
  await page.keyboard.press("f")
  const exposure = page.getByRole("dialog", { name: "Exposure band preview" })
  await exposure.waitFor()
  await page.keyboard.press("Escape")
  assert.equal(await exposure.isVisible(), false)
  assert.equal(await button("Expand exposure preview").evaluate((node) => node === document.activeElement), true)
  await tabTo(button("Start with Reference emphasis"))
  await page.keyboard.press("Enter")
  await button("Cancel preview").waitFor()
  await page.keyboard.press("Escape")
  assert.equal(await button("Cancel preview").count(), 0)
  await tabTo(button("Open Band 1 color picker"))
  await page.keyboard.press("Enter")
  await page.getByRole("slider", { name: "Band 1 color hue", exact: true }).waitFor()
  await page.keyboard.press("Escape")
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open Band 1 color picker")
  assert.equal(await button("Open Band 1 color picker").evaluate((node) => node === document.activeElement), true)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const html = await readFile(resolve(root, "src/lut_builder/static/index.html"), "utf8")
  await page.route("http://127.0.0.1:8765/", (route) => route.fulfill({ body: html, contentType: "text/html" }))
  await page.goto("http://127.0.0.1:8765/")
  await page.getByLabel("Browser camera verification").waitFor()
  assert.equal(await centers.count(), 1)
  await tabTo(centers.first())
  await page.keyboard.press("Backspace")
  assert.equal(await centers.count(), 0)
  assert.ok(await graph.evaluate((node) => node === document.activeElement))
  await page.keyboard.press("?")
  await help.waitFor()
  await page.keyboard.press("Control+z")
  assert.equal(await centers.count(), 0)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Control+z")
  assert.equal(await centers.count(), 1)
  await tabTo(page.locator('input[name="band-mode"][value="stops"]'))
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  assert.equal(await page.locator('input[name="band-mode"][value="fill"]').isChecked(), true)
  await tabTo(centers.first())
  while (await centers.count() > 2) await page.keyboard.press("Delete")
  await page.keyboard.press("Delete")
  assert.equal(await centers.count(), 2, "Fill retains its two-color minimum")
  await page.keyboard.press("Control+z")
  assert.equal(await centers.count(), 3, "blocked deletion preserves undo")
  assert.deepEqual(errors, [])
  console.log("PASS: real Chromium Tab navigation, graph delete/undo, modal isolation, Escape/focus restoration, palette cancellation, picker and narrow layout")
} finally {
  await browser.close()
  if (server.exitCode === null) {
    const stopped = once(server, "exit")
    server.stdin.end("\n")
    await stopped
  }
}
