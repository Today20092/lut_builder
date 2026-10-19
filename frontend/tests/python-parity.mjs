import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { generateCube } from "../src/lutEngine.ts"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const fixture = JSON.parse(await readFile(new URL("./fixtures/lut-engine-python-reference.json", import.meta.url), "utf8"))
const setups = Object.keys(fixture.cases).map((profileTarget) => {
  const [profile, target] = profileTarget.split("|")
  return {
    profile,
    target,
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
    output: "parity.cube",
  }
})
for (const reference of Object.values(fixture.behavior)) {
  setups.push({ ...setups[0], ...reference.setup })
}

function cubeRows(cube) {
  const lines = cube.trimEnd().split("\n")
  const sizeLine = lines.findIndex((line) => line.startsWith("LUT_3D_SIZE "))
  assert.notEqual(sizeLine, -1)
  return lines.slice(sizeLine + 1).filter((line) => /^[-+\d.]/.test(line)).map((line) => line.trim().split(/\s+/).map(Number))
}

test("every browser LUT node matches Python across cameras, targets, and diagnostic modes", async () => {
  const python = spawnSync(
    "uv",
    ["run", "--locked", "python", "frontend/tests/python-lut-reference.py"],
    { cwd: repoRoot, input: JSON.stringify(setups), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  )
  assert.equal(python.status, 0, `Python LUT reference generation failed:\n${python.stderr}`)
  const references = JSON.parse(python.stdout)

  for (const [setupIndex, setup] of setups.entries()) {
    const actual = cubeRows(await generateCube(setup))
    const expected = references[setupIndex]
    assert.equal(actual.length, expected.length, `${setup.profile} / ${setup.target}: node count`)
    for (const [nodeIndex, channels] of actual.entries()) {
      assert.equal(channels.length, 3)
      for (const [channelIndex, value] of channels.entries()) {
        assert.ok(
          Math.abs(value - expected[nodeIndex][channelIndex]) <= 0.000001,
          `${setup.profile} / ${setup.target}, node ${nodeIndex}, channel ${channelIndex}: ${value} vs ${expected[nodeIndex][channelIndex]}`,
        )
      }
    }
  }
})
