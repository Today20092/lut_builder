import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { Popover } from "@base-ui/react/popover"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import referenceImage from "@/assets/lut-preview-reference.jpg"
import {
  applyColorPreset,
  applyBandPreset,
  applyFillPreset,
  activeRampAnchors,
  changeMode,
  contrastTextColor,
  createBand,
  exportSetup,
  filterPalette,
  hexToHsv,
  hsvToHex,
  importSetup,
  isHexColor,
  maxSrgbChroma,
  oklabSeparation,
  resizeBandWidth,
  removeBand,
  snapBandValue,
  stepBandValue,
  orderBands,
  oklchToHex,
  sampleOklabRamp,
  updateBand,
  updateFillBoundary,
  vividRampAnchors,
  widestSrgbRamp,
  type LightnessProfile,
  type FillPreset,
  type BandPreset,
  type Mode,
  type OklchAnchor,
  type PaletteColor,
  type Setup,
} from "@/editor"

type Catalog = {
  profiles: string[]
  targets: string[]
  palette: PaletteColor[]
}

type Preview = {
  minimum: number
  maximum: number
  unit: string
  colors: string[]
  overlays: (string | null)[]
  input_overlays: (string | null)[]
  input_exposure: number[]
  legend: { kind: string; color: string; label: string }[]
  warnings: string[]
  setup: Setup
}

export function previewColorAt(colors: string[], luminance: number) {
  return colors[Math.round(Math.max(0, Math.min(1, luminance)) * (colors.length - 1))] ?? "#000000"
}

export function previewOverlayAt(colors: (string | null)[], luminance: number) {
  return colors[Math.round(Math.max(0, Math.min(1, luminance)) * (colors.length - 1))] ?? null
}

export function displayPreviewOverlayAt(
  colors: (string | null)[],
  luminance: number,
  minimum: number,
  maximum: number,
  unit: string,
) {
  const exposure = unit === "IRE"
    ? luminance * 100
    : Math.log2(Math.max(luminance, 1e-6) / 0.18)
  return previewOverlayAt(colors, (exposure - minimum) / (maximum - minimum))
}

export function overlayForExposure(setup: Setup, exposure: number) {
  if (setup.fill_mode && setup.bands.length) {
    const bands = [...setup.bands].sort((left, right) => left.stop - right.stop)
    return bands.find((band) => exposure < band.stop)?.color ?? bands.at(-1)!.color
  }
  let color: string | null = null
  for (const band of setup.bands) {
    if (Math.abs(exposure - band.stop) <= band.width) color = band.color
  }
  return color
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function interpolate(values: number[], position: number) {
  const scaled = Math.max(0, Math.min(1, position)) * (values.length - 1)
  const lower = Math.floor(scaled)
  const upper = Math.min(values.length - 1, lower + 1)
  return values[lower] + (values[upper] - values[lower]) * (scaled - lower)
}

function LutImagePreview({ preview }: { preview: Preview | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [imageUrl, setImageUrl] = useState(referenceImage)
  const [showLut, setShowLut] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [inputMode, setInputMode] = useState<"display" | "log">("display")
  const [opacity, setOpacity] = useState(100)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d", { willReadFrequently: true })
    if (!canvas || !context) return

    const draw = (image?: HTMLImageElement) => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (image) {
        const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
        const width = image.naturalWidth * scale
        const height = image.naturalHeight * scale
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      } else {
        const sky = context.createLinearGradient(0, 0, 0, canvas.height)
        sky.addColorStop(0, "#9dc7df")
        sky.addColorStop(0.55, "#d8c5a6")
        sky.addColorStop(1, "#30291f")
        context.fillStyle = sky
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = "#17191c"
        context.fillRect(0, 250, canvas.width, 110)
        context.fillStyle = "#b98063"
        context.beginPath()
        context.arc(450, 158, 72, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = "#34271f"
        context.beginPath()
        context.arc(450, 122, 75, Math.PI, Math.PI * 2)
        context.fill()
        for (let index = 0; index < 7; index += 1) {
          const level = Math.round(index / 6 * 255)
          context.fillStyle = `rgb(${level} ${level} ${level})`
          context.fillRect(28 + index * 54, 270, 44, 54)
        }
      }

      if (!showLut || !preview?.overlays.length) return
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        const red = pixels.data[offset] / 255
        const green = pixels.data[offset + 1] / 255
        const blue = pixels.data[offset + 2] / 255
        const encodedLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        const linearLuminance = srgbToLinear(red) * 0.2126 + srgbToLinear(green) * 0.7152 + srgbToLinear(blue) * 0.0722
        const exposure = inputMode === "log"
          ? interpolate(preview.input_exposure, encodedLuminance)
          : preview.setup.band_mode === "ire"
            ? encodedLuminance * 100
            : Math.log2(Math.max(linearLuminance, 1e-6) / 0.18)
        const overlay = overlayForExposure(preview.setup, exposure)
        const luminance = inputMode === "log" ? encodedLuminance : linearLuminance
        if (preview.setup.monochrome) {
          const grey = Math.round(luminance * 255)
          pixels.data[offset] = grey
          pixels.data[offset + 1] = grey
          pixels.data[offset + 2] = grey
        }
        if (overlay) {
          const alpha = opacity / 100
          pixels.data[offset] = pixels.data[offset] * (1 - alpha) + Number.parseInt(overlay.slice(1, 3), 16) * alpha
          pixels.data[offset + 1] = pixels.data[offset + 1] * (1 - alpha) + Number.parseInt(overlay.slice(3, 5), 16) * alpha
          pixels.data[offset + 2] = pixels.data[offset + 2] * (1 - alpha) + Number.parseInt(overlay.slice(5, 7), 16) * alpha
        }
      }
      context.putImageData(pixels, 0, 0)
    }

    if (!imageUrl) return draw()
    const image = new Image()
    image.onload = () => draw(image)
    image.onerror = () => draw()
    image.src = imageUrl
  }, [imageUrl, inputMode, opacity, preview, showLut])

  return (
    <aside className="z-30 xl:fixed xl:bottom-6 xl:right-6 xl:w-96">
      <Card className="overflow-hidden border-white/15 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader className="flex-row items-center justify-between gap-3 py-3">
          <div>
            <CardTitle className="text-base">Live LUT preview</CardTitle>
            {!collapsed && <CardDescription>Exposure colors update as you edit.</CardDescription>}
          </div>
          <Button
            aria-controls="live-lut-preview-content"
            aria-expanded={!collapsed}
            className="-mr-2 gap-1"
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "Show preview" : "Hide preview"}
            {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </Button>
        </CardHeader>
        {!collapsed && (
          <CardContent id="live-lut-preview-content" className="grid gap-3 pb-4">
            <canvas ref={canvasRef} className="aspect-video w-full rounded-md bg-black object-cover" height="360" width="640" aria-label={showLut ? "Image with the current LUT preview applied" : "Original preview image"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant={showLut ? "default" : "outline"} onClick={() => setShowLut((value) => !value)}>{showLut ? "LUT on" : "LUT off"}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>Choose image</Button>
              {imageUrl !== referenceImage && <Button type="button" size="sm" variant="ghost" onClick={() => setImageUrl(referenceImage)}>Reference photo</Button>}
              <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => setImageUrl(String(reader.result))
                reader.readAsDataURL(file)
                event.target.value = ""
              }} />
            </div>
            <label className="grid gap-1 text-xs font-medium">Image encoding
              <select className={fieldClass} value={inputMode} onChange={(event) => setInputMode(event.target.value as "display" | "log")}>
                <option value="display">Already graded / sRGB image</option>
                <option value="log">Camera log · {preview?.setup.profile ?? "selected camera"}</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">Overlay opacity · {opacity}%
              <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
            </label>
            <p className="text-[11px] text-muted-foreground">At 100%, band colors match their configured hex values exactly. Lower opacity blends them with the image. Images stay in this browser session.</p>
          </CardContent>
        )}
      </Card>
    </aside>
  )
}

declare global {
  interface Window {
    LUT_BUILDER_TOKEN: string
    LUT_BUILDER_SETUP: Setup
    LUT_BUILDER_CATALOG: Catalog
  }
}

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"

async function postJson<T>(path: string, setup: Setup): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN,
    },
    body: JSON.stringify({ version: 1, ...setup }),
  })
  if (!response.ok) {
    const result = (await response.json()) as { error?: string }
    throw new Error(result.error || "Request failed")
  }
  return response.json() as Promise<T>
}

export function ColorPicker({
  label,
  value,
  palette,
  disabled = false,
  hideLabel = false,
  onChange,
}: {
  label: string
  value: string
  palette: PaletteColor[]
  disabled?: boolean
  hideLabel?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [showPresets, setShowPresets] = useState(false)
  const [hue, setHue] = useState(() => hexToHsv(isHexColor(value) ? value : "#000000").hue)
  const originalValue = useRef(value)
  const matches = useMemo(
    () => filterPalette(palette, search),
    [palette, search],
  )
  const presetGroups = Object.entries(matches.reduce<Record<string, PaletteColor[]>>((groups, color) => {
    const family = color.name.replace(/-\d+$/, "")
    ;(groups[family] ??= []).push(color)
    return groups
  }, {}))
  const paletteColumnCount = new Set(palette.map((color) => color.name.replace(/-\d+$/, ""))).size
  const hsv = hexToHsv(isHexColor(value) ? value : "#000000")

  function pickSaturation(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    const brightness = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height))
    onChange(hsvToHex(hue, saturation, brightness))
  }

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className={hideLabel ? "sr-only" : "text-sm font-medium"}>{label}</legend>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (nextOpen) { originalValue.current = value; setHue(hsv.hue) }
          if (!nextOpen && eventDetails.reason === "escape-key") {
            onChange(originalValue.current)
          }
          setOpen(nextOpen)
        }}
      >
        <Popover.Trigger
          aria-label={`Open ${label} picker`}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded border border-black/10"
            style={{ backgroundColor: isHexColor(value) ? value : "#000000" }}
          />
          {value}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            align="start"
            className="z-50"
            collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "end" }}
            sideOffset={8}
          >
            <Popover.Popup
              aria-label={`${label} picker`}
              className={`flex max-h-[var(--available-height)] max-w-[calc(100vw-2rem)] items-start gap-4 overflow-hidden rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none ${showPresets ? "w-[78rem]" : "w-80"}`}
            >
              <div className="grid w-[calc(20rem-1.5rem-2px)] shrink-0 gap-3">
              <div
                aria-label={`${label} saturation and brightness`}
                className="relative h-44 w-full cursor-crosshair touch-none select-none overflow-hidden rounded-md border border-white/10"
                style={{ backgroundColor: hsvToHex(hue, 1, 1), backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)" }}
                onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pickSaturation(event) }}
                onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickSaturation(event) }}
              >
                <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#000]" style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }} />
              </div>
              <input
                aria-label={`${label} hue`}
                className="hue-slider"
                type="range"
                min="0"
                max="359"
                value={Math.round(hue)}
                onChange={(event) => { const nextHue = Number(event.target.value); setHue(nextHue); onChange(hsvToHex(nextHue, hsv.saturation, hsv.value)) }}
              />
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
                <label htmlFor={`${label}-saturation`}>Saturation</label>
                <input id={`${label}-saturation`} type="range" min="0" max="100" value={Math.round(hsv.saturation * 100)} onChange={(event) => onChange(hsvToHex(hue, Number(event.target.value) / 100, hsv.value))} />
                <label htmlFor={`${label}-brightness`}>Brightness</label>
                <input id={`${label}-brightness`} type="range" min="0" max="100" value={Math.round(hsv.value * 100)} onChange={(event) => onChange(hsvToHex(hue, hsv.saturation, Number(event.target.value) / 100))} />
              </div>
              <input
                aria-label={`${label} hex color`}
                aria-invalid={!isHexColor(value)}
                className={fieldClass}
                value={value}
                placeholder="#rrggbb"
                onChange={(event) => { const next = event.target.value; if (isHexColor(next)) setHue(hexToHsv(next).hue); onChange(next) }}
              />
              <Button type="button" size="sm" variant="outline" aria-expanded={showPresets} onClick={() => setShowPresets((shown) => !shown)}>Tailwind presets</Button>
              </div>
              {showPresets && <div className="grid h-[30rem] min-w-0 flex-1 grid-rows-[auto_1fr] gap-3">
                <input aria-label={`Search ${label} palette`} className={fieldClass} value={search} placeholder="Search red-500 or #ef44" onChange={(event) => setSearch(event.target.value)} />
                <div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${paletteColumnCount}, minmax(0, 1fr))` }}>
                  {presetGroups.map(([family, colors]) => <div className="grid min-w-0 grid-rows-[auto_repeat(11,minmax(0,1fr))] gap-2" key={family}>
                    <span className="truncate text-center text-[10px] text-muted-foreground" title={family}>{family}</span>
                    {colors.map((color) => (
                      <button aria-label={color.name} aria-pressed={color.hex.toLowerCase() === value.toLowerCase()} className={`min-h-0 rounded border border-black/10 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring ${color.hex.toLowerCase() === value.toLowerCase() ? "ring-2 ring-white ring-offset-2 ring-offset-black" : ""}`} key={color.name} title={color.name} type="button" style={{ backgroundColor: color.hex }} onClick={() => { setHue(hexToHsv(color.hex).hue); onChange(color.hex) }} />
                    ))}
                  </div>)}
                </div>
              </div>}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </fieldset>
  )
}

export function ExposureGraph({
  setup,
  preview,
  increment,
  selectedBand,
  onSelect,
  onChange,
  onWidthChange,
}: {
  setup: Setup
  preview: Preview
  increment: number
  selectedBand: number
  onSelect: (index: number) => void
  onChange: (index: number, stop: number) => void
  onWidthChange: (index: number, width: number) => void
}) {
  const graph = useRef<HTMLDivElement>(null)
  const position = (value: number) =>
    Math.max(
      0,
      Math.min(
        100,
        ((value - preview.minimum) / (preview.maximum - preview.minimum)) * 100,
      ),
    )
  const bounds = setup.band_mode === "ire"
    ? ([preview.minimum, preview.maximum] as const)
    : ([-Infinity, Infinity] as const)
  const interactiveBands = setup.fill_mode ? setup.bands.slice(0, -1) : setup.bands
  const belowIndexes = interactiveBands.flatMap((band, index) =>
    band.stop < preview.minimum ? [index] : [],
  )
  const aboveIndexes = interactiveBands.flatMap((band, index) =>
    band.stop > preview.maximum ? [index] : [],
  )
  const ticks = setup.band_mode === "stops"
    ? Array.from(
        { length: preview.maximum - preview.minimum + 1 },
        (_, index) => preview.minimum + index,
      )
    : Array.from({ length: 11 }, (_, index) => index * 10)
  const selected = interactiveBands[selectedBand]
  const unitLabel = setup.band_mode === "stops" ? "stops from reference" : preview.unit
  const selectedReadout = selected && (setup.fill_mode
    ? `Boundary ${selectedBand + 1} · ${selected.stop} ${preview.unit}`
    : `Band ${selectedBand + 1} · center ${selected.stop} ${preview.unit} · ±${selected.width} ${preview.unit}`)

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? -1
          : null
    if (direction === null) return
    event.preventDefault()
    onChange(index, stepBandValue(setup.bands[index].stop, direction, increment, ...bounds))
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !graph.current) return
    const graphBounds = graph.current.getBoundingClientRect()
    const ratio = (event.clientX - graphBounds.left) / graphBounds.width
    const value = preview.minimum + ratio * (preview.maximum - preview.minimum)
    onChange(index, snapBandValue(value, increment, ...bounds))
  }

  function handleWidthPointerMove(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const graphBounds = event.currentTarget.parentElement!.getBoundingClientRect()
    const ratio = (event.clientX - graphBounds.left) / graphBounds.width
    const edge = preview.minimum + ratio * (preview.maximum - preview.minimum)
    onWidthChange(index, resizeBandWidth(setup.bands[index].stop, edge))
  }

  return (
    <div className="grid gap-1">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
      <span className="font-medium">Exposure · {unitLabel}</span>
      <span className="text-muted-foreground">Range {preview.minimum} to {preview.maximum} {preview.unit}</span>
    </div>
    <div
      ref={graph}
      className="relative flex h-28 touch-none overflow-hidden rounded-lg border"
      aria-label={`Editable exposure graph from ${preview.minimum} to ${preview.maximum} ${preview.unit}`}
    >
      {preview.colors.map((color, index) => (
        <span
          className="flex-1"
          data-preview-color={index}
          key={index}
          style={{ backgroundColor: setup.fill_mode ? color : undefined }}
        />
      ))}
      {setup.low_signal_warning && (
        <span
          className="pointer-events-none absolute bottom-1 left-1 z-30 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow"
          style={{ backgroundColor: setup.low_signal_hex, color: contrastTextColor(setup.low_signal_hex) }}
          title="Low recorded-signal warning is enabled; shadow detail may be buried in noise"
        >
          Low signal
        </span>
      )}
      {setup.high_signal_warning && (
        <span
          className="pointer-events-none absolute bottom-1 right-1 z-30 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow"
          style={{ backgroundColor: setup.high_signal_hex, color: contrastTextColor(setup.high_signal_hex) }}
          title="High recorded-signal warning is enabled; one or more recorded channels may be clipped"
        >
          High signal
        </span>
      )}
      {ticks.map((tick) => (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 z-[1] border-l mix-blend-difference ${tick === 0 ? "z-[2] border-l-2 border-white/90" : "border-white/35"}`}
          data-scale-guide={tick}
          key={`guide-${tick}`}
          style={{ left: `${position(tick)}%` }}
        />
      ))}
      {belowIndexes.length > 0 && (
        <button
          type="button"
          className="absolute left-1 top-1 z-20 rounded bg-background/90 px-1 text-xs font-medium"
          aria-label={`${belowIndexes.length} bands below the visible range`}
          onClick={() => onSelect(belowIndexes[0])}
        >
          ← {belowIndexes.length} outside
        </button>
      )}
      {aboveIndexes.length > 0 && (
        <button
          type="button"
          className="absolute right-1 top-1 z-20 rounded bg-background/90 px-1 text-xs font-medium"
          aria-label={`${aboveIndexes.length} bands above the visible range`}
          onClick={() => onSelect(aboveIndexes[0])}
        >
          {aboveIndexes.length} outside →
        </button>
      )}
      {!setup.fill_mode && setup.bands.map((band, index) => {
        const left = position(band.stop - band.width)
        const right = position(band.stop + band.width)
        return (
          <span
            aria-hidden="true"
            className="absolute inset-y-0"
            data-band-width={index}
            key={`width-${index}`}
            style={{
              backgroundColor: band.color,
              left: `${left}%`,
              width: `${right - left}%`,
            }}
          />
        )
      })}
      {!setup.fill_mode && setup.bands.map((band, index) => [-1, 1].map((side) => (
          <button
            aria-label={`Resize ${side < 0 ? "left" : "right"} edge of band ${index + 1}`}
            aria-valuemin={0.1}
            aria-valuenow={band.width}
            aria-valuetext={`${band.width} ${preview.unit} half-width`}
            className={`absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize bg-transparent outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-white after:shadow hover:after:w-1 focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "after:w-1" : ""}`}
            key={`${index}-${side}`}
            role="slider"
            style={{ left: `${position(band.stop + side * band.width)}%` }}
            type="button"
            onKeyDown={(event) => {
              const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0
              if (!direction) return
              event.preventDefault()
              onSelect(index)
              onWidthChange(index, Math.max(0.1, Number((band.width + direction * side * 0.1).toFixed(1))))
            }}
            onPointerDown={(event) => {
              onSelect(index)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => handleWidthPointerMove(event, index)}
          />
      )))}
      {setup.bands.map((band, index) => {
        if (setup.fill_mode && index === setup.bands.length - 1) return null
        const below = band.stop < preview.minimum
        const above = band.stop > preview.maximum
        const edge = below || above
        if (edge && selectedBand !== index) return null
        return (
          <button
            key={`handle-${index}`}
            type="button"
            className={setup.fill_mode
              ? `absolute inset-y-0 z-10 w-6 -translate-x-1/2 bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-background after:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "ring-2 ring-ring" : ""}`
              : `absolute z-10 rounded-full border-2 border-background px-2 py-1 text-xs font-semibold shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "ring-2 ring-ring ring-offset-2" : ""}`}
            style={{
              left: `${position(band.stop)}%`,
              ...(setup.fill_mode ? {} : {
                backgroundColor: band.color,
                color: contrastTextColor(band.color),
                top: edge ? "70%" : "50%",
                transform: edge
                  ? `translate(${below ? "0" : "-100%"}, -50%)`
                  : "translate(-50%, -50%)",
              }),
            }}
            aria-label={setup.fill_mode
              ? `Boundary between colors ${index + 1} and ${index + 2}, ${band.stop} ${preview.unit}`
              : `Band ${index + 1}, ${band.stop} ${preview.unit}${edge ? ", outside visible range" : ""}`}
            title={edge ? `${band.stop} ${preview.unit} is outside the visible range` : undefined}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPointerDown={(event) => {
              onSelect(index)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => handlePointerMove(event, index)}
          >
            {!setup.fill_mode && <>{below ? "← " : ""}{band.stop}{above ? " →" : ""}</>}
          </button>
        )
      })}
    </div>
    <div className="relative h-8 text-[10px] text-muted-foreground" aria-label={`${preview.unit} scale`}>
      {ticks.map((tick) => (
        <span className="absolute top-0 flex -translate-x-1/2 flex-col items-center" key={tick} style={{ left: `${position(tick)}%` }}>
          <span aria-hidden="true" className="h-2 border-l border-current" />
          {tick > 0 ? `+${tick}` : tick}
        </span>
      ))}
    </div>
    {selectedReadout && (
      <output className="text-[11px] text-muted-foreground" aria-live="polite">{selectedReadout}</output>
    )}
    </div>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={text}
        className="inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] text-muted-foreground"
        render={<span tabIndex={0} />}
      >
        ?
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

function OklchEndpointPicker({
  points,
  onChange,
}: {
  points: [OklchAnchor, OklchAnchor]
  onChange: (points: [OklchAnchor, OklchAnchor]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sharedChroma = points[0].c
  const maximumSharedChroma = Math.min(0.35, maxSrgbChroma(points[0]), maxSrgbChroma(points[1]))
  const separation = oklabSeparation(points[0], points[1]) * 100

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const image = context.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const hex = oklchToHex({ l: 1 - y / (canvas.height - 1), c: sharedChroma, h: x / (canvas.width - 1) * 360 })
        const offset = (y * canvas.width + x) * 4
        image.data[offset] = Number.parseInt(hex.slice(1, 3), 16)
        image.data[offset + 1] = Number.parseInt(hex.slice(3, 5), 16)
        image.data[offset + 2] = Number.parseInt(hex.slice(5, 7), 16)
        image.data[offset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [sharedChroma])

  function move(event: PointerEvent<HTMLButtonElement>, index: number) {
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
    const h = Math.max(0, Math.min(359, (event.clientX - bounds.left) / bounds.width * 360))
    const l = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height))
    onChange(points.map((point, pointIndex) => pointIndex === index ? { ...point, h, l } : point) as [OklchAnchor, OklchAnchor])
  }

  return (
    <div className="grid max-w-xl gap-3">
      <div
        aria-label="Custom OKLCH endpoints: horizontal is hue and vertical is lightness"
        className="relative h-56 overflow-hidden rounded-xl border border-neutral-700 bg-black bg-clip-padding"
      >
        <canvas aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" height="112" ref={canvasRef} width="180" />
        {points.map((point, index) => (
          <button
            aria-label={`Drag ${index === 0 ? "shadow" : "highlight"} endpoint`}
            className="absolute size-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white shadow-[0_0_0_2px_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={index}
            style={{ backgroundColor: oklchToHex(point), left: `${point.h / 360 * 100}%`, top: `${(1 - point.l) * 100}%` }}
            type="button"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event, index) }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event, index) }}
          />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">Shared chroma: {sharedChroma.toFixed(2)}
          <input
            aria-label="Custom ramp chroma"
            max="0.35"
            min="0"
            step="0.01"
            type="range"
            value={sharedChroma}
            onChange={(event) => onChange(points.map((point) => ({ ...point, c: Number(event.target.value) })) as [OklchAnchor, OklchAnchor])}
          />
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(points.map((point) => ({ ...point, c: maximumSharedChroma })) as [OklchAnchor, OklchAnchor])}>
            Max vividness
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(widestSrgbRamp())}>
            Max sRGB range
          </Button>
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {points.map((point, index) => <span key={index}>{index === 0 ? "Shadow" : "Highlight"}: OKLCH({point.l.toFixed(2)} {point.c.toFixed(2)} {Math.round(point.h)}°)</span>)}
      </div>
      <div className="text-xs text-muted-foreground">OKLab separation: {separation.toFixed(1)} · Lightness difference: {(Math.abs(points[1].l - points[0].l) * 100).toFixed(1)}</div>
    </div>
  )
}

export function App() {
  const catalog = window.LUT_BUILDER_CATALOG
  const [setup, setSetup] = useState<Setup>(window.LUT_BUILDER_SETUP)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [validationError, setValidationError] = useState("")
  const [status, setStatus] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [stopIncrement, setStopIncrement] = useState<1 | 0.5 | 0.25>(0.25)
  const [colorPreset, setColorPreset] = useState<"false-color" | "gradient">("gradient")
  const [fillPreset, setFillPreset] = useState<FillPreset>("standard")
  const [bandPreset, setBandPreset] = useState<BandPreset>("standard")
  const [rampPreset, setRampPreset] = useState<"vivid" | "exposure" | "custom">("vivid")
  const [lightnessProfile, setLightnessProfile] = useState<LightnessProfile>("custom")
  const [customRampAnchors, setCustomRampAnchors] = useState<[OklchAnchor, OklchAnchor]>(() => {
    const vivid = vividRampAnchors(catalog.palette)
    return [vivid[1] ?? { l: 0.5, c: 0.2, h: 260 }, vivid.at(-2) ?? { l: 0.8, c: 0.2, h: 50 }]
  })
  const [selectedBandIndex, setSelectedBandIndex] = useState(0)
  const [removingBandIndex, setRemovingBandIndex] = useState<number | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const mode: Mode = setup.fill_mode ? "fill" : setup.band_mode
  const movementIncrement = mode === "ire" ? 1 : stopIncrement
  const selectedBand = Math.max(0, Math.min(selectedBandIndex, setup.bands.length - 1))
  const rampAnchors = rampPreset === "custom" ? customRampAnchors : vividRampAnchors(catalog.palette)
  const profiledRampAnchors = activeRampAnchors(
    rampAnchors,
    lightnessProfile,
    setup.low_signal_warning,
    setup.high_signal_warning,
    rampPreset !== "custom",
  )
  const rampPreview = Array.from({ length: 25 }, (_, index) => sampleOklabRamp(profiledRampAnchors, index / 24))
  const selectBand = (index: number) => {
    setSelectedBandIndex(index)
    setRemovingBandIndex(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const next = await postJson<Preview>("/preview", setup)
        if (!controller.signal.aborted) {
          setPreview(next)
          setValidationError("")
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setValidationError(error instanceof Error ? error.message : "Preview failed")
        }
      }
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [setup])

  function patchSetup(changes: Partial<Setup>) {
    setSetup((current) => ({ ...current, ...changes }))
  }

  function addBand() {
    const band = createBand(setup.bands, mode === "ire" ? "ire" : "stops", catalog.palette)
    if (band) patchSetup({ bands: orderBands([...setup.bands, band]) })
    else setStatus("No non-overlapping band position is available.")
  }

  async function generate() {
    setIsGenerating(true)
    setStatus(`Generating ${setup.cube_size}³ LUT…`)
    try {
      const response = await fetch("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN,
        },
        body: JSON.stringify({ version: 1, ...setup }),
      })
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        throw new Error(result.error || "Generation failed")
      }
      const link = document.createElement("a")
      link.href = URL.createObjectURL(await response.blob())
      link.download =
        /filename="([^"]+)"/.exec(
          response.headers.get("Content-Disposition") || "",
        )?.[1] || "lut.cube"
      link.click()
      URL.revokeObjectURL(link.href)
      setStatus("LUT downloaded.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  async function importFile(file: File) {
    try {
      const imported = await importSetup(await file.text(), async (candidate) => {
        const result = await postJson<Preview>("/preview", candidate)
        return result.setup
      })
      setSetup(imported)
      setStatus(`Imported ${file.name}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed")
    }
  }

  function downloadConfig() {
    const link = document.createElement("a")
    link.href = URL.createObjectURL(
      new Blob([exportSetup(setup)], { type: "application/json" }),
    )
    link.download = `${setup.output.replace(/\.cube$/i, "") || "lut-setup"}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    setStatus("Version-1 configuration exported.")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 p-4 py-8 sm:p-8">
      <header>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">LUT Builder</h1>
        <p className="text-muted-foreground">Local diagnostic scene-exposure LUT editor</p>
      </header>

      <LutImagePreview preview={preview} />

      <section className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Choose the camera-to-display transform before editing exposure bands.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              Camera
              <select className={fieldClass} value={setup.profile} onChange={(e) => patchSetup({ profile: e.target.value })}>
                {catalog.profiles.map((profile) => <option key={profile}>{profile}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Target display
              <select className={fieldClass} value={setup.target} onChange={(e) => patchSetup({ target: e.target.value })}>
                {catalog.targets.map((target) => <option key={target}>{target}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">Cube size <InfoTooltip text="Higher cube sizes sample the transform more precisely but produce larger LUT files and take longer to generate." /></span>
              <select className={fieldClass} value={setup.cube_size} onChange={(e) => patchSetup({ cube_size: Number(e.target.value) })}>
                {[17, 33, 65].map((size) => <option key={size} value={size}>{size}³</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Band mode
              <select className={fieldClass} value={mode} onChange={(e) => setSetup((current) => changeMode(current, e.target.value as Mode, catalog.palette))}>
                <option value="stops">Stops</option>
                <option value="ire">IRE</option>
                <option value="fill">Fill</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={setup.monochrome} disabled={setup.fill_mode} onChange={(e) => patchSetup({ monochrome: e.target.checked })} />
              Monochrome base
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={setup.legal_range} onChange={(e) => patchSetup({ legal_range: e.target.checked })} />
              <span className="flex items-center gap-1.5">Legal/video range (off = Full range) <InfoTooltip text="Encodes output in video/legal range instead of full data range. Enable only when the monitoring pipeline expects legal-range levels." /></span>
            </label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Output filename
              <input className={fieldClass} value={setup.output} onChange={(e) => patchSetup({ output: e.target.value })} />
            </label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="grid gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">Exposure bands</CardTitle>
              <CardDescription>{setup.fill_mode ? "Drag a separator or edit its boundary. Every value is filled by a color zone." : "Drag a marker or edit its row. Higher bands win overlaps."}</CardDescription>
            </div>
            <div className="grid w-full gap-5 xl:grid-cols-[auto_minmax(28rem,36rem)] xl:justify-between">
              <div className="flex flex-wrap items-end gap-5">
                <div className="grid gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Band geometry</span>
                <div className="flex flex-wrap items-end gap-2">
                {!setup.fill_mode && (
                  <>
                    <label className="grid gap-1 text-xs font-medium">Band preset
                      <select className={fieldClass} value={bandPreset} onChange={(event) => setBandPreset(event.target.value as BandPreset)}>
                        <option value="standard">Standard · 7 bands</option>
                        <option value="detailed">Detailed · {mode === "ire" ? "9" : "10"} bands</option>
                      </select>
                    </label>
                    <Button type="button" size="lg" variant="outline" onClick={() => setSetup((current) => applyBandPreset(current, catalog.palette, bandPreset))}>Apply preset</Button>
                  </>
                )}
                {!setup.fill_mode && (
                <label className="grid gap-1 text-xs font-medium">All half-widths ({mode === "ire" ? "IRE" : "stops"})
                  <input
                    aria-label="All half-widths"
                    className={fieldClass}
                    disabled={setup.bands.length === 0}
                    min="0"
                    placeholder="Mixed"
                    step="0.1"
                    type="number"
                    value={setup.bands.every((band) => band.width === setup.bands[0]?.width) ? setup.bands[0]?.width ?? "" : ""}
                    onChange={(event) => setSetup((current) => ({ ...current, bands: current.bands.map((band) => ({ ...band, width: Number(event.target.value) })) }))}
                  />
                </label>
                )}
                {mode === "stops" && (
                  <label className="grid gap-1 text-xs font-medium">Movement increment
                    <select className={fieldClass} value={stopIncrement} onChange={(event) => setStopIncrement(Number(event.target.value) as 1 | 0.5 | 0.25)}>
                      <option value="1">1 stop</option><option value="0.5">½ stop</option><option value="0.25">¼ stop</option>
                    </select>
                  </label>
                )}
                {setup.fill_mode && (
                  <>
                    <label className="grid gap-1 text-xs font-medium">
                      Fill preset
                      <select className={fieldClass} value={fillPreset} onChange={(event) => setFillPreset(event.target.value as FillPreset)}>
                        <option value="standard">Standard · 5 zones</option>
                        <option value="detailed">Detailed · 9 zones</option>
                      </select>
                    </label>
                    <Button type="button" size="lg" variant="outline" onClick={() => setSetup((current) => applyFillPreset(current, catalog.palette, fillPreset))}>Apply preset</Button>
                  </>
                )}
                </div>
                </div>
                <Button type="button" size="lg" onClick={addBand}>Add band</Button>
              </div>
              <div className="grid gap-2">
                <div className="grid gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">Color automation</span>
                <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs font-medium">Color all bands
                <select
                  aria-label="Color all bands"
                  className={fieldClass}
                  value={colorPreset}
                  onChange={(event) => setColorPreset(event.target.value as "false-color" | "gradient")}
                >
                  <option value="false-color">False color by exposure</option>
                  <option value="gradient">Perceptual color ramp</option>
                </select>
                </label>
                <Button type="button" size="lg" variant="outline" onClick={() => setSetup((current) => applyColorPreset(current, catalog.palette, colorPreset, rampAnchors, lightnessProfile, rampPreset !== "custom"))}>Apply colors</Button>
                </div>
                </div>
                {colorPreset === "gradient" && (
                  <div className="grid gap-2 rounded-lg bg-muted/25 p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid min-w-0 gap-1.5 text-sm font-medium">Ramp preset
                        <select
                          className={`${fieldClass} w-full`}
                          value={rampPreset}
                          onChange={(event) => {
                            const preset = event.target.value as "vivid" | "exposure" | "custom"
                            setRampPreset(preset)
                            if (preset === "vivid") setLightnessProfile("custom")
                            if (preset === "exposure") setLightnessProfile("ascending")
                            if (preset === "custom") setLightnessProfile("custom")
                          }}
                        >
                          <option value="vivid">Vivid</option>
                          <option value="exposure">Exposure</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                  <div className="grid min-w-0 gap-1.5 text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <label htmlFor="lightness-profile">Lightness profile</label>
                      <InfoTooltip text="Ascending follows exposure brightness. Even keeps every band similarly visible. Custom uses the picker handles' vertical positions." />
                    </span>
                    <select id="lightness-profile" className={`${fieldClass} w-full`} value={lightnessProfile} onChange={(event) => setLightnessProfile(event.target.value as LightnessProfile)}>
                          <option value="ascending">Ascending</option>
                          <option value="even">Even</option>
                          <option value="custom">Custom</option>
                        </select>
                  </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium">Preset ramp preview</div>
                      <div
                        aria-label="Preset ramp preview; this shows colors, not band coverage"
                        className="h-4 overflow-hidden rounded-sm"
                        style={{
                          backgroundColor: rampPreview[0],
                          backgroundImage: `linear-gradient(to right, ${rampPreview.map((color, index) => `${color} ${index / (rampPreview.length - 1) * 100}%`).join(", ")})`,
                        }}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">Color preview only; actual coverage is controlled by the bands below.</p>
                    </div>
                    {rampPreset === "custom" && (
                      <OklchEndpointPicker points={customRampAnchors} onChange={setCustomRampAnchors} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {preview ? (
              <>
                <ExposureGraph
                  setup={setup}
                  preview={preview}
                  increment={movementIncrement}
                  selectedBand={selectedBand}
                  onSelect={selectBand}
                  onChange={(index, stop) => setSetup((current) => setup.fill_mode
                    ? updateFillBoundary(current, index, stop, movementIncrement)
                    : updateBand(current, index, { stop }))}
                  onWidthChange={(index, width) => setSetup((current) => updateBand(current, index, { width }))}
                />
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full table-fixed min-w-[38rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="w-20 px-3 py-2">Band</th><th className="w-1/5 px-3 py-2">Color</th><th className="px-3 py-2">{setup.fill_mode ? "Boundary to next color" : mode === "ire" ? "Center (IRE)" : "Center (stops)"}</th><th className="px-3 py-2">{setup.fill_mode ? "Coverage" : `Half-width (${mode === "ire" ? "IRE" : "stops"})`}</th><th className="w-32 px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{setup.bands.map((band, index) => (
                      <tr className={`border-t ${selectedBand === index ? "bg-accent/60" : ""}`} key={index} onFocus={() => selectBand(index)} onClick={() => selectBand(index)}>
                        <th className="p-3 text-left font-medium" scope="row">{setup.fill_mode ? "Color" : "Band"} {index + 1}</th>
                        <td className="p-2"><ColorPicker hideLabel label={`Band ${index + 1} color`} value={band.color} palette={catalog.palette} onChange={(color) => setSetup((current) => updateBand(current, index, { color }))} /></td>
                        <td className="p-2">{setup.fill_mode && index === setup.bands.length - 1
                          ? <span className="text-muted-foreground">—</span>
                          : <input aria-label={setup.fill_mode ? `Boundary after color ${index + 1}` : `Band ${index + 1} ${mode === "ire" ? "IRE" : "stops"}`} className={fieldClass} type="number" step={movementIncrement} min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(event) => setSetup((current) => setup.fill_mode ? updateFillBoundary(current, index, Number(event.target.value), movementIncrement) : updateBand(current, index, { stop: Number(event.target.value) }))} />}</td>
                        <td className="p-2">{setup.fill_mode
                          ? <span className="text-muted-foreground">{index === setup.bands.length - 1 ? "Fills the rest" : "Until boundary"}</span>
                          : <input aria-label={`Band ${index + 1} half-width`} className={fieldClass} type="number" min="0" step="0.1" value={band.width} onChange={(event) => setSetup((current) => updateBand(current, index, { width: Number(event.target.value) }))} />}</td>
                        <td className="p-2"><Button
                          aria-label={removingBandIndex === index ? `Confirm remove band ${index + 1}` : `Remove band ${index + 1}`}
                          type="button"
                          size="sm"
                          variant={removingBandIndex === index ? "destructive" : "ghost"}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (removingBandIndex !== index) return setRemovingBandIndex(index)
                            setSetup((current) => removeBand(current, index))
                            setRemovingBandIndex(null)
                          }}
                        >{removingBandIndex === index ? "Confirm remove" : "Remove"}</Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {setup.bands.length === 0 && <p className="p-4 text-sm text-muted-foreground">No bands yet.</p>}
                </div>
                {preview.warnings.map((warning) => <p className="text-sm text-amber-700 dark:text-amber-300" key={warning}>{warning}</p>)}
              </>
            ) : <p className="text-sm text-muted-foreground">Preparing preview…</p>}
            {validationError && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{validationError}</p>}
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
              <CardTitle>Recorded-signal limit warnings</CardTitle>
              <CardDescription className="max-w-3xl">
                Colors pixels when any recorded RGB channel reaches this profile&apos;s configured code-value limits. The high warning means a recorded channel may be clipped and unrecoverable; the low warning means shadow detail may be buried in noise, not that it crosses a precise clipping point. These are not guaranteed physical sensor limits because a LUT sees processed RGB—not RAW sensor data—and the true limits vary by camera model, recording mode, EI/ISO, and signal range.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.low_signal_warning} onChange={(e) => patchSetup({ low_signal_warning: e.target.checked })} />
                  Low recorded-signal warning
                </label>
                <ColorPicker label="Low-limit indicator color" value={setup.low_signal_hex} palette={catalog.palette} disabled={!setup.low_signal_warning} onChange={(low_signal_hex) => patchSetup({ low_signal_hex })} />
              </div>
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.high_signal_warning} onChange={(e) => patchSetup({ high_signal_warning: e.target.checked })} />
                  High recorded-signal warning
                </label>
                <ColorPicker label="High-limit indicator color" value={setup.high_signal_hex} palette={catalog.palette} disabled={!setup.high_signal_warning} onChange={(high_signal_hex) => patchSetup({ high_signal_hex })} />
              </div>
            </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate LUT</CardTitle>
            <CardDescription>Build the final {setup.profile} to {setup.target} transformation.</CardDescription>
          </CardHeader>
          <CardFooter className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Button size="lg" disabled={isGenerating || Boolean(validationError)} onClick={generate}>
              {isGenerating && <Spinner data-icon="inline-start" />}
              {isGenerating ? "Generating…" : <><span className="lg:hidden">Generate LUT</span><span className="hidden lg:inline">Generate {setup.profile} → {setup.target} LUT</span></>}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import JSON</Button>
              <Button type="button" variant="outline" onClick={downloadConfig}>Export JSON</Button>
              <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = "" }} />
            </div>
            <p className="min-h-5 text-sm text-muted-foreground sm:col-span-2" role="status" aria-live="polite">{status}</p>
          </CardFooter>
        </Card>

      </section>
    </main>
  )
}

export default App
