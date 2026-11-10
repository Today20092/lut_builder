import { Radio } from "@/components/ui/radio-group"
import { RadioChoices } from "./RadioChoices"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InlineDisclosure } from "./WorkspaceTask"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { ChoiceField } from "./ChoiceField"
import { BandStrip } from "./ExposurePreview"
import { applyExposurePreset, type PaletteColor, type Setup } from "./editor"
import { exposurePresetGroups } from "./exposurePresetGroups"

const starterGroups = exposurePresetGroups.map((group) => ({
  ...group,
  presets: group.presets.filter((preset) => preset.starter),
}))

export function NewLut({
  setup,
  profiles,
  targets,
  palette,
  busy,
  error,
  onCreate,
  onCancel,
  returning = false,
}: {
  setup: Setup
  profiles: string[]
  targets: string[]
  palette: PaletteColor[]
  busy: boolean
  error: string
  onCreate: (setup: Setup) => void
  onCancel: () => void
  returning?: boolean
}) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(setup.profile)
  const [target, setTarget] = useState(setup.target)
  const [preset, setPreset] = useState(starterGroups[0].presets[0])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [step])
  // A new LUT starts independently of any imported look or warning configuration.
  const base: Setup = {
    ...setup,
    profile,
    target,
    imported_lut: undefined,
    cube_size: 33,
    legal_range: false,
    low_signal_warning: false,
    high_signal_warning: false,
  }
  return (
    <main className="new-lut">
      <header className="new-lut-header">
        <span className="workspace-brand">
          <Layers aria-hidden="true" />
          LUT Builder
        </span>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {returning ? "Cancel" : "Skip setup"}
        </Button>
      </header>
      <section className="new-lut-content" aria-labelledby="new-lut-title">
        <nav aria-label="New LUT progress">
          <ol className="new-lut-progress">
            <li aria-current={step === 0 ? "step" : undefined}>1. Camera</li>
            <li aria-current={step === 1 ? "step" : undefined}>2. Exposure preset</li>
          </ol>
        </nav>
        <h1 id="new-lut-title" ref={heading} tabIndex={-1}>
          {step === 0 ? "Start with your camera" : "Choose your exposure guide"}
        </h1>
        <p className="text-muted-foreground">
          {step === 0
            ? "Build an exposure-monitoring LUT for the log signal you actually shoot."
            : "Each group measures or lays out exposure differently. Pick a starting point; more presets and every band and color stay editable afterwards."}
        </p>
        {error && (
          <Alert variant="error">
            <AlertDescription>
              {error} Your existing setup is unchanged. Try again or continue editing.
            </AlertDescription>
          </Alert>
        )}
        {step === 0 ? (
          <>
            <InlineDisclosure className="new-lut-explanation" title="What does this LUT do?">
              <p>
                It turns exposure ranges, measured in IRE or stops, into colors so you can judge your camera signal
                while shooting. It is a monitoring aid, not a creative grade or proof of sensor clipping. No footage
                upload is needed.
              </p>
            </InlineDisclosure>
            <label htmlFor="new-lut-profile" className="grid gap-2 font-medium">
              Camera / log profile
              <NativeSelect id="new-lut-profile" value={profile} onChange={(event) => setProfile(event.target.value)}>
                {profiles.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </NativeSelect>
            </label>
            <p className="text-sm text-muted-foreground">For a Lumix S5IIX recording V-Log, choose Panasonic V-Log.</p>
            <ChoiceField
              label="Display color space"
              value={target}
              onChange={setTarget}
              options={targets.map((value) => ({ value, label: value }))}
            />
            <p className="text-sm text-muted-foreground">
              Rec.709 is the starting point for an SDR monitoring display. The new LUT uses 33³ and full range; review
              compatibility at export.
            </p>
            <Button size="lg" disabled={busy} onClick={() => setStep(1)}>
              Choose exposure preset
              <ArrowRight aria-hidden="true" />
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">
              {profile} → {target} · 33³ · Full range
            </p>
            <RadioChoices
              value={preset.name}
              onChange={(name) =>
                setPreset(
                  starterGroups.flatMap((group) => group.presets).find((option) => option.name === name) ?? preset,
                )
              }
              className="new-lut-presets"
            >
              <legend className="sr-only">Starting exposure preset</legend>
              {starterGroups.map(({ mode, summary, presets }) => (
                <section key={mode} aria-label={`${mode} presets`} className="new-lut-presets">
                  <div>
                    <h2 className="font-semibold">{mode}</h2>
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  </div>
                  {presets.map((option) => {
                    const preview = applyExposurePreset(base, palette, option.id, option.arrangement)
                    const ire = preview.band_mode === "ire"
                    return (
                      <label key={option.name} className="new-lut-preset">
                        <span className="flex items-center gap-3">
                          <Radio value={option.name} />
                          <strong>{option.name}</strong>
                        </span>
                        <span className="text-sm text-muted-foreground">{option.detail}</span>
                        <BandStrip
                          setup={preview}
                          minimum={ire ? 0 : -7}
                          maximum={ire ? 100 : 7}
                          label={`${option.name} preview`}
                        />
                      </label>
                    )
                  })}
                </section>
              ))}
            </RadioChoices>
            <p className="text-sm text-muted-foreground">
              Colors describe the selected ranges, not a universal safe skin exposure. Your media is optional.
            </p>
            <div className="new-lut-actions">
              <Button variant="outline" disabled={busy} onClick={() => setStep(0)}>
                <ArrowLeft aria-hidden="true" />
                Camera
              </Button>
              <Button
                size="lg"
                disabled={busy}
                onClick={() => onCreate(applyExposurePreset(base, palette, preset.id, preset.arrangement))}
              >
                <Check aria-hidden="true" />
                Start editing
              </Button>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Your existing setup stays available through Restore previous setup after starting a new LUT.
        </p>
      </section>
    </main>
  )
}
