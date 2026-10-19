import { Data, Effect, Exit } from "effect"
import { exportSetup, importSetup, type Setup } from "./editor.ts"
import { decodeSetup } from "./setupSchema.ts"
import { exportSetup, importSetup } from "./editor.ts"

export type SetupPreset = { name: string; setup: Setup }

const storageKey = "lut-builder.named-setups.v1"
const sessionKey = "lut-builder.workspace-session.v1"

export class SetupStorageError extends Data.TaggedError("SetupStorageError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export function readWorkspaceSession(storage: () => Pick<Storage, "getItem">): Effect.Effect<Setup | null, SetupStorageError> {
  return Effect.try({
    try: () => storage().getItem(sessionKey),
    catch: (cause) => new SetupStorageError({ message: "Could not read your last session. Export your setup file to keep a backup; browser storage may be unavailable.", cause }),
  }).pipe(Effect.flatMap((raw) => raw === null ? Effect.succeed(null) : Effect.tryPromise({
    try: (signal) => importSetup(raw, (candidate) => Effect.runPromise(decodeSetup(candidate), { signal })),
    catch: (cause) => new SetupStorageError({ message: "Your saved session could not be recovered. Download its backup before replacing it, or import a setup file.", cause }),
  })))
}

export function writeWorkspaceSession(storage: () => Pick<Storage, "setItem">, setup: Setup): Effect.Effect<void, SetupStorageError> {
  return decodeSetup(setup).pipe(Effect.mapError((cause) => new SetupStorageError({ message: "Session not saved while setup values are invalid. Correct the values or export your setup file.", cause })), Effect.flatMap((validated) => Effect.try({
    try: () => storage().setItem(sessionKey, exportSetup(validated)),
    catch: (cause) => new SetupStorageError({ message: "Could not save your session on this device. Export your setup file to keep a copy, then free browser storage and retry.", cause }),
  })))
}

export function workspaceSessionBackup(storage: () => Pick<Storage, "getItem">): Effect.Effect<string | null, SetupStorageError> {
  return Effect.try({
    try: () => storage().getItem(sessionKey),
    catch: (cause) => new SetupStorageError({ message: "Could not read the saved session backup. Browser storage may be unavailable.", cause }),
  })
}

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
