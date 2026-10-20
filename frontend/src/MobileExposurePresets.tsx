import { Button } from "@/components/ui/button"
import { useState } from "react"
import type { BandPreset, ExposurePreset } from "./editor"

const groups = [
  { mode: "IRE", presets: [
    { id: "camera-ire", name: "Camera-log IRE", detail: "7 bands anchored to your camera’s log levels." },
    { id: "camera-ire", arrangement: "detailed", name: "Detailed IRE", detail: "9 camera-log bands for finer exposure checks." },
  ] },
  { mode: "Fill", presets: [
    { id: "contrast-checker", name: "Contrast Checker", detail: "5 continuous zones for comparing face and scene contrast." },
    { id: "contrast-checker", arrangement: "standard", name: "Standard Fill", detail: "5 false-color zones across the exposure range." },
    { id: "contrast-checker", arrangement: "detailed", name: "Detailed Fill", detail: "9 false-color zones for a more detailed exposure map." },
  ] },
  { mode: "Stops", presets: [
    { id: "three-band", name: "Three-band Exposure", detail: "Blue at −2, green at 0, orange at +2 stops." },
    { id: "three-band", arrangement: "standard", name: "Standard Stops", detail: "7 bands from −3 to +3 stops." },
    { id: "three-band", arrangement: "detailed", name: "Detailed Stops", detail: "10 bands from −4 to +5 stops." },
  ] },
] satisfies { mode: string; presets: { id: ExposurePreset; arrangement?: BandPreset; name: string; detail: string }[] }[]

export function MobileExposurePresets({ onApply }: { onApply: (preset: ExposurePreset, arrangement?: BandPreset) => void }) {
  const [applied, setApplied] = useState("")
  return <div className="grid gap-7">
    {groups.map(({ mode, presets }) => <section key={mode} aria-label={`${mode} presets`} className="grid gap-3">
      <h3 className="text-lg font-semibold">{mode}</h3>
      {presets.map(({ id, arrangement, name, detail }) => <div key={name} className="grid gap-3 border-t pt-4">
        <div className="grid gap-1">
          <h4 className="font-medium">{name}</h4>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={() => {
          onApply(id, arrangement)
          setApplied(name)
        }}>Use {name}</Button>
        {applied === name && <p role="status" className="text-sm">Applied. Open Bands to adjust or undo.</p>}
      </div>)}
    </section>)}
    <p className="text-sm text-muted-foreground">Presets replace your bands and mode. Camera, output and warning settings stay the same. Undo in Bands restores your previous bands. Colors do not establish a universal safe skin exposure.</p>
  </div>
}
