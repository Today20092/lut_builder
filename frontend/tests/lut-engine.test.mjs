import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { cubeFilename, generateCube } from "../src/lutEngine.ts"
import { cameraGray } from "../src/cameraReference.ts"
import { sourceLumaWeights } from "../src/lutColorData.ts"

const pythonReference = JSON.parse(await readFile(new URL("./fixtures/lut-engine-python-reference.json", import.meta.url), "utf8"))

const setup = {
  profile: "Sony S-Log3",
  target: "Rec.709",
  cube_size: 17,
  bands: [],
  band_mode: "stops",
  fill_mode: false,
  low_signal_warning: false,
  low_signal_hex: "",
  high_signal_warning: false,
  high_signal_hex: "",
  monochrome: false,
  legal_range: false,
  output: "reference.cube",
}

function cubeRows(cube) {
  const lines = cube.trimEnd().split("\n")
  const sizeLine = lines.findIndex((line) => line.startsWith("LUT_3D_SIZE "))
  assert.notEqual(sizeLine, -1)
  return lines.slice(sizeLine + 1).map((line) => line.trim()).filter((line) => /^[-+\d.]/.test(line))
}

function row(rows, size, red, green, blue) {
  return rows[blue * size ** 2 + green * size + red]
}

function assertRowNear(actual, expected, message) {
  const values = actual.split(/\s+/).map(Number)
  const reference = expected.split(/\s+/).map(Number)
  assert.equal(values.length, 3)
  assert.ok(values.every((value, index) => Math.abs(value - reference[index]) <= 0.000001), `${message}: ${actual} vs ${expected}`)
}

test("browser engine matches Python cube nodes and R-fastest serialization", async () => {
  const cube = await generateCube(setup)
  const rows = cubeRows(cube)

  assert.match(cube, /^TITLE "Sony S-Log3 to Rec\.709 Custom Assist"/)
  assert.equal(rows.length, 17 ** 3)
  assert.equal(row(rows, 17, 0, 0, 0), "0.0000000 0.0000000 0.0000000")
  assert.equal(row(rows, 17, 8, 8, 8), "0.6410198 0.6410198 0.6410198")
  assert.equal(row(rows, 17, 16, 16, 16), "1.0000000 1.0000000 1.0000000")
  assert.equal(row(rows, 17, 16, 8, 0), "1.0000000 0.0000000 0.0000000")
  assert.equal(row(rows, 17, 0, 8, 16), "0.0000000 0.0000000 1.0000000")
})

test("browser engine rejects unsupported cube sizes", async () => {
  await assert.rejects(() => generateCube({ ...setup, cube_size: 32 }), /cube_size/)
  await assert.rejects(() => generateCube({ ...setup, target: "toString" }), /unknown target/)
})

test("generation reports progress and can be cancelled between blue planes", async () => {
  const controller = new AbortController()
  const progress = []
  await assert.rejects(
    () => generateCube(setup, { signal: controller.signal, onProgress: (value) => { progress.push(value); controller.abort() } }),
    /Generation cancelled/,
  )
  assert.deepEqual(progress, [1 / 17])
})

test("cube filenames discard directories and unsafe characters", () => {
  assert.equal(cubeFilename("C:\\Users\\me\\Look Dev!!.cube"), "Look_Dev.cube")
  assert.equal(cubeFilename("../../"), "lut.cube")
})

test("all supported profiles and output gamuts match Python reference nodes", async () => {
  for (const [profileTarget, expected] of Object.entries(pythonReference.cases)) {
    const [profile, target] = profileTarget.split("|")
    const cube = await generateCube({ ...setup, profile, target })
    const rows = cubeRows(cube)
    for (const [coordinate, index] of Object.entries(pythonReference.coordinates)) {
      assertRowNear(rows[index], expected[coordinate], `${profile} / ${target} at ${coordinate}`)
    }
  }
})

test("Stops, IRE, Fill, warning priority, and legal Rec.2020 match Python references", async () => {
  for (const [name, reference] of Object.entries(pythonReference.behavior)) {
    const current = { ...setup, ...reference.setup }
    const rows = cubeRows(await generateCube(current))
    for (const [coordinate, expected] of Object.entries(reference.samples)) {
      const [red, green, blue] = coordinate.slice(1, -1).split(",").map(Number)
      assertRowNear(row(rows, 17, red, green, blue), expected, `${name} at ${coordinate}`)
    }
  }
})

test("browser engine emits supported cube sizes", async () => {
  for (const size of [17, 33, 65]) {
    const cube = await generateCube({ ...setup, cube_size: size })
    assert.match(cube, new RegExp(`^TITLE .*\\n(?:# .*\\n)*LUT_3D_SIZE ${size}\\n`))
    assert.equal(cubeRows(cube).length, size ** 3)
  }
})

test("camera-log IRE bands measure encoded source luma independently of output settings", async () => {
  for (const [profile, reference] of Object.entries(cameraGray)) {
    for (const target of ["Rec.709", "Rec.2020"]) {
      const current = { ...setup, profile, target, band_mode: "ire", ire_basis: "camera", monochrome: true, legal_range: target === "Rec.2020" }
      const baseline = cubeRows(await generateCube(current))
      const rows = cubeRows(await generateCube({ ...current, bands: [{ stop: reference, width: 3, color: "#ffffff" }] }))
      const weights = sourceLumaWeights[profile]
      const white = current.legal_range ? 940 / 1023 : 1
      let covered = 0
      for (let b = 0; b < 17; b++) for (let g = 0; g < 17; g++) for (let r = 0; r < 17; r++) {
        const index = b * 289 + g * 17 + r
        const value = (r * weights[0] + g * weights[1] + b * weights[2]) / 16 * 100
        if (Math.abs(value - reference) <= 3) {
          covered++
          // The published sRGB-to-target matrices round white by up to 0.00003.
          assert.ok(rows[index].split(/\s+/).map(Number).every((channel) => Math.abs(channel - white) < 3e-5))
        } else assert.equal(rows[index], baseline[index])
      }
      assert.ok(covered > 0)
    }
  }
})
