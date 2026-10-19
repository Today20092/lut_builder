import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { exposureReferenceValue, type Setup } from "./editor"
import type { PalettePreview } from "./PaletteEditor"
import { isTypingTarget } from "./keyboard"

function BandStrip({ setup, minimum, maximum, expanded = false }: { setup: Setup; minimum: number; maximum: number; expanded?: boolean }) {
  const position = (value: number) => Math.max(0, Math.min(1000, (value - minimum) / (maximum - minimum) * 1000))
  return <svg viewBox="0 0 1000 60" preserveAspectRatio="none" role="img" aria-label="Exposure band coverage" className={`${expanded ? "h-40" : "h-10"} w-full rounded border bg-muted`}>
    {setup.bands.map((band, index) => {
      const left = position(setup.fill_mode ? index === 0 ? minimum : setup.bands[index - 1].stop : band.stop - band.width)
      const right = position(setup.fill_mode ? index === setup.bands.length - 1 ? maximum : band.stop : band.stop + band.width)
      return <rect key={index} data-preview-band={index + 1} x={left} y={0} width={Math.max(0, right - left)} height={60} fill={band.color} />
    })}
    {minimum <= exposureReferenceValue(setup) && maximum >= exposureReferenceValue(setup) && <line x1={position(exposureReferenceValue(setup))} x2={position(exposureReferenceValue(setup))} y1={0} y2={60} stroke="currentColor" strokeDasharray="5 5" />}
  </svg>
}

export function ExposurePreview({ setup, preview, minimum, maximum, unit }: {
  setup: Setup; preview: PalettePreview | null; minimum: number; maximum: number; unit: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const displayed = preview?.setup ?? setup
  const label = preview ? preview.valid ? `Previewing ${preview.label}` : "Invalid draft · showing current bands" : "Current exposure bands"
  function decide(action: () => void) {
    action()
    const target = dialog.current?.open ? dialog.current.querySelector("button") : trigger.current
    target?.focus()
  }
  const actions = preview && <div className="flex items-center gap-2">
    <Button type="button" className="flex-1" disabled={!preview.valid} onClick={() => decide(preview.apply)}>Use palette</Button>
    <Button type="button" variant="outline" onClick={() => decide(preview.cancel)}>Cancel</Button>
  </div>
  return <div tabIndex={0} role="group" className="sticky top-0 z-40 grid gap-2 border-b bg-card p-3 shadow-sm" aria-label="Persistent exposure preview"
    onKeyDown={(event) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key.toLowerCase() === "f" && !dialog.current?.open) { event.preventDefault(); trigger.current?.click() }
      if (event.key === "Escape" && preview && !dialog.current?.open) { event.preventDefault(); decide(preview.cancel) }
    }}>
    <button ref={trigger} type="button" aria-label="Expand exposure preview" aria-haspopup="dialog" className="grid gap-1 rounded text-left" onClick={() => dialog.current?.showModal()}>
      <span className="flex flex-wrap justify-between gap-x-3 text-xs"><span className="font-semibold" role="status">{label}</span><span className="text-muted-foreground">Tap to expand</span></span>
      <BandStrip setup={displayed} minimum={minimum} maximum={maximum} />
      <span className="flex justify-between text-[11px] text-muted-foreground"><span>{minimum} {unit}</span><span>{unit === "stops" ? "0 = reference" : `${exposureReferenceValue(setup).toFixed(1)} = neutral reference`}</span><span>{maximum} {unit}</span></span>
    </button>
    {preview && <p className="text-xs text-muted-foreground">{preview.valid ? "Draft only · current bands and downloads are unchanged." : "Correct the invalid color before using this palette."}</p>}
    {actions}
    <dialog ref={dialog} aria-labelledby="exposure-preview-title" className="fixed inset-0 m-0 h-dvh max-h-dvh w-screen max-w-none overflow-auto border bg-card p-4 text-card-foreground backdrop:bg-black/70 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(48rem,calc(100%-2rem))] sm:rounded-xl" onClose={() => trigger.current?.focus()}>
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 bg-card pb-2"><h2 id="exposure-preview-title" className="font-semibold">Exposure band preview</h2><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close preview</Button></div>
      <p className="mb-3 text-sm font-medium">{label}</p>
      <BandStrip setup={displayed} minimum={minimum} maximum={maximum} expanded />
      <p className="mt-2 text-xs text-muted-foreground">{minimum} to {maximum} {unit}{unit === "stops" ? " · Reference: 0 stops" : ` · Neutral reference: ${exposureReferenceValue(setup).toFixed(1)} IRE`}. This shows band positions and widths, not a camera-image verification.</p>
      <ul className="my-4 grid gap-2 text-sm">{displayed.bands.map((band, index) => <li key={index} className="flex flex-wrap items-center gap-2"><span aria-hidden="true" className="size-5 rounded border" style={{ backgroundColor: band.color }} /><span>Band {index + 1}</span><span className="font-mono">{band.color}</span><span className="text-xs text-muted-foreground">{displayed.fill_mode ? index === displayed.bands.length - 1 ? "Fills the rest" : `Until ${band.stop} ${unit}` : `${band.stop} ${unit} · width ${Number((band.width * 2).toFixed(6))}`}</span></li>)}</ul>
      {preview && <p className="mb-3 text-xs text-muted-foreground">Closing this view keeps your draft. Use palette commits it; Cancel keeps the current band colors.</p>}
      {actions}
    </dialog>
  </div>
}
