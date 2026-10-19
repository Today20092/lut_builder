import assert from "node:assert/strict"
import test from "node:test"
import { Effect } from "effect"
import { createWorkspaceRuntime } from "../src/workspaceRuntime.ts"

const setup = {
  profile: "Sony S-Log3", target: "Rec.709", cube_size: 17, bands: [], band_mode: "stops",
  fill_mode: false, low_signal_warning: false, low_signal_hex: "#5b21b6",
  high_signal_warning: false, high_signal_hex: "#dc2626", monochrome: true,
  legal_range: false, output: "test.cube",
}

test("browser runtime normalizes setups without contacting a backend", async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => { throw new Error("Unexpected backend request") }
  try {
    const runtime = createWorkspaceRuntime()
    assert.equal(runtime.capabilities.remotePreview, false)
    assert.deepEqual(await Effect.runPromise(runtime.normalize(setup)), setup)
    assert.equal(await Effect.runPromise(runtime.preview(setup)), null)
    await assert.rejects(Effect.runPromise(runtime.normalize({ ...setup, cube_size: 32 })), /17|33|65/)
  } finally { globalThis.fetch = original }
})

test("local runtime normalizes and generates through authenticated HTTP without workers", async () => {
  const original = globalThis.fetch
  const calls = []
  const normalized = { ...setup, bands: [{ stop: 0, width: 0.3, color: "#22c55e" }] }
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return path === "/preview"
      ? Response.json({ minimum: -7, maximum: 7, unit: "stops", colors: [], overlays: [], input_overlays: [], input_exposure: [], legend: [], warnings: ["Source warning"], setup: normalized })
      : new Response("TITLE verified\n", { headers: { "Content-Disposition": 'attachment; filename="server.cube"' } })
  }
  try {
    const runtime = createWorkspaceRuntime("secret-token")
    assert.equal(runtime.capabilities.remotePreview, true)
    assert.equal(runtime.capabilities.cancellableGeneration, false)
    assert.deepEqual(await Effect.runPromise(runtime.normalize(setup)), normalized)
    assert.deepEqual((await Effect.runPromise(runtime.preview(setup))).warnings, ["Source warning"])
    const artifact = await Effect.runPromise(runtime.generate(setup, "requested.cube", () => assert.fail("HTTP has no progress protocol")))
    assert.equal(await artifact.blob.text(), "TITLE verified\n")
    assert.equal(artifact.filename, "server.cube")
    assert.deepEqual(calls.map(({ path }) => path), ["/preview", "/preview", "/generate"])
    for (const { options } of calls) {
      assert.equal(options.headers["X-LUT-Builder-Token"], "secret-token")
      assert.equal(options.headers["Content-Type"], "application/json")
      assert.equal(options.method, "POST")
      assert.equal(JSON.parse(options.body).version, 1)
    }
    assert.equal(JSON.parse(calls[2].options.body).output, "requested.cube")
  } finally { globalThis.fetch = original }
})

test("runtime preserves actionable remote failures and rejects malformed preview JSON", async () => {
  const original = globalThis.fetch
  try {
    const runtime = createWorkspaceRuntime("token")
    globalThis.fetch = async () => Response.json({ error: "Unsupported camera input" }, { status: 400 })
    await assert.rejects(Effect.runPromise(runtime.normalize(setup)), /Unsupported camera input/)
    await assert.rejects(Effect.runPromise(runtime.generate(setup, "x.cube", () => {})), /Unsupported camera input/)
    globalThis.fetch = async () => Response.json({ setup })
    await assert.rejects(Effect.runPromise(runtime.preview(setup)), /minimum/)
  } finally { globalThis.fetch = original }
})

test("runtime cancellation reaches HTTP requests and terminates browser workers", async () => {
  const originalFetch = globalThis.fetch
  const originalWorker = globalThis.Worker
  let httpSignal
  let terminated = false
  const messages = []
  try {
    globalThis.fetch = (_, { signal }) => {
      httpSignal = signal
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
    }
    const runtime = createWorkspaceRuntime("token")
    for (const operation of [runtime.preview(setup), runtime.generate(setup, "x.cube", () => {})]) {
      const localController = new AbortController()
      const local = Effect.runPromiseExit(operation, { signal: localController.signal })
      await new Promise((resolve) => setImmediate(resolve))
      localController.abort()
      await local
      assert.equal(httpSignal.aborted, true)
    }
    globalThis.Worker = class {
      postMessage(message) { messages.push(message.type) }
      terminate() { terminated = true }
    }
    const browserController = new AbortController()
    const browser = Effect.runPromiseExit(createWorkspaceRuntime().generate(setup, "x.cube", () => {}), { signal: browserController.signal })
    await new Promise((resolve) => setImmediate(resolve))
    browserController.abort()
    await browser
    assert.deepEqual(messages, ["generate", "cancel"])
    assert.equal(terminated, true)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Worker = originalWorker
  }
})

test("browser runtime preserves worker bytes, progress and requested filename", async () => {
  const original = globalThis.Worker
  globalThis.Worker = class {
    postMessage({ id }) {
      this.onmessage({ data: { type: "progress", id, progress: 0.75 } })
      this.onmessage({ data: { type: "complete", id, bytes: new Uint8Array([65, 66, 10]).buffer } })
    }
    terminate() {}
  }
  try {
    const progress = []
    const result = await Effect.runPromise(createWorkspaceRuntime().generate(setup, "browser.cube", (value) => progress.push(value)))
    assert.equal(await result.blob.text(), "AB\n")
    assert.equal(result.filename, "browser.cube")
    assert.deepEqual(progress, [0.75])
  } finally { globalThis.Worker = original }
})
