import assert from "node:assert/strict"
import test from "node:test"
import { Effect } from "effect"

import { deleteSetupPreset, readSetupPresets, saveSetupPreset } from "../src/setupPresets.ts"
import { decodeSetup } from "../src/setupSchema.ts"

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

const setup = {
  profile: "Sony S-Log3", target: "Rec.709", cube_size: 17, bands: [], band_mode: "stops",
  fill_mode: false, low_signal_warning: false, low_signal_hex: "#5b21b6",
  high_signal_warning: false, high_signal_hex: "#dc2626", monochrome: true,
  legal_range: false, output: "setup.cube",
}

test("named setup presets persist separately and replace names case-insensitively", async () => {
  const local = storage()
  const saved = await Effect.runPromise(saveSetupPreset(() => local, [], "Interview", setup))
  const replaced = await Effect.runPromise(saveSetupPreset(() => local, saved, " interview ", { ...setup, cube_size: 33 }))

  assert.equal(replaced.length, 1)
  assert.equal((await Effect.runPromise(readSetupPresets(() => local)))[0].setup.cube_size, 33)
  assert.deepEqual(await Effect.runPromise(readSetupPresets(() => storage({ "lut-builder.named-setups.v1": "not json" }))), [])
  assert.deepEqual(await Effect.runPromise(readSetupPresets(() => storage({
    "lut-builder.named-setups.v1": JSON.stringify([{ name: "Broken", setup: { ...setup, cube_size: 32 } }]),
  }))), [])
  assert.deepEqual(await Effect.runPromise(deleteSetupPreset(() => local, replaced, "Interview")), [])
})

test("named setup presets require a name and report storage failures", async () => {
  await assert.rejects(Effect.runPromise(saveSetupPreset(() => storage(), [], "  ", setup)), /name/)
  await assert.rejects(Effect.runPromise(readSetupPresets(() => ({ getItem() { throw new Error("blocked") } }))), /Browser storage may be unavailable/)
  await assert.rejects(Effect.runPromise(saveSetupPreset(() => ({ setItem() { throw new Error("blocked") } }), [], "Interview", setup)), /Browser storage may be unavailable/)
})

test("Effect schema rejects malformed setup JSON with a typed, useful failure", async () => {
  const failure = Effect.runSync(Effect.result(decodeSetup({ ...setup, cube_size: 32 })))
  assert.equal(failure._tag, "Failure")
  assert.equal(failure.failure._tag, "SetupValidationError")
  assert.match(failure.failure.message, /cube_size/)
  assert.equal((await Effect.runPromise(decodeSetup(setup))).profile, setup.profile)
})
