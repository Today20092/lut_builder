import assert from "node:assert/strict"
import test from "node:test"

import {
  changeMode,
  exportSetup,
  filterPalette,
  importSetup,
  updateBand,
} from "../src/editor.ts"

const setup = {
  profile: "Sony S-Log3",
  target: "Rec.709",
  cube_size: 65,
  bands: [
    { stop: -1, width: 0.3, color: "#ef4444" },
    { stop: 1, width: 0.5, color: "#22c55e" },
  ],
  band_mode: "stops",
  fill_mode: false,
  low_signal_warning: false,
  low_signal_hex: "#6b21a8",
  high_signal_warning: false,
  high_signal_hex: "#dc2626",
  monochrome: true,
  legal_range: false,
  output: "SonySLog3_Rec709.cube",
}

test("mode transitions preserve bands and disable meaningless fill options", () => {
  const fill = changeMode(setup, "fill")

  assert.equal(fill.fill_mode, true)
  assert.equal(fill.band_mode, "stops")
  assert.equal(fill.monochrome, false)
  assert.deepEqual(fill.bands, setup.bands)

  const ire = changeMode(fill, "ire")
  assert.equal(ire.fill_mode, false)
  assert.equal(ire.band_mode, "ire")
})

test("editing a band orders it by position without mutating prior state", () => {
  const edited = updateBand(setup, 1, { stop: -2, color: "#123456" })

  assert.equal(setup.bands[0].stop, -1)
  assert.deepEqual(edited.bands.map((band) => band.stop), [-2, -1])
  assert.equal(edited.bands[0].color, "#123456")
})

test("bands at equal positions retain their creation order", () => {
  const created = {
    ...setup,
    bands: [
      { stop: 0, width: 0.3, color: "#ef4444" },
      { stop: 1, width: 0.5, color: "#22c55e" },
    ],
  }
  const crossed = updateBand(created, 0, { stop: 2 })
  const tied = updateBand(crossed, 1, { stop: 1 })

  assert.deepEqual(tied.bands.map((band) => band.color), [
    "#ef4444",
    "#22c55e",
  ])
})

test("palette search returns selectable names and validated hex colors", () => {
  const palette = [
    { name: "red-500", hex: "#ef4444" },
    { name: "rose-500", hex: "#f43f5e" },
    { name: "blue-500", hex: "#3b82f6" },
  ]

  assert.deepEqual(filterPalette(palette, "red"), [palette[0]])
  assert.deepEqual(filterPalette(palette, "#f43"), [palette[1]])
})

test("version-1 import/export round trips and invalid imports preserve state", async () => {
  const unordered = { ...setup, bands: [...setup.bands].reverse() }
  const text = exportSetup(unordered)
  const imported = await importSetup(text, async (candidate) => candidate)
  assert.deepEqual(imported, setup)

  await assert.rejects(
    importSetup("{bad json", async (candidate) => candidate),
    /valid JSON/,
  )
  assert.equal(setup.profile, "Sony S-Log3")
})
