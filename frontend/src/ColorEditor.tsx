import { useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BandNumberInput } from "./BandNumberInput"
import { ChoiceField } from "./ChoiceField"
import { HsvTrianglePicker } from "./HsvTrianglePicker"
import { hexToOklch, isHexColor, maxSrgbChroma, oklchToHex, type OklchAnchor } from "./editor"

export type ColorModel = "oklch" | "hsv"

function OklchSliders({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [edited, setEdited] = useState<{ hex: string; channels: OklchAnchor } | null>(null)
  const channels = edited?.hex === color ? edited.channels : hexToOklch(isHexColor(color) ? color : "#2563eb")
  const outsideGamut = channels.c > maxSrgbChroma(channels) + 0.002
  const controls = [
    { key: "l", label: "Lightness", max: 1, step: 0.001 },
    { key: "c", label: "Chroma", max: 0.4, step: 0.001 },
    { key: "h", label: "Hue", max: 360, step: 1 },
  ] as const
  function change(key: 'l' | 'c' | 'h', value: number) {
    const next = { ...channels, [key]: value }
    const hex = oklchToHex(next)
    setEdited({ hex, channels: next })
    onChange(hex)
  }
  return <div className="grid gap-4">
    {controls.map(({ key, label, max, step }) => <div key={key} className="grid gap-1 text-sm">
      <label className="flex items-center justify-between gap-3"><span>{label}</span><span className="flex items-center gap-1 font-mono">
        <BandNumberInput aria-label={`Color ${label.toLowerCase()} value`} className="w-full min-w-0 max-w-24 text-right" value={Number((channels[key] * (key === 'l' ? 100 : 1)).toFixed(key === 'c' ? 3 : 1))} min={0} max={key === 'l' ? 100 : max} step={key === 'l' ? 0.1 : step} onChange={(value) => change(key, value / (key === 'l' ? 100 : 1))} />
        {key === 'l' ? '%' : key === 'h' ? '°' : ''}
      </span></label>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label={`Decrease ${label.toLowerCase()}`} disabled={channels[key] <= 0} onClick={() => change(key, Math.max(0, channels[key] - step))}><Minus data-icon="inline-start" aria-hidden="true" /></Button>
        <input type="range" aria-label={`Color ${label.toLowerCase()}`} min={0} max={max} step={step} value={channels[key]} className="oklch-slider"
          style={{ backgroundImage: `linear-gradient(to right, ${Array.from({ length: 25 }, (_, index) => oklchToHex({ ...channels, [key]: index / 24 * max })).join(",")})` }}
          onChange={event => change(key, Number(event.target.value))} />
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label={`Increase ${label.toLowerCase()}`} disabled={channels[key] >= max} onClick={() => change(key, Math.min(max, channels[key] + step))}><Plus data-icon="inline-start" aria-hidden="true" /></Button>
      </div>
    </div>)}
    {/* Both messages share a grid cell so their longest wrapping reserves space. */}
    <div className="grid text-xs text-muted-foreground" role="status">
      <p className="col-start-1 row-start-1" style={{ visibility: outsideGamut ? "visible" : "hidden" }} aria-hidden={!outsideGamut}>Outside sRGB: chroma is reduced in the saved color. This is a file-gamut limit, not a measurement of your screen.</p>
      <p className="col-start-1 row-start-1" style={{ visibility: outsideGamut ? "hidden" : "visible" }} aria-hidden={outsideGamut}>Within sRGB. The swatch previews the saved color; screen accuracy varies.</p>
    </div>
  </div>
}

export function ColorEditor({ color, onChange, model, onModelChange, hexLabel = "Selected color hex" }: {
  color: string; onChange: (color: string) => void; model: ColorModel; onModelChange: (model: ColorModel) => void; hexLabel?: string
}) {
  const originalHex = useRef(color)
  return <div className="grid min-w-0 gap-4" data-color-editor>
    <ChoiceField label="Color model" value={model} onChange={onModelChange} options={[{ value: "oklch", label: "OKLCH · perceptual" }, { value: "hsv", label: "HSV triangle" }]} />
    {model === "oklch" ? <OklchSliders color={color} onChange={onChange} /> : <HsvTrianglePicker color={color} onChange={onChange} />}
    <label className="grid gap-1 text-sm">Hex color
      <Input aria-label={hexLabel} className="w-full min-w-0" value={color} aria-invalid={!isHexColor(color)} spellCheck={false} onChange={event => onChange(event.target.value)}
        onFocus={() => { if (isHexColor(color)) originalHex.current = color }}
        onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onChange(originalHex.current) } }} />
    </label>
  </div>
}
