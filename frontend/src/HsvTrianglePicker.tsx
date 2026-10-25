import { useEffect, useRef, useState, type PointerEvent } from "react"
import { BandNumberInput } from "./BandNumberInput"
import { hexToHsv, hsvToHex, isHexColor } from "./editor"
import { hsvPickerCenter, hsvTriangleContains, hsvTrianglePoint, hsvTriangleValue, hueWheelPoint, hueWheelValue, triangleWeights, type PickerPoint } from "./hsvTriangle"

export function HsvTrianglePicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [edited, setEdited] = useState<{ hex: string; channels: ReturnType<typeof hexToHsv> } | null>(null)
  const channels = edited?.hex === color ? edited.channels : hexToHsv(isHexColor(color) ? color : "#000000")
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<"hue" | "triangle" | null>(null)
  const { hue, saturation, value } = channels
  const selected = hsvTrianglePoint(saturation, value, hue)
  const hueHandle = hueWheelPoint(hue)
  const vertices = [[1, 1], [0, 1], [0, 0]].map(([s, v]) => hsvTrianglePoint(s, v, 0))
  const points = vertices.map(point => `${point.x},${point.y}`).join(" ")

  useEffect(() => {
    const context = canvas.current?.getContext("2d")
    if (!context) return
    const pixels = context.createImageData(220, 220)
    const hex = hsvToHex(hue, 1, 1)
    const rgb = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16))
    for (let y = 45; y < 176; y += 1) {
      for (let x = 72; x < 185; x += 1) {
        const weights = triangleWeights({ x: x + 0.5, y: y + 0.5 })
        if (weights.some(weight => weight < 0)) continue
        const offset = (y * 220 + x) * 4
        for (let channel = 0; channel < 3; channel += 1) pixels.data[offset + channel] = Math.round(weights[0] * rgb[channel] + weights[1] * 255)
        pixels.data[offset + 3] = 255
      }
    }
    context.putImageData(pixels, 0, 0)
  }, [hue])

  function change(next: typeof channels) {
    const hex = hsvToHex(next.hue, next.saturation, next.value)
    setEdited({ hex, channels: next })
    onChange(hex)
  }
  function point(event: PointerEvent<SVGSVGElement>): PickerPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / bounds.width * 220, y: (event.clientY - bounds.top) / bounds.height * 220 }
  }
  function pick(position: PickerPoint) {
    if (drag.current === "hue") change({ ...channels, hue: hueWheelValue(position) })
    else change({ ...channels, ...hsvTriangleValue(position, hue) })
  }
  function release(event: PointerEvent<SVGSVGElement>) {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <div className="grid gap-4">
    <div className="hsv-triangle-picker">
      <div className="hsv-hue-ring" aria-hidden="true" />
      <canvas ref={canvas} width={220} height={220} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" style={{ transform: `rotate(${hue}deg)` }} />
      <svg viewBox="0 0 220 220" className="relative block w-full touch-none select-none" role="group" aria-label="HSV triangle color picker"
        onPointerDown={event => {
          if (event.button !== 0) return
          const position = point(event)
          const radius = Math.hypot(position.x - hsvPickerCenter, position.y - hsvPickerCenter)
          if (radius >= 81 && radius <= 105) drag.current = "hue"
          else if (hsvTriangleContains(position, hue)) drag.current = "triangle"
          else return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pick(position)
        }}
        onPointerMove={event => { if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) pick(point(event)) }}
        onPointerUp={release} onPointerCancel={release}>
        <circle className="hsv-hue-control" role="slider" aria-label="Color hue" tabIndex={0} cx={110} cy={110} r={91} fill="none" stroke="transparent" strokeWidth={24} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Number(hue.toFixed(1))} aria-valuetext={`${Number(hue.toFixed(1))} degrees`}
          onKeyDown={event => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
            if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) return
            event.preventDefault()
            const next = event.key === "Home" ? 0 : event.key === "End" ? 360 : (hue + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 10 : 1) + 360) % 360
            change({ ...channels, hue: next })
          }} />
        <circle className="hsv-hue-focus" cx={110} cy={110} r={104} fill="none" stroke="var(--ring)" strokeWidth={2} aria-hidden="true" pointerEvents="none" />
        <polygon points={points} transform={`rotate(${hue} 110 110)`} fill="transparent" stroke="var(--border)" strokeWidth={1} aria-hidden="true" />
        {[hueHandle, selected].map((handle, index) => <g key={index} aria-hidden="true" pointerEvents="none">
          <circle cx={handle.x} cy={handle.y} r={5} fill="none" stroke="#171717" strokeWidth={4} />
          <circle cx={handle.x} cy={handle.y} r={5} fill={index === 0 ? hsvToHex(hue, 1, 1) : hsvToHex(hue, saturation, value)} stroke="white" strokeWidth={2} />
        </g>)}
      </svg>
    </div>
    <p className="text-xs text-muted-foreground">Drag the hue ring. Move inside the triangle for saturation and brightness.</p>
    <div className="grid grid-cols-3 items-end gap-2">
      {([
        ["hue", "Hue °", 360, 1, 1],
        ["saturation", "Saturation %", 100, 1, 100],
        ["value", "Brightness %", 100, 1, 100],
      ] as const).map(([key, label, max, step, scale]) => <label key={key} className="grid min-w-0 gap-1 text-xs">
        {label}<BandNumberInput className="w-full min-w-0" aria-label={`Color ${key === "value" ? "brightness" : key} value`} value={Number((channels[key] * scale).toFixed(1))} min={0} max={max} step={step} onChange={number => change({ ...channels, [key]: number / scale })} />
      </label>)}
    </div>
  </div>
}
