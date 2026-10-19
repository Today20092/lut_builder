import { Data, Effect, Exit } from "effect"
import type { Setup } from "./editor.ts"
import { decodeSetup } from "./setupSchema.ts"
import { exportSetup, importSetup } from "./editor.ts"

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
      if (Array.isArray(value)) return value
      if (value && typeof value === "object" && "version" in value && value.version === 2 && "presets" in value && Array.isArray(value.presets)) return value.presets
      throw new Error("Saved setups use an unsupported format. Export a backup before replacing them.")
    },
    catch: (cause) => new SetupStorageError({
      message: "Could not read saved setups. Browser storage may be unavailable.",
      cause,
    }),
  }).pipe(Effect.flatMap(items => Effect.tryPromise({
    try: async () => {
      const presets: SetupPreset[] = []
      for (const item of items) {
        if (!item || typeof item.name !== "string" || !item.name.trim()) continue
        const decoded = await Effect.runPromiseExit(item.setup?.version === undefined
          ? decodeSetup(item.setup)
          : Effect.tryPromise({try:()=>importSetup(JSON.stringify(item.setup),candidate=>Effect.runPromise(decodeSetup(candidate))),catch:cause=>cause}))
        if (Exit.isSuccess(decoded)) presets.push({ name: item.name, setup: decoded.value })
        else if (item.setup?.imported_lut !== undefined || item.setup?.version === 3) throw new Error(`Saved setup “${item.name}” has a missing or damaged imported look. Reattach the original .cube or import a portable backup.`)
      }
      return presets
    },
    catch: cause => new SetupStorageError({message: cause instanceof Error ? cause.message : "Could not validate saved setups.",cause}),
  })), Effect.catchTag("SetupStorageError", (error) =>
    error.cause instanceof SyntaxError ? Effect.succeed([]) : Effect.fail(error),
  ))
}

export function saveSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string, setup: Setup): Effect.Effect<SetupPreset[], SetupStorageError> {
  const normalized = name.trim()
  if (!normalized) return Effect.fail(new SetupStorageError({ message: "Enter a name for this preset.", cause: null }))
  const next = [...presets.filter((preset) => preset.name.toLocaleLowerCase() !== normalized.toLocaleLowerCase()), { name: normalized, setup }]
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, JSON.stringify({version:2,presets:next.map(preset=>({name:preset.name,setup:JSON.parse(exportSetup(preset.setup))}))}))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not save this preset. Browser storage may be unavailable. Export setup JSON to keep a portable backup.", cause }),
  })
}

export function deleteSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string): Effect.Effect<SetupPreset[], SetupStorageError> {
  const next = presets.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase())
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, JSON.stringify({version:2,presets:next.map(preset=>({name:preset.name,setup:JSON.parse(exportSetup(preset.setup))}))}))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not update browser storage. Export your setup as JSON to keep a copy.", cause }),
  })
}
