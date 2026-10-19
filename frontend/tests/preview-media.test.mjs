import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import test, { after } from "node:test"
import { build, stop } from "esbuild"
import { JSDOM } from "jsdom"
import React, { act } from "react"
import { createRoot } from "react-dom/client"

const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost/" })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.LUT_BUILDER_TOKEN = "test-token"
after(() => dom.window.close())

const bundle = await build({
  entryPoints: ["src/previewMedia.ts"], bundle: true, format: "esm", platform: "node",
  external: ["react"], write: false,
})
stop()
const directory = await mkdtemp(join(process.cwd(), "tests", ".media-"))
const path = join(directory, "media.mjs")
await writeFile(path, bundle.outputFiles[0].text)
const { usePreviewMedia } = await import(pathToFileURL(path).href)
await rm(directory, { recursive: true })

async function mountMedia() {
  let media
  function Consumer() { media = usePreviewMedia("reference.jpg"); return null }
  const root = createRoot(document.createElement("div"))
  await act(() => root.render(React.createElement(Consumer)))
  return { get media() { return media }, unmount: () => act(() => root.unmount()) }
}

function frame(source_id, index = 0) {
  return {
    source_id, display: `${source_id}-${index}.png`,
    frame: { index, pts: String(index), time_base: "1/24", first_pts: "0", relative_time: `${index}/24`, seconds: index / 24, count: 4 },
    facts: { stream: {}, frame: {} }, source: { precision_bits: 10, pixel_format: "yuv420p10le" },
    provenance: { matrix: "bt709", range: "limited", chroma_location: "left", view: "Illustration only" },
  }
}

test("pagehide releases a source allocated after its upload was cancelled", async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  let finishStart
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: options.body })
    if (url === "/video/start") return new Promise((resolve) => {
      finishStart = () => resolve({ ok: true, json: async () => ({ source_id: "late-source" }) })
    })
    return { ok: true, json: async () => ({}) }
  }
  let media
  function Consumer() { media = usePreviewMedia("reference.jpg"); return null }
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(() => root.render(React.createElement(Consumer)))
    let upload
    await act(() => { upload = media.chooseVideo(new File(["video"], "source.mp4")) })
    await act(() => window.dispatchEvent(new window.Event("pagehide")))
    await act(async () => { finishStart(); await upload })
    assert.equal(media.video, null)
    assert.equal(media.imageUrl, "reference.jpg")
    assert.equal(requests.some(({ url }) => url.startsWith("/video/upload")), false)
    assert.deepEqual(requests.filter(({ url }) => url === "/video/cancel").map(({ body }) => JSON.parse(body)), [{ source_id: "late-source" }])
  } finally {
    await act(() => root.unmount())
    globalThis.fetch = originalFetch
  }
})

test("replacement cancels an upload and only the current source can supply frames", async () => {
  const originalFetch = globalThis.fetch
  const released = []
  let allocations = 0
  let finishOldUpload
  let oldSignal
  let failFrame = false
  globalThis.fetch = async (url, options) => {
    const reply = (value) => ({ ok: true, json: async () => value })
    if (url === "/video/start") return reply({ source_id: `source-${++allocations}` })
    if (url.includes("upload?source_id=source-1")) {
      oldSignal = options.signal
      return new Promise((resolve) => { finishOldUpload = () => resolve(reply(frame("source-1"))) })
    }
    if (url.includes("upload?source_id=source-2")) return reply(frame("source-2"))
    if (url === "/video/cancel") { released.push(JSON.parse(options.body).source_id); return reply({}) }
    if (url === "/video/frame") {
      if (failFrame) return { ok: false, json: async () => ({ error: "Decode failed" }) }
      const { source_id, index } = JSON.parse(options.body)
      return reply(frame(source_id, index))
    }
    throw new Error(`Unexpected request ${url}`)
  }
  const view = await mountMedia()
  try {
    let oldUpload
    await act(() => { oldUpload = view.media.chooseVideo(new File(["a"], "a.mp4")) })
    await act(() => view.media.chooseVideo(new File(["b"], "b.mp4")))
    await act(async () => { finishOldUpload(); await oldUpload })
    assert.equal(oldSignal.aborted, true)
    assert.equal(view.media.video.source_id, "source-2")
    assert.equal(view.media.imageName, "b.mp4")
    assert.deepEqual(released, ["source-1"])

    failFrame = true
    await act(() => view.media.selectVideoFrame({ index: 1 }))
    assert.match(view.media.imageError, /Decode failed.*displayed frame is unchanged/)
    assert.equal(view.media.imageUrl, "source-2-0.png")
    assert.equal(view.media.frameRevision, 1)
    failFrame = false
    await act(() => view.media.selectVideoFrame({ index: 2 }))
    assert.equal(view.media.video.frame.index, 2)
    assert.equal(view.media.video.name, "b.mp4")
    assert.equal(view.media.imageError, "")
    assert.equal(view.media.frameRevision, 2)
    await act(() => view.media.reference())
    assert.equal(view.media.video, null)
    assert.equal(view.media.imageUrl, "reference.jpg")
    assert.deepEqual(released, ["source-1", "source-2"])
  } finally {
    await view.unmount()
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(released, ["source-1", "source-2"], "unmount does not release a source twice")
})

test("reference replacement aborts image decoding and a late callback cannot replace it", async () => {
  const previousReader = globalThis.FileReader
  const previousImage = globalThis.Image
  const candidates = []
  globalThis.FileReader = class {
    readAsDataURL(file) { this.result = `data:image/png,${file.name}`; this.onload() }
  }
  globalThis.Image = class {
    set src(value) { this.url = value; candidates.push(this) }
  }
  const view = await mountMedia()
  try {
    let loading
    await act(() => { loading = view.media.chooseImage(new File(["image"], "pending.png", { type: "image/png" })) })
    const staleLoad = candidates[0].onload
    await act(() => view.media.reference())
    await act(async () => { staleLoad(); await loading })
    assert.equal(view.media.imageUrl, "reference.jpg")
    assert.equal(view.media.imageName, "Reference photo")
    assert.equal(view.media.imageError, "")
    assert.equal(candidates[0].onload, null)
  } finally {
    await view.unmount()
    globalThis.FileReader = previousReader
    globalThis.Image = previousImage
  }
})

test("unmount releases active video and rejects pending frame work", async () => {
  const originalFetch = globalThis.fetch
  const released = []
  let finishFrame
  let frameSignal
  globalThis.fetch = async (url, options) => {
    const reply = (value) => ({ ok: true, json: async () => value })
    if (url === "/video/start") return reply({ source_id: "owned" })
    if (url.startsWith("/video/upload")) return reply(frame("owned"))
    if (url === "/video/frame") {
      frameSignal = options.signal
      return new Promise((resolve) => { finishFrame = () => resolve(reply(frame("owned", 1))) })
    }
    released.push(JSON.parse(options.body).source_id)
    return reply({})
  }
  const view = await mountMedia()
  try {
    await act(() => view.media.chooseVideo(new File(["video"], "owned.mp4")))
    let selecting
    await act(() => { selecting = view.media.selectVideoFrame({ index: 1 }) })
    await view.unmount()
    await act(async () => { finishFrame(); await selecting })
    assert.equal(frameSignal.aborted, true)
    assert.deepEqual(released, ["owned"])
  } finally {
    globalThis.fetch = originalFetch
  }
})
