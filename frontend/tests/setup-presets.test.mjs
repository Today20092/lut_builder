import assert from "node:assert/strict"
import test from "node:test"

import { deleteSetupPreset, readSetupPresets, saveSetupPreset } from "../src/setupPresets.ts"

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

const setup = { profile: "Sony S-Log3", target: "Rec.709", cube_size: 17, bands: [] }

test("named setup presets persist separately and replace names case-insensitively", () => {
  const local = storage()
  const saved = saveSetupPreset(local, [], "Interview", setup)
  const replaced = saveSetupPreset(local, saved, " interview ", { ...setup, cube_size: 33 })

  assert.equal(replaced.length, 1)
  assert.equal(readSetupPresets(local)[0].setup.cube_size, 33)
  assert.deepEqual(readSetupPresets(storage({ "lut-builder.named-setups.v1": "not json" })), [])
  assert.deepEqual(deleteSetupPreset(local, replaced, "Interview"), [])
})

test("named setup presets require a name", () => {
  assert.throws(() => saveSetupPreset(storage(), [], "  ", setup), /name/)
})
