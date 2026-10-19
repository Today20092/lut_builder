import { Effect, Result } from "effect"
import { createEditorState, importSetup, reduceEditor, type EditorState, type Setup } from "./editor.ts"
import type { PalettePreview } from "./PaletteEditor.tsx"
import { SetupValidationError } from "./setupSchema.ts"

type WorkspaceState = EditorState & {
  previousSetup: Setup | null
  loadStatus: string
  isLoadingSetup: boolean
  request: number | null
  palettePreview: PalettePreview | null
  bandStatus: string
}
type WorkspaceAction = Exclude<Parameters<typeof reduceEditor>[1], { type: "import" }> |
  { type: "load-start"; request: number } |
  { type: "load-commit"; request: number; setup: Setup; message: string } |
  { type: "load-failed"; request: number; message: string } |
  { type: "load-finished"; request: number } |
  { type: "restore-setup" } |
  { type: "load-status" | "band-status"; value: string } |
  { type: "palette-preview"; value: PalettePreview | null }

export function createSetupWorkspace(setup: Setup, loadStatus = ""): WorkspaceState {
  return { ...createEditorState(setup), previousSetup: null, loadStatus, isLoadingSetup: false, request: null, palettePreview: null, bandStatus: "" }
}

function replace(state: WorkspaceState, setup: Setup, previousSetup: Setup | null, loadStatus: string): WorkspaceState {
  return { ...state, ...reduceEditor(state, { type: "import", setup }), previousSetup, loadStatus, request: null, isLoadingSetup: false, palettePreview: null, bandStatus: "" }
}

export function reduceSetupWorkspace(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "load-start": return { ...state, request: action.request, isLoadingSetup: true }
    case "load-commit": return state.request === action.request ? replace(state, action.setup, state.setup, action.message) : state
    case "load-failed": return state.request === action.request ? { ...state, loadStatus: action.message } : state
    case "load-finished": return state.request === action.request ? { ...state, request: null, isLoadingSetup: false } : state
    case "restore-setup": return state.previousSetup ? replace(state, state.previousSetup, null, "Previous setup restored.") : state
    case "load-status": return { ...state, loadStatus: action.value }
    case "band-status": return { ...state, bandStatus: action.value }
    case "palette-preview": return { ...state, palettePreview: action.value }
    default: {
      const editor = reduceEditor(state, action)
      const editedWhileLoading = state.isLoadingSetup && editor.setup !== state.setup
      return { ...state, ...editor, ...(editedWhileLoading ? {
        request: null, isLoadingSetup: false,
        loadStatus: "Setup changed while loading. Your edits were kept; load the setup again to replace them.",
      } : {}) }
    }
  }
}

export function createSetupReplacement<E>(normalize: (input: unknown) => Effect.Effect<Setup, E>, dispatch: (action: WorkspaceAction) => void) {
  let request = 0
  function load<A>(source: Effect.Effect<Setup, A>, message: string) {
    return Effect.gen(function* () {
      const current = ++request
      dispatch({ type: "load-start", request: current })
      yield* Effect.gen(function* () {
        const result = yield* Effect.result(source)
        if (Result.isSuccess(result)) dispatch({ type: "load-commit", request: current, setup: result.success, message })
        else dispatch({ type: "load-failed", request: current, message: result.failure instanceof Error ? result.failure.message : "Could not load this setup." })
      }).pipe(Effect.ensuring(Effect.sync(() => dispatch({ type: "load-finished", request: current }))))
    })
  }
  return {
    file: (file: Pick<File, "name" | "text">) => load(Effect.tryPromise({
      try: () => file.text(),
      catch: (cause) => new SetupValidationError({ message: "Could not read this setup file.", cause }),
    }).pipe(Effect.flatMap((text) => Effect.tryPromise({
      try: (signal) => importSetup(text, (candidate) => Effect.runPromise(normalize(candidate), { signal })),
      catch: (cause) => new SetupValidationError({ message: cause instanceof Error ? cause.message : "Import failed", cause }),
    }))), `Imported ${file.name}. You can restore the setup you were editing.`),
    preset: (preset: { name: string; setup: Setup }) => load(normalize(preset.setup), `Loaded ${preset.name}. You can restore the setup you were editing.`),
    restore: () => dispatch({ type: "restore-setup" }),
  }
}
