import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Palette, SlidersHorizontal, RotateCcw, Eye, Check, X, Save, Pencil, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { createPaletteWorkflow, reducePaletteWorkflow, type PaletteDraft as Draft } from "./paletteWorkflow"
import { Data, Effect, Result, Schema } from "effect"
import { Button } from "@/components/ui/button"
import { ContextHelp } from "./ContextHelp"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { GradientPicker } from "./GradientPicker"
import { WorkspaceTask } from "./WorkspaceTask"
import { isTypingTarget } from "./keyboard"
import { applyColorPreset, applyLightnessProfile, exposurePaletteScale, exposureReferenceValue, hexToOklch, isHexColor, sampleOklabRamp, type GradientBlend, type HuePath, type PaletteColor, type Setup } from "./editor"

type SavedPalette = Draft & { name: string }
export type PalettePreview = { setup: Setup; label: string; valid: boolean; apply: () => void; cancel: () => void }
const storageKey = "lut-builder.palettes.v1"
const fieldClass = "w-full min-w-0"
const startingPalettes = [
  { name: "Exposure zones", description: "Blended gradient · green reference · cool to warm", colors: ["#5b21b6", "#2563eb", "#38bdf8", "#22c55e", "#facc15", "#f97316", "#dc2626"] },
  { name: "Reference emphasis", description: "Green reference stands out against quieter surrounding colors", colors: ["#334e68", "#3b6c8e", "#4c8b93", "#22c55e", "#a3a044", "#a66b35", "#a33a3a"] },
]

function PaletteHelp({ label, children }: { label: string; children: string }) {
  return <ContextHelp label={`About ${label}`}>{children}</ContextHelp>
}
const SavedPaletteSchema = Schema.Struct({
  name: Schema.String,
  colors: Schema.Array(Schema.String),
  positions: Schema.optional(Schema.Array(Schema.Finite)),
  blend: Schema.optional(Schema.Literals(["colorful", "direct"])),
  huePath: Schema.optional(Schema.Literals(["shorter", "longer"])),
  mapping: Schema.optional(Schema.Literals(["band-range", "exposure"])),
  brightness: Schema.Literals(["custom", "ascending", "even"]),
  intensity: Schema.Finite,
})

function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false
  const draft = value as Draft
  return Array.isArray(draft.colors) && draft.colors.length >= 2 && draft.colors.length <= 32 &&
    draft.colors.every((color) => typeof color === "string" && isHexColor(color)) &&
    (draft.positions === undefined || (Array.isArray(draft.positions) && draft.positions.length === draft.colors.length && draft.positions.every((position, index) => Number.isFinite(position) && position >= 0 && position <= 1 && (index === 0 || position > draft.positions![index - 1])))) &&
    ["custom", "ascending", "even"].includes(draft.brightness) &&
    (draft.blend === undefined || ["colorful", "direct"].includes(draft.blend)) &&
    (draft.huePath === undefined || ["shorter", "longer"].includes(draft.huePath)) &&
    (draft.mapping === undefined || draft.mapping === "band-range" || (draft.mapping === "exposure" && draft.colors.some((_, index) => (draft.positions?.[index] ?? index / (draft.colors.length - 1)) === 0.5))) &&
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
      return { palettes: value.map((item) => ({ ...item, colors: [...item.colors], positions: item.positions ? [...item.positions] : undefined })) }
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

export function PaletteEditor({ setup, palette, onApply, onPreview }: { setup: Setup; palette: PaletteColor[]; onApply: (next: Setup) => void; onPreview?: (preview: PalettePreview | null) => void }) {
  const applyButton = useRef<HTMLButtonElement>(null)
  const chooser = useRef<HTMLElement | null>(null)
  const [{ draft, audition, label: draftLabel, method }, send] = useReducer(reducePaletteWorkflow, { colors: startingPalettes[0].colors, brightness: "custom", intensity: 100, blend: "colorful", huePath: "shorter", mapping: "exposure" }, createPaletteWorkflow)
  const cancelPreview = useCallback(() => {
    const target = chooser.current
    const top = target?.getBoundingClientRect().top
    send({ type: "cancel" })
    // Wait for the parent preview to collapse before restoring the chooser position.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      target?.focus({ preventScroll: true })
      if (target && top !== undefined) window.scrollBy(0, target.getBoundingClientRect().top - top)
    }))
  }, [])
  function setDraft(next: Draft, label = "Custom gradient", origin?: HTMLElement) {
    if (origin) chooser.current = origin
    else if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[aria-label="Band colors"]')) chooser.current = document.activeElement
    send({ type: "preview", draft: next, label })
  }
  const [loadedPalettes] = useState(() => Effect.runSync(Effect.result(loadPalettes())))
  const [library, setLibrary] = useState(() => Result.isSuccess(loadedPalettes)
    ? { ...loadedPalettes.success, message: "" }
    : { palettes: [], message: loadedPalettes.failure.message })
  const [selected, setSelected] = useState("")
  const [name, setName] = useState("")
  const [applied, setApplied] = useState<{ draft: string; colors: string } | null>(null)
  const valid = validDraft(draft)
  const blend = draft.blend ?? "direct"
  const huePath = draft.huePath ?? "shorter"
  const mapping = draft.mapping ?? "band-range"
  const positions = draft.positions ?? draft.colors.map((_, index) => index / (draft.colors.length - 1))
  const anchors = useMemo(() => valid ? draft.colors.map(hexToOklch).map((anchor, index) => ({ ...anchor, c: anchor.c * draft.intensity / 100, position: draft.positions?.[index] ?? index / (draft.colors.length - 1) })) : [], [valid, draft])
  const nextSetup = useMemo(() => valid ? applyColorPreset(setup, palette, "gradient", anchors, draft.brightness, false, blend, huePath, mapping) : setup, [valid, setup, palette, anchors, draft.brightness, blend, huePath, mapping])
  const apply = useCallback(() => {
    if (!valid || setup.bands.length === 0) return
    onApply(nextSetup)
    setApplied({ draft: JSON.stringify(draft), colors: JSON.stringify(nextSetup.bands.map((band) => band.color)) })
    send({ type: "apply" })
  }, [valid, setup.bands.length, onApply, nextSetup, draft, setApplied, send])
  useEffect(() => {
    onPreview?.(audition ? { setup: nextSetup, label: draftLabel, valid: valid && setup.bands.length > 0, apply, cancel: cancelPreview } : null)
  }, [audition, nextSetup, draftLabel, valid, setup.bands.length, apply, onPreview, cancelPreview])
  const ramp = Array.from({ length: 65 }, (_, index) => sampleOklabRamp(applyLightnessProfile(anchors, draft.brightness), index / 64, blend, huePath))
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

  return <section aria-label="Band colors" className="grid gap-3 border-t pt-4" onKeyDown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.nativeEvent.isComposing && !isTypingTarget(event.target) && audition) {
      event.preventDefault()
      cancelPreview()
    }
  }}>
    <h3 className="text-sm font-semibold">Recolor all bands</h3>
    <p className="text-sm text-muted-foreground">Keep your colors, edit a band swatch above, or choose a method.</p>
    <ToggleGroup className="w-full" variant="outline" value={[method]} onValueChange={(values) => { const value = values[0]; if (value === "palette" || value === "gradient") send({ type: "choose-method", method: value }) }} aria-label="Color editing method">
      <ToggleGroupItem className="min-w-0 flex-1 whitespace-normal" value="palette"><Palette data-icon="inline-start" aria-hidden="true" />Choose a palette</ToggleGroupItem>
      <ToggleGroupItem className="min-w-0 flex-1 whitespace-normal" value="gradient" onClick={(event) => { chooser.current = event.currentTarget }}><SlidersHorizontal data-icon="inline-start" aria-hidden="true" />Customize gradient</ToggleGroupItem>
    </ToggleGroup>
    {method === "palette" && <>
    <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Choose a starting palette</legend>
      <Button type="button" variant="outline" className="h-auto min-w-0 flex-col items-stretch gap-2 whitespace-normal p-3 text-left" disabled={setup.bands.length === 0} onClick={() => {
        onApply(applyColorPreset(setup, palette, "false-color"))
        setApplied(null)
        send({ type: "cancel" })
      }}>
        <span aria-hidden="true" className="flex h-5 w-full overflow-hidden rounded-sm">{applyColorPreset(setup, palette, "false-color").bands.map((band, index) => <span key={index} className="flex-1" style={{ backgroundColor: band.color }} />)}</span>
        <span className="font-medium"><span className="sr-only">Apply </span>Standard false color</span>
        <span className="text-xs font-normal text-muted-foreground">Fixed exposure thresholds · applies immediately · supports undo</span>
      </Button>
      {startingPalettes.map((preset) => {
        const presetAnchors = preset.colors.map(hexToOklch)
        const preview = Array.from({ length: 65 }, (_, index) => sampleOklabRamp(presetAnchors, index / 64, "colorful", "shorter"))
        const active = mapping === "exposure" && draft.intensity === 100 && draft.brightness === "custom" && blend === "colorful" && huePath === "shorter" && JSON.stringify(draft.colors) === JSON.stringify(preset.colors) && positions.every((position, index) => position === index / (positions.length - 1))
        return <Button key={preset.name} type="button" variant="outline" data-palette={preset.name} aria-pressed={active} className="h-auto min-w-0 flex-col items-stretch gap-2 whitespace-normal p-3 text-left" onClick={(event) => setDraft({ colors: [...preset.colors], brightness: "custom", intensity: 100, blend: "colorful", huePath: "shorter", mapping: "exposure" }, preset.name, event.currentTarget)}>
          <span className="sr-only">Start with </span>
          <span aria-hidden="true" className="h-5 w-full rounded-sm" style={{ background: `linear-gradient(to right, ${preview.join(",")})` }} />
          <span className="flex items-center justify-between gap-2"><span>{preset.name}</span>{active && <span className="text-xs text-muted-foreground">{audition ? "Previewing" : pending ? "Starting point" : "Applied"}</span>}</span>
          <span className="text-xs font-normal text-muted-foreground">{preset.description}</span>
        </Button>
      })}
    </fieldset>
    </>}
    {mapping === "exposure" ? <div className="grid gap-1 text-xs text-muted-foreground">
      <p>18% gray reference: <strong className="text-foreground">{exposureReferenceValue(setup).toFixed(setup.band_mode === "stops" ? 0 : 1)} {setup.band_mode === "stops" ? "stops" : "IRE"}</strong>{setup.band_mode === "ire" ? ` · ${setup.ire_basis === "camera" ? setup.profile : "Legacy target-display signal"}` : " · scene-linear exposure"}.</p>
      <details><summary className="cursor-pointer">What does the reference mean?</summary><p className="mt-2">Green marks 18% scene gray, not a universal correct exposure for every subject. {setup.band_mode === "ire" && setup.ire_basis === "camera" ? "Camera-log IRE measures encoded input luma using the source gamut weights, on a full-code-range scale (0–1023). Match your monitor's signal range; legal-range waveform readings may differ. Stops measures scene-linear luminance and is preferable for exposure comparisons of colored subjects." : "Stops measures scene-linear luminance; older IRE setups measure the target-display signal."} Cool colors are below reference; warm colors are above. Red does not establish sensor clipping.</p></details>
      {setup.fill_mode && <p>Fill colors cover entire existing zones: the zone containing the reference uses its color, and the outer zones use the end colors.</p>}
      <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-7" aria-label="Exposure palette legend">{["Deep shadows", "Shadows", "Below reference", "Reference", "Above reference", "Highlights", "Very high"].map((label, index) => <li key={label} className="grid grid-cols-[2rem_4.5rem_1fr] items-center gap-2 sm:grid-cols-1 sm:content-start sm:items-start sm:gap-1"><span aria-hidden="true" className="h-4 rounded border" style={{ backgroundColor: ramp[Math.round(index / 6 * 64)] }} /><span className="font-medium text-foreground">{setup.band_mode === "stops" && index > 3 ? "+" : ""}{Number(exposurePaletteScale(setup)[index].toFixed(1))} {setup.band_mode === "stops" ? "stops" : "IRE"}</span><span>{label}</span></li>)}</ul>
    </div> : <p className="text-xs text-muted-foreground">Saved custom gradient: colors span your current band range. Its middle color is not anchored to the exposure reference.</p>}
    {method === "gradient" && <>
    <h4 className="text-sm font-medium">Shape your gradient</h4>
    <div className="grid grid-cols-2 items-end gap-3">
      <label className="grid min-w-0 gap-1 text-sm font-medium">Blend
        <NativeSelect aria-label="Gradient blend" className={fieldClass} value={blend} onChange={(event) => setDraft({ ...draft, blend: event.target.value as GradientBlend })}>
          <option value="colorful">Colorful</option><option value="direct">Direct</option>
        </NativeSelect>
      </label>
      {blend === "colorful" && <label className="grid min-w-0 gap-1 text-sm font-medium">Hue path
        <NativeSelect aria-label="Hue path" className={fieldClass} value={huePath} onChange={(event) => setDraft({ ...draft, huePath: event.target.value as HuePath })}>
          <option value="shorter">Shorter</option><option value="longer">Longer</option>
        </NativeSelect>
      </label>}
    </div>
    <p className="text-xs text-muted-foreground">{blend === "colorful" ? "Colorful blends around the color wheel. Longer passes through more hues; colors are fitted to sRGB." : "Direct blends straight between colors and may pass through gray. Hue path does not affect this blend."}</p>
    <GradientPicker displayColors={ramp} colors={draft.colors} positions={positions} blend={blend} huePath={huePath} exposureScale={mapping === "exposure" ? exposurePaletteScale(setup) : undefined} exposureUnit={setup.band_mode === "stops" ? "stops" : "IRE"} onChange={(colors, positions) => setDraft({ ...draft, colors, positions })} />
    <WorkspaceTask id="palette-adjustments" title="Advanced: adjust all colors" icon={SlidersHorizontal} className="rounded-md border p-3">
    <div className="mt-3 grid gap-3">
    <p className="text-xs text-muted-foreground">Optional finishing controls for the whole palette. They change the preview and applied colors, while your individual dots keep their chosen colors.</p>
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium"><span className="inline-flex items-center gap-2">Lightness across the palette <PaletteHelp label="palette lightness">Keep chosen lightness uses the lightness you chose for each dot. Dark to light assigns increasing lightness from low to high exposure. Same lightness gives every dot their average lightness. Hue is retained; fitting to sRGB may reduce chroma.</PaletteHelp></span></legend>
      {([["custom", "Keep chosen lightness"], ["ascending", "Dark to light"], ["even", "Same lightness"]] as const).map(([value, label]) => <label key={value} className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <input type="radio" name="palette-brightness" value={value} checked={draft.brightness === value} onChange={() => setDraft({ ...draft, brightness: value })} />{label}
      </label>)}
    </fieldset>
    <div className="flex items-center gap-2 text-sm font-medium"><label htmlFor="palette-intensity">Overall color strength · {draft.intensity}%</label><PaletteHelp label="overall color strength">Multiplies chroma for every dot before blending. 100% keeps the chosen strength, 0% produces gray, and 200% requests twice the chroma. Colors outside sRGB are reduced to fit, so more is not always visibly stronger.</PaletteHelp></div>
    <label className="grid gap-2 text-sm font-medium">
      <span className="sr-only">Overall color strength</span>
      <input className="pointer-adjustment" id="palette-intensity" aria-label="Color intensity" aria-describedby="palette-intensity-help" type="range" min="0" max="200" value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: Number(event.target.value) })} />
      <NativeSelect className={`${fieldClass} touch-adjustment`} aria-label="Color intensity" value={draft.intensity} onChange={(event) => setDraft({ ...draft, intensity: Number(event.target.value) })}>{Array.from(new Set([...Array.from({ length: 21 }, (_, i) => i * 10), draft.intensity])).sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value}%</option>)}</NativeSelect>
    </label>
    <p id="palette-intensity-help" className="text-xs text-muted-foreground">100% keeps your chosen color strength. 0% makes the palette gray.</p>
    <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={draft.brightness === "custom" && draft.intensity === 100} onClick={() => setDraft({ ...draft, brightness: "custom", intensity: 100 })}><RotateCcw data-icon="inline-start" aria-hidden="true" />Reset adjustments</Button>
    </div>
    </WorkspaceTask>
    </>}
    {!valid && <p role="alert" className="text-sm text-destructive">Correct the invalid anchor color before applying or saving.</p>}
    <p role="status" className="text-sm">{audition ? "Draft · review your bands above." : !pending ? "Palette applied to bands." : "Current band colors are kept."}</p>
    {!audition && method === "gradient" && <Button type="button" variant="outline" className="justify-self-start" onClick={() => setDraft(draft, draftLabel)}><Eye data-icon="inline-start" aria-hidden="true" />Preview gradient</Button>}
    {applied && applied.colors !== bandColors && <p className="text-xs text-muted-foreground">Applying will replace manual overrides.</p>}
    {audition && <div className="flex flex-wrap gap-2">
      <Button ref={applyButton} type="button" className="justify-self-start" disabled={!valid || setup.bands.length === 0} onClick={apply}><Check data-icon="inline-start" aria-hidden="true" />Use palette</Button>
      {audition && <Button type="button" variant="outline" onClick={cancelPreview}><X data-icon="inline-start" aria-hidden="true" />Cancel preview</Button>}
    </div>}
    <WorkspaceTask id="saved-palettes" title="Save and reuse palettes" icon={Save} className="rounded-md border p-3">
    <div className="mt-3 grid gap-2">
      <p className="text-xs text-muted-foreground">Stored in this browser only.</p>
        <NativeSelect aria-label="Reuse saved palette" className={fieldClass} value={selected} onChange={(event) => {
          setSelected(event.target.value)
          const saved = library.palettes.find((item) => item.name === event.target.value)
          if (saved) { setDraft({ colors: [...saved.colors], positions: saved.positions ? [...saved.positions] : undefined, brightness: saved.brightness, intensity: saved.intensity, blend: saved.blend ?? "direct", huePath: saved.huePath ?? "shorter", mapping: saved.mapping ?? "band-range" }, saved.name, event.currentTarget); setName(saved.name) }
        }}><option value="">Choose a saved palette</option>{library.palettes.map((item) => <option key={item.name}>{item.name}</option>)}</NativeSelect>
      <label className="grid gap-1 text-sm">Palette name<Input aria-label="Palette name" className={fieldClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      {nameError && <p className="text-xs text-muted-foreground">{nameError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!valid || !!nameError} onClick={() => save("new")}><Save data-icon="inline-start" aria-hidden="true" />Save new palette</Button>
        <Button type="button" variant="outline" disabled={!selected || !valid || !!nameError} onClick={() => save("replace")}><Save data-icon="inline-start" aria-hidden="true" />Replace saved palette</Button>
        <Button type="button" variant="outline" disabled={!selected || !!nameError} onClick={() => save("rename")}><Pencil data-icon="inline-start" aria-hidden="true" />Rename saved palette</Button>
        <Button type="button" variant="ghost" disabled={!selected} onClick={() => save("delete")}><Trash2 data-icon="inline-start" aria-hidden="true" />Delete saved palette</Button>
      </div>
      <p className="text-xs text-muted-foreground">Saving stores this draft, not the bands. Export JSON keeps applied band colors with your setup.</p>
    </div>
    </WorkspaceTask>
    <p role="status" className="text-xs text-muted-foreground">{library.message}</p>
  </section>
}
