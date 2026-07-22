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
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  format: "esm",
  jsx: "automatic",
  platform: "node",
  stdin: {
    contents: `
      export { ExposureGraph } from "./src/App.tsx";
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
const { ExposureGraph, React, act, createRoot } = await import(pathToFileURL(bundlePath).href)
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
    ...overrides,
  })))
  return { container, root }
}

function pointerEvent(type, { clientX, pointerId }) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX })
  Object.defineProperty(event, "pointerId", { value: pointerId })
  return event
}

test("exposure graph dispatches stepped keyboard, wheel, and pointer edits", async () => {
  const changes = []
  const { container, root } = await mountGraph({
    onChange(index, value) { changes.push([index, value]) },
  })
  const graph = container.querySelector("[aria-label='Editable exposure graph from -7 to 7 stops']")
  const handle = container.querySelector("[aria-label='Band 1, 0 stops']")
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
  const browserWheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -1,
  })
  await act(() => graph.dispatchEvent(browserWheel))
  await act(() => handle.dispatchEvent(pointerEvent("pointerdown", { clientX: 50, pointerId: 1 })))
  await act(() => handle.dispatchEvent(pointerEvent("pointermove", { clientX: 75, pointerId: 1 })))

  assert.equal(browserWheel.defaultPrevented, false)
  assert.deepEqual(changes, [[0, 0.25], [0, 0.25], [0, 3.5]])
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
  assert.equal(container.querySelectorAll("[aria-label*='outside visible range']").length, 1)
  assert.ok(container.querySelector("[aria-label='Band 3, 10 stops, outside visible range']"))
  await act(() => root.unmount())
  container.remove()
})
