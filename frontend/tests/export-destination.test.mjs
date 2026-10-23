import assert from "node:assert/strict"
import test from "node:test"
import { destinationFilename, exportCompatibility } from "../src/exportDestination.ts"

test("S5IIX export checks log input, cube limit and range without restricting other destinations", () => {
  const incompatible = { profile: "Sony S-Log3", cube_size: 65, legal_range: true }
  assert.equal(exportCompatibility(incompatible, "s5iix").length, 3)
  for (const cube_size of [17, 33]) assert.deepEqual(exportCompatibility({ profile: "Panasonic V-Log", cube_size, legal_range: false }, "s5iix"), [])
  for (const destination of ["general", "monitor", "editor"]) assert.deepEqual(exportCompatibility(incompatible, destination), [])
})

test("camera filenames meet SDHC limits without changing general export naming", () => {
  const setup = { profile: "Panasonic V-Log", target: "Rec.709", cube_size: 33, band_mode: "stops", bands: [], output: "My camera look.cube" }
  assert.match(destinationFilename(setup, "s5iix"), /^[a-f0-9]{8}\.cube$/)
  assert.equal(destinationFilename(setup, "general"), "My_camera_look.cube")
  assert.equal(setup.output, "My camera look.cube")
})
