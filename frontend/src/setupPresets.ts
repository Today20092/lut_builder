import { Data, Effect, Schema } from "effect"
import { exportSetup, importSetup, parseSetupImport, type Setup } from "./editor.ts"
import { decodeSetup } from "./setupSchema.ts"

export type SetupPreset = { name: string; setup: Setup }

const storageKey = "lut-builder.named-setups.v1"
const sessionKey = "lut-builder.workspace-session.v1"
const PresetEntry = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/\S/)),
  setup: Schema.Unknown,
})
const PresetCollection = Schema.Union([
  Schema.Array(PresetEntry),
  Schema.Struct({ version: Schema.Literal(2), presets: Schema.Array(PresetEntry) }),
])

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
      const decoded = Schema.decodeUnknownSync(PresetCollection)(value)
      return "presets" in decoded ? decoded.presets : decoded
    },
    catch: (cause) => new SetupStorageError({
      message: "Could not read saved setups. Browser storage may be unavailable or damaged. Download a backup before replacing the saved library.",
      cause,
    }),
  }).pipe(
    Effect.flatMap(items => Effect.forEach(items, item =>
      Effect.try({
        try: () => {
          const candidate = item.setup
          return candidate && typeof candidate === "object" && "version" in candidate
            ? parseSetupImport(JSON.stringify(candidate)) : candidate
        },
        catch: cause => cause,
      }).pipe(
        Effect.flatMap(decodeSetup),
        Effect.map(setup => ({ name: item.name, setup })),
        Effect.mapError(cause => new SetupStorageError({
          message: `Saved setup “${item.name}” is damaged. Reattach its original .cube or import a portable backup. Download the saved library before replacing it.`,
          cause,
        })),
      ),
    )),
  )
}

export function setupPresetsBackup(storage: () => Pick<Storage, "getItem">): Effect.Effect<string | null, SetupStorageError> {
  return Effect.try({ try: () => storage().getItem(storageKey), catch: cause => new SetupStorageError({ message: "Could not read the saved library backup.", cause }) })
}

function serializePresets(presets: SetupPreset[]) {
  return JSON.stringify({ version: 2, presets: presets.map(preset => ({ name: preset.name, setup: JSON.parse(exportSetup(preset.setup)) })) })
}

export function saveSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string, setup: Setup): Effect.Effect<SetupPreset[], SetupStorageError> {
  const normalized = name.trim()
  if (!normalized) return Effect.fail(new SetupStorageError({ message: "Enter a name for this preset.", cause: null }))
  const next = [...presets.filter((preset) => preset.name.toLocaleLowerCase() !== normalized.toLocaleLowerCase()), { name: normalized, setup }]
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, serializePresets(next))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not save this preset. Browser storage may be unavailable. Export setup JSON to keep a portable backup.", cause }),
  })
}

export function deleteSetupPreset(storage: () => Pick<Storage, "setItem">, presets: SetupPreset[], name: string): Effect.Effect<SetupPreset[], SetupStorageError> {
  const next = presets.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase())
  return Effect.try({
    try: () => {
      storage().setItem(storageKey, serializePresets(next))
      return next
    },
    catch: (cause) => new SetupStorageError({ message: "Could not update browser storage. Export your setup as JSON to keep a copy.", cause }),
  })
}
