import assert from "node:assert/strict"
import test from "node:test"

import {
  bandId,
  changeMode,
  contrastTextColor,
  createBand,
  exportSetup,
  filterPalette,
  hexToHsv,
  hsvToHex,
  importSetup,
  resizeBandWidth,
  snapBandValue,
  stepBandValue,
  updateBand,
  updateFillBoundary,
  wheelStepDirection,
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

test("direct manipulation and discrete movement share the selected increment", () => {
  assert.equal(snapBandValue(0.62, 0.25), 0.5)
  assert.equal(stepBandValue(0.5, 1, 0.25), 0.75)
  assert.equal(stepBandValue(0.5, -1, 0.5), 0)
  assert.equal(snapBandValue(102, 1, 0, 100), 100)
  assert.equal(stepBandValue(100, 1, 1, 0, 100), 100)
  assert.equal(resizeBandWidth(1, -0.24), 1.2)
  assert.equal(resizeBandWidth(1, 1), 0.1)
  assert.equal(wheelStepDirection(-1, false, false), 1)
  assert.equal(wheelStepDirection(1, false, false), -1)
  assert.equal(wheelStepDirection(0, false, false), 0)
  assert.equal(wheelStepDirection(-1, true, false), 0)
  assert.equal(wheelStepDirection(-1, false, true), 0)
})

test("graph handles choose readable text for user colors", () => {
  assert.equal(contrastTextColor("#ffffff"), "#111827")
  assert.equal(contrastTextColor("#facc15"), "#111827")
  assert.equal(contrastTextColor("#1e3a8a"), "#ffffff")
})

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
  const selectedId = bandId(setup.bands[1])
  const edited = updateBand(setup, 1, { stop: -2, color: "#123456" })

  assert.equal(setup.bands[0].stop, -1)
  assert.deepEqual(edited.bands.map((band) => band.stop), [-2, -1])
  assert.equal(edited.bands[0].color, "#123456")
  assert.equal(bandId(edited.bands[0]), selectedId)
})

test("fill boundaries cannot cross or reorder their colors", () => {
  const fill = {
    ...setup,
    fill_mode: true,
    bands: [
      { stop: -2, width: 0, color: "#111111" },
      { stop: -1, width: 0, color: "#222222" },
      { stop: 2, width: 0, color: "#333333" },
    ],
  }

  const edited = updateFillBoundary(fill, 0, 4, 0.25)
  assert.deepEqual(edited.bands.map((band) => band.color), ["#111111", "#222222", "#333333"])
  assert.deepEqual(edited.bands.map((band) => band.stop), [-1.25, -1, 2])
  assert.equal(updateFillBoundary(fill, 2, 10, 0.25), fill)
})

test("custom color picker converts between hex and HSV", () => {
  assert.deepEqual(hexToHsv("#ff0000"), { hue: 0, saturation: 1, value: 1 })
  assert.equal(hsvToHex(120, 1, 1), "#00ff00")
  assert.equal(hsvToHex(240, 1, 1), "#0000ff")
  assert.equal(hsvToHex(360, 1, 1), "#ff0000")
  assert.equal(hsvToHex(-120, 2, -1), "#000000")
  const sample = "#7c3aed"
  const hsv = hexToHsv(sample)
  assert.equal(hsvToHex(hsv.hue, hsv.saturation, hsv.value), sample)
})

test("fill boundaries cannot cross or reorder their colors", () => {
  const fill = {
    ...setup,
    fill_mode: true,
    bands: [
      { stop: -2, width: 0, color: "#111111" },
      { stop: -1, width: 0, color: "#222222" },
      { stop: 2, width: 0, color: "#333333" },
    ],
  }

  const edited = updateFillBoundary(fill, 0, 4, 0.25)
  assert.deepEqual(edited.bands.map((band) => band.color), ["#111111", "#222222", "#333333"])
  assert.deepEqual(edited.bands.map((band) => band.stop), [-1.25, -1, 2])
  assert.equal(updateFillBoundary(fill, 2, 10, 0.25), fill)
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

test("new bands use open positions and unused palette colors", () => {
  const palette = [
    { name: "red-500", hex: "#ef4444" },
    { name: "amber-500", hex: "#f59e0b" },
    { name: "lime-500", hex: "#84cc16" },
    { name: "cyan-500", hex: "#06b6d4" },
  ]
  const bands = [{ stop: 0, width: 0.3, color: palette[0].hex }]

  for (let index = 0; index < 3; index++) {
    const band = createBand(bands, "stops", palette)
    assert.ok(band)
    bands.push(band)
  }

  assert.deepEqual(bands.map(({ stop }) => stop), [0, 1, -1, 2])
  assert.equal(new Set(bands.map(({ color }) => color)).size, 4)
  assert.ok(bands.every((band, index) => bands.slice(index + 1).every(
    (other) => Math.abs(band.stop - other.stop) >= band.width + other.width,
  )))
})

test("new IRE bands stay bounded and refuse an impossible placement", () => {
  const palette = [{ name: "red-500", hex: "#ef4444" }]
  assert.equal(createBand([{ stop: 50, width: 60, color: "#000000" }], "ire", palette), undefined)

  const band = createBand([{ stop: 50, width: 2, color: "#000000" }], "ire", palette)
  assert.equal(band.stop, 55)
  assert.ok(band.stop >= 0 && band.stop <= 100)
})

test("new band colors cycle after every palette color has been used", () => {
  const palette = [
    { name: "red-500", hex: "#ef4444" },
    { name: "blue-500", hex: "#3b82f6" },
  ]
  const bands = [
    { stop: -1, width: 0.3, color: palette[0].hex },
    { stop: 1, width: 0.3, color: palette[1].hex },
  ]

  assert.equal(createBand(bands, "stops", palette).color, palette[0].hex)
  bands.push(createBand(bands, "stops", palette))
  assert.equal(createBand(bands, "stops", palette).color, palette[1].hex)
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
