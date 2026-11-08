import { Button } from "@/components/ui/button"
import { applyExposurePreset, type BandPreset, type ExposurePreset, type PaletteColor, type Setup } from "./editor"
import { BandStrip } from "./ExposurePreview"
import { Check } from "lucide-react"
import { exposurePresetGroups } from "./exposurePresetGroups"
import { Separator } from "@/components/ui/separator"

export function ExposurePresets({ setup, palette, onApply }: { setup: Setup; palette: PaletteColor[]; onApply: (preset: ExposurePreset, arrangement?: BandPreset) => void }) {
  return <div className="grid gap-7">
    {exposurePresetGroups.map(({ mode, summary, icon: Icon, presets }) => <section key={mode} aria-label={`${mode} presets`} className="grid gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4" aria-hidden="true" />{mode}</h3>
      <p className="text-sm text-muted-foreground">{summary}</p>
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
