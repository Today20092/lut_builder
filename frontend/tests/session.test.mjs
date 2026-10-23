import assert from "node:assert/strict"
import test from "node:test"
import { Effect } from "effect"
import { readWorkspaceSession, writeWorkspaceSession } from "../src/setupPresets.ts"

const setup = {
  profile: "Sony S-Log3", target: "Rec.709", cube_size: 33, bands: [{ stop: 0, width: 0.3, color: "#22c55e" }], band_mode: "stops",
  fill_mode: false, low_signal_warning: false, low_signal_hex: "#5b21b6", high_signal_warning: false,
  high_signal_hex: "#dc2626", monochrome: true, legal_range: false, output: "session.cube",
}

test("last workspace session round-trips a validated setup without touching named presets", async () => {
  const values = new Map()
  const storage = () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
  assert.equal(await Effect.runPromise(readWorkspaceSession(storage)), null)
  await Effect.runPromise(writeWorkspaceSession(storage, setup))
  assert.deepEqual(await Effect.runPromise(readWorkspaceSession(storage)), setup)
  assert.equal(values.size, 1)
  assert.match([...values.keys()][0], /session/)
})

test("unreadable or outdated sessions are preserved for recovery and storage failures explain export", async () => {
  for (const raw of ["{broken", JSON.stringify({ version: 99, setup }), JSON.stringify({ version: 1, setup: { ...setup, cube_size: 32 } })]) {
    let writes = 0
    const storage = () => ({ getItem: () => raw, setItem: () => { writes++ } })
    await assert.rejects(Effect.runPromise(readWorkspaceSession(storage)), /session.*(export|recover|backup)/i)
    assert.equal(writes, 0)
  }
  await assert.rejects(Effect.runPromise(writeWorkspaceSession(() => ({ setItem() { throw new Error("quota") } }), setup)), /export.*setup/i)
})
