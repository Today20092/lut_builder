import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { BandStrip } from "./ExposurePreview"
import { applyExposurePreset, type ExposurePreset, type PaletteColor, type Setup } from "./editor"

const presets: { id: ExposurePreset; title: string; description: string }[] = [
  { id: "camera-ire", title: "Camera-log IRE", description: "Seven bands anchored to your camera’s log levels. A useful starting point for monitoring." },
  { id: "three-band", title: "Three-band Exposure", description: "Mark −2, 0 and +2 stops. Leave the rest of the image monochrome." },
  { id: "contrast-checker", title: "Contrast Checker", description: "Five continuous zones for comparing scene contrast around 18% gray." },
]

export function NewLut({ setup, profiles, targets, palette, busy, error, onCreate, onCancel, returning = false }: {
  setup: Setup; profiles: string[]; targets: string[]; palette: PaletteColor[]; busy: boolean; error: string
  onCreate: (setup: Setup) => void; onCancel: () => void; returning?: boolean
}) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(setup.profile)
  const [target, setTarget] = useState(setup.target)
  const [preset, setPreset] = useState<ExposurePreset>("camera-ire")
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [step])
  // A new LUT starts independently of any imported look or warning configuration.
  const base: Setup = { ...setup, profile, target, imported_lut: undefined, cube_size: 33, legal_range: false, low_signal_warning: false, high_signal_warning: false }
  return <main className="new-lut">
    <header className="new-lut-header"><span className="workspace-brand"><Layers aria-hidden="true" />LUT Builder</span><Button variant="ghost" onClick={onCancel} disabled={busy}>{returning ? "Cancel" : "Skip setup"}</Button></header>
    <section className="new-lut-content" aria-labelledby="new-lut-title">
      <nav aria-label="New LUT progress"><ol className="new-lut-progress"><li aria-current={step === 0 ? "step" : undefined}>1. Camera</li><li aria-current={step === 1 ? "step" : undefined}>2. Exposure preset</li></ol></nav>
      <h1 id="new-lut-title" ref={heading} tabIndex={-1}>{step === 0 ? "Start with your camera" : "Choose your exposure guide"}</h1>
      <p className="text-muted-foreground">{step === 0 ? "Build an exposure-monitoring LUT for the log signal you actually shoot." : "Start with a complete arrangement. Adjust every band and color in the editor."}</p>
      {error && <p role="alert">{error} Your existing setup is unchanged. Try again or continue editing.</p>}
      {step === 0 ? <>
        <details className="new-lut-explanation"><summary>What does this LUT do?</summary><p>It turns exposure ranges into colors so you can judge your camera signal while shooting. It is a monitoring aid, not a creative grade or proof of sensor clipping. No footage upload is needed.</p></details>
        <label htmlFor="new-lut-profile" className="grid gap-2 font-medium">Camera / log profile<NativeSelect id="new-lut-profile" value={profile} onChange={event => setProfile(event.target.value)}>{profiles.map(value => <option key={value}>{value}</option>)}</NativeSelect></label>
        <p className="text-sm text-muted-foreground">For a Lumix S5IIX recording V-Log, choose Panasonic V-Log.</p>
        <label htmlFor="new-lut-target" className="grid gap-2 font-medium">Display color space<NativeSelect id="new-lut-target" value={target} onChange={event => setTarget(event.target.value)}>{targets.map(value => <option key={value}>{value}</option>)}</NativeSelect></label>
        <p className="text-sm text-muted-foreground">Rec.709 is the starting point for an SDR monitoring display. The new LUT uses 33³ and full range; review compatibility at export.</p>
        <Button size="lg" disabled={busy} onClick={() => setStep(1)}>Choose exposure preset<ArrowRight aria-hidden="true" /></Button>
      </> : <>
        <p className="text-sm">{profile} → {target} · 33³ · Full range</p>
        <fieldset className="new-lut-presets"><legend className="sr-only">Starting exposure preset</legend>{presets.map(({ id, title, description }) => {
          const preview = applyExposurePreset(base, palette, id)
          return <label key={id} className="new-lut-preset"><span className="flex items-center gap-3"><input type="radio" name="new-lut-preset" value={id} checked={preset === id} onChange={() => setPreset(id)} /><strong>{title}</strong></span><span className="text-sm text-muted-foreground">{description}</span><BandStrip setup={preview} minimum={id === "camera-ire" ? 0 : -7} maximum={id === "camera-ire" ? 100 : 7} label={`${title} preview`} /></label>
        })}</fieldset>
        <p className="text-sm text-muted-foreground">Colors describe the selected ranges, not a universal safe skin exposure. Your media is optional.</p>
        <div className="new-lut-actions"><Button variant="outline" disabled={busy} onClick={() => setStep(0)}><ArrowLeft aria-hidden="true" />Camera</Button><Button size="lg" disabled={busy} onClick={() => onCreate(applyExposurePreset(base, palette, preset))}><Check aria-hidden="true" />Start editing</Button></div>
      </>}
      <p className="text-xs text-muted-foreground">Your existing setup stays available through Restore previous setup after starting a new LUT.</p>
    </section>
  </main>
}
