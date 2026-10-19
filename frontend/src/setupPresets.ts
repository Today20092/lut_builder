import { Data, Effect, Exit } from "effect"
import type { Setup } from "./editor.ts"
import { decodeSetup } from "./setupSchema.ts"

export type SetupPreset = { name: string; setup: Setup }

const storageKey = "lut-builder.named-setups.v1"

export class SetupStorageError extends Data.TaggedError("SetupStorageError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export function readSetupPresets(storage: () => Pick<Storage, "getItem">): Effect.Effect<SetupPreset[], SetupStorageError> {
  return Effect.try({
    try: () => {
      const value: unknown = JSON.parse(storage().getItem(storageKey) ?? "[]")
      if (!Array.isArray(value)) return []
      return value.flatMap((item): SetupPreset[] => {
        if (!item || typeof item.name !== "string" || !item.name.trim()) return []
        const decoded = Effect.runSyncExit(decodeSetup(item.setup))
        return Exit.isSuccess(decoded) ? [{ name: item.name, setup: decoded.value }] : []
      })
    },
    catch: (cause) => new SetupStorageError({
      message: "Could not read saved setups. Browser storage may be unavailable.",
      cause,
    }),
  }).pipe(Effect.catchTag("SetupStorageError", (error) =>
    error.cause instanceof SyntaxError ? Effect.succeed([]) : Effect.fail(error),
  ))
}

export function saveSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string, setup: Setup): Effect.Effect<SetupPreset[], SetupStorageError> {
  const normalized = name.trim()
  if (!normalized) return Effect.fail(new SetupStorageError({ message: "Enter a name for this preset.", cause: null }))
  const next = [...presets.filter((preset) => preset.name.toLocaleLowerCase() !== normalized.toLocaleLowerCase()), { name: normalized, setup }]
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, JSON.stringify(next))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not save this preset. Browser storage may be unavailable.", cause }),
  })
}

export function deleteSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string): Effect.Effect<SetupPreset[], SetupStorageError> {
  const next = presets.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase())
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, JSON.stringify(next))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not update browser storage. Export your setup as JSON to keep a copy.", cause }),
  })
}
