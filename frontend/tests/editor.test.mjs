import assert from "node:assert/strict"
import test from "node:test"

import {
  applyColorPreset,
  applyBandPreset,
  applyFillPreset,
  bandId,
  changeMode,
  contrastTextColor,
  createBand,
  createEditorState,
  exportSetup,
  filterPalette,
  hexToHsv,
  hsvToHex,
  hexToOklch,
  oklchToHex,
  sampleOklabRamp,
  exposureReferenceValue,
  importSetup,
  resizeBandWidth,
  removeBand,
  reduceEditor,
  snapBandValue,
  stepBandValue,
  updateBand,
  updateFillBoundary,
} from "../src/editor.ts"

const palette = [
  "violet-800", "blue-600", "sky-400", "teal-400", "green-500",
  "lime-400", "yellow-400", "orange-500", "red-600",
].map((name, index) => ({
  name,
  hex: ["#5b21b6", "#2563eb", "#38bdf8", "#2dd4bf", "#22c55e", "#a3e635", "#facc15", "#f97316", "#dc2626"][index],
}))

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

test("a band drag keeps selection through reordering and undoes as one edit", () => {
  let state = createEditorState(setup)
  state = reduceEditor(state, { type: "begin" })
  state = reduceEditor(state, {
    type: "edit", edit: (current) => updateBand(current, 0, { stop: 2 }),
  })
  assert.equal(state.selection, 1)
  assert.equal(state.setup.bands[state.selection].color, "#ef4444")
  state = reduceEditor(state, {
    type: "edit", edit: (current) => updateBand(current, 1, { stop: 3 }),
  })
  state = reduceEditor(state, { type: "end" })
  state = reduceEditor(state, { type: "patch", changes: { output: "later.cube", monochrome: false } })
  state = reduceEditor(state, {
    type: "edit", edit: (current) => updateBand(current, 1, { stop: 3 }),
  })
  state = reduceEditor(state, { type: "undo" })
  assert.deepEqual(state.setup.bands, setup.bands)
  assert.equal(state.selection, 0)
  assert.equal(state.setup.output, "later.cube")
  assert.equal(state.setup.monochrome, false)
  assert.equal(state.undo, null)
  assert.equal(reduceEditor(state, { type: "undo" }), state)
})

test("adding selects the new band, removing clamps selection, and importing clears recovery", () => {
  const band = { stop: 0, width: 0.3, color: "#0000ff" }
  let state = reduceEditor(createEditorState(setup), { type: "select", selection: 1 })
  state = reduceEditor(state, { type: "add", band })
  assert.equal(state.selection, 1)
  assert.equal(state.setup.bands[1], band)
  state = reduceEditor(state, { type: "undo" })
  assert.deepEqual(state.setup.bands, setup.bands)
  assert.equal(state.selection, 1)
  state = reduceEditor(state, { type: "edit", edit: (current) => removeBand(current, 1) })
  assert.equal(state.selection, 0)
  state = reduceEditor(state, { type: "edit", edit: (current) => removeBand(current, 0) })
  assert.equal(state.selection, 0)
  assert.deepEqual(state.setup.bands, [])
  const imported = { ...setup, output: "imported.cube" }
  state = reduceEditor(state, { type: "import", setup: imported })
  assert.equal(state.setup, imported)
  assert.equal(state.selection, 0)
  assert.equal(state.undo, null)
})

test("direct manipulation and discrete movement share the selected increment", () => {
  assert.equal(snapBandValue(0.62, 0.25), 0.5)
  assert.equal(stepBandValue(0.5, 1, 0.25), 0.75)
  assert.equal(stepBandValue(0.5, -1, 0.5), 0)
  assert.equal(snapBandValue(102, 1, 0, 100), 100)
  assert.equal(stepBandValue(100, 1, 1, 0, 100), 100)
  assert.equal(resizeBandWidth(1, -0.24), 1.2)
  assert.equal(resizeBandWidth(1, 1), 0.1)
})

test("color presets recolor every band by exposure or ordered ramp", () => {
  const bands = [-4, -3.5, 0, 4].map((stop) => ({ stop, width: 0.3, color: "#ffffff" }))
  const current = { ...setup, bands }

  assert.deepEqual(
    applyColorPreset(current, palette, "false-color").bands.map(({ color }) => color),
    ["#5b21b6", "#5b21b6", "#22c55e", "#dc2626"],
  )
  const gradient = applyColorPreset(current, palette, "gradient").bands.map(({ color }) => color)
  assert.equal(gradient[0], "#5b21b6")
  assert.notEqual(gradient[1], gradient[0])
  assert.notEqual(gradient[1], palette[1].hex)
  assert.equal(gradient.at(-1), "#dc2626")

  const fullRamp = applyColorPreset(
    { ...setup, bands: Array.from({ length: 15 }, (_, index) => ({ stop: index - 7, width: 0.3, color: "#ffffff" })) },
    palette,
    "gradient",
  ).bands.map(({ color }) => color)
  assert.equal(new Set(fullRamp).size, 15)
})

test("fill presets replace geometry and colors for stops and IRE", () => {
  const standard = applyFillPreset(setup, palette, "standard")
  assert.equal(standard.fill_mode, true)
  assert.equal(standard.monochrome, false)
  assert.deepEqual(standard.bands.slice(0, -1).map(({ stop }) => stop), [-1.25, -0.5, 0.5, 1.25])
  assert.equal(standard.bands.length, 5)

  const detailed = applyFillPreset({ ...setup, band_mode: "ire" }, palette, "detailed")
  assert.deepEqual(detailed.bands.slice(0, -1).map(({ stop }) => stop), [10, 25, 35, 38, 46, 55, 65, 80])
  assert.equal(detailed.bands.length, 9)
})

test("positioned gradient stops agree with applied colors and extend endpoint colors", () => {
  const anchors = ["#2563eb", "#ff0000", "#22c55e"].map((color, index) => ({ ...hexToOklch(color), position: [0.1, 0.25, 0.9][index] }))
  assert.equal(sampleOklabRamp(anchors, 0), "#2563eb")
  assert.equal(sampleOklabRamp(anchors, 0.25), "#ff0000")
  assert.equal(sampleOklabRamp(anchors, 1), "#22c55e")
  const current = { ...setup, bands: [0, 1, 2, 4].map((stop) => ({ stop, width: 0.3, color: "#ffffff" })) }
  const applied = applyColorPreset(current, [], "gradient", anchors, "custom", false)
  assert.deepEqual(applied.bands.map(({ color }) => color), [0, 0.25, 0.5, 1].map((position) => sampleOklabRamp(anchors, position)))
  assert.deepEqual(applied.bands.map(({ stop, width }) => ({ stop, width })), current.bands.map(({ stop, width }) => ({ stop, width })))
})

test("Colorful keeps chroma through complementary colors while Direct can pass through gray", () => {
  const anchors = [{ l: 0.7, c: 0.1, h: 20 }, { l: 0.7, c: 0.1, h: 200 }]
  const direct = hexToOklch(sampleOklabRamp(anchors, 0.5, "direct"))
  const colorful = hexToOklch(sampleOklabRamp(anchors, 0.5, "colorful"))
  assert.ok(direct.c < 0.002)
  assert.ok(colorful.c > 0.08)
  assert.equal(sampleOklabRamp(anchors, 0, "colorful"), oklchToHex(anchors[0]))
  assert.equal(sampleOklabRamp(anchors, 1, "colorful", "longer"), oklchToHex(anchors[1]))
})

test("exposure palettes keep the reference green with asymmetric ranges, IRE, and Fill", () => {
  const anchors = ["#5b21b6", "#2563eb", "#38bdf8", "#22c55e", "#facc15", "#f97316", "#dc2626"].map(hexToOklch)
  const apply = (current) => applyColorPreset(current, [], "gradient", anchors, "custom", false, "colorful", "shorter", "exposure")
  const current = { ...setup, bands: [-5, -2, 0, 1, 2].map((stop) => ({ stop, width: 0.1, color: "#ffffff" })) }
  assert.equal(apply(current).bands[2].color, "#22c55e")
  const extended = { ...current, bands: [{ stop: -20, width: 0.1, color: "#ffffff" }, ...current.bands, { stop: 10, width: 0.1, color: "#ffffff" }] }
  assert.deepEqual(apply(extended).bands.slice(1, -1).map((band) => band.color), apply(current).bands.map((band) => band.color))
  assert.deepEqual(apply(extended).bands.map(({ stop, width }) => ({ stop, width })), extended.bands.map(({ stop, width }) => ({ stop, width })))
  const coveringReference = { ...setup, bands: [{ stop: 0.1, width: 0.3, color: "#ffffff" }] }
  assert.equal(apply(coveringReference).bands[0].color, "#22c55e")
  for (const target of ["Rec.709", "Rec.2020"]) for (const legal_range of [false, true]) {
    const reference = exposureReferenceValue({ band_mode: "ire" })
    assert.ok(Math.abs(reference - 40.900758) < 0.001)
    const ire = { ...setup, target, legal_range, band_mode: "ire", bands: [10, reference, 80].map((stop) => ({ stop, width: 1, color: "#ffffff" })) }
    assert.equal(apply(ire).bands[1].color, "#22c55e")
    assert.equal(apply(ire).bands[2].color, "#dc2626")
    const fill = { ...ire, fill_mode: true, bands: [10, 50, 60].map((stop) => ({ stop, width: 0, color: "#ffffff" })) }
    assert.deepEqual(apply(fill).bands.map((band) => band.color), ["#5b21b6", "#22c55e", "#dc2626"])
    fill.bands[2].stop = 95
    assert.equal(apply(fill).bands[2].color, "#dc2626")
  }
  const fill = { ...setup, fill_mode: true, bands: [-1, 0.5, 4].map((stop) => ({ stop, width: 0, color: "#ffffff" })) }
  assert.deepEqual(apply(fill).bands.map((band) => band.color), ["#5b21b6", "#22c55e", "#dc2626"])
})

test("Colorful hue paths wrap around zero and neutral endpoints inherit the colored hue", () => {
  const anchors = [{ l: 0.7, c: 0.1, h: 350 }, { l: 0.7, c: 0.1, h: 10 }]
  assert.equal(sampleOklabRamp(anchors, 0.5, "colorful", "shorter"), oklchToHex({ l: 0.7, c: 0.1, h: 0 }))
  assert.equal(sampleOklabRamp(anchors, 0.5, "colorful", "longer"), oklchToHex({ l: 0.7, c: 0.1, h: 180 }))
  assert.equal(sampleOklabRamp(anchors, 0.5, "direct", "shorter"), sampleOklabRamp(anchors, 0.5, "direct", "longer"))
  const neutral = [{ l: 0.7, c: 0, h: 300 }, { l: 0.7, c: 0.1, h: 90 }]
  for (const path of ["shorter", "longer"]) assert.equal(sampleOklabRamp(neutral, 0.5, "colorful", path), oklchToHex({ l: 0.7, c: 0.05, h: 90 }))
  const current = { ...setup, bands: [0, 1, 2].map((stop) => ({ stop, width: 0.3, color: "#ffffff" })) }
  for (const blend of ["direct", "colorful"]) for (const path of ["shorter", "longer"]) {
    assert.equal(applyColorPreset(current, [], "gradient", anchors, "custom", false, blend, path).bands[1].color, sampleOklabRamp(anchors, 0.5, blend, path))
  }
})

test("band presets provide useful stops and IRE defaults", () => {
  const stops = applyBandPreset(setup, palette, "standard")
  assert.deepEqual(stops.bands.map(({ stop }) => stop), [-3, -2, -1, 0, 1, 2, 3])
  assert.ok(stops.bands.every(({ width }) => width === 0.3))

  const ire = changeMode(setup, "ire", palette)
  assert.deepEqual(ire.bands.map(({ stop }) => stop), [10, 25, 40, 50, 60, 75, 90])
  assert.ok(ire.bands.every(({ width }) => width === 3))
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

test("removing a band leaves the prior setup unchanged", () => {
  const removed = removeBand(setup, 0)

  assert.deepEqual(removed.bands, [setup.bands[1]])
  assert.equal(setup.bands.length, 2)
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

test("loading a setup clears edit gestures and changes the palette workflow identity", () => {
  const original = createEditorState(setup)
  const dragging = reduceEditor(original, { type: "begin" })
  const loaded = reduceEditor(dragging, { type: "import", setup: { ...setup, target: "Rec.2020" } })
  assert.equal(loaded.gesture, null)
  assert.equal(loaded.undo, null)
  assert.equal(loaded.selection, 0)
  assert.equal(loaded.revision, original.revision + 1)
  assert.equal(loaded.setup.target, "Rec.2020")
})
