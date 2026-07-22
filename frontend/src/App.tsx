import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react"
import { Popover } from "@base-ui/react/popover"

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
import {
  applyColorPreset,
  bandId,
  changeMode,
  contrastTextColor,
  createBand,
  exportSetup,
  filterPalette,
  hexToHsv,
  hsvToHex,
  importSetup,
  isHexColor,
  resizeBandWidth,
  snapBandValue,
  stepBandValue,
  orderBands,
  updateBand,
  updateFillBoundary,
  wheelStepDirection,
  type Mode,
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
  legend: { kind: string; color: string; label: string }[]
  warnings: string[]
  setup: Setup
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
              <div className={`grid shrink-0 gap-3 ${showPresets ? "w-80" : "w-full"}`}>
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
    ? Array.from({ length: 15 }, (_, index) => index - 7)
    : Array.from({ length: 11 }, (_, index) => index * 10)

  function stepSelected(direction: -1 | 1) {
    const band = setup.bands[selectedBand]
    if (setup.fill_mode && selectedBand >= setup.bands.length - 1) return
    if (band) onChange(selectedBand, stepBandValue(band.stop, direction, increment, ...bounds))
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const direction = wheelStepDirection(event.deltaY, event.ctrlKey, event.metaKey)
    if (direction === 0 || !setup.bands[selectedBand]) return
    event.preventDefault()
    stepSelected(direction)
  }

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
    <div
      ref={graph}
      className="relative flex h-28 touch-none overflow-hidden rounded-lg border"
      aria-label={`Editable exposure graph from ${preview.minimum} to ${preview.maximum} ${preview.unit}`}
      onWheel={handleWheel}
    >
      {preview.colors.map((color, index) => (
        <span className="flex-1" key={index} style={{ backgroundColor: color }} />
      ))}
      {ticks.map((tick) => (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-[1] border-l border-white/35 mix-blend-difference"
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
            className="absolute inset-y-0 opacity-25"
            key={`width-${index}`}
            style={{ backgroundColor: band.color, left: `${left}%`, width: `${right - left}%` }}
          />
        )
      })}
      {!setup.fill_mode && setup.bands.map((band, index) => [-1, 1].map((side) => (
          <button
            aria-label={`Resize ${side < 0 ? "left" : "right"} edge of band ${index + 1}`}
            aria-valuemin={0.1}
            aria-valuenow={band.width}
            aria-valuetext={`${band.width} ${preview.unit} half-width`}
            className={`absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize border-x border-background/70 bg-white/35 outline-none hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "bg-white/60" : ""}`}
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
  const [selectedBandId, setSelectedBandId] = useState(() => setup.bands[0] ? bandId(setup.bands[0]) : -1)
  const importInput = useRef<HTMLInputElement>(null)
  const mode: Mode = setup.fill_mode ? "fill" : setup.band_mode
  const movementIncrement = mode === "ire" ? 1 : stopIncrement
  const selectedBand = Math.max(0, setup.bands.findIndex((band) => bandId(band) === selectedBandId))
  const selectBand = (index: number) => setSelectedBandId(setup.bands[index] ? bandId(setup.bands[index]) : -1)

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
              Cube size
              <select className={fieldClass} value={setup.cube_size} onChange={(e) => patchSetup({ cube_size: Number(e.target.value) })}>
                {[17, 33, 65].map((size) => <option key={size} value={size}>{size}³</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Band mode
              <select className={fieldClass} value={mode} onChange={(e) => setSetup((current) => changeMode(current, e.target.value as Mode))}>
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
              Legal/video range (off = Full range)
            </label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
              Output filename
              <input className={fieldClass} value={setup.output} onChange={(e) => patchSetup({ output: e.target.value })} />
            </label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Exposure bands</CardTitle>
              <CardDescription>{setup.fill_mode ? "Drag a separator or edit its boundary. Every value is filled by a color zone." : "Drag a marker or edit its row. Higher bands win overlaps."}</CardDescription>
            </div>
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <label className="grid gap-1 text-xs font-medium">Color all bands
                <select
                  aria-label="Color all bands"
                  className={fieldClass}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) setSetup((current) => applyColorPreset(current, catalog.palette, event.target.value as "false-color" | "gradient"))
                    event.target.value = ""
                  }}
                >
                  <option value="" disabled>Choose preset</option>
                  <option value="false-color">False color by exposure</option>
                  <option value="gradient">Perceptual color ramp</option>
                </select>
              </label>
              {mode === "stops" && (
                <label className="grid gap-1 text-xs font-medium">Movement
                  <select className={fieldClass} value={stopIncrement} onChange={(event) => setStopIncrement(Number(event.target.value) as 1 | 0.5 | 0.25)}>
                    <option value="1">1 stop</option><option value="0.5">½ stop</option><option value="0.25">¼ stop</option>
                  </select>
                </label>
              )}
              <Button type="button" variant="outline" onClick={addBand}>Add band</Button>
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
                  <table className="w-full table-fixed min-w-[34rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="w-1/5 px-3 py-2">Color</th><th className="px-3 py-2">{setup.fill_mode ? "Boundary to next color" : mode === "ire" ? "IRE" : "Stops"}</th><th className="px-3 py-2">{setup.fill_mode ? "Coverage" : "Half-width"}</th><th className="w-24 px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{setup.bands.map((band, index) => (
                      <tr className={`border-t ${selectedBand === index ? "bg-accent/60" : ""}`} key={bandId(band)} onFocus={() => selectBand(index)} onClick={() => selectBand(index)}>
                        <td className="p-2"><ColorPicker hideLabel label={`Band ${index + 1} color`} value={band.color} palette={catalog.palette} onChange={(color) => setSetup((current) => updateBand(current, index, { color }))} /></td>
                        <td className="p-2">{setup.fill_mode && index === setup.bands.length - 1
                          ? <span className="text-muted-foreground">—</span>
                          : <input aria-label={setup.fill_mode ? `Boundary after color ${index + 1}` : `Band ${index + 1} ${mode === "ire" ? "IRE" : "stops"}`} className={fieldClass} type="number" step={movementIncrement} min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(event) => setSetup((current) => setup.fill_mode ? updateFillBoundary(current, index, Number(event.target.value), movementIncrement) : updateBand(current, index, { stop: Number(event.target.value) }))} />}</td>
                        <td className="p-2">{setup.fill_mode
                          ? <span className="text-muted-foreground">{index === setup.bands.length - 1 ? "Fills the rest" : "Until boundary"}</span>
                          : <input aria-label={`Band ${index + 1} half-width`} className={fieldClass} type="number" min="0" step="0.1" value={band.width} onChange={(event) => setSetup((current) => updateBand(current, index, { width: Number(event.target.value) }))} />}</td>
                        <td className="p-2"><Button aria-label={`Remove band ${index + 1}`} type="button" size="sm" variant="destructive" onClick={() => patchSetup({ bands: setup.bands.filter((_, current) => current !== index) })}>Remove</Button></td>
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
              <CardTitle>Encoded-signal warnings</CardTitle>
              <CardDescription>Encoded-signal warnings, controlled independently.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.low_signal_warning} onChange={(e) => patchSetup({ low_signal_warning: e.target.checked })} />
                  Low encoded-signal warning
                </label>
                <ColorPicker label="Black indicator color" value={setup.low_signal_hex} palette={catalog.palette} disabled={!setup.low_signal_warning} onChange={(low_signal_hex) => patchSetup({ low_signal_hex })} />
              </div>
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.high_signal_warning} onChange={(e) => patchSetup({ high_signal_warning: e.target.checked })} />
                  High encoded-signal warning
                </label>
                <ColorPicker label="White indicator color" value={setup.high_signal_hex} palette={catalog.palette} disabled={!setup.high_signal_warning} onChange={(high_signal_hex) => patchSetup({ high_signal_hex })} />
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
