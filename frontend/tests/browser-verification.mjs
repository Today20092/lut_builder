// Optional real-browser check; all media stays on this machine.
import assert from "node:assert/strict"
import { readFile, mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
import { tmpdir } from "node:os"

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const browser = await playwright[process.env.BROWSER || "chromium"].launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(300_000)
const url = process.env.LUT_BUILDER_URL || "http://127.0.0.1:4178/lut_builder/"
const errors = [], requests = []
page.on("pageerror", (error) => errors.push(error.message))
await context.route("**/*", async (route) => {
  const request = route.request()
  if (request.method() !== "GET" || new URL(request.url()).origin !== new URL(url).origin) { requests.push(request.url()); await route.abort() }
  else await route.continue()
})
try {
  await page.goto(url)
  await page.getByRole("combobox", { name: /^Camera/ }).selectOption("Panasonic V-Log")
  console.log("editor ready")
  const card = page.getByLabel("Browser camera verification", { exact: true })
  const button = (name) => card.getByRole("button", { name, exact: true })
  async function done(label) {
    const timer = setInterval(async () => console.log(label, await card.getByRole("status").first().textContent()), 15000)
    try {
    await page.waitForFunction(() => !document.querySelector('[aria-label="Browser camera verification"]')?.textContent.includes("Cancel verification"), null, { timeout: 300_000 })
    } finally { clearInterval(timer) }
    const status = await card.getByRole("status").first().textContent()
    console.log(label, status)
    assert.ok(!status.includes("failed"), status)
  }
  if (process.env.VERIFICATION_VIDEO) {
    await card.getByRole("radio", { name: "Video", exact: true }).check()
    await card.getByLabel("Choose camera video", { exact: true }).setInputFiles(process.env.VERIFICATION_VIDEO)
    console.log("video chosen", await button("Inspect video").isEnabled(), await card.getByRole("status").first().textContent())
    await button("Inspect video").click()
    await done("probe")
    await card.getByLabel("Frame in inspected interval (from 0)").fill(process.env.VERIFICATION_FRAME || "0")
    await card.getByRole("group", { name: "YCbCr matrix", exact: true }).getByRole("button", { name: "bt709", exact: true }).click()
    await card.getByRole("group", { name: "Signal range", exact: true }).getByRole("button", { name: "full", exact: true }).click()
    await card.getByRole("group", { name: "Chroma location", exact: true }).getByRole("button", { name: "left", exact: true }).click()
    await card.getByRole("group", { name: "Component bit depth", exact: true }).getByRole("button", { name: "10", exact: true }).click()
  } else {
    const header = Buffer.from("PF\n2 1\n-1\n")
    const samples = Buffer.alloc(24)
    ;[-0.1, 0.42, 1.1, 0.5, 0.5, 0.5].forEach((value, i) => samples.writeFloatLE(value, i * 4))
    await card.getByLabel("Choose camera still", { exact: true }).setInputFiles({ name: "camera.pfm", mimeType: "application/octet-stream", buffer: Buffer.concat([header, samples]) })
    await card.getByRole("checkbox", { name: /^Normalized camera RGB/ }).check()
  }
  await card.getByRole("combobox", { name: /^Source transfer function/ }).selectOption("V-Log")
  await card.getByRole("combobox", { name: /^Source gamut/ }).selectOption("V-Gamut")
  await card.getByRole("checkbox", { name: /^I confirm/ }).check()
  console.log("source confirmed")
  await button(process.env.VERIFICATION_VIDEO ? "Verify selected frame" : "Verify still").click()
  await done("verify")
  await card.getByAltText("Verified LUT result in the declared SDR view").waitFor()
  await button("Inspect pixel").click()
  console.log("pixel", await card.locator("output").textContent())
  const download = page.waitForEvent("download")
  await button("Download checked cube").click()
  const cube = await readFile(await (await download).path(), "utf8")
  assert.match(cube, /LUT_3D_SIZE/)
  assert.equal(requests.length, 0, requests.join("\n"))
  assert.deepEqual(errors, [])
  const output = join(tmpdir(), "lut-browser-verification")
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: join(output, "mobile.png"), fullPage: true })
  await card.getByRole("combobox", { name: /^Source transfer function/ }).selectOption("S-Log3")
  assert.equal(await card.getByAltText("Verified LUT result in the declared SDR view").count(), 0)
  console.log("PASS; screenshots", output)
} finally { await browser.close() }
