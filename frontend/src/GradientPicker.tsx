import { NativeSelect } from "@/components/ui/native-select"
import { Plus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ColorEditor, type ColorModel } from "./ColorEditor"
import { hexToOklch, isHexColor, sampleOklabRamp, type GradientBlend, type HuePath } from "./editor"

const fieldClass = "w-full min-w-0"

export function GradientPicker({ colors, positions, blend, huePath, displayColors, exposureScale, exposureUnit = "stops", onChange }: {
  colors: string[]
  positions: number[]
  blend: GradientBlend
  huePath: HuePath
  displayColors?: string[]
  exposureScale?: number[]
  exposureUnit?: string
  onChange: (colors: string[], positions: number[]) => void
}) {
  const [selection, setSelection] = useState(0)
  const [colorModel, setColorModel] = useState<ColorModel>("oklch")
  const selected = Math.min(selection, colors.length - 1)
  const exposureAnchored = exposureScale !== undefined
  function positionLabel(position: number) {
    if (!exposureScale) return `${Math.round(position * 100)}%`
    const scaled = position * (exposureScale.length - 1)
    const left = Math.min(Math.floor(scaled), exposureScale.length - 2)
    return `${Number((exposureScale[left] + (exposureScale[left + 1] - exposureScale[left]) * (scaled - left)).toFixed(1))} ${exposureUnit}`
  }
  const referenceIndex = exposureAnchored ? positions.indexOf(0.5) : -1
  const anchors = colors.map((color, index) => ({ ...hexToOklch(isHexColor(color) ? color : "#2563eb"), position: positions[index] }))
  const gradient = (displayColors ?? Array.from({ length: 65 }, (_, index) => sampleOklabRamp(anchors, index / 64, blend, huePath))).join(",")

  function add(position?: number) {
    if (colors.length >= 32) return
    if (position === undefined) {
      const gaps = positions.slice(1).map((value, index) => value - positions[index])
      const index = gaps.indexOf(Math.max(...gaps))
      position = (positions[index] + positions[index + 1]) / 2
    }
    const nearest = positions.findIndex((value) => Math.abs(value - position!) < 0.01)
    if (nearest >= 0) { setSelection(nearest); return }
    const index = positions.findIndex((value) => value > position!)
    const insertion = index < 0 ? colors.length : index
    const nextColors = [...colors]
    const nextPositions = [...positions]
    nextColors.splice(insertion, 0, sampleOklabRamp(anchors, position, blend, huePath))
    nextPositions.splice(insertion, 0, position)
    onChange(nextColors, nextPositions)
    setSelection(insertion)
  }

  function move(index: number, position: number) {
    const minimum = index === 0 ? 0 : positions[index - 1] + 0.01
    const maximum = index === colors.length - 1 ? 1 : positions[index + 1] - 0.01
    onChange(colors, positions.map((value, i) => i === index ? Math.max(minimum, Math.min(maximum, position)) : value))
  }

  function remove() {
    if (colors.length <= 2) return
    onChange(colors.filter((_, index) => index !== selected), positions.filter((_, index) => index !== selected))
    setSelection(Math.max(0, selected - 1))
  }

  return <div className="grid gap-4 rounded-lg border p-4">
    <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{exposureAnchored ? `≤ ${positionLabel(0)}` : "Low exposure"}</span>{exposureAnchored && <span>{positionLabel(0.5)} · ref</span>}<span>{exposureAnchored ? `≥ ${positionLabel(1)}` : "High exposure"}</span></div>
    <div className="mx-6 relative h-14" role="group" aria-label="Gradient color stops">
      <button type="button" aria-label="Add color on gradient" className="gradient-bar absolute inset-x-0 top-3 h-8 w-full rounded-md border" style={{ background: `linear-gradient(to right, ${gradient})` }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          add(event.detail === 0 || bounds.width === 0 ? undefined : Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)))
        }} />
      {colors.map((color, index) => <button key={index} type="button" role="slider" aria-label={`Color stop ${index + 1}`} aria-valuemin={Math.round((index === 0 ? 0 : positions[index - 1] + 0.01) * 100)} aria-valuemax={Math.round((index === colors.length - 1 ? 1 : positions[index + 1] - 0.01) * 100)} aria-valuenow={Math.round(positions[index] * 100)} aria-valuetext={`${positionLabel(positions[index])}, ${color}${selected === index ? ", selected" : ""}`} aria-orientation="horizontal"
        className="absolute top-1 flex size-12 -translate-x-1/2 touch-pan-y items-center justify-center rounded-md"
        style={{ left: `${positions[index] * 100}%` }}
        onFocus={() => setSelection(index)}
        onClick={() => setSelection(index)}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.pointerType === "touch") return
          setSelection(index)
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
          if (bounds.width > 0) move(index, (event.clientX - bounds.left) / bounds.width)
        }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
          if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault()
            setSelection(index)
            move(index, event.key === "Home" ? 0 : event.key === "End" ? 1 : positions[index] + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01))
          }
        }}>
        <span aria-hidden="true" className={`size-6 rounded-full border-2 border-white shadow-[0_0_0_1px_#171717] ${selected === index ? "ring-2 ring-foreground ring-offset-4 ring-offset-card" : ""}`} style={{ background: isHexColor(color) ? color : "#2563eb" }} />
      </button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="pointer-adjustment text-xs text-muted-foreground">Click the bar to add a color. Drag a dot to move it. Keep at least two colors.</p>
      <Button type="button" variant="outline" size="sm" disabled={colors.length >= 32} onClick={() => add()}><Plus data-icon="inline-start" aria-hidden="true" />Add color</Button>
    </div>
    <div className="grid gap-4 border-t pt-4">
      <div className="touch-adjustment grid gap-3">
        <label className="grid gap-1 text-sm">Selected color<NativeSelect aria-label="Selected color" className={fieldClass} value={selected} onChange={(event) => setSelection(Number(event.target.value))}>{colors.map((_, index) => <option key={index} value={index}>Color {index + 1} · {positionLabel(positions[index])}</option>)}</NativeSelect></label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={positions[selected] <= (selected === 0 ? 0 : positions[selected - 1] + 0.01)} onClick={() => move(selected, positions[selected] - 0.01)}><ChevronLeft data-icon="inline-start" aria-hidden="true" />Move left</Button>
          <Button type="button" variant="outline" disabled={positions[selected] >= (selected === colors.length - 1 ? 1 : positions[selected + 1] - 0.01)} onClick={() => move(selected, positions[selected] + 0.01)}><ChevronRight data-icon="inline-start" aria-hidden="true" />Move right</Button>
        </div>
        <p className="text-xs text-muted-foreground">Tap to select. Use buttons to adjust; swipe vertically to scroll.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="size-12 shrink-0 rounded-md border" style={{ backgroundColor: isHexColor(colors[selected]) ? colors[selected] : undefined }} />
          <div><h4 className="text-sm font-medium">Color {selected + 1} <span className="font-normal text-muted-foreground">· {positionLabel(positions[selected])}{selected === referenceIndex ? " · reference" : exposureAnchored ? "" : " of ramp"}</span></h4>
          <p className="font-mono text-xs text-muted-foreground">{isHexColor(colors[selected]) ? colors[selected].toUpperCase() : "Enter a valid hex color"}</p></div>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Remove selected color" disabled={colors.length <= 2} onClick={remove}><Trash2 data-icon="inline-start" aria-hidden="true" />Remove selected color</Button>
      </div>
      <ColorEditor color={colors[selected]} model={colorModel} onModelChange={setColorModel} onChange={(color) => onChange(colors.map((item, index) => index === selected ? color : item), positions)} />
    </div>
    <p className="sr-only">Select a dot to edit its color. Use arrow keys to move it, Shift for larger steps, or Home and End. Keep 2 to 32 colors.</p>
  </div>
}
