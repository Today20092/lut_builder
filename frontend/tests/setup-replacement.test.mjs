import assert from "node:assert/strict"
import test from "node:test"
import { Effect } from "effect"
import { createSetupReplacement, createSetupWorkspace, reduceSetupWorkspace } from "../src/setupReplacement.ts"
import { decodeSetup } from "../src/setupSchema.ts"
const browserSetup = {
  profile: "Sony S-Log3", target: "Rec.709", cube_size: 17,
  bands: [{ stop: 0, width: 0.3, color: "#22c55e" }], band_mode: "stops",
  fill_mode: false, low_signal_warning: false, low_signal_hex: "#5b21b6",
  high_signal_warning: false, high_signal_hex: "#dc2626", monochrome: true,
  legal_range: false, output: "test.cube",
}

function workspace(normalize = decodeSetup) {
  let state = createSetupWorkspace(browserSetup)
  const dispatch = (action) => { state = reduceSetupWorkspace(state, action) }
  return { get state() { return state }, dispatch, replacement: createSetupReplacement(normalize, dispatch) }
}

test("file replacement captures recovery and clears band edit and palette state", async () => {
  const workspaceState = workspace()
  workspaceState.dispatch({ type: "select", selection: 2 })
  workspaceState.dispatch({ type: "begin" })
  workspaceState.dispatch({ type: "edit", edit: (setup) => ({ ...setup, bands: [] }) })
  workspaceState.dispatch({ type: "palette-preview", value: { setup: browserSetup, label: "Draft", valid: true, apply() {}, cancel() {} } })
  workspaceState.dispatch({ type: "band-status", value: "Old feedback" })
  const previous = workspaceState.state.setup
  await Effect.runPromise(workspaceState.replacement.file({ name: "test.json", text: async () => JSON.stringify({ version: 1, ...browserSetup, cube_size: 33 }) }))
  const state = workspaceState.state
  assert.equal(state.setup.cube_size, 33)
  assert.equal(state.previousSetup, previous)
  assert.equal(state.selection, 0)
  assert.equal(state.undo, null)
  assert.equal(state.gesture, null)
  assert.equal(state.palettePreview, null)
  assert.equal(state.bandStatus, "")
  assert.equal(state.revision, 1)
  assert.equal(state.isLoadingSetup, false)
  assert.match(state.loadStatus, /Imported test.json/)
})

test("editing while a setup loads keeps the edits and rejects the late replacement", async () => {
  let finish
  const workspaceState = workspace()
  const loading = Effect.runPromise(workspaceState.replacement.file({ name: "late.json", text: () => new Promise((resolve) => { finish = resolve }) }))
  assert.equal(workspaceState.state.isLoadingSetup, true)
  workspaceState.dispatch({ type: "patch", changes: { output: "edited.cube" } })
  finish(JSON.stringify({ version: 1, ...browserSetup, cube_size: 33 }))
  await loading
  assert.equal(workspaceState.state.setup.output, "edited.cube")
  assert.equal(workspaceState.state.setup.cube_size, 17)
  assert.equal(workspaceState.state.previousSetup, null)
  assert.equal(workspaceState.state.isLoadingSetup, false)
  assert.match(workspaceState.state.loadStatus, /changed while loading/)
})

test("newest load wins across file and preset adapters, including late failures", async () => {
  let finish
  const workspaceState = workspace()
  const first = Effect.runPromise(workspaceState.replacement.file({ name: "late.json", text: () => new Promise((resolve) => { finish = resolve }) }))
  await Effect.runPromise(workspaceState.replacement.preset({ name: "Interview", setup: { ...browserSetup, cube_size: 65 } }))
  finish("invalid json")
  await first
  assert.equal(workspaceState.state.setup.cube_size, 65)
  assert.equal(workspaceState.state.previousSetup, browserSetup)
  assert.equal(workspaceState.state.isLoadingSetup, false)
  assert.match(workspaceState.state.loadStatus, /Loaded Interview/)
})

test("a failed winning load never lets an older success replace the working setup", async () => {
  let finish
  const workspaceState = workspace()
  const first = Effect.runPromise(workspaceState.replacement.file({ name: "late.json", text: () => new Promise((resolve) => { finish = resolve }) }))
  await Effect.runPromise(workspaceState.replacement.file({ name: "bad.json", text: async () => "{" }))
  finish(JSON.stringify({ version: 1, ...browserSetup, cube_size: 33 }))
  await first
  assert.equal(workspaceState.state.setup, browserSetup)
  assert.equal(workspaceState.state.previousSetup, null)
  assert.match(workspaceState.state.loadStatus, /valid JSON/)
})

test("failed input preserves recovery and restoration stays distinct from band undo", async () => {
  const workspaceState = workspace()
  await Effect.runPromise(workspaceState.replacement.preset({ name: "Interview", setup: { ...browserSetup, cube_size: 33 } }))
  workspaceState.dispatch({ type: "edit", edit: (setup) => ({ ...setup, bands: [] }) })
  workspaceState.dispatch({ type: "patch", changes: { output: "edited.cube" } })
  workspaceState.dispatch({ type: "undo" })
  assert.equal(workspaceState.state.setup.output, "edited.cube")
  assert.equal(workspaceState.state.setup.cube_size, 33)
  assert.equal(workspaceState.state.setup.bands.length, 1)
  await Effect.runPromise(workspaceState.replacement.file({ name: "bad.json", text: async () => "{" }))
  assert.equal(workspaceState.state.previousSetup, browserSetup)
  workspaceState.replacement.restore()
  assert.equal(workspaceState.state.setup, browserSetup)
  assert.equal(workspaceState.state.previousSetup, null)
  assert.equal(workspaceState.state.undo, null)
  assert.equal(workspaceState.state.revision, 2)
  assert.equal(workspaceState.state.loadStatus, "Previous setup restored.")
})

test("restoring invalidates pending loads and interruption releases loading state", async () => {
  let finish
  const workspaceState = workspace()
  await Effect.runPromise(workspaceState.replacement.preset({ name: "Interview", setup: { ...browserSetup, cube_size: 33 } }))
  const loading = Effect.runPromise(workspaceState.replacement.file({ name: "late.json", text: () => new Promise((resolve) => { finish = resolve }) }))
  workspaceState.replacement.restore()
  finish(JSON.stringify({ version: 1, ...browserSetup, cube_size: 65 }))
  await loading
  assert.equal(workspaceState.state.setup, browserSetup)
  assert.equal(workspaceState.state.loadStatus, "Previous setup restored.")
  const controller = new AbortController()
  const cancelled = Effect.runPromise(workspaceState.replacement.file({ name: "cancelled.json", text: () => new Promise(() => {}) }), { signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled)
  assert.equal(workspaceState.state.isLoadingSetup, false)
  assert.equal(workspaceState.state.setup, browserSetup)
})

test("read and normalization failures preserve the working setup and recovery", async () => {
  const workspaceState = workspace()
  await Effect.runPromise(workspaceState.replacement.preset({ name: "Interview", setup: { ...browserSetup, cube_size: 33 } }))
  const current = workspaceState.state.setup
  await Effect.runPromise(workspaceState.replacement.file({ name: "unreadable.json", text: async () => { throw new Error("disk failure") } }))
  assert.match(workspaceState.state.loadStatus, /Could not read this setup file/)
  await Effect.runPromise(workspaceState.replacement.preset({ name: "Broken", setup: { ...browserSetup, cube_size: 32 } }))
  assert.match(workspaceState.state.loadStatus, /cube_size/)
  assert.equal(workspaceState.state.setup, current)
  assert.equal(workspaceState.state.previousSetup, browserSetup)
  assert.equal(workspaceState.state.isLoadingSetup, false)
})
