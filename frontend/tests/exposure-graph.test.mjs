import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test, { after } from "node:test"
import { pathToFileURL } from "node:url"

import { build, stop } from "esbuild"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
})
globalThis.window = dom.window
globalThis.document = dom.window.document
window.LUT_BUILDER_TOKEN = "test-token"
globalThis.Element = dom.window.Element
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = clearTimeout
globalThis.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator })
after(() => dom.window.close())

const capturedPointers = new WeakMap()
dom.window.HTMLElement.prototype.setPointerCapture = function (pointerId) {
  capturedPointers.set(this, pointerId)
}
dom.window.HTMLElement.prototype.hasPointerCapture = function (pointerId) {
  return capturedPointers.get(this) === pointerId
}
dom.window.HTMLElement.prototype.releasePointerCapture = function () {
  capturedPointers.delete(this)
}

const bundle = await build({
  bundle: true,
  define: { "import.meta.env.BASE_URL": '"/"' },
  external: ["@base-ui/react/*", "lucide-react", "react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  format: "esm",
  jsx: "automatic",
  loader: { ".jpg": "dataurl", ".png": "dataurl" },
  platform: "node",
  stdin: {
    contents: `
      export { App, ColorPicker, ExposureGraph, LutImagePreview } from "./src/App.tsx";
      export { BrowserVerification } from "./src/BrowserVerification.tsx";
      export { tailwindPalette } from "./src/tailwindPalette.ts";
      export { outputFilename, defaultFilenameTemplate } from "./src/outputFilename.ts";
      export { displayPreviewOverlayAt, overlayForExposure, previewColorAt, previewOverlayAt } from "./src/demonstration.ts";
      export { default as React, act } from "react";
      export { createRoot } from "react-dom/client";
    `,
    resolveDir: process.cwd(),
    sourcefile: "exposure-graph-test.ts",
  },
  write: false,
})
stop()
const bundleDirectory = await mkdtemp(join(process.cwd(), "tests", ".graph-"))
const bundlePath = join(bundleDirectory, "graph.mjs")
await writeFile(bundlePath, bundle.outputFiles[0].text)
const { App, BrowserVerification, ColorPicker, ExposureGraph, LutImagePreview, tailwindPalette, outputFilename, defaultFilenameTemplate, displayPreviewOverlayAt, overlayForExposure, previewColorAt, previewOverlayAt, React, act, createRoot } = await import(pathToFileURL(bundlePath).href)
await rm(bundleDirectory, { recursive: true })

const preview = {
  minimum: -7,
  maximum: 7,
  unit: "stops",
  colors: ["#111111", "#222222"],
}
const setup = {
  bands: [{ stop: 0, width: 0.3, color: "#ffffff" }],
  band_mode: "stops",
  fill_mode: false,
}

test("demonstration compares pixels, preserves setup, replaces images, and keeps dialog choices", async () => {
  const images = []
  let rendered
  const original = new Uint8ClampedArray(960 * 4).fill(255)
  for (let i = 0; i < original.length; i += 4) original.set([128, 128, 128, 255], i)
  globalThis.Image = class {
    naturalWidth = 960
    naturalHeight = 540
    set src(value) { this.url = value; images.push(this) }
  }
  globalThis.FileReader = class {
    readAsDataURL(file) { this.result = `data:image/png,${file.name}`; this.onload() }
  }
  const prototype = window.HTMLCanvasElement.prototype
  const getContext = prototype.getContext
  prototype.getContext = () => ({
    clearRect() {}, drawImage() { rendered = original.slice() },
    getImageData() { return { data: original.slice() } },
    putImageData(pixels) { rendered = pixels.data },
  })
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")) }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const configured = { ...setup, bands: [{ stop: 0, width: 10, color: "#ff0000" }] }
  const before = structuredClone(configured)
  const draw = async () => { await act(() => images.at(-1).onload?.()) }
  const click = async (text) => {
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text)
    await act(() => button.click())
    return button
  }
  try {
    await act(() => root.render(React.createElement(LutImagePreview, { preview: { ...preview, overlays: ["#ff0000"], setup: configured } })))
    await draw()
    assert.match(container.textContent, /graded image cannot verify original camera exposure/)
    assert.deepEqual([...rendered.slice(0, 4)], [128, 128, 128, 255])
    assert.deepEqual([...rendered.slice(480 * 4, 481 * 4)], [255, 0, 0, 255])
    const choice = (value) => container.querySelector(`input[value='${value}']`)
    await act(() => choice("Original").click())
    await draw()
    assert.deepEqual(rendered, original)
    await act(() => choice("Band colors").click())
    await draw()
    assert.deepEqual([...rendered.slice(0, 4)], [255, 0, 0, 255])
    const slider = container.querySelector("input[type=range]")
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(slider, "0")
      slider.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
    await draw()
    assert.deepEqual(rendered, original)
    assert.deepEqual(configured, before)
    const trigger = await click("Expand preview")
    assert.equal(container.querySelector("dialog").open, true)
    assert.equal(container.querySelector("dialog input[value='Band colors']").checked, true)
    await click("Close preview")
    assert.equal(document.activeElement, trigger)
    assert.equal(choice("Band colors").checked, true)
    const upload = async (file) => {
      const input = container.querySelector("input[type=file]")
      Object.defineProperty(input, "files", { configurable: true, value: [file] })
      await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    }
    await upload(new window.File(["bad"], "broken.png", { type: "image/png" }))
    await act(() => images.at(-1).onerror())
    assert.match(container.querySelector("[role=alert]").textContent, /previous image is unchanged/)
    await upload(new window.File(["image"], "portrait.png", { type: "image/png" }))
    await draw()
    assert.match(container.querySelector("[role=status]").textContent, /portrait.png/)
    await click("Reference photo")
    assert.match(container.querySelector("[role=status]").textContent, /Reference photo/)
  } finally {
    await act(() => root.unmount())
    container.remove()
    prototype.getContext = getContext
    delete globalThis.Image
    delete globalThis.FileReader
  }
})

test("video controls show server-selected identity and reject stale frames after release", async () => {
  const previousFetch = globalThis.fetch
  const previousFile = globalThis.File
  const getContext = window.HTMLCanvasElement.prototype.getContext
  const images = []
  const requests = []
  let finishFrame
  globalThis.File = window.File
  globalThis.Image = class { set src(value) { images.push(value) } }
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, drawImage() {} })
  const result = {
    source_id: "source-1", display: "data:image/png;base64,first",
    frame: { index: 0, pts: "5000", time_base: "1/1000", first_pts: "5000", relative_time: "0", seconds: 0, count: 4 },
    facts: { stream: { codec_name: "h264" }, frame: {} },
    source: { precision_bits: 10, pixel_format: "yuv420p10le" },
    provenance: { matrix: "bt709", range: "limited", chroma_location: "left", view: "Illustration only." },
  }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url === "/video/start") return { ok: true, json: async () => ({ source_id: "source-1" }) }
    if (url.startsWith("/video/upload")) return { ok: true, json: async () => result }
    if (url === "/video/frame") return new Promise((resolve) => { finishFrame = (value) => resolve({ ok: true, json: async () => value }) })
    return { ok: true, json: async () => ({ cancelled: true }) }
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const click = async (text) => act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === text).click())
  try {
    await act(() => root.render(React.createElement(LutImagePreview, { preview: null })))
    const input = container.querySelector("input[aria-label='Choose local demonstration video']")
    Object.defineProperty(input, "files", { value: [new window.File(["video"], "known.mp4")] })
    await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    assert.match(container.textContent, /Selected 0.000000 s/)
    assert.match(container.textContent, /PTS 5000, time base 1\/1000/)
    assert.match(container.textContent, /color transferStream: "unknown"/)
    assert.match(container.textContent, /No exported LUT has been applied/)
    assert.equal(images.at(-1), result.display)
    assert.equal(requests[1].options.headers["Content-Type"], "application/octet-stream")
    await click("Next frame")
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), { source_id: "source-1", index: 1 })
    assert.match(container.textContent, /Decoding the selected presentation frame/)
    const videoKeys = async (key, options = {}) => act(() => container.querySelector("aside").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options })))
    const busyCount = requests.length
    await videoKeys("ArrowRight")
    assert.equal(requests.length, busyCount, "decoding blocks repeated requests")
    await act(() => finishFrame({ ...result, display: "data:image/png;base64,next", frame: { ...result.frame, index: 1, pts: "5100", relative_time: "1/10", seconds: 0.1 } }))
    assert.match(container.textContent, /Selected 0.100000 s · exact 1\/10 s/)
    assert.equal(images.at(-1), "data:image/png;base64,next")
    await videoKeys("ArrowRight", { shiftKey: true })
    assert.equal(JSON.parse(requests.at(-1).options.body).index, 3, "ten-frame jumps clamp to the last frame")
    await act(() => finishFrame({ ...result, frame: { ...result.frame, index: 3 } }))
    await videoKeys("ArrowLeft", { shiftKey: true })
    assert.equal(JSON.parse(requests.at(-1).options.body).index, 0)
    await act(() => finishFrame(result))
    await click("Next frame")
    await click("Cancel video")
    assert.match(container.textContent, /Video cancelled and temporary data released/)
    await act(() => finishFrame({ ...result, display: "data:image/png;base64,stale" }))
    assert.notEqual(images.at(-1), "data:image/png;base64,stale")
    assert.doesNotMatch(container.textContent, /Selected 0.000000 s/)
    assert.equal(requests.at(-1).url, "/video/cancel")
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.fetch = previousFetch
    globalThis.File = previousFile
    window.HTMLCanvasElement.prototype.getContext = getContext
    delete globalThis.Image
  }
})

test("camera video selection confirms decoding, verifies, invalidates and rejects cancelled or stale replies", async () => {
  const oldFetch = globalThis.fetch, oldFile = globalThis.File
  globalThis.File = window.File
  const calls = []
  const selected = {
    source_id: "camera-source", display: "data:image/png;base64,NEVER-VERIFY-THIS",
    frame: { source_id: "camera-source", index: 0, pts: "5000", time_base: "1/1000", first_pts: "5000", relative_time: "0", seconds: 0, count: 4 },
    facts: { stream: { color_space: "bt709", color_range: "tv", chroma_location: "left" }, frame: { color_space: "bt2020nc" } },
    source: { precision_bits: 10, pixel_format: "yuv420p10le" },
    provenance: { matrix: "bt2020nc", range: "limited", chroma_location: "left", view: "Illustration only." },
  }
  globalThis.fetch = async (path, options) => {
    const payload = options.body instanceof window.File ? null : JSON.parse(options.body)
    if (path === "/video/start") return { ok: true, json: async () => ({ source_id: selected.source_id }) }
    if (path.startsWith("/video/upload")) return { ok: true, json: async () => selected }
    if (path === "/verify-video" || path === "/video/frame") return new Promise((resolve) => calls.push({ path, payload, resolve }))
    calls.push({ path, payload })
    return { ok: true, json: async () => ({ cancelled: true }) }
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  let camera = { setup: { profile: "Sony", target: "Rec.709", cube_size: 17, bands: [] }, interpretations: { Sony: { transfer: "S-Log3", gamut: "S-Gamut3.Cine" } } }
  const render = () => act(() => root.render(React.createElement(LutImagePreview, { preview: null, camera })))
  const button = (name) => [...container.querySelectorAll("button")].find((b) => b.textContent === name)
  const click = (name) => act(() => button(name).click())
  const set = async (label, value) => {
    const input = [...container.querySelectorAll("label")].find((e) => e.textContent.startsWith(label)).querySelector("select")
    await act(() => { input.value = value; input.dispatchEvent(new window.Event("change", { bubbles: true })) })
  }
  const confirm = () => act(() => container.querySelector("input[type=checkbox]").click())
  const finish = (job) => act(() => job.resolve({ ok: true, json: async () => ({ request_id: job.payload.request_id, image: "data:image/png;base64,verified", width: 16, height: 16, provenance: { warnings: [], comparison_unavailable: "No camera reference viewing transform.", source: { frame: job.payload.frame } } }) }))
  try {
    await render()
    const input = container.querySelector("input[accept='.mp4,.mov,.mkv']")
    Object.defineProperty(input, "files", { value: [new window.File(["video"], "camera.mkv")] })
    await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    assert.equal(container.querySelector("canvas, img"), null)
    assert.match(container.textContent, /Suggestion from metadata: bt2020nc/)
    assert.equal(button("Verify selected frame").disabled, true)
    for (const [label, value] of [["YCbCr matrix", "bt709"], ["Signal range", "full"], ["Chroma location", "center"], ["Component bit depth", "10"], ["Source transfer function", "S-Log3"], ["Source gamut", "S-Gamut3.Cine"]]) await set(label, value)
    await confirm()
    await click("Verify selected frame")
    let job = calls.at(-1)
    assert.deepEqual(job.payload.frame, selected.frame)
    assert.equal(job.payload.source, undefined)
    assert.equal(job.payload.interpretation.signal_range, "full")
    assert.equal(job.payload.interpretation.bit_depth, 10)
    assert.doesNotMatch(JSON.stringify(job.payload), /NEVER-VERIFY/)
    await finish(job)
    assert.ok(container.querySelector("img"))
    await click("Expand verified image")
    const frameRequests = calls.filter((call) => call.path === "/video/frame").length
    await act(() => container.querySelector('dialog[open] button').dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" })))
    assert.equal(calls.filter((call) => call.path === "/video/frame").length, frameRequests, "verified-image dialogs cannot change the underlying selected frame")
    await click("Close verified image")
    assert.equal(button("Original").disabled, true)
    assert.ok(button("Inspect pixel"))
    assert.ok(button("Download checked cube"))
    camera = { ...camera, setup: { ...camera.setup, legal_range: true } }
    await render()
    assert.equal(container.querySelector("img"), null)
    await click("Verify selected frame")
    job = calls.at(-1)
    await set("Signal range", "limited")
    assert.equal(container.querySelector("input[type=checkbox]").checked, false)
    await finish(job)
    assert.equal(container.querySelector("img"), null)
    await confirm()
    await click("Verify selected frame")
    job = calls.at(-1)
    await click("Cancel verification")
    await finish(job)
    assert.equal(container.querySelector("img"), null)
    await click("Verify selected frame")
    job = calls.at(-1)
    await click("Next frame")
    assert.equal(button("Verify selected frame"), undefined)
    await finish(job)
    assert.equal(container.querySelector("img"), null)
    const frameJob = calls.findLast((call) => call.path === "/video/frame")
    await act(() => frameJob.resolve({ ok: true, json: async () => ({ ...selected, frame: { ...selected.frame, index: 1, pts: "5300", relative_time: "3/10", seconds: .3 } }) }))
    assert.match(container.textContent, /Selected 0.300000 s/)
    assert.equal(button("Verify selected frame").disabled, true)
    await click("Release video")
    assert.equal(button("Verify selected frame"), undefined)
    assert.ok(calls.some((call) => call.path === "/verify-cancel"))
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.fetch = oldFetch
    globalThis.File = oldFile
  }
})

test("image preview samples and clamps the current LUT colors", () => {
  assert.equal(previewColorAt(["#000000", "#777777", "#ffffff"], 0), "#000000")
  assert.equal(previewColorAt(["#000000", "#777777", "#ffffff"], 0.5), "#777777")
  assert.equal(previewColorAt(["#000000", "#777777", "#ffffff"], 2), "#ffffff")
  assert.equal(previewOverlayAt([null, "#ff0000", null], 0), null)
  assert.equal(previewOverlayAt([null, "#ff0000", null], 0.5), "#ff0000")
})

test("display-image middle gray samples the zero-stop overlay", () => {
  assert.equal(displayPreviewOverlayAt([null, "#ff0000", null], 0.18, -1, 1, "stops"), "#ff0000")
  assert.equal(displayPreviewOverlayAt([null, "#ff0000", null], 0.5, 0, 100, "IRE"), "#ff0000")
})

test("image preview follows exact band overlap and fill boundaries", () => {
  const bands = [
    { stop: 0, width: 0.5, color: "#00ff00" },
    { stop: 0.25, width: 0.5, color: "#ff0000" },
  ]
  assert.equal(overlayForExposure({ ...setup, bands }, 0), "#ff0000")
  assert.equal(overlayForExposure({ ...setup, bands }, 1), null)
  assert.equal(overlayForExposure({ ...setup, bands, fill_mode: true }, 0.1), "#ff0000")
})

async function mountGraph(overrides = {}) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(() => root.render(React.createElement(ExposureGraph, {
    setup,
    preview,
    increment: 0.25,
    selectedBand: 0,
    onSelect() {},
    onChange() {},
    onWidthChange() {},
    ...overrides,
  })))
  return { container, root }
}

function pointerEvent(type, { clientX, pointerId }) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  return event
}

test("exposure graph dispatches keyboard and pointer edits without intercepting wheel events", async () => {
  const changes = []
  const widths = []
  const { container, root } = await mountGraph({
    onChange(index, value) { changes.push([index, value]) },
    onWidthChange(index, value) { widths.push([index, value]) },
  })
  const graph = container.querySelector("[aria-label='Editable exposure graph from -7 to 7 stops']")
  const scale = container.querySelector("[aria-label='stops scale']")
  const handle = container.querySelector("[aria-label='Band 1, 0 stops']")
  const rightEdge = container.querySelector("[aria-label='Resize right edge of band 1']")
  assert.equal(scale.children.length, 15)
  assert.equal(graph.querySelectorAll("[data-scale-guide]").length, 1)
  assert.equal(handle.textContent, "")
  assert.equal(scale.firstElementChild.textContent.trim(), "-7")
  assert.equal(scale.lastElementChild.textContent.trim(), "+7")
  assert.match(container.textContent, /Exposure · stops from reference/)
  assert.match(container.textContent, /Range -7 to 7 stops/)
  assert.match(container.textContent, /Band 1 · center 0 stops · total width 0.6 stops · boundaries -0.3 to 0.3 stops/)
  assert.match(container.querySelector("[data-scale-guide='0']").className, /border-l-2/)
  graph.getBoundingClientRect = () => ({ left: 0, width: 100 })

  await act(() => handle.dispatchEvent(new window.KeyboardEvent("keydown", {
    bubbles: true,
    key: "ArrowRight",
  })))
  const wheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -1,
  })
  await act(() => graph.dispatchEvent(wheel))
  await act(() => handle.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, pointerId: 1 })))
  await act(() => handle.dispatchEvent(pointerEvent("pointermove", { clientX: 75, pointerId: 1 })))
  await act(() => rightEdge.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })))
  await act(() => rightEdge.dispatchEvent(pointerEvent("pointerdown", { clientX: 52, pointerId: 2 })))
  await act(() => rightEdge.dispatchEvent(pointerEvent("pointermove", { clientX: 75, pointerId: 2 })))

  assert.equal(wheel.defaultPrevented, false)
  assert.deepEqual(changes, [[0, 0.25], [0, 3.5]])
  assert.deepEqual(widths, [[0, 0.4], [0, 3.5]])
  await act(() => root.unmount())
  container.remove()
})

test("fill mode renders draggable separators instead of numbered band markers", async () => {
  const fillSetup = {
    ...setup,
    fill_mode: true,
    bands: [
      { stop: -2, width: 0, color: "#22814b" },
      { stop: -1, width: 0, color: "#fe9a00" },
      { stop: 2.25, width: 0, color: "#fb2c36" },
    ],
  }
  const edited = []
  const { container, root } = await mountGraph({ setup: fillSetup, onEditColor(index) { edited.push(index) } })

  assert.equal(container.querySelectorAll("[aria-label^='Boundary between colors']").length, 2)
  assert.equal(container.querySelectorAll("[aria-label^='Band ']").length, 0)
  assert.equal(container.querySelector("[aria-label^='Editable exposure graph']").textContent, "")
  assert.match(container.querySelector("[aria-label^='Editable exposure graph']").style.backgroundImage, /^linear-gradient/)
  assert.ok(container.querySelector("[aria-label^='Editable exposure graph']").classList.contains("bg-no-repeat"))
  assert.ok(container.querySelector("[aria-label^='Editable exposure graph']").classList.contains("bg-clip-padding"))
  assert.equal(container.querySelectorAll("[data-preview-color]").length, 0)
  assert.equal(container.querySelectorAll("[aria-label^='Edit fill color ']").length, 3)
  await act(() => container.querySelector("[aria-label='Edit fill color 1']").dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true })))
  await act(() => container.querySelector("[aria-label='Edit fill color 3']").click())
  assert.deepEqual(edited, [0, 2])
  await act(() => root.unmount())
  container.remove()
})

test("band color and resize handles share the exact edge positions", async () => {
  const { container, root } = await mountGraph()
  const color = container.querySelector("[data-band-width='0']")
  const leftHandle = container.querySelector("[aria-label='Resize left edge of band 1']")
  const rightHandle = container.querySelector("[aria-label='Resize right edge of band 1']")

  assert.equal(container.querySelector("[aria-label^='Editable exposure graph']").style.backgroundImage, "")
  assert.equal(color.style.left, leftHandle.style.left)
  assert.ok(Math.abs(
    Number.parseFloat(color.style.left) + Number.parseFloat(color.style.width) - Number.parseFloat(rightHandle.style.left),
  ) < Number.EPSILON * 100)
  await act(() => root.unmount())
  container.remove()
})

test("exposure graph shows enabled encoded-signal warnings", async () => {
  const { container, root } = await mountGraph({
    setup: {
      ...setup,
      low_signal_warning: true,
      low_signal_hex: "#5d0ec0",
      high_signal_warning: true,
      high_signal_hex: "#e7000b",
    },
  })

  const low = [...container.querySelectorAll("span")].find((item) => item.textContent === "Low signal")
  const high = [...container.querySelectorAll("span")].find((item) => item.textContent === "High signal")
  assert.equal(low.style.backgroundColor, "rgb(93, 14, 192)")
  assert.equal(high.style.backgroundColor, "rgb(231, 0, 11)")
  await act(() => root.unmount())
  container.remove()
})

test("exposure graph summarizes crowded edge values and exposes the selected one", async () => {
  const edgeSetup = {
    ...setup,
    bands: [8, 9, 10, 11].map((stop) => ({ stop, width: 0.3, color: "#ffffff" })),
  }
  const { container, root } = await mountGraph({ setup: edgeSetup, selectedBand: 2 })

  assert.ok(container.querySelector("[aria-label='4 bands above the visible range']"))
  assert.equal(container.querySelectorAll("[role='slider']").length, 8)
  assert.equal(container.querySelectorAll("[aria-label*='outside visible range']").length, 1)
  assert.ok(container.querySelector("[aria-label='Band 3, 10 stops, outside visible range']"))
  await act(() => root.unmount())
  container.remove()
})

test("color picker hides the complete ordered preset grid until requested", async () => {
  const palette = [
    { name: "red-50", hex: "#fff1f2" },
    { name: "red-500", hex: "#ef4444" },
    { name: "blue-50", hex: "#eff6ff" },
  ]
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(() => root.render(React.createElement(ColorPicker, { label: "Test color", value: "#ef4444", palette, onChange() {} })))
  await act(() => container.querySelector("[aria-label='Open Test color picker']").click())

  assert.equal(document.querySelector("input[type='color']"), null)
  assert.equal(document.querySelector("[aria-label='red-50']"), null)
  const pickerPanel = document.querySelector("[aria-label='Test color saturation and brightness']").parentElement
  await act(() => document.querySelector("button[aria-expanded='false']").click())
  assert.equal(pickerPanel.className, "hidden")
  assert.deepEqual([...document.querySelectorAll("[aria-label='Test color picker'] button[title]")].map((item) => item.title), palette.map((color) => color.name))
  assert.equal(document.querySelector("[aria-label='red-500']").getAttribute("aria-pressed"), "true")
  await act(() => root.unmount())
  container.remove()
})

test("width keyboard steps preserve typed precision and selected overlapping edges stay reachable", async () => {
  const widths = []
  const centers = []
  const { container, root } = await mountGraph({
    setup: { ...setup, bands: [{ stop: 0.1, width: 0.35, color: "#ffffff" }, { stop: 0.1, width: 0.35, color: "#000000" }] },
    onWidthChange(index, width) { widths.push([index, width]) },
    onChange(index, stop) { centers.push([index, stop]) },
  })
  const edge = container.querySelector("[aria-label='Resize right edge of band 1']")
  await act(() => edge.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })))
  assert.deepEqual(widths, [[0, 0.45]])
  assert.equal(edge.style.zIndex, "30")
  await act(() => container.querySelector("[aria-label='Band 1, 0.1 stops']").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })))
  assert.deepEqual(centers, [[0, 0.35]])
  await act(() => root.unmount())
  container.remove()
})

test("custom palettes draft, persist, reload, and reach generation without changing geometry", async () => {
  const initial = {
    ...setup, profile: "Sony S-Log3", target: "Rec.709", cube_size: 17,
    monochrome: true, legal_range: false, output: "palette.cube",
    low_signal_warning: false, high_signal_warning: false,
    low_signal_hex: "#000000", high_signal_hex: "#ffffff",
    bands: [{ stop: -2, width: 0.3, color: "#ffffff" }, { stop: 2, width: 0.7, color: "#ff0000" }],
  }
  window.LUT_BUILDER_SETUP = initial
  window.LUT_BUILDER_CATALOG = { profiles: [initial.profile], targets: [initial.target], palette: [] }
  window.localStorage.clear()
  window.localStorage.setItem("lut-builder.palettes.v1", '{"bad":true}')
  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.Image = window.Image
  globalThis.fetch = async (path, options) => {
    const candidate = JSON.parse(options.body)
    requests.push({ path, setup: candidate })
    if (path === "/generate") return new Response("cube", { status: 200 })
    return Response.json({ ...preview, setup: candidate, warnings: [], legend: [], overlays: [], input_overlays: [], input_exposure: [] })
  }
  const container = document.createElement("div")
  document.body.append(container)
  let root = createRoot(container)
  const field = (label) => container.querySelector(`[aria-label='${label}']`)
  const button = (text) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)
  const click = async (element) => { assert.ok(element); await act(() => element.click()) }
  const type = async (element, value) => {
    assert.ok(element)
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value)
      element.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
  }
  const choose = async (value) => { await act(() => { field("Reuse saved palette").value = value; field("Reuse saved palette").dispatchEvent(new window.Event("change", { bubbles: true })) }) }
  const generate = async () => {
    await click(button("Generate LUT"))
    return requests.filter(({ path }) => path === "/generate").at(-1).setup
  }
  const mount = async () => { await act(() => root.render(React.createElement(App))); await act(() => new Promise((resolve) => setTimeout(resolve, 300))) }
  try {
    await mount()
    assert.match(container.textContent, /Saved palettes could not be read/)
    const ramp = () => field("Add color on gradient").style.background
    const chooseField = async (label, value) => { await act(() => { field(label).value = value; field(label).dispatchEvent(new window.Event("change", { bubbles: true })) }) }
    assert.equal(field("Gradient blend"), null, "gradient editing is optional")
    const persistent = field("Persistent exposure preview")
    const previewColors = () => [...persistent.querySelectorAll("svg:first-of-type rect")].slice(0, initial.bands.length).map((rect) => rect.getAttribute("fill"))
    assert.deepEqual(previewColors(), initial.bands.map((band) => band.color))
    await click(container.querySelector('[data-palette="Reference emphasis"]'))
    const oceanPreview = previewColors()
    assert.notDeepEqual(oceanPreview, initial.bands.map((band) => band.color))
    assert.match(persistent.textContent, /Previewing Reference emphasis/)
    assert.deepEqual((await generate()).bands, initial.bands)
    await click(button("Cancel"))
    assert.deepEqual(previewColors(), initial.bands.map((band) => band.color))
    assert.equal(button("Undo last band edit").disabled, true)
    await click(container.querySelector('[data-palette="Reference emphasis"]'))
    await click(button("Use palette"))
    assert.deepEqual((await generate()).bands.map((band) => band.color), oceanPreview)
    assert.match(persistent.textContent, /Current exposure bands/)
    await click(button("Undo last band edit"))
    assert.deepEqual((await generate()).bands, initial.bands)
    for (const [name, count] of [["Exposure zones", 7], ["Reference emphasis", 7]]) {
      const preset = container.querySelector(`[data-palette="${name}"]`)
      await click(preset)
      assert.equal(preset.getAttribute("aria-pressed"), "true")
      await click(button("Customize gradient"))
      assert.equal(container.querySelectorAll("[aria-label^='Color stop ']").length, count)
      assert.equal(preset.querySelector("[aria-hidden]").style.background, ramp())
      assert.deepEqual((await generate()).bands, initial.bands)
      await click(button("Choose a palette"))
    }
    await click(button("Customize gradient"))
    await click(field("Color stop 4"))
    await act(() => field("Color stop 4").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })))
    assert.equal(field("Color stop 4").getAttribute("aria-valuenow"), "50")
    assert.equal(field("Remove selected color").disabled, true)
    await type(field("Palette name"), "Anchored exposure")
    await click(button("Save new palette"))
    assert.equal(JSON.parse(window.localStorage.getItem("lut-builder.palettes.v1"))[0].mapping, "exposure")
    await act(() => root.unmount())
    root = createRoot(container)
    window.localStorage.setItem("lut-builder.palettes.v1", JSON.stringify([{ name: "Custom draft", colors: ["#2563eb", "#f59e0b"], brightness: "custom", intensity: 100, blend: "colorful", huePath: "shorter" }]))
    await mount()
    await choose("Custom draft")
    await click(button("Customize gradient"))
    await click(button("Delete saved palette"))
    const vividRamp = ramp()
    await chooseField("Gradient blend", "direct")
    assert.notEqual(ramp(), vividRamp)
    assert.equal(field("Hue path"), null)
    await chooseField("Gradient blend", "colorful")
    await chooseField("Hue path", "longer")
    assert.notEqual(ramp(), vividRamp)
    await chooseField("Hue path", "shorter")
    assert.equal(ramp(), vividRamp)
    await type(field("Color intensity"), "0")
    assert.notEqual(ramp(), vividRamp)
    await click(button("Reset adjustments"))
    assert.equal(field("Color intensity").value, "100")
    assert.equal(ramp(), vividRamp)
    await click(container.querySelector("input[value='ascending']"))
    assert.notEqual(ramp(), vividRamp)
    await click(container.querySelector("input[value='custom']"))
    assert.equal(container.querySelectorAll("[aria-label^='Color stop ']").length, 2)
    assert.equal(field("Remove selected color").disabled, true)
    await type(field("Selected color hex"), "#000000")
    await type(field("Color hue"), "180")
    assert.equal(field("Color hue").value, "180")
    await type(field("Color hue value"), "240")
    await act(() => field("Color hue value").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" })))
    assert.equal(field("Color hue").value, "240")
    await type(field("Color hue value"), "400")
    assert.equal(field("Color hue value").getAttribute("aria-invalid"), "true")
    await act(() => field("Color hue value").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" })))
    assert.equal(field("Color hue value").value, "240")
    await click(field("Increase hue"))
    assert.equal(field("Color hue").value, "241")
    await type(field("Color lightness value"), "50")
    await act(() => field("Color lightness value").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" })))
    assert.equal(field("Color lightness").value, "0.5")
    await click(field("Color stop 2"))
    await type(field("Selected color hex"), "#ffffff")
    await click(button("Add color"))
    await type(field("Selected color hex"), "#ff0000")
    assert.equal(container.querySelectorAll("[aria-label^='Color stop ']").length, 3)
    await act(() => field("Color stop 2").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight", shiftKey: true })))
    assert.equal(field("Color stop 2").getAttribute("aria-valuenow"), "60")
    const middle = field("Color stop 2")
    middle.parentElement.getBoundingClientRect = () => ({ left: 0, width: 100 })
    await act(() => middle.dispatchEvent(pointerEvent("pointerdown", { clientX: 60, pointerId: 9 })))
    await act(() => middle.dispatchEvent(pointerEvent("pointermove", { clientX: 40, pointerId: 9 })))
    assert.equal(middle.getAttribute("aria-valuenow"), "40")
    await act(() => middle.dispatchEvent(pointerEvent("pointercancel", { clientX: 40, pointerId: 9 })))
    await act(() => middle.dispatchEvent(pointerEvent("pointermove", { clientX: 80, pointerId: 9 })))
    assert.equal(middle.getAttribute("aria-valuenow"), "40")
    await click(field("Remove selected color"))
    await click(field("Color stop 2"))
    assert.equal(field("Selected color hex").value, "#ffffff")
    assert.deepEqual((await generate()).bands, initial.bands)
    await click(field("Color stop 1"))
    await type(field("Selected color hex"), "#bad")
    assert.equal(button("Use palette").disabled, true)
    await type(field("Selected color hex"), "#000000")
    await click(button("Use palette"))
    const applied = await generate()
    assert.deepEqual(applied.bands, [{ stop: -2, width: 0.3, color: "#000000" }, { stop: 2, width: 0.7, color: "#ffffff" }])
    assert.match(container.textContent, /Palette applied to bands/)
    await click(field("Open Band 1 color picker"))
    await type(document.querySelector("[aria-label='Band 1 color hex color']"), "#123456")
    assert.equal((await generate()).bands[0].color, "#123456")
    assert.match(container.textContent, /Applying will replace manual overrides/)
    await click(button("Preview gradient"))
    await click(button("Use palette"))
    assert.deepEqual((await generate()).bands, applied.bands)
    await click(button("Undo last band edit"))
    assert.equal((await generate()).bands[0].color, "#123456")
    assert.match(container.textContent, /Applying will replace manual overrides/)
    await click(button("Preview gradient"))
    await click(button("Use palette"))
    await type(field("Palette name"), "Neutral")
    await chooseField("Hue path", "longer")
    const originalSet = window.Storage.prototype.setItem
    window.Storage.prototype.setItem = () => { throw new Error("quota") }
    try { await click(button("Save new palette")) } finally { window.Storage.prototype.setItem = originalSet }
    assert.match(container.textContent, /Could not save palettes/)
    assert.deepEqual((await generate()).bands, applied.bands)
    await click(button("Save new palette"))
    await click(button("Save new palette"))
    assert.match(container.textContent, /That name is already saved/)
    assert.equal(field("Reuse saved palette").options.length, 2)
    await type(field("Palette name"), "Neutral renamed")
    await click(button("Rename saved palette"))
    await click(field("Color stop 2"))
    await type(field("Selected color hex"), "#00ff00")
    await act(() => field("Color stop 2").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft", shiftKey: true })))
    await click(button("Replace saved palette"))
    assert.deepEqual(JSON.parse(window.localStorage.getItem("lut-builder.palettes.v1"))[0].positions, [0, 0.9])
    assert.equal(JSON.parse(window.localStorage.getItem("lut-builder.palettes.v1"))[0].blend, "colorful")
    assert.equal(JSON.parse(window.localStorage.getItem("lut-builder.palettes.v1"))[0].huePath, "longer")
    await act(() => root.unmount())
    root = createRoot(container)
    await mount()
    await choose("Neutral renamed")
    await click(button("Customize gradient"))
    assert.equal(field("Gradient blend").value, "colorful")
    assert.equal(field("Hue path").value, "longer")
    await click(field("Color stop 2"))
    assert.equal(field("Selected color hex").value, "#00ff00")
    assert.equal(field("Color stop 2").getAttribute("aria-valuenow"), "90")
    assert.deepEqual((await generate()).bands, initial.bands)
    await click(button("Preview gradient"))
    await click(button("Use palette"))
    const reused = await generate()
    assert.notEqual(reused.bands[1].color, initial.bands[1].color)
    assert.deepEqual(reused.bands.map(({ stop, width }) => ({ stop, width })), initial.bands.map(({ stop, width }) => ({ stop, width })))
    await click(button("Delete saved palette"))
    assert.equal(field("Reuse saved palette").options.length, 1)
    assert.deepEqual((await generate()).bands, reused.bands)
    for (const mode of ["ire", "fill"]) {
      await click(container.querySelector(`input[name="band-mode"][value="${mode}"]`))
      const before = await generate()
      await click(button("Preview gradient"))
      await click(button("Use palette"))
      const after = await generate()
      assert.deepEqual(after.bands.map(({ stop, width }) => ({ stop, width })), before.bands.map(({ stop, width }) => ({ stop, width })))
      assert.equal(after.band_mode, before.band_mode)
      assert.equal(after.fill_mode, before.fill_mode)
    }
    await act(() => root.unmount())
    root = createRoot(container)
    window.localStorage.setItem("lut-builder.palettes.v1", JSON.stringify([{ name: "Legacy", colors: ["#2563eb", "#22c55e", "#dc2626"], brightness: "custom", intensity: 100 }]))
    await mount()
    await choose("Legacy")
    await click(button("Customize gradient"))
    assert.equal(field("Gradient blend").value, "direct")
    assert.equal(field("Hue path"), null)
    assert.equal(container.querySelectorAll("[aria-label^='Color stop ']").length, 3)
    assert.equal(field("Color stop 2").getAttribute("aria-valuenow"), "50")
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.fetch = originalFetch
    window.localStorage.clear()
  }
})

test("band editing preserves valid generation data, selection, and one-step recovery", async () => {
  window.LUT_BUILDER_SETUP = {
    ...setup, profile: "Sony S-Log3", target: "Rec.709", cube_size: 17,
    monochrome: true, legal_range: false, output: "test.cube",
    low_signal_warning: false, high_signal_warning: false,
    low_signal_hex: "#000000", high_signal_hex: "#ffffff",
    bands: [{ stop: 0, width: 0.3, color: "#ffffff" }, { stop: 1, width: 0.5, color: "#ff0000" }],
  }
  window.LUT_BUILDER_CATALOG = { profiles: ["Sony S-Log3"], targets: ["Rec.709"], palette: [{ name: "blue-600", hex: "#2563eb" }, { name: "red-600", hex: "#dc2626" }] }
  const requests = []
  const originalFetch = globalThis.fetch
  globalThis.Image = window.Image
  globalThis.fetch = async (path, options) => {
    const candidate = JSON.parse(options.body)
    requests.push({ path, setup: candidate })
    if (path === "/generate") return new Response("cube", { status: 200 })
    return Response.json({ ...preview, setup: candidate, warnings: [], legend: [], overlays: [], input_overlays: [], input_exposure: [] })
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const field = (label) => container.querySelector(`[aria-label='${label}']`)
  const button = (text) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)
  const click = async (element) => { assert.ok(element); await act(() => element.click()) }
  const key = async (element, key, options = {}) => { await act(() => element.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }))) }
  const type = async (element, value) => {
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value)
      element.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
  }
  const generate = async () => {
    await click([...container.querySelectorAll("button")].find((item) => item.textContent.startsWith("Generate LUT")))
    return requests.filter(({ path }) => path === "/generate").at(-1).setup
  }
  try {
    await act(() => root.render(React.createElement(App)))
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    assert.equal(field("Band 1 total width").value, "0.6")
    const table = container.querySelector('table[aria-label="Band colors and positions"]')
    assert.equal(table.querySelectorAll("thead th").length, 4)
    assert.equal(table.querySelector("thead th").textContent, "Color")
    await click(field("Video / Legal"))
    assert.equal((await generate()).legal_range, true)
    await click(field("Full / Data"))
    assert.equal((await generate()).legal_range, false)
    const graphKeys = () => container.querySelector("[aria-label^='Editable exposure graph']")
    const centers = () => [...graphKeys().querySelectorAll("[data-band-center]")]
    await act(() => centers()[0].focus())
    await key(centers()[0], "ArrowRight", { altKey: true })
    assert.equal(document.activeElement, centers()[1])
    assert.equal(field("Band 2 stops").value, "1")
    await key(centers()[1], "ArrowLeft", { ctrlKey: true })
    assert.equal(field("Band 2 stops").value, "1")
    await key(centers()[1], "ArrowRight", { shiftKey: true })
    assert.equal(field("Band 2 stops").value, "3.5")
    await key(field("Band 2 stops"), "z", { ctrlKey: true })
    assert.equal(field("Band 2 stops").value, "3.5", "text fields retain native undo")
    await key(centers()[1], "z", { ctrlKey: true })
    assert.equal(field("Band 2 stops").value, "1")
    await key(field("Band 2 stops"), "Delete")
    assert.equal(centers().length, 2, "typing never removes a band")
    await act(() => centers()[1].focus())
    await key(centers()[1], "Delete")
    assert.equal(centers().length, 1)
    assert.equal(document.activeElement, centers()[0], "deletion focuses the nearest band")
    await key(centers()[0], "Delete", { repeat: true })
    assert.equal(centers().length, 1, "holding Delete cannot remove more bands")
    await key(centers()[0], "?", { shiftKey: true })
    const shortcutDialog = container.querySelector("[aria-labelledby='keyboard-help-title']")
    assert.equal(shortcutDialog.open, true)
    await key(shortcutDialog.querySelector("button"), "z", { ctrlKey: true })
    assert.equal(centers().length, 1, "modal shortcuts cannot undo the editor underneath")
    await click(button("Close shortcuts"))
    assert.equal(document.activeElement, centers()[0])
    await key(centers()[0], "z", { metaKey: true })
    assert.equal(centers().length, 2)
    assert.equal(field("Band 2 stops").value, "1")
    await type(field("Output filename template"), defaultFilenameTemplate)
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))
    assert.equal(requests.filter(({ path }) => path === "/preview").at(-1).setup.output, defaultFilenameTemplate)
    assert.match((await generate()).output, /^Sony-S-Log3-Rec-709-[a-f0-9]{8}\.cube$/)
    assert.equal(field("Output filename template").value, defaultFilenameTemplate)
    await type(field("Band 1 stops"), "-")
    assert.equal((await generate()).bands[0].stop, 0)
    await type(field("Band 1 stops"), "2.25")
    await key(field("Band 1 stops"), "Enter")
    assert.match(container.querySelector("output[aria-live]").textContent, /Band 2 · center 2.25/)
    await type(field("Band 2 total width"), "1.4")
    await key(field("Band 2 total width"), "Enter")
    assert.deepEqual((await generate()).bands[1], { stop: 2.25, width: 0.7, color: "#ffffff" })
    await click(button("Undo last band edit"))
    assert.equal(field("Band 2 total width").value, "0.6")
    assert.equal(button("Undo last band edit").disabled, true)
    await key(field("Band 2 stops"), "ArrowUp")
    assert.equal(field("Band 2 stops").value, "2.5")
    const wheel = new window.WheelEvent("wheel", { bubbles: true, deltaY: -100 })
    await act(() => field("Band 2 stops").dispatchEvent(wheel))
    assert.equal(field("Band 2 stops").value, "2.5")
    const graph = container.querySelector("[aria-label^='Editable exposure graph']")
    graph.getBoundingClientRect = () => ({ left: 0, width: 140 })
    let handle = field("Band 2, 2.5 stops")
    await act(() => handle.dispatchEvent(pointerEvent("pointerdown", { clientX: 95, pointerId: 3 })))
    await act(() => handle.dispatchEvent(pointerEvent("pointermove", { clientX: 65, pointerId: 3 })))
    handle = field("Band 1, -0.5 stops")
    await act(() => handle.dispatchEvent(pointerEvent("pointermove", { clientX: 60, pointerId: 3 })))
    await act(() => handle.dispatchEvent(pointerEvent("pointerup", { clientX: 60, pointerId: 3 })))
    assert.equal((await generate()).bands[0].stop, -1)
    await click(button("Undo last band edit"))
    assert.equal(field("Band 2 stops").value, "2.5")
    await click(field("Remove band 2"))
    await click(field("Confirm remove band 2"))
    assert.equal((await generate()).bands.length, 1)
    await click(button("Undo last band edit"))
    assert.match(container.querySelector("output[aria-live]").textContent, /Band 2 · center 2.5/)
    await click(button("Add band"))
    assert.equal((await generate()).bands.length, 3)
    await click(button("Undo last band edit"))
    assert.equal((await generate()).bands.length, 2)
    await click(container.querySelector('[data-palette="Exposure zones"]'))
    await click(button("Use palette"))
    assert.notDeepEqual((await generate()).bands.map(({ color }) => color), ["#ff0000", "#ffffff"])
    await click(button("Undo last band edit"))
    assert.deepEqual((await generate()).bands.map(({ color }) => color), ["#ff0000", "#ffffff"])
    await click(button("Apply preset"))
    assert.equal((await generate()).bands.length, 7)
    await click(button("Undo last band edit"))
    assert.equal((await generate()).bands.length, 2)
    await type(field("Band 2 total width"), "-1")
    await key(field("Band 2 total width"), "Enter")
    assert.equal(field("Band 2 total width").value, "0.6")
    await type(field("Band 2 stops"), "10")
    await key(field("Band 2 stops"), "Enter")
    assert.ok(field("Band 2, 10 stops, outside visible range"))
    await key(field("Band 2, 10 stops, outside visible range"), "ArrowLeft")
    assert.equal(field("Band 2 stops").value, "9.75")
    assert.match(container.textContent, /Sony S-Log3 · S-Gamut3.Cine/)
    const modeRadio = container.querySelector('input[name="band-mode"][value="ire"]')
    await click(modeRadio)
    assert.equal(modeRadio.checked, true)
    await type(field("Band 1 IRE"), "101")
    await key(field("Band 1 IRE"), "Enter")
    assert.equal(field("Band 1 IRE").value, "10.3")
    await type(field("Band 1 IRE"), "0")
    await key(field("Band 1 IRE"), "Enter")
    await key(field("Band 1 IRE"), "ArrowDown")
    assert.equal((await generate()).bands[0].stop, 0)
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.fetch = originalFetch
  }
})

test("setup changes are recoverable, deletion is deliberate, and feedback stays local", async () => {
  const originalToken = window.LUT_BUILDER_TOKEN
  const originalSetup = window.LUT_BUILDER_SETUP
  const storageKey = "lut-builder.named-setups.v1"
  const originalPresets = window.localStorage.getItem(storageKey)
  delete window.LUT_BUILDER_TOKEN
  const initial = {
    ...setup, profile: "Sony S-Log3", target: "Rec.709", cube_size: 17,
    monochrome: true, legal_range: false, output: "test.cube",
    low_signal_warning: false, high_signal_warning: false,
    low_signal_hex: "#000000", high_signal_hex: "#ffffff",
  }
  window.LUT_BUILDER_SETUP = initial
  window.localStorage.setItem(storageKey, JSON.stringify([
    { name: "Interview", setup: { ...initial, cube_size: 33 } },
    { name: "Exterior", setup: { ...initial, cube_size: 65 } },
  ]))
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const button = (text) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)
  const click = async (text) => { assert.ok(button(text), text); await act(() => button(text).click()) }
  const liveMessages = (text) => [...container.querySelectorAll('[role="status"]')].filter((item) => item.textContent.includes(text))
  const select = async (value) => {
    const field = container.querySelector("details select")
    await act(() => { field.value = value; field.dispatchEvent(new window.Event("change", { bubbles: true })) })
  }
  const importFile = async (text) => {
    const field = container.querySelector('[aria-label="Import setup JSON file"]')
    Object.defineProperty(field, "files", { configurable: true, value: [{ name: "setup.json", text: async () => text }] })
    await act(() => field.dispatchEvent(new window.Event("change", { bubbles: true })))
  }
  try {
    await act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(App))))
    const output = () => container.querySelector('[aria-label="LUT output"]').textContent
    await select("Interview")
    await click("Load setup")
    assert.match(output(), /33³/)
    assert.equal(liveMessages("Loaded Interview").length, 1)
    assert.ok(liveMessages("Loaded Interview")[0].closest('[aria-label="Setup loading feedback"]'))
    await click("Restore previous setup")
    assert.match(output(), /17³/)
    assert.equal(button("Restore previous setup"), undefined)
    await importFile(JSON.stringify({ version: 1, ...initial, cube_size: 65 }))
    assert.match(output(), /65³/)
    assert.equal(liveMessages("Imported setup.json").length, 1)
    await importFile("{")
    assert.match(output(), /65³/, "invalid imports leave the working setup intact")
    assert.ok(button("Restore previous setup"), "failed imports retain the recovery snapshot")
    await click("Restore previous setup")
    assert.match(output(), /17³/)
    await click("Delete setup")
    assert.equal(JSON.parse(window.localStorage.getItem(storageKey)).length, 2)
    await click("Keep setup")
    assert.equal(button("Confirm delete setup"), undefined)
    await click("Delete setup")
    await select("Exterior")
    assert.equal(button("Confirm delete setup"), undefined, "selecting a different preset cancels confirmation")
    await click("Delete setup")
    await click("Confirm delete setup")
    assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)).map((preset) => preset.name), ["Interview"])
    const name = [...container.querySelectorAll("label")].find((label) => label.textContent.trim() === "Preset name").querySelector("input")
    await act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(name, " interview ")
      name.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
    assert.ok(button("Replace saved setup"), "case-insensitive replacements are explicit")
    assert.match(container.textContent, /overwrites that saved copy/)
    await click("Replace saved setup")
    assert.equal(JSON.parse(window.localStorage.getItem(storageKey))[0].setup.cube_size, 17)
    assert.equal(liveMessages("Named LUT setup saved").length, 1)
    assert.doesNotMatch(output(), /Named LUT setup saved/)
    assert.equal(container.querySelector('a[href="#photo-result"]').textContent, "View photo result")
    assert.ok(container.querySelector('#photo-result a[href="#exposure-bands"]'))
  } finally {
    await act(() => root.unmount())
    container.remove()
    if (originalToken !== undefined) window.LUT_BUILDER_TOKEN = originalToken
    else delete window.LUT_BUILDER_TOKEN
    if (originalSetup !== undefined) window.LUT_BUILDER_SETUP = originalSetup
    else delete window.LUT_BUILDER_SETUP
    if (originalPresets === null) window.localStorage.removeItem(storageKey)
    else window.localStorage.setItem(storageKey, originalPresets)
  }
})

test("browser-only app generates and downloads through a local worker without backend calls", async () => {
  const originalToken = window.LUT_BUILDER_TOKEN
  const originalSetup = window.LUT_BUILDER_SETUP
  const originalWorker = globalThis.Worker
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = globalThis.URL.createObjectURL
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click
  const requests = []
  const messages = []
  const downloads = []
  let terminated = false
  delete window.LUT_BUILDER_TOKEN
  delete window.LUT_BUILDER_SETUP
  globalThis.fetch = async (...args) => { requests.push(args); throw new Error("unexpected backend call") }
  globalThis.Worker = class {
    onmessage = null
    onerror = null
    postMessage(message) {
      messages.push(message)
      this.onmessage({ data: { type: "progress", id: message.id, progress: 1 } })
      this.onmessage({ data: { type: "complete", id: message.id, bytes: new Uint8Array([1, 2, 3]).buffer } })
    }
    terminate() { terminated = true }
  }
  globalThis.URL.createObjectURL = () => "blob:test-lut"
  globalThis.URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, filename: this.download }) }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(() => root.render(React.createElement(App)))
    assert.ok(container.querySelector('[aria-label="Browser camera verification"]'))
    const marker = container.querySelector('button[aria-label="Band 1, 0 stops"]')
    assert.ok(marker, "static app exposes the editable graph without a backend preview")
    assert.ok(container.querySelector('[aria-label="Band 1 total width"]'))
    const filenameBefore = container.querySelector('[aria-label="Output filename preview"]').textContent
    const range = container.querySelector('[aria-label="Graph range in stops"]')
    const setRange = async (value) => {
      await act(() => {
        range.value = value
        range.dispatchEvent(new window.Event("change", { bubbles: true }))
      })
      await act(() => range.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
    }
    for (const value of ["1", "9", "12", "20"]) {
      await setRange(value)
      assert.ok(container.querySelector(`[aria-label="Editable exposure graph from -${value} to ${value} stops"]`))
      assert.ok(container.querySelector('[aria-label="stops scale"]').children.length <= 17)
    }
    await setRange("12")
    assert.equal([...range.options].some(option => option.value === '0'), false)
    assert.equal(range.value, "12")
    assert.equal(container.querySelector('[aria-label="Output filename preview"]').textContent, filenameBefore)
    await act(() => marker.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })))
    const generate = [...container.querySelectorAll("button")].find((button) => button.textContent === "Generate LUT")
    await act(async () => { generate.click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(messages[0].type, "generate")
    assert.equal(messages[0].setup.profile, "Sony S-Log3")
    assert.equal(messages[0].setup.bands[0].stop, 0.25)
    assert.equal(downloads[0].href, "blob:test-lut")
    assert.match(downloads[0].filename, /^Sony-S-Log3-Rec-709-[a-f0-9]{8}\.cube$/)
    assert.equal(terminated, true)
    assert.deepEqual(requests, [])
    assert.match(container.textContent, /LUT downloaded\. Calculations stayed on this device/)
  } finally {
    await act(() => root.unmount())
    container.remove()
    if (originalToken !== undefined) window.LUT_BUILDER_TOKEN = originalToken
    if (originalSetup !== undefined) window.LUT_BUILDER_SETUP = originalSetup
    globalThis.Worker = originalWorker
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreateObjectURL
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL
    window.HTMLAnchorElement.prototype.click = originalAnchorClick
  }
})

test("StrictMode browser verification keeps inspection and exact cube download alive until invalidation", async () => {
  const originalWorker = globalThis.Worker
  const originalImageData = globalThis.ImageData
  const originalContext = window.HTMLCanvasElement.prototype.getContext
  const originalDataURL = window.HTMLCanvasElement.prototype.toDataURL
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalClick = window.HTMLAnchorElement.prototype.click
  let worker
  let downloaded
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage() {}
    terminate() {}
  }
  globalThis.ImageData = class {}
  window.HTMLCanvasElement.prototype.getContext = () => ({ putImageData() {} })
  window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,test"
  URL.createObjectURL = (blob) => { downloaded = blob; return "blob:checked" }
  URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = () => {}
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const settings = { ...setup, profile: "Sony S-Log3", target: "Rec.709", legal_range: false }
  const render = (value) => act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(BrowserVerification, { setup: value }))))
  const button = (name) => [...container.querySelectorAll("button")].find((node) => node.textContent === name)
  const cube = "# exact checked bytes\r\nLUT_3D_SIZE 2\n"
  const complete = () => act(() => worker.onmessage({ data: { type: "complete", value: {
    width: 1, height: 1, source: Float64Array.from([-0.25, 0.5, 1.25]), output: Float64Array.from([0, 0, 0]),
    rgba: Uint8ClampedArray.from([0, 0, 0, 255]), cube,
    provenance: { cube_sha256: "checked-cube", comparison_unavailable: "No reference", warnings: [] },
  } } }))
  try {
    await render(settings)
    const input = container.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: [new window.File(["camera"], "camera.pfm")] })
    await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    for (const [index, value] of ["S-Log3", "S-Gamut3.Cine"].entries()) {
      const select = container.querySelectorAll("select")[index]
      select.value = value
      await act(() => select.dispatchEvent(new window.Event("change", { bubbles: true })))
    }
    for (const checkbox of container.querySelectorAll('input[type="checkbox"]')) await act(() => checkbox.click())
    assert.equal(button("Verify still").disabled, false)
    await act(() => button("Verify still").click())
    await complete()
    await act(() => button("Inspect pixel").click())
    assert.match(container.querySelector("output")?.textContent ?? container.textContent, /Source RGB: -0.2500000000, 0.5000000000, 1.250000000/)
    await act(() => button("Download checked cube").click())
    assert.equal(await downloaded.text(), cube)
    await render({ ...settings, legal_range: true })
    assert.equal(button("Inspect pixel"), undefined)
    assert.equal(button("Download checked cube"), undefined)
    await act(() => button("Verify still").click())
    await complete()
    await act(() => button("Inspect pixel").click())
    assert.ok(container.querySelector("output"))
  } finally {
    await act(() => root.unmount())
    assert.equal(container.childElementCount, 0)
    container.remove()
    globalThis.Worker = originalWorker
    globalThis.ImageData = originalImageData
    window.HTMLCanvasElement.prototype.getContext = originalContext
    window.HTMLCanvasElement.prototype.toDataURL = originalDataURL
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    window.HTMLAnchorElement.prototype.click = originalClick
  }
})

test("browser video shortcuts select interval frames, clamp jumps and respect fields and busy state", async () => {
  const originalWorker = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage() {}
    terminate() {}
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const button = (name) => [...container.querySelectorAll("button")].find((node) => node.textContent === name)
  const field = () => container.querySelector('input[type="number"][step="1"]')
  const key = (target, key, options = {}) => act(() => target.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options })))
  const info = { frames: Array.from({ length: 13 }, (_, pts) => ({ pts })), stream: { width: 16, height: 16, codec_name: "h264", pix_fmt: "yuv420p", time_base: "1/24", start_pts: 0 }, bitDepth: 8 }
  const finish = () => act(() => worker.onmessage({ data: { type: "complete", value: info } }))
  try {
    await act(() => root.render(React.createElement(BrowserVerification, { setup: { ...setup, profile: "Sony S-Log3" } })))
    await act(() => [...container.querySelectorAll('input[type="radio"]')][1].click())
    const input = container.querySelector('input[type="file"]')
    Object.defineProperty(input, "files", { value: [new window.File(["video"], "camera.mp4")] })
    await act(() => input.dispatchEvent(new window.Event("change", { bubbles: true })))
    await act(() => button("Inspect video").click())
    await finish()
    const preview = container.querySelector('[aria-label="Browser camera verification"]')
    const confirm = [...container.querySelectorAll('input[type="checkbox"]')].at(-1)
    await act(() => confirm.click())
    await key(preview, "ArrowRight")
    assert.equal(field().value, "1")
    assert.equal(confirm.checked, false, "changing frames requires confirmation again")
    await key(preview, "ArrowRight", { shiftKey: true })
    assert.equal(field().value, "11")
    await key(preview, "ArrowRight", { shiftKey: true })
    assert.equal(field().value, "12")
    assert.equal(button("Next frame").disabled, true)
    await key(preview, "ArrowLeft", { ctrlKey: true })
    await key(field(), "ArrowLeft")
    await key(preview, "ArrowLeft", { repeat: true })
    assert.equal(field().value, "12")
    await key(preview, "ArrowLeft", { shiftKey: true })
    assert.equal(field().value, "2")
    await act(() => button("Inspect video").click())
    await key(preview, "ArrowRight")
    assert.equal(field().value, "2", "inspection blocks frame shortcuts")
    await finish()
    await key(preview, "ArrowLeft", { shiftKey: true })
    assert.equal(field().value, "0")
    assert.equal(button("Previous frame").disabled, true)
  } finally {
    await act(() => root.unmount())
    container.remove()
    globalThis.Worker = originalWorker
  }
})

test("Tailwind presets include every shade and valid neutral colors", () => {
  assert.ok(tailwindPalette.length >= 242)
  assert.equal(new Set(tailwindPalette.map((color) => color.name)).size, tailwindPalette.length)
  assert.ok(tailwindPalette.every((color) => /^#[a-f0-9]{6}$/i.test(color.hex)))
  for (const family of ["red", "blue", "neutral", "slate"]) {
    assert.equal(tailwindPalette.filter((color) => color.name.startsWith(family + "-")).length, 11)
  }
})

test("filename tokens track settings, preserve fixed names, and survive key reordering", () => {
  const configured = { ...setup, profile: "Panasonic V-Log", target: "Rec.709", output: defaultFilenameTemplate }
  const name = outputFilename(configured)
  assert.match(name, /^Panasonic-V-Log-Rec-709-[a-f0-9]{8}\.cube$/)
  assert.equal(outputFilename({ ...configured }), name)
  assert.equal(outputFilename(Object.fromEntries(Object.entries(configured).reverse())), name)
  assert.notEqual(outputFilename({ ...configured, bands: [{ stop: 2, width: 0.5, color: "#ffffff" }] }), name)
  assert.match(outputFilename({ ...configured, profile: "Sony S-Log3", target: "Rec.2020" }), /^Sony-S-Log3-Rec-2020-/)
  assert.equal(outputFilename({ ...configured, output: "custom.cube" }), "custom.cube")
})
