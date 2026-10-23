// Optional Windows desktop measurement; summed working sets are not unique RAM.
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { pathToFileURL } from "node:url"

assert.equal(process.platform, "win32", "This measurement uses Windows process working sets")
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const run = promisify(execFile)
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
try {
  const session = await browser.newBrowserCDPSession()
  const page = await browser.newPage({ acceptDownloads: true })
  await page.goto(process.env.LUT_BUILDER_URL || "https://today20092.github.io/lut_builder/")
  await page.getByRole("group", { name: "Cube size", exact: true }).getByRole("button", { name: "65³", exact: true }).click()
  const sample = async () => {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo")
    const ids = processInfo.map(({ id }) => Number(id))
    assert.ok(ids.length && ids.every(Number.isSafeInteger))
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", `Get-Process -Id ${ids.join(",")} -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum | Select-Object -ExpandProperty Sum`], { windowsHide: true })
    const bytes = Number(stdout.trim())
    assert.ok(Number.isFinite(bytes) && bytes > 0)
    return bytes
  }
  const baselineBytes = await sample()
  const samples = [baselineBytes]
  let done = false
  const pending = page.waitForEvent("download").then(async (download) => {
    assert.equal(await download.failure(), null)
    done = true
  })
  await page.getByRole("button", { name: "Download LUT", exact: true }).click()
  while (!done) samples.push(await sample())
  await pending
  console.log(JSON.stringify({ browser: browser.version(), cubeSize: 65, baselineBytes, maximumSampledWorkingSetBytes: Math.max(...samples), samples: samples.length, includes: "CDP-reported browser processes, including renderer/worker memory", limitation: "Sampled summed working sets can double-count shared memory and miss brief peaks; not a phone memory requirement." }))
} finally {
  await browser.close()
}
