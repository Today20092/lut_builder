import assert from "node:assert/strict"
import test from "node:test"
import { Effect } from "effect"
import { browserVerifiedResult, localVerifiedResult } from "../src/verifiedResult.ts"

const metadata = { request_id: "checked-123", width: 1, height: 1, image: "data:image/png;base64,test", provenance: { comparison_unavailable: "No reference", warnings: [] } }
const pixel = { x: 0, y: 0, source_rgb: [-0.25, 0.5, 1.25], output_rgb: [0, 0, 0], display_rgb: [0, 0, 0] }
const cube = "# exact checked bytes\r\nLUT_3D_SIZE 2\n"

for (const mode of ["local", "browser"]) test(`${mode} verified result preserves pixel values, exact artifact and release`, async () => {
  const calls = []
  const result = mode === "local"
    ? localVerifiedResult(metadata, async (path, payload) => {
      calls.push([path, payload])
      return path === "/verify-pixel" ? Response.json(pixel) : path === "/verify-cube" ? new Response(cube) : new Response()
    })
    : browserVerifiedResult({ ...metadata, source: Float64Array.from(pixel.source_rgb), output: Float64Array.from(pixel.output_rgb), cube }, { target: "Rec.709", legal_range: false }, metadata.image)
  assert.deepEqual(await Effect.runPromise(result.inspect(0, 0)), pixel)
  assert.equal(await (await Effect.runPromise(result.cube())).text(), cube)
  for (const [x, y] of [[-1, 0], [1, 0], [0, 1], [0.5, 0], [NaN, 0]]) await assert.rejects(Effect.runPromise(result.inspect(x, y)), /inside the original frame/)
  assert.deepEqual(result.provenance, metadata.provenance)
  await Effect.runPromise(result.release())
  await assert.rejects(Effect.runPromise(result.inspect(0, 0)), /no longer current/)
  await assert.rejects(Effect.runPromise(result.cube()), /no longer current/)
  if (mode === "local") assert.deepEqual(calls, [["/verify-pixel", { request_id: "checked-123", x: 0, y: 0 }], ["/verify-cube", { request_id: "checked-123" }], ["/verify-cancel", { request_id: "checked-123" }]])
})

test("released local results reject late pixels and preserve server expiry failures", async () => {
  let finish
  const result = localVerifiedResult(metadata, async (path) => path === "/verify-pixel" ? new Promise((resolve) => { finish = resolve }) : new Response())
  const pending = Effect.runPromise(result.inspect(0, 0))
  await Effect.runPromise(result.release())
  finish(Response.json(pixel))
  await assert.rejects(pending, /no longer current/)
  const expired = localVerifiedResult(metadata, async () => { throw new Error("Verification result expired. Verify again.") })
  await assert.rejects(Effect.runPromise(expired.cube()), /expired/)
})

test("released browser results reject pending pixel inspection and checked cube reads", async () => {
  const result = browserVerifiedResult({ ...metadata, source: Float64Array.from(pixel.source_rgb), output: Float64Array.from(pixel.output_rgb), cube }, { target: "Rec.709", legal_range: false }, metadata.image)
  const inspecting = Effect.runPromise(result.inspect(0, 0))
  const downloading = Effect.runPromise(result.cube())
  await Effect.runPromise(result.release())
  await assert.rejects(inspecting, /no longer current/)
  await assert.rejects(downloading, /no longer current/)
})

test("local pixel cancellation reaches the result transport", async () => {
  let signal
  const result = localVerifiedResult(metadata, async (_path, _payload, requestSignal) => {
    signal = requestSignal
    return new Promise(() => {})
  })
  const controller = new AbortController()
  const pending = Effect.runPromise(result.inspect(0, 0), { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending)
  assert.equal(signal.aborted, true)
})

test("both adapters preserve distinct source/output values and the declared SDR display policy", async () => {
  const expected = { x: 0, y: 0, source_rgb: [-0.125, 0.75, 1.125], output_rgb: [0.25, 0.5, 0.75], display_rgb: [0.20875, 0.4725, 0.73625] }
  const local = localVerifiedResult(metadata, async () => Response.json(expected))
  const browser = browserVerifiedResult({ ...metadata, source: Float64Array.from(expected.source_rgb), output: Float64Array.from(expected.output_rgb), cube }, { target: "Rec.709", legal_range: false }, metadata.image)
  for (const result of [local, browser]) {
    const actual = await Effect.runPromise(result.inspect(0, 0))
    assert.deepEqual(actual.source_rgb, expected.source_rgb)
    assert.deepEqual(actual.output_rgb, expected.output_rgb)
    actual.display_rgb.forEach((value, index) => assert.ok(Math.abs(value - expected.display_rgb[index]) < 1e-12))
  }
})
