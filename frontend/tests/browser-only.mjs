// Run against a Pages build served at LUT_BUILDER_URL (local or deployed).
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { enterWorkspace, navigateWorkspace } from './workspace-navigation.mjs'

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const engine = process.env.BROWSER || "chromium"
const url = process.env.LUT_BUILDER_URL || "http://127.0.0.1:4173/lut_builder/"
const browser = await playwright[engine].launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    const touch = viewport.width !== 1280 && engine !== "firefox"
    const context = await browser.newContext({ viewport, hasTouch: touch, acceptDownloads: true })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    const unexpectedRequests = []
    page.on("pageerror", (error) => errors.push(error.message))
    await context.route("**/*", async (route) => {
      const request = route.request()
      if (request.method() !== "GET" || new URL(request.url()).origin !== new URL(url).origin) {
        unexpectedRequests.push(request.url())
        await route.abort()
      } else await route.continue()
    })
    const activate = (locator) => touch ? locator.tap() : locator.click()
    const button = (name) => page.getByRole("button", { name, exact: true })
    const panel = name => navigateWorkspace(page, name, activate)
    const download = async (name) => {
      const pending = page.waitForEvent("download")
      await activate(button(name))
      const result = await pending
      assert.equal(await result.failure(), null)
      return { name: result.suggestedFilename(), text: await readFile(await result.path(), "utf8") }
    }
    const started = performance.now()
    await page.goto(url)
    await enterWorkspace(page)
    await page.getByLabel("Band 1 stops", { exact: true }).waitFor()
    const startupMs = performance.now() - started
    await panel("Configure")
    await page.getByRole("combobox", { name: /^Camera/ }).selectOption("Panasonic V-Log")
    await page.locator("summary").filter({ hasText: "Customize output filename" }).click()
    await page.getByLabel("Output filename template", { exact: true }).fill("Browser acceptance.cube")
    await panel("Bands")
    await page.getByLabel("Band 1 stops", { exact: true }).fill("1.25")
    await page.getByLabel("Band 1 stops", { exact: true }).press("Enter")
    await page.getByLabel("Band 1 total width", { exact: true }).fill("0.8")
    await page.getByLabel("Band 1 total width", { exact: true }).press("Enter")
    const graph = page.getByLabel("Editable exposure graph from -7 to 7 stops", { exact: true })
    await graph.waitFor()
    const stopField = page.getByLabel("Band 1 stops", { exact: true })
    await page.locator("summary").filter({ hasText: "Band setup & graph settings" }).click()
    const increment = page.getByRole("combobox", { name: /^Movement increment/ })
    for (const [step, expected] of [[1, 2.25], [0.5, 1.75], [0.25, 1.5]]) {
      await increment.selectOption(String(step))
      const marker = graph.getByRole("button", { name: /^Band 1,/ })
      await marker.focus()
      await page.keyboard.press("ArrowRight")
      assert.equal(Number(await stopField.inputValue()), expected)
      await stopField.fill("1.25")
      await stopField.press("Enter")
    }
    const marker = graph.getByRole("button", { name: /^Band 1,/ })
    assert.equal(await marker.evaluate((element) => {
      const normal = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true })
      const zoom = new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true })
      return element.dispatchEvent(normal) && element.dispatchEvent(zoom)
    }), true, "wheel and Ctrl-wheel retain their browser defaults")
    assert.equal(await stopField.inputValue(), "1.25")
    if (!touch) {
      await marker.scrollIntoViewIfNeeded()
      const start = await marker.boundingBox()
      const bounds = await graph.boundingBox()
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width * 9 / 14, start.y + start.height / 2, { steps: 5 })
      await page.mouse.up()
      assert.equal(await stopField.inputValue(), "2")
    }
    await stopField.fill("10")
    await stopField.press("Enter")
    await graph.getByRole("button", { name: "1 bands above the visible range" }).waitFor()
    await stopField.fill("1.25")
    await stopField.press("Enter")
    await panel("Setups")
    await page.getByLabel("Preset name", { exact: true }).fill("Acceptance")
    await activate(button("Save current setup"))
    await page.getByRole("status").filter({ hasText: "Named LUT setup saved" }).waitFor()
    await page.reload()
    await panel("Setups")
    await page.locator("summary").filter({ hasText: "Load setup · optional" }).click()
    await page.getByRole("combobox", { name: /^Saved setup/ }).selectOption("Acceptance")
    await activate(button("Load setup"))
    await page.waitForFunction(() => document.querySelector('[aria-label="Band 1 stops"]')?.value === "1.25")
    const exported = await download("Export setup file")
    const setup = JSON.parse(exported.text)
    assert.equal(setup.profile, "Panasonic V-Log")
    assert.equal(setup.bands[0].stop, 1.25)
    assert.equal(setup.bands[0].width, 0.4)
    await page.getByLabel("Import setup JSON file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") })
    await page.getByLabel("Setup loading feedback", { exact: true }).getByRole("status").filter({ hasText: /JSON|Unexpected|parse/i }).waitFor()
    assert.equal(await page.getByLabel("Band 1 stops", { exact: true }).inputValue(), "1.25")
    await page.getByLabel("Import setup JSON file").setInputFiles({ name: "saved.json", mimeType: "application/json", buffer: Buffer.from(exported.text) })
    await page.getByLabel("Setup loading feedback", { exact: true }).getByRole("status").filter({ hasText: "Imported saved.json" }).waitFor()
    // Actual keyboard activation after traversing from the first control.
    await panel("Configure")
    await page.getByRole("combobox", { name: /^Camera/ }).focus()
    await page.keyboard.press("Tab")
    assert.equal(await page.getByRole("combobox", { name: /^Target display/ }).evaluate((element) => element === document.activeElement), true)
    const timings = {}
    const heapSamples = []
    for (const size of [17, 33, 65]) {
      await panel("Configure")
      await page.getByRole("combobox", { name: /^Cube size/ }).selectOption(String(size))
      await panel("Export")
      const start = performance.now()
      const cube = await download("Download LUT")
      timings[size] = Math.round(performance.now() - start)
      heapSamples.push(await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null))
      assert.equal(cube.name, "Browser_acceptance.cube")
      assert.match(cube.text, new RegExp(`LUT_3D_SIZE ${size}`))
      const rows = cube.text.split("\n").filter((line) => /^[-+\d.]/.test(line))
      assert.equal(rows.length, size ** 3)
      assert.ok(rows.every((line) => line.trim().split(/\s+/).length === 3))
    }
    await activate(button("Download LUT"))
    await activate(button("Cancel generation"))
    await page.getByLabel("LUT output", { exact: true }).getByRole("status").filter({ hasText: "Generation cancelled" }).waitFor()
    assert.equal(await page.getByLabel("Band 1 stops", { exact: true }).inputValue(), "1.25")
    await panel("Bands")
    await page.getByRole("radio", { name: /^IRE/ }).check()
    await page.getByLabel("Editable exposure graph from 0 to 100 IRE", { exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal page overflow")
    assert.deepEqual(unexpectedRequests, [], "no uploads or remote calculation calls")
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ engine, version: browser.version(), viewport, touchEmulation: touch, startupMs: Math.round(startupMs), generationMs: timings, mainThreadHeapBytesAfterDownloads: heapSamples }))
    await context.close()
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error("Browser acceptance failure state", await page.evaluate(() => ({
      selectedTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      openDisclosures: Array.from(document.querySelectorAll('details[open] > summary')).map(node => node.textContent),
    })))
    if (process.env.BROWSER_EVIDENCE) await page.screenshot({ path: process.env.BROWSER_EVIDENCE, fullPage: true })
  }
  throw error
} finally {
  await browser.close()
}
