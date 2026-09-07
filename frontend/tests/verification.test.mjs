import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test, { after } from "node:test"
import { pathToFileURL } from "node:url"
import { build, stop } from "esbuild"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
for (const key of ["window", "document", "Element", "HTMLElement", "Node", "FileReader"]) globalThis[key] = key === "window" ? dom.window : dom.window[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator })
window.LUT_BUILDER_TOKEN = "test-token"
window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")) }
after(() => dom.window.close())

const bundle = await build({
  bundle: true, external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"], format: "esm", jsx: "automatic", platform: "node",
  stdin: { contents: `export { CameraVerification } from "./src/CameraVerification.tsx"; export { default as React, act } from "react"; export { createRoot } from "react-dom/client";`, resolveDir: process.cwd(), sourcefile: "verification-test.ts" }, write: false,
})
stop()
const directory = await mkdtemp(join(process.cwd(), "tests", ".verify-"))
const path = join(directory, "test.mjs")
await writeFile(path, bundle.outputFiles[0].text)
const { CameraVerification, React, act, createRoot } = await import(pathToFileURL(path).href)
await rm(directory, { recursive: true })

test("still workflow requires facts, rejects stale responses, cancels, and inspects the unblended result", async () => {
  const calls = []
  const oldFetch = globalThis.fetch
  globalThis.fetch = (path, options) => {
    const payload = JSON.parse(options.body)
    assert.equal(options.headers["X-LUT-Builder-Token"], "test-token")
    if (path === "/verify-cancel") { calls.push({ path, payload }); return Promise.resolve({ ok: true }) }
    return new Promise((resolve) => calls.push({ path, payload, resolve }))
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const interpretations = { Sony: { transfer: "S-Log3", gamut: "S-Gamut3.Cine" }, Other: { transfer: "V-Log", gamut: "V-Gamut" } }
  let setup = { profile: "Sony", target: "Rec.709", cube_size: 17, bands: [] }
  const render = () => act(() => root.render(React.createElement(CameraVerification, { setup, interpretations })))
  const button = (text) => [...container.querySelectorAll("button")].find((e) => e.textContent === text)
  const click = (text) => act(() => button(text).click())
  const select = async (index, value) => { const input = container.querySelectorAll("select")[index]; await act(() => { input.value = value; input.dispatchEvent(new window.Event("change", { bubbles: true })) }) }
  const upload = async (name) => {
    const input = container.querySelector("input[type=file]")
    Object.defineProperty(input, "files", { configurable: true, value: [new window.File(["source bytes"], name)] })
    await act(async () => { input.dispatchEvent(new window.Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 30)) })
  }
  const finish = async (call) => {
    await act(() => call.resolve({ ok: true, json: async () => ({ request_id: call.payload.request_id, image: "data:image/png;base64,test", width: 2, height: 1, provenance: { warnings: [], comparison_unavailable: "No source reference transform.", source: { name: "camera.png" } } }) }))
  }
  try {
    await render()
    assert.equal(button("Verify still").disabled, true)
    await upload("graded.jpg")
    assert.match(container.textContent, /JPEG, RAW and video are unsupported/)
    await upload("camera.png")
    await select(0, "S-Log3")
    await select(1, "V-Gamut")
    await select(2, "camera-code-values")
    await act(() => container.querySelector("input[type=checkbox]").click())
    assert.match(container.textContent, /does not match/)
    assert.equal(button("Verify still").disabled, true)
    await select(1, "S-Gamut3.Cine")
    assert.equal(container.querySelector("input[type=checkbox]").checked, false)
    await act(() => container.querySelector("input[type=checkbox]").click())
    await click("Verify still")
    const first = calls.at(-1)
    assert.equal(first.payload.source.name, "camera.png")
    assert.deepEqual(first.payload.setup, setup)
    setup = { ...setup, legal_range: true }
    await render()
    await finish(first)
    assert.equal(container.querySelector("img"), null)
    assert.match(container.textContent, /previous result is no longer current/)
    await click("Verify still")
    await finish(calls.at(-1))
    assert.ok(container.querySelector("img"))
    assert.match(container.textContent, /Unblended LUT result · 100% strength/)
    assert.equal(button("Original").disabled, true)
    assert.equal(container.querySelector("input[type=range]"), null)
    await click("Inspect pixel")
    const sample = calls.at(-1)
    await act(() => sample.resolve({ ok: true, json: async () => ({ x: 0, y: 0, source_rgb: [-0.125, 0.375001, 1.125], output_rgb: [0.5, 0.25, 0.125], display_rgb: [0.4, 0.2, 0.1] }) }))
    assert.match(container.querySelector("output").textContent, /-0.1250000000/)
    const expand = button("Expand verified image")
    await click("Expand verified image")
    assert.equal(container.querySelector("dialog").open, true)
    await click("Close verified image")
    assert.equal(document.activeElement, expand)
    await select(0, "V-Log")
    assert.equal(container.querySelector("img"), null)
    assert.ok(calls.some((call) => call.path === "/verify-cancel" && call.payload.request_id === sample.payload.request_id))
    await select(0, "S-Log3")
    await act(() => container.querySelector("input[type=checkbox]").click())
    await click("Verify still")
    const cancelled = calls.at(-1)
    await click("Cancel verification")
    await finish(cancelled)
    assert.equal(container.querySelector("img"), null)
    assert.match(container.textContent, /Verification cancelled/)
    await click("Verify still")
    const failed = calls.at(-1)
    await act(() => failed.resolve({ ok: false, json: async () => ({ error: "PNG decoding needs FFmpeg" }) }))
    assert.match(container.textContent, /PNG decoding needs FFmpeg/)
    assert.equal(container.querySelector("img, canvas"), null)
    await click("Verify still")
    const oldSource = calls.at(-1)
    await upload("replacement.pfm")
    await finish(oldSource)
    assert.equal(container.querySelector("img"), null)
    setup = { ...setup, target: "HDR" }
    await render()
    assert.match(container.textContent, /Unsupported SDR view/)
    assert.equal(button("Verify still").disabled, true)
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.fetch = oldFetch
  }
})
