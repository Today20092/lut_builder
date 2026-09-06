// One small, runnable check of the prototype's observable editing behavior.
import assert from "node:assert/strict"
import { editedColorPixel, initialBands, initialDraft, moveBand, recolor } from "../src/prototype-state.ts"
const original = initialBands()
const draft = { ...initialDraft, palette: "ocean", brightness: "ascending", intensity: 60 }
const applied = recolor(original, draft)
assert.notDeepEqual(applied.map(b => b.color), original.map(b => b.color))
assert.deepEqual(applied.map(({ stop, width }) => [stop, width]), original.map(({ stop, width }) => [stop, width]))
assert.deepEqual(original, initialBands(), "draft/application must not mutate the previous undo state")
assert.equal(moveBand(original, 0, 0.63)[0].stop, 0.75)
assert.equal(moveBand(original, 0, -100)[0].stop, -7 + original[0].width)
assert.deepEqual(editedColorPixel([118, 118, 118], [{ stop: 0, width: 0.1, color: "#ff0000" }], 1), [255, 0, 0])
assert.deepEqual(editedColorPixel([118, 118, 118], original, 0), [118, 118, 118])
console.log("Prototype check passed: apply preserves geometry, undo state is immutable, movement snaps, and demonstration opacity works.")
