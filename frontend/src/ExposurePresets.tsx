import { Button } from "@/components/ui/button"
import { applyExposurePreset, type BandPreset, type ExposurePreset, type PaletteColor, type Setup } from "./editor"
import { BandStrip } from "./ExposurePreview"
import { Check, Gauge, PaintBucket, Sun, type LucideIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"

const groups: { mode: string; icon: LucideIcon; presets: { id: ExposurePreset; arrangement?: BandPreset; name: string; detail: string }[] }[] = [
  { mode: "IRE", icon: Gauge, presets: [
    { id: "camera-ire", name: "Camera-log IRE", detail: "7 bands anchored to your camera’s log levels." },
    { id: "camera-ire", arrangement: "detailed", name: "Detailed IRE", detail: "9 camera-log bands for finer exposure checks." },
  ] },
  { mode: "Fill", icon: PaintBucket, presets: [
    { id: "contrast-checker", name: "Contrast Checker", detail: "5 continuous zones for comparing face and scene contrast." },
    { id: "portrait-contrast", name: "Portrait contrast", detail: "Half-stop zones from −2 to +2 for comparing key and fill across a face." },
    { id: "wide-contrast", name: "Wide contrast", detail: "One-stop zones from −4 to +4 for interiors, windows and strong lighting differences." },
    { id: "reference-emphasis", name: "Reference emphasis", detail: "7 continuous zones with a bright green reference and quieter surrounding colors." },
    { id: "contrast-checker", arrangement: "standard", name: "Standard Fill", detail: "5 false-color zones across the exposure range." },
    { id: "contrast-checker", arrangement: "detailed", name: "Detailed Fill", detail: "9 false-color zones for a more detailed exposure map." },
  ] },
  { mode: "Stops", icon: Sun, presets: [
    { id: "three-band", name: "Three-band Exposure", detail: "Blue at −2, green at 0, orange at +2 stops." },
    { id: "highlight-placement", name: "Highlight placement", detail: "One-stop markers at +2, +3, +4 and +5 over a monochrome base; keeps imported looks." },
    { id: "shadow-placement", name: "Shadow placement", detail: "One-stop markers at −2, −3, −4 and −5 over a monochrome base; keeps imported looks." },
    { id: "three-band", arrangement: "standard", name: "Standard Stops", detail: "7 bands from −3 to +3 stops." },
    { id: "three-band", arrangement: "detailed", name: "Detailed Stops", detail: "10 bands from −4 to +5 stops." },
  ] },
]

export function ExposurePresets({ setup, palette, onApply }: { setup: Setup; palette: PaletteColor[]; onApply: (preset: ExposurePreset, arrangement?: BandPreset) => void }) {
  return <div className="grid gap-7">
    {groups.map(({ mode, icon: Icon, presets }) => <section key={mode} aria-label={`${mode} presets`} className="grid gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4" aria-hidden="true" />{mode}</h3>
      <Separator />
      {presets.map(({ id, arrangement, name, detail }) => {
        const preview = applyExposurePreset(setup, palette, id, arrangement)
        const ire = preview.band_mode === "ire"
        return <div key={name} className="workspace-preset-row">
        <div className="grid gap-1">
          <h4 className="font-medium">{name}</h4>
          <p className="text-xs text-muted-foreground">{detail}</p>
          <BandStrip setup={preview} minimum={ire ? 0 : -7} maximum={ire ? 100 : 7} label={`${name} preview`} />
          <div aria-hidden="true" className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{ire ? "0" : "−7"}</span><span>{ire ? "Camera-log IRE" : "Stops"}</span><span>{ire ? "100" : "+7"}</span></div>
        </div>
        <Button type="button" variant="outline" aria-label={`Use ${name}`} onClick={() => onApply(id, arrangement)}><Check data-icon="inline-start" aria-hidden="true" />Use</Button>
      </div>})}
    </section>)}
    <p className="text-sm text-muted-foreground">Presets replace your bands and mode. Camera, output and warning settings stay the same. Undo in Bands restores your previous bands. Colors do not establish a universal safe skin exposure.</p>
  </div>
}
