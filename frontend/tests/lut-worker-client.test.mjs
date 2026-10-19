import assert from "node:assert/strict"
import test from "node:test"
import { Effect, Exit } from "effect"

import { generateInWorker } from "../src/lutWorkerClient.ts"

const setup = { profile: "Sony S-Log3", target: "Rec.709", cube_size: 17, bands: [] }

test("unsupported browsers receive actionable generation feedback", async () => {
  const originalWorker = globalThis.Worker
  delete globalThis.Worker
  try {
    await assert.rejects(Effect.runPromise(generateInWorker(setup, () => {})), /Web Workers.*current browser/)
  } finally {
    globalThis.Worker = originalWorker
  }
})

test("Effect worker client reports progress, returns bytes, and terminates", async () => {
  const originalWorker = globalThis.Worker
  const messages = []
  let terminated = false
  const bytes = new Uint8Array([1, 2, 3]).buffer
  globalThis.Worker = class {
    onmessage = null
    onerror = null
    postMessage(message) {
      messages.push(message)
      this.onmessage({ data: { type: "progress", id: message.id, progress: 0.5 } })
      this.onmessage({ data: { type: "complete", id: message.id, bytes } })
    }
    terminate() { terminated = true }
  }
  try {
    const progress = []
    const result = await Effect.runPromise(generateInWorker(setup, (value) => progress.push(value)))
    assert.deepEqual([...new Uint8Array(result)], [1, 2, 3])
    assert.deepEqual(progress, [0.5])
    assert.equal(messages[0].type, "generate")
    assert.equal(terminated, true)
  } finally {
    globalThis.Worker = originalWorker
  }
})

test("interrupting Effect generation sends cancel and terminates its worker", async () => {
  const originalWorker = globalThis.Worker
  const messages = []
  let terminated = false
  globalThis.Worker = class {
    onmessage = null
    onerror = null
    postMessage(message) { messages.push(message) }
    terminate() { terminated = true }
  }
  const controller = new AbortController()
  try {
    const running = Effect.runPromiseExit(generateInWorker(setup, () => {}), { signal: controller.signal })
    await new Promise((resolve) => setImmediate(resolve))
    controller.abort()
    const exit = await running
    assert.ok(Exit.isFailure(exit))
    assert.deepEqual(messages.map(({ type }) => type), ["generate", "cancel"])
    assert.equal(terminated, true)
  } finally {
    globalThis.Worker = originalWorker
  }
})
