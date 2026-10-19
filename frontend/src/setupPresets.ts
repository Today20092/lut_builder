import type { Setup } from "./editor.ts"

export type SetupPreset = { name: string; setup: Setup }

const storageKey = "lut-builder.named-setups.v1"

export function readSetupPresets(storage: Pick<Storage, "getItem">): SetupPreset[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter((item): item is SetupPreset =>
      item && typeof item.name === "string" && item.name.trim() !== "" && item.setup && typeof item.setup === "object",
    )
  } catch {
    return []
  }
}

export function saveSetupPreset(storage: Pick<Storage, "setItem">, presets: SetupPreset[], name: string, setup: Setup) {
  const normalized = name.trim()
  if (!normalized) throw new Error("Enter a name for this preset.")
  const next = [...presets.filter((preset) => preset.name.toLocaleLowerCase() !== normalized.toLocaleLowerCase()), { name: normalized, setup }]
  storage.setItem(storageKey, JSON.stringify(next))
  return next
}

export function deleteSetupPreset(storage: Pick<Storage, "setItem">, presets: SetupPreset[], name: string) {
  const next = presets.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase())
  storage.setItem(storageKey, JSON.stringify(next))
  return next
}
