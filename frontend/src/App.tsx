import { useEffect, useMemo, useRef, useState } from "react"
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
  changeMode,
  exportSetup,
  filterPalette,
  importSetup,
  isHexColor,
  moveBand,
  updateBand,
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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const originalValue = useRef(value)
  const matches = useMemo(
    () => filterPalette(palette, search).slice(0, 24),
    [palette, search],
  )

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (nextOpen) originalValue.current = value
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
              className="grid max-h-[var(--available-height)] w-72 max-w-[var(--available-width)] gap-3 overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
              <input
                aria-label={`${label} visual picker`}
                className="h-24 w-full cursor-pointer rounded border border-input bg-transparent p-1"
                type="color"
                value={isHexColor(value) ? value : "#000000"}
                onChange={(event) => onChange(event.target.value)}
              />
              <input
                aria-label={`${label} hex color`}
                aria-invalid={!isHexColor(value)}
                className={fieldClass}
                value={value}
                placeholder="#rrggbb"
                onChange={(event) => onChange(event.target.value)}
              />
              <input
                aria-label={`Search ${label} palette`}
                className={fieldClass}
                value={search}
                placeholder="Search red-500 or #ef44"
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
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </fieldset>
  )
}

export function App() {
  const catalog = window.LUT_BUILDER_CATALOG
  const [setup, setSetup] = useState<Setup>(window.LUT_BUILDER_SETUP)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [validationError, setValidationError] = useState("")
  const [status, setStatus] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const mode: Mode = setup.fill_mode ? "fill" : setup.band_mode

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

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="grid gap-6">
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
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Exposure bands</CardTitle>
                <CardDescription>Later bands win where ranges overlap.</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => patchSetup({ bands: [...setup.bands, { stop: mode === "ire" ? 50 : 0, width: mode === "ire" ? 2 : 0.3, color: "#eab308" }] })}>Add band</Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              {setup.bands.length === 0 && <p className="text-sm text-muted-foreground">No bands yet.</p>}
              {setup.bands.map((band, index) => (
                <fieldset className="grid gap-3 rounded-lg border p-3" key={index}>
                  <legend className="px-1 text-sm font-medium">Band {index + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium">
                      {mode === "ire" ? "IRE" : "Stops"}
                      <input className={fieldClass} type="number" step="0.1" min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(e) => setSetup((current) => updateBand(current, index, { stop: Number(e.target.value) }))} />
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

        <div className="grid gap-6 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Live exposure preview</CardTitle>
              <CardDescription>Calculated by the shared Python exposure mapper.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {preview ? (
                <>
                  <div className="flex h-28 overflow-hidden rounded-lg border" aria-label={`Exposure preview from ${preview.minimum} to ${preview.maximum} ${preview.unit}`}>
                    {preview.colors.map((color, index) => <span className="flex-1" key={index} style={{ backgroundColor: color }} />)}
                  </div>
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
            <CardFooter className="grid gap-3">
              <Button size="lg" disabled={isGenerating || Boolean(validationError)} onClick={generate}>
                {isGenerating && <Spinner data-icon="inline-start" />}
                {isGenerating ? "Generating…" : "Generate .cube"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import JSON</Button>
                <Button type="button" variant="outline" onClick={downloadConfig}>Export JSON</Button>
                <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = "" }} />
              </div>
              <p className="min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">{status}</p>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  )
}

export default App
