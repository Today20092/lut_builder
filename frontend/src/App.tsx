import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react"

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
  changeMode,
  contrastTextColor,
  exportSetup,
  filterPalette,
  importSetup,
  isHexColor,
  moveBand,
  snapBandValue,
  stepBandValue,
  updateBand,
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

function ColorPicker({
  label,
  value,
  palette,
  disabled = false,
  onChange,
}: {
  label: string
  value: string
  palette: PaletteColor[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [search, setSearch] = useState("")
  const matches = useMemo(
    () => filterPalette(palette, search).slice(0, 24),
    [palette, search],
  )

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[2.5rem_1fr] gap-2">
        <input
          aria-label={`${label} visual picker`}
          className="h-9 w-10 cursor-pointer rounded border border-input bg-transparent p-1"
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-invalid={!isHexColor(value)}
          className={fieldClass}
          value={value}
          placeholder="#rrggbb"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Search Tailwind palette
        </summary>
        <div className="mt-2 grid gap-2">
          <input
            aria-label={`Search ${label} palette`}
            className={fieldClass}
            value={search}
            placeholder="red-500 or #ef44"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="grid max-h-40 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
            {matches.map((color) => (
              <button
                className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                key={color.name}
                type="button"
                onClick={() => onChange(color.hex)}
              >
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded border border-black/10"
                  style={{ backgroundColor: color.hex }}
                />
                {color.name}
              </button>
            ))}
          </div>
        </div>
      </details>
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
}: {
  setup: Setup
  preview: Preview
  increment: number
  selectedBand: number
  onSelect: (index: number) => void
  onChange: (index: number, stop: number) => void
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
  const belowIndexes = setup.bands.flatMap((band, index) =>
    band.stop < preview.minimum ? [index] : [],
  )
  const aboveIndexes = setup.bands.flatMap((band, index) =>
    band.stop > preview.maximum ? [index] : [],
  )

  function stepSelected(direction: -1 | 1) {
    const band = setup.bands[selectedBand]
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

  return (
    <div
      ref={graph}
      className="relative flex h-28 touch-none overflow-hidden rounded-lg border"
      aria-label={`Editable exposure graph from ${preview.minimum} to ${preview.maximum} ${preview.unit}`}
      onWheel={handleWheel}
    >
      {preview.colors.map((color, index) => (
        <span className="flex-1" key={index} style={{ backgroundColor: color }} />
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
      {setup.bands.map((band, index) => {
        const below = band.stop < preview.minimum
        const above = band.stop > preview.maximum
        const edge = below || above
        if (edge && selectedBand !== index) return null
        return (
          <button
            key={`handle-${index}`}
            type="button"
            className={`absolute z-10 rounded-full border-2 border-background px-2 py-1 text-xs font-semibold shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "ring-2 ring-ring ring-offset-2" : ""}`}
            style={{
              backgroundColor: band.color,
              color: contrastTextColor(band.color),
              left: `${position(band.stop)}%`,
              top: edge ? "70%" : "50%",
              transform: edge
                ? `translate(${below ? "0" : "-100%"}, -50%)`
                : "translate(-50%, -50%)",
            }}
            aria-label={`Band ${index + 1}, ${band.stop} ${preview.unit}${edge ? ", outside visible range" : ""}`}
            title={edge ? `${band.stop} ${preview.unit} is outside the visible range` : undefined}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPointerDown={(event) => {
              onSelect(index)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => handlePointerMove(event, index)}
          >
            {below ? "← " : ""}{band.stop}{above ? " →" : ""}
          </button>
        )
      })}
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
  const [selectedBand, setSelectedBand] = useState(0)
  const importInput = useRef<HTMLInputElement>(null)
  const mode: Mode = setup.fill_mode ? "fill" : setup.band_mode
  const movementIncrement = mode === "ire" ? 1 : stopIncrement

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
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Live exposure preview</CardTitle>
            <CardDescription>Calculated by the shared Python exposure mapper.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {preview ? (
              <>
                <ExposureGraph
                  setup={setup}
                  preview={preview}
                  increment={movementIncrement}
                  selectedBand={selectedBand}
                  onSelect={setSelectedBand}
                  onChange={(index, stop) => setSetup((current) => updateBand(current, index, { stop }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{preview.minimum} {preview.unit}</span>
                  <span>{preview.maximum} {preview.unit}</span>
                </div>
                <ul className="grid gap-2 text-sm">
                  {preview.legend.map((item, index) => (
                    <li className="flex items-center gap-2" key={`${item.kind}-${index}`}>
                      <span className="size-4 rounded border" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </li>
                  ))}
                </ul>
                {preview.warnings.map((warning) => <p className="text-sm text-amber-700 dark:text-amber-300" key={warning}>{warning}</p>)}
              </>
            ) : <p className="text-sm text-muted-foreground">Preparing preview…</p>}
            {validationError && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{validationError}</p>}
          </CardContent>
          <CardFooter className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" disabled={isGenerating || Boolean(validationError)} onClick={generate}>
              {isGenerating && <Spinner data-icon="inline-start" />}
              {isGenerating ? "Generating…" : "Generate .cube"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import JSON</Button>
              <Button type="button" variant="outline" onClick={downloadConfig}>Export JSON</Button>
              <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = "" }} />
            </div>
            <p className="min-h-5 text-sm text-muted-foreground sm:col-span-2" role="status" aria-live="polite">{status}</p>
          </CardFooter>
        </Card>

        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Exposure bands</CardTitle>
                <CardDescription>Later bands win where ranges overlap.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => patchSetup({ bands: [...setup.bands, { stop: mode === "ire" ? 50 : 0, width: mode === "ire" ? 2 : 0.3, color: "#eab308" }] })}>Add band</Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              {mode === "stops" && (
                <label className="grid gap-1 text-sm font-medium">
                  Movement increment
                  <select className={fieldClass} value={stopIncrement} onChange={(event) => setStopIncrement(Number(event.target.value) as 1 | 0.5 | 0.25)}>
                    <option value="1">1 stop</option>
                    <option value="0.5">½ stop</option>
                    <option value="0.25">¼ stop</option>
                  </select>
                </label>
              )}
              {setup.bands.length === 0 && <p className="text-sm text-muted-foreground">No bands yet.</p>}
              {setup.bands.map((band, index) => (
                <fieldset className={`grid gap-3 rounded-lg border p-3 ${selectedBand === index ? "border-ring" : ""}`} key={index} onFocus={() => setSelectedBand(index)}>
                  <legend className="px-1 text-sm font-medium">Band {index + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium">
                      {mode === "ire" ? "IRE" : "Stops"}
                      <input className={fieldClass} type="number" step={movementIncrement} min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(e) => setSetup((current) => updateBand(current, index, { stop: Number(e.target.value) }))} />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Half-width
                      <input className={fieldClass} type="number" min="0" step="0.1" value={band.width} disabled={setup.fill_mode} onChange={(e) => setSetup((current) => updateBand(current, index, { width: Number(e.target.value) }))} />
                    </label>
                  </div>
                  <ColorPicker label="Band color" value={band.color} palette={catalog.palette} onChange={(color) => setSetup((current) => updateBand(current, index, { color }))} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => setSetup((current) => moveBand(current, index, index - 1))}>Move up</Button>
                    <Button type="button" size="sm" variant="outline" disabled={index === setup.bands.length - 1} onClick={() => setSetup((current) => moveBand(current, index, index + 1))}>Move down</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => patchSetup({ bands: setup.bands.filter((_, current) => current !== index) })}>Remove</Button>
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Every edit stays local to this launch.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
        </div>

      </section>
    </main>
  )
}

export default App
