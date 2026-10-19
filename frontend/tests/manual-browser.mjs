// Run against the combined production build, using the existing browser-check tools.
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { JSDOM } from "jsdom"

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const builder = process.env.LUT_BUILDER_URL || "http://127.0.0.1:4173/lut_builder/"
const manual = new URL("docs/", builder).href
const browser = await playwright[process.env.BROWSER || "chromium"].launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const pages = ["", "first-lut/", "controls/", "save-and-apply/", "verification/", "troubleshooting/", "keyboard/", "signal-limits/", "profiles/"]
const documents = new Map()
try {
  // Check real URLs and fragments, not just the presence of link text in Markdown.
  for (const path of pages) {
    const url = manual + path
    const response = await fetch(url)
    assert.equal(response.status, 200, url)
    const document = new JSDOM(await response.text(), { url }).window.document
    assert.ok(document.querySelector("h1"), url)
    documents.set(url, document)
  }
  const assets = new Set()
  for (const [url, document] of documents) {
    for (const anchor of document.querySelectorAll("a[href]")) {
      const target = new URL(anchor.getAttribute("href"), url)
      if (!target.href.startsWith(manual)) continue
      const fragment = decodeURIComponent(target.hash.slice(1))
      target.hash = ""
      assert.ok(documents.has(target.href), `Unknown manual page: ${target.href}`)
      if (fragment) assert.ok(documents.get(target.href).getElementById(fragment), `Missing anchor: ${target.href}#${fragment}`)
    }
    for (const element of document.querySelectorAll("img[src], script[src], link[rel=stylesheet]")) {
      assets.add(new URL(element.getAttribute("src") || element.getAttribute("href"), url).href)
    }
  }
  for (const asset of assets) {
    const response = await fetch(asset)
    assert.equal(response.status, 200, asset)
    await response.arrayBuffer()
  }

  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(builder)
    const help = page.getByRole("link", { name: /Help \/ Manual/ })
    await help.waitFor()
    if (process.env.MANUAL_EVIDENCE && width === 1280) {
      await mkdir(process.env.MANUAL_EVIDENCE, { recursive: true })
      await page.screenshot({ path: `${process.env.MANUAL_EVIDENCE}/builder-1280.png` })
    }
    assert.equal(await help.getAttribute("href"), new URL(manual).pathname)
    await help.focus()
    const popupPromise = page.waitForEvent("popup")
    await page.keyboard.press("Enter")
    const docs = await popupPromise
    await docs.waitForLoadState()
    assert.equal(docs.url(), manual)
    await docs.getByRole("heading", { name: "Understand your exposure colors", exact: true }).waitFor()
    if (width === 390) {
      const menu = docs.getByRole("button", { name: "Menu", exact: true })
      await menu.focus()
      await docs.keyboard.press("Enter")
      await docs.getByRole("link", { name: /Return to LUT Builder/ }).waitFor({ state: "visible" })
      await menu.press("Enter")
    }
    await docs.getByRole("button", { name: /Search/ }).click()
    const input = docs.getByRole("textbox", { name: "Search", exact: true })
    await input.fill("purple")
    const result = docs.locator(".pagefind-ui__result-link").first()
    await result.waitFor({ state: "visible" })
    assert.ok((await result.getAttribute("href")).includes("/docs/"))
    await result.click()
    await docs.waitForLoadState()
    for (const path of pages) {
      await docs.goto(manual + path)
      assert.equal(await docs.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Overflow at ${width}: ${path}`)
    }
    await docs.goto(manual + "first-lut/")
    await docs.locator("main img").scrollIntoViewIfNeeded()
    await docs.waitForFunction(() => [...document.querySelectorAll("main img")].every(img => img.complete && img.naturalWidth > 0))
    assert.equal(await docs.locator("main img").evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true)
    await docs.emulateMedia({ colorScheme: "dark" })
    if (process.env.MANUAL_EVIDENCE) {
      await mkdir(process.env.MANUAL_EVIDENCE, { recursive: true })
      await docs.screenshot({ path: `${process.env.MANUAL_EVIDENCE}/manual-${width}.png`, fullPage: true })
    }
    await docs.goto(manual + "signal-limits/#how-are-these-limits-calculated")
    await docs.locator("#how-are-these-limits-calculated").waitFor()
    if (width === 390) await docs.getByRole("button", { name: "Menu", exact: true }).click()
    await docs.getByRole("link", { name: /Return to LUT Builder/ }).click()
    await docs.getByRole("heading", { name: "LUT Builder", exact: true }).waitFor()
    const links = await page.locator('a[href*="docs/"]').evaluateAll(elements => elements.map(a => a.href))
    for (const link of links) {
      if (!link.startsWith(manual)) continue
      const url = new URL(link)
      const fragment = decodeURIComponent(url.hash.slice(1)); url.hash = ""
      assert.ok(documents.has(url.href), link)
      if (fragment) assert.ok(documents.get(url.href).getElementById(fragment), link)
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log("Manual acceptance passed: 9 pages, internal links/anchors/assets, search, keyboard entry, mobile navigation, return links, and contextual help.")
} finally {
  await browser.close()
}
