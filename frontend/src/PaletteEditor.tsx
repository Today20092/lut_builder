import { useState } from "react"
import { Data, Effect, Result, Schema } from "effect"
import { Button } from "@/components/ui/button"
import { applyColorPreset, applyLightnessProfile, hexToOklch, isHexColor, oklchToHex, sampleOklabRamp, vividRampAnchors, type LightnessProfile, type PaletteColor, type Setup } from "./editor"

type Draft = { colors: string[]; brightness: LightnessProfile; intensity: number }
type SavedPalette = Draft & { name: string }
const storageKey = "lut-builder.palettes.v1"
const fieldClass = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const SavedPaletteSchema = Schema.Struct({
  name: Schema.String,
  colors: Schema.Array(Schema.String),
  brightness: Schema.Literals(["custom", "ascending", "even"]),
  intensity: Schema.Finite,
})

function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false
  const draft = value as Draft
  return Array.isArray(draft.colors) && draft.colors.length >= 2 && draft.colors.length <= 32 &&
    draft.colors.every((color) => typeof color === "string" && isHexColor(color)) &&
    ["custom", "ascending", "even"].includes(draft.brightness) &&
    typeof draft.intensity === "number" && Number.isFinite(draft.intensity) && draft.intensity >= 0 && draft.intensity <= 200
}

class PaletteStorageError extends Data.TaggedError("PaletteStorageError")<{
  readonly message: string
  readonly cause: unknown
}> {}

function loadPalettes(): Effect.Effect<{ palettes: SavedPalette[] }, PaletteStorageError> {
  return Effect.try({
    try: () => {
      const value = Schema.decodeUnknownSync(Schema.Array(SavedPaletteSchema))(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"))
      if (value.length > 100 || !value.every((item) => validDraft(item) && item.name.trim() === item.name && item.name.length > 0 && item.name.length <= 80) ||
        new Set(value.map((item) => item.name.toLowerCase())).size !== value.length) throw new Error("Invalid saved palette data")
      return { palettes: value.map((item) => ({ ...item, colors: [...item.colors] })) }
    },
    catch: (cause) => new PaletteStorageError({ message: "Saved palettes could not be read. Your active setup is unchanged. You can keep editing and retry saving.", cause }),
  })
}

function persistPalettes(palettes: SavedPalette[]): Effect.Effect<void, PaletteStorageError> {
  return Effect.try({
    try: () => window.localStorage.setItem(storageKey, JSON.stringify(palettes)),
    catch: (cause) => new PaletteStorageError({ message: "Could not save palettes in this browser. Your draft and active setup are unchanged. Check browser storage and retry.", cause }),
  })
}

export function PaletteEditor({ setup, palette, onApply }: { setup: Setup; palette: PaletteColor[]; onApply: (next: Setup) => void }) {
  const presetColors = vividRampAnchors(palette).map(oklchToHex)
  const colors = presetColors.length >= 2 ? presetColors : ["#2563eb", "#dc2626"]
  const [draft, setDraft] = useState<Draft>({ colors, brightness: "custom", intensity: 100 })
  const [loadedPalettes] = useState(() => Effect.runSync(Effect.result(loadPalettes())))
  const [library, setLibrary] = useState(() => Result.isSuccess(loadedPalettes)
    ? { ...loadedPalettes.success, message: "" }
    : { palettes: [], message: loadedPalettes.failure.message })
  const [selected, setSelected] = useState("")
  const [name, setName] = useState("")
  const [applied, setApplied] = useState<{ draft: string; colors: string } | null>(null)
  const valid = validDraft(draft)
  const anchors = valid ? draft.colors.map(hexToOklch).map((anchor) => ({ ...anchor, c: anchor.c * draft.intensity / 100 })) : []
  const ramp = Array.from({ length: 25 }, (_, index) => sampleOklabRamp(applyLightnessProfile(anchors, draft.brightness), index / 24))
  const bandColors = JSON.stringify(setup.bands.map((band) => band.color))
  const pending = !applied || applied.draft !== JSON.stringify(draft) || applied.colors !== bandColors
  const trimmedName = name.trim()
  const duplicate = library.palettes.some((item) => item.name.toLowerCase() === trimmedName.toLowerCase() && item.name !== selected)
  const nameError = !trimmedName ? "Enter a palette name." : trimmedName.length > 80 ? "Use at most 80 characters." : duplicate ? "That name is already saved. Choose another name or select it to replace." : ""

  function save(action: "new" | "replace" | "rename" | "delete") {
    if (action !== "delete" && (nameError || (action !== "rename" && !valid))) return
    const saved = library.palettes.find((item) => item.name === selected)
    if (action !== "new" && !saved) return
    if (action === "new" && library.palettes.some((item) => item.name.toLowerCase() === trimmedName.toLowerCase())) {
      setLibrary({ ...library, message: "That name is already saved. Use Replace saved palette to update it." })
      return
    }
    const next = action === "new" ? [...library.palettes, { ...draft, name: trimmedName }] :
      action === "delete" ? library.palettes.filter((item) => item.name !== selected) :
        library.palettes.map((item) => item.name !== selected ? item : { ...(action === "rename" ? item : draft), name: trimmedName })
    if (next.length > 100) { setLibrary({ ...library, message: "Up to 100 palettes can be saved. Delete one before saving another." }); return }
    void Effect.runPromise(persistPalettes(next)).then(() => {
      setLibrary({ palettes: next, message: action === "delete" ? "Palette deleted from this browser." : "Palette saved in this browser." })
      setSelected(action === "delete" ? "" : trimmedName)
    }).catch((error: unknown) => setLibrary({ ...library, message: error instanceof Error ? error.message : "Could not save palettes in this browser." }))
  }

  function move(index: number, offset: number) {
    const next = [...draft.colors]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    setDraft({ ...draft, colors: next })
  }

  return <section aria-label="Band colors" className="grid gap-3 border-t pt-4">
    <h3 className="text-sm font-semibold">Recolor all bands</h3>
    <p className="text-sm text-muted-foreground">Change one band using its swatch in the table above. Here you can build a palette for all bands, from low to high exposure.</p>
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium">1. Choose a starting palette</legend>
      {(["Vivid", "Exposure"] as const).map((preset) => <Button key={preset} type="button" variant="outline" aria-pressed={draft.intensity === 100 && draft.brightness === (preset === "Vivid" ? "custom" : "ascending") && JSON.stringify(draft.colors) === JSON.stringify(colors)} onClick={() => setDraft({ colors, brightness: preset === "Vivid" ? "custom" : "ascending", intensity: 100 })}>
        <span aria-hidden="true" className="h-4 w-16 rounded-sm" style={{ background: `linear-gradient(to right, ${applyLightnessProfile(colors.map(hexToOklch), preset === "Vivid" ? "custom" : "ascending").map(oklchToHex).join(",")})` }} />{preset === "Exposure" ? "Dark to light" : preset}
      </Button>)}
    </fieldset>
    <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">2. Customize palette (optional)</summary>
    <div className="mt-3 grid gap-3">
    <p className="text-xs text-muted-foreground">Edit ordered colors from low to high exposure. Brightness progression changes their relative lightness; color intensity changes their saturation.</p>
    <ol className="grid gap-2">
      {draft.colors.map((color, index) => <li key={index} className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">Color {index + 1}
          <input type="color" aria-label={`Anchor ${index + 1} color picker`} className="h-9 w-10 shrink-0" value={isHexColor(color) ? color : "#000000"} onChange={(event) => setDraft({ ...draft, colors: draft.colors.map((item, i) => i === index ? event.target.value : item) })} />
          <input aria-label={`Anchor ${index + 1} hex color`} className={`${fieldClass} max-w-32`} value={color} aria-invalid={!isHexColor(color)} onChange={(event) => setDraft({ ...draft, colors: draft.colors.map((item, i) => i === index ? event.target.value : item) })} />
        </label>
        <Button type="button" variant="outline" aria-label={`Move color ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>Earlier</Button>
        <Button type="button" variant="outline" aria-label={`Move color ${index + 1} later`} disabled={index === draft.colors.length - 1} onClick={() => move(index, 1)}>Later</Button>
        <Button type="button" variant="ghost" aria-label={`Remove color ${index + 1}`} disabled={draft.colors.length <= 2} onClick={() => setDraft({ ...draft, colors: draft.colors.filter((_, i) => i !== index) })}>Remove</Button>
      </li>)}
    </ol>
    <Button type="button" variant="outline" className="justify-self-start" disabled={draft.colors.length >= 32} onClick={() => setDraft({ ...draft, colors: [...draft.colors, "#ffffff"] })}>Add color</Button>
    <p className="text-xs text-muted-foreground">Use 2 to 32 colors. Enter six-digit hex colors, such as #2563eb.</p>
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium">Brightness progression</legend>
      {([["custom", "Keep original brightness"], ["ascending", "Dark to light"], ["even", "Even brightness"]] as const).map(([value, label]) => <label key={value} className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <input type="radio" name="palette-brightness" value={value} checked={draft.brightness === value} onChange={() => setDraft({ ...draft, brightness: value })} />{label}
      </label>)}
    </fieldset>
    <label className="grid gap-2 text-sm font-medium">Color intensity · {draft.intensity}%
      <input aria-label="Color intensity" type="range" min="0" max="200" value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: Number(event.target.value) })} />
    </label>
    </div>
    </details>
    <h4 className="text-sm font-medium">3. Preview and apply</h4>
    <div className="flex justify-between text-xs text-muted-foreground"><span>Low exposure</span><span>High exposure</span></div>
    {valid ? <div role="img" aria-label="Draft palette ramp from low to high exposure" className="h-6 rounded-md" style={{ background: `linear-gradient(to right, ${ramp.join(",")})` }} /> : <p role="alert" className="text-sm text-destructive">Correct the invalid anchor color before applying or saving.</p>}
    <p className="text-xs text-muted-foreground">Apply colors replaces every band color and keeps positions and widths. Undo restores your previous colors.</p>
    <p role="status" className="text-sm">{pending ? applied && applied.colors !== bandColors ? "Band colors changed since application. Applying will replace manual overrides." : "Unapplied palette changes." : "Palette applied to bands."}</p>
    <Button type="button" variant="outline" className="justify-self-start" disabled={!valid || setup.bands.length === 0} onClick={() => {
      const next = applyColorPreset(setup, palette, "gradient", anchors, draft.brightness, false)
      onApply(next)
      setApplied({ draft: JSON.stringify(draft), colors: JSON.stringify(next.bands.map((band) => band.color)) })
    }}>Apply colors</Button>
    <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">Use standard exposure colors instead</summary>
    <Button type="button" variant="outline" className="mt-3" disabled={setup.bands.length === 0} onClick={() => {
      onApply(applyColorPreset(setup, palette, "false-color"))
      setApplied(null)
    }}>Apply false color by exposure</Button>
    <p className="text-xs text-muted-foreground">False color by exposure uses the original exposure thresholds instead of this draft ramp. It also replaces individual overrides and supports undo.</p>
    </details>
    <details className="rounded-md border p-3">
    <summary className="cursor-pointer text-sm font-medium">Save and reuse palettes · this browser</summary>
    <fieldset className="mt-3 grid gap-2">
      <legend className="px-1 text-sm font-medium">Saved palettes · this browser only</legend>
      <label className="grid gap-1 text-sm">Reuse saved palette
        <select aria-label="Reuse saved palette" className={fieldClass} value={selected} onChange={(event) => {
          setSelected(event.target.value)
          const saved = library.palettes.find((item) => item.name === event.target.value)
          if (saved) { setDraft({ colors: [...saved.colors], brightness: saved.brightness, intensity: saved.intensity }); setName(saved.name) }
        }}><option value="">Choose a saved palette</option>{library.palettes.map((item) => <option key={item.name}>{item.name}</option>)}</select>
      </label>
      <label className="grid gap-1 text-sm">Palette name<input aria-label="Palette name" className={fieldClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      {nameError && <p className="text-xs text-muted-foreground">{nameError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!valid || !!nameError} onClick={() => save("new")}>Save new palette</Button>
        <Button type="button" variant="outline" disabled={!selected || !valid || !!nameError} onClick={() => save("replace")}>Replace saved palette</Button>
        <Button type="button" variant="outline" disabled={!selected || !!nameError} onClick={() => save("rename")}>Rename saved palette</Button>
        <Button type="button" variant="ghost" disabled={!selected} onClick={() => save("delete")}>Delete saved palette</Button>
      </div>
      <p className="text-xs text-muted-foreground">Saving stores this draft, not the bands. Export JSON keeps applied band colors with your setup.</p>
    </fieldset>
    </details>
    <p role="status" className="text-xs text-muted-foreground">{library.message}</p>
  </section>
}
