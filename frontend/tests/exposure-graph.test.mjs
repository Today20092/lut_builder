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

const bundle = await build({
  bundle: true,
  external: ["@base-ui/react/*", "lucide-react", "react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  format: "esm",
  jsx: "automatic",
  loader: { ".jpg": "dataurl" },
  platform: "node",
  stdin: {
    contents: `
      export { App, ColorPicker, ExposureGraph, LutImagePreview, displayPreviewOverlayAt, overlayForExposure, previewColorAt, previewOverlayAt } from "./src/App.tsx";
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
const { App, ColorPicker, ExposureGraph, LutImagePreview, displayPreviewOverlayAt, overlayForExposure, previewColorAt, previewOverlayAt, React, act, createRoot } = await import(pathToFileURL(bundlePath).href)
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
  assert.equal(graph.querySelectorAll("[data-scale-guide]").length, 15)
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
  const { container, root } = await mountGraph({ setup: fillSetup })

  assert.equal(container.querySelectorAll("[aria-label^='Boundary between colors']").length, 2)
  assert.equal(container.querySelectorAll("[aria-label^='Band ']").length, 0)
  assert.equal(container.querySelector("[aria-label^='Editable exposure graph']").textContent, "")
  await act(() => root.unmount())
  container.remove()
})

test("band color and resize handles share the exact edge positions", async () => {
  const { container, root } = await mountGraph()
  const color = container.querySelector("[data-band-width='0']")
  const sampledColor = container.querySelector("[data-preview-color='0']")
  const leftHandle = container.querySelector("[aria-label='Resize left edge of band 1']")
  const rightHandle = container.querySelector("[aria-label='Resize right edge of band 1']")

  assert.equal(sampledColor.style.backgroundColor, "")
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
  const collapsedWidth = pickerPanel.className.match(/w-\S+/)?.[0]
  await act(() => document.querySelector("button[aria-expanded='false']").click())
  assert.equal(pickerPanel.className.match(/w-\S+/)?.[0], collapsedWidth)
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
    return Response.json({ ...preview, setup: candidate, warnings: [], legend: [], overlays: [] })
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
    const ramp = () => field("Draft palette ramp from low to high exposure").style.background
    const vividRamp = ramp()
    await type(field("Color intensity"), "0")
    assert.notEqual(ramp(), vividRamp)
    await type(field("Color intensity"), "100")
    await click(container.querySelector("input[value='ascending']"))
    assert.notEqual(ramp(), vividRamp)
    await click(container.querySelector("input[value='custom']"))
    assert.equal(field("Remove color 1").disabled, true)
    await type(field("Anchor 1 hex color"), "#000000")
    await type(field("Anchor 2 hex color"), "#ffffff")
    await click(button("Add color"))
    await type(field("Anchor 3 hex color"), "#ff0000")
    await click(field("Move color 3 earlier"))
    assert.equal(field("Anchor 2 hex color").value, "#ff0000")
    await click(field("Remove color 2"))
    assert.equal(field("Anchor 2 hex color").value, "#ffffff")
    assert.deepEqual((await generate()).bands, initial.bands)
    await type(field("Anchor 1 hex color"), "#bad")
    assert.equal(button("Apply colors").disabled, true)
    await type(field("Anchor 1 hex color"), "#000000")
    await click(button("Apply colors"))
    const applied = await generate()
    assert.deepEqual(applied.bands, [{ stop: -2, width: 0.3, color: "#000000" }, { stop: 2, width: 0.7, color: "#ffffff" }])
    assert.match(container.textContent, /Palette applied to bands/)
    await click(field("Open Band 1 color picker"))
    await type(document.querySelector("[aria-label='Band 1 color hex color']"), "#123456")
    assert.equal((await generate()).bands[0].color, "#123456")
    assert.match(container.textContent, /Applying will replace manual overrides/)
    await click(button("Apply colors"))
    assert.deepEqual((await generate()).bands, applied.bands)
    await click(button("Undo last band edit"))
    assert.equal((await generate()).bands[0].color, "#123456")
    assert.match(container.textContent, /Applying will replace manual overrides/)
    await click(button("Apply colors"))
    await type(field("Palette name"), "Neutral")
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
    await type(field("Anchor 2 hex color"), "#00ff00")
    await click(button("Replace saved palette"))
    await act(() => root.unmount())
    root = createRoot(container)
    await mount()
    await choose("Neutral renamed")
    assert.equal(field("Anchor 2 hex color").value, "#00ff00")
    assert.deepEqual((await generate()).bands, initial.bands)
    await click(button("Apply colors"))
    const reused = await generate()
    assert.notEqual(reused.bands[1].color, initial.bands[1].color)
    assert.deepEqual(reused.bands.map(({ stop, width }) => ({ stop, width })), initial.bands.map(({ stop, width }) => ({ stop, width })))
    await click(button("Delete saved palette"))
    assert.equal(field("Reuse saved palette").options.length, 1)
    assert.deepEqual((await generate()).bands, reused.bands)
    const modeSelect = [...container.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.value === "ire"))
    for (const mode of ["ire", "fill"]) {
      await act(() => { modeSelect.value = mode; modeSelect.dispatchEvent(new window.Event("change", { bubbles: true })) })
      const before = await generate()
      await click(button("Apply colors"))
      const after = await generate()
      assert.deepEqual(after.bands.map(({ stop, width }) => ({ stop, width })), before.bands.map(({ stop, width }) => ({ stop, width })))
      assert.equal(after.band_mode, before.band_mode)
      assert.equal(after.fill_mode, before.fill_mode)
    }
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
  const key = async (element, key) => { await act(() => element.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key }))) }
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
    await type(field("Band 1 stops"), "-")
    assert.equal((await generate()).bands[0].stop, 0)
    await type(field("Band 1 stops"), "2.25")
    await key(field("Band 1 stops"), "Enter")
    assert.match(container.querySelector("output").textContent, /Band 2 · center 2.25/)
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
    assert.match(container.querySelector("output").textContent, /Band 2 · center 2.5/)
    await click(button("Add band"))
    assert.equal((await generate()).bands.length, 3)
    await click(button("Undo last band edit"))
    assert.equal((await generate()).bands.length, 2)
    await click(button("Apply colors"))
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
    const modeSelect = [...container.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.value === "ire"))
    await act(() => { modeSelect.value = "ire"; modeSelect.dispatchEvent(new window.Event("change", { bubbles: true })) })
    await type(field("Band 1 IRE"), "101")
    await key(field("Band 1 IRE"), "Enter")
    assert.equal(field("Band 1 IRE").value, "10")
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
