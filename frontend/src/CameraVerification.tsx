import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Setup } from "@/editor"

export type SourceInterpretations = Record<string, { transfer: string; gamut: string }>
type CheckedStill = {
  request_id: string
  width: number
  height: number
  image: string
  provenance: {
    source: { name: string; sha256: string; storage: string; decoding: string }
    cube_sha256: string
    settings_sha256: string
    interpolation: string
    viewing_policy: string
    comparison_unavailable: string
    warnings: string[]
    output: { target: string; transfer: string; gamut: string; range: string }
  }
}
type Pixel = { x: number; y: number; source_rgb: number[]; output_rgb: number[]; display_rgb: number[] }
const field = "h-9 min-w-0 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"

async function request(path: string, payload: object, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const failure = await response.json()
    throw new Error(failure.error || "Verification request failed. Try again.")
  }
  return response
}

function CheckedImage({ result }: { result: CheckedStill }) {
  const [x, setX] = useState("0")
  const [y, setY] = useState("0")
  const [pixel, setPixel] = useState<Pixel | null>(null)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const expand = useRef<HTMLButtonElement>(null)
  const sampleRequest = useRef(0)
  const sampleController = useRef<AbortController | null>(null)
  useEffect(() => () => { sampleRequest.current++; sampleController.current?.abort() }, [])

  async function inspect() {
    const sequence = ++sampleRequest.current
    sampleController.current?.abort()
    const controller = new AbortController()
    sampleController.current = controller
    setError("")
    try {
      const response = await request("/verify-pixel", { request_id: result.request_id, x: Number(x), y: Number(y) }, controller.signal)
      const next = await response.json() as Pixel
      if (sequence === sampleRequest.current) setPixel(next)
    } catch (failure) {
      if (!controller.signal.aborted) setError(String(failure))
    }
  }

  async function download() {
    setError("")
    try {
      const response = await request("/verify-cube", { request_id: result.request_id })
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "checked.cube"
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setError(String(failure)) }
  }

  const content = <div className="grid min-w-0 gap-3">
    <img src={result.image} alt="Verified LUT result in the declared SDR view" className="max-h-[65dvh] w-full object-contain bg-black" onError={() => setError("The browser could not display the verified image. Retry verification or inspect the numerical pixel values.")} />
    <p className="text-sm">Unblended LUT result · 100% strength · Full frame {result.width} × {result.height}</p>
    <fieldset className="flex flex-wrap gap-2" disabled>
      <legend className="mb-1 text-sm font-medium">Source comparison unavailable</legend>
      <Button variant="outline" disabled>Original</Button><Button variant="outline" disabled>Split view</Button>
    </fieldset>
    <p className="text-xs text-muted-foreground">{result.provenance.comparison_unavailable}</p>
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Inspect original-resolution pixel</legend>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid w-24 gap-1 text-sm">X, from 0<input className={field} type="number" min="0" max={result.width - 1} step="1" value={x} onChange={(e) => { setX(e.target.value); setPixel(null); sampleRequest.current++ }} /></label>
        <label className="grid w-24 gap-1 text-sm">Y, from 0<input className={field} type="number" min="0" max={result.height - 1} step="1" value={y} onChange={(e) => { setY(e.target.value); setPixel(null); sampleRequest.current++ }} /></label>
        <Button variant="outline" onClick={() => void inspect()} disabled={x === "" || y === "" || !Number.isInteger(Number(x)) || !Number.isInteger(Number(y)) || Number(x) < 0 || Number(y) < 0 || Number(x) >= result.width || Number(y) >= result.height}>Inspect pixel</Button>
      </div>
      {pixel && <output className="grid gap-1 break-all font-mono text-xs" aria-live="polite">
        <span>Pixel {pixel.x}, {pixel.y}, top-left origin</span>
        <span>Source RGB: {pixel.source_rgb.map((v) => v.toPrecision(10)).join(", ")}</span>
        <span>Cube output RGB: {pixel.output_rgb.map((v) => v.toPrecision(10)).join(", ")}</span>
        <span>Display sRGB: {pixel.display_rgb.map((v) => v.toPrecision(10)).join(", ")}</span>
      </output>}
    </fieldset>
    <Button variant="outline" onClick={() => void download()}>Download checked cube</Button>
    <details className="min-w-0 text-xs">
      <summary className="cursor-pointer text-sm font-medium">Verification provenance</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(result.provenance, null, 2)}</pre>
    </details>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
  return <>
    <Button ref={expand} variant="outline" onClick={() => { setExpanded(true); dialog.current?.showModal() }}>Expand verified image</Button>
    {!expanded && content}
    <dialog ref={dialog} aria-labelledby="verified-dialog-title" className="m-auto max-h-[90dvh] w-[min(72rem,calc(100%-2rem))] overflow-auto rounded-xl border bg-card p-4 text-card-foreground backdrop:bg-black/70" onClose={() => { setExpanded(false); expand.current?.focus() }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="verified-dialog-title">Expanded verified image</h2><Button variant="outline" onClick={() => dialog.current?.close()}>Close verified image</Button></div>
      {expanded && content}
    </dialog>
  </>
}

export function CameraVerification({ setup, interpretations }: { setup: Setup; interpretations: SourceInterpretations }) {
  const [source, setSource] = useState<{ name: string; data: string; id: number } | null>(null)
  const [transfer, setTransfer] = useState("")
  const [gamut, setGamut] = useState("")
  const [range, setRange] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState("")
  const [result, setResult] = useState<{ key: string; value: CheckedStill } | null>(null)
  const [status, setStatus] = useState<{ key: string; text: string }>({ key: "", text: "" })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const pending = useRef<{ id: string; controller: AbortController } | null>(null)
  const fileSequence = useRef(0)
  const reader = useRef<FileReader | null>(null)
  const key = JSON.stringify([setup, source?.id, transfer, gamut, range, confirmed])
  const expected = interpretations[setup.profile]
  const mismatch = Boolean(transfer && gamut && (transfer !== expected?.transfer || gamut !== expected?.gamut))
  const supported = ["Rec.709", "Rec.2020"].includes(setup.target)
  const current = result?.key === key ? result.value : null
  const busy = busyKey === key
  // Once invalidated, reverting controls must not resurrect the old image.
  if (result && result.key !== key) {
    setResult(null)
    setStatus({ key, text: "Source, interpretation or settings changed. Verify again; the previous result is no longer current." })
  }

  useEffect(() => () => {
    const job = pending.current
    if (job) {
      pending.current = null
      job.controller.abort()
      void request("/verify-cancel", { request_id: job.id }).catch(() => {})
    }
  }, [key])
  useEffect(() => () => { fileSequence.current++; reader.current?.abort() }, [])
  useEffect(() => {
    const completed = current?.request_id
    return () => {
      if (completed) void request("/verify-cancel", { request_id: completed }).catch(() => {})
    }
  }, [current?.request_id])

  function choose(file: File) {
    const id = ++fileSequence.current
    reader.current?.abort()
    setSource(null)
    setConfirmed(false)
    setFileError("")
    setReading(false)
    if (!/\.(png|pfm)$/i.test(file.name) || file.size > 48 * 1024 * 1024 + 1024) {
      setFileError("Choose an untagged 16-bit RGB PNG or float32 RGB PFM up to 48 MiB and 4,194,304 pixels. JPEG, RAW and video are unsupported here.")
      return
    }
    setReading(true)
    const input = new FileReader()
    reader.current = input
    input.onload = () => {
      if (id !== fileSequence.current) return
      setReading(false)
      setSource({ name: file.name, data: String(input.result).split(",", 2)[1], id })
    }
    input.onerror = () => { if (id === fileSequence.current) { setReading(false); setFileError("Could not read this still. Select the file again.") } }
    input.readAsDataURL(file)
  }

  function cancel() {
    const job = pending.current
    if (job) {
      pending.current = null
      job.controller.abort()
      void request("/verify-cancel", { request_id: job.id }).catch(() => {})
    }
    setBusyKey(null)
    setStatus({ key, text: "Verification cancelled. No result is shown." })
  }

  async function verify() {
    if (!source) return
    const id = crypto.randomUUID()
    const controller = new AbortController()
    pending.current = { id, controller }
    setBusyKey(key)
    setResult(null)
    setStatus({ key, text: "Decoding source and applying the exported cube…" })
    try {
      const response = await request("/verify", {
        request_id: id, source: { name: source.name, data: source.data }, setup,
        interpretation: { transfer, gamut, range, confirmed, decoding: "RGB; no color transform or range scaling" },
      }, controller.signal)
      const next = await response.json() as CheckedStill
      if (pending.current?.id !== id || controller.signal.aborted) return
      if (next.request_id !== id) throw new Error("Verification response does not match this request. Verify again.")
      setResult({ key, value: next })
      setStatus({ key, text: "Verified against the serialized cube. This checks the declared pipeline, not sensor exposure or another application's display." })
    } catch (failure) {
      if (pending.current?.id === id && !controller.signal.aborted) setStatus({ key, text: `Verification failed: ${String(failure)}` })
    } finally {
      if (pending.current?.id === id) { pending.current = null; setBusyKey(null) }
    }
  }

  return <Card className="min-w-0 overflow-hidden" aria-label="Camera-matched verification">
    <CardHeader><CardTitle>Camera-matched still check</CardTitle><CardDescription>Apply the actual exported cube to preserved camera RGB.</CardDescription></CardHeader>
    <CardContent className="grid min-w-0 gap-3">
      {current?.provenance.warnings.map((warning) => <p key={warning} className="text-sm text-amber-600">{warning}</p>)}
      {current && <CheckedImage key={current.request_id} result={current} />}
      <label className="grid gap-2 text-sm font-medium">Choose camera still<input type="file" accept=".png,.pfm" className="max-w-full text-sm" onChange={(e) => { const file = e.target.files?.[0]; if (file) choose(file); e.target.value = "" }} /></label>
      <p className="text-xs text-muted-foreground">Untagged, non-interlaced 16-bit RGB PNG, or float32 RGB PFM. No alpha. Up to 4,194,304 pixels and 48 MiB. PNG requires local FFmpeg. Files stay in this local workspace session.</p>
      <p className="text-xs" role="status">{reading ? "Reading still…" : source?.name ?? "No camera still selected."}</p>
      {fileError && <p className="text-sm text-destructive" role="alert">{fileError}</p>}
      <p className="text-xs text-muted-foreground">The file cannot prove its camera profile. Confirm these facts from the recording/export workflow. Unknowns prevent verification.</p>
      <label className="grid gap-1 text-sm">Source transfer function<select className={field} value={transfer} onChange={(e) => { setTransfer(e.target.value); setConfirmed(false) }}><option value="">Unknown</option>{[...new Set(Object.values(interpretations).map((v) => v.transfer))].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Source gamut<select className={field} value={gamut} onChange={(e) => { setGamut(e.target.value); setConfirmed(false) }}><option value="">Unknown</option>{[...new Set(Object.values(interpretations).map((v) => v.gamut))].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">RGB range convention<select className={field} value={range} onChange={(e) => { setRange(e.target.value); setConfirmed(false) }}><option value="">Unknown</option><option value="camera-code-values">Normalized camera code values</option></select></label>
      <p className="text-xs text-muted-foreground">PNG codes are divided by 65535. PFM values are unchanged. No YCbCr matrix or input range expansion is applied. Resolve any transport conversion before export. Excursions are clamped only at the cube's [0, 1] boundary and reported.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm unchanged camera-encoded RGB, this transfer/gamut and range, with no viewing transform or additional range scaling.</label>
      {mismatch && <p role="alert" className="text-sm text-destructive">Source interpretation does not match {setup.profile}. Correct the source interpretation or LUT camera profile.</p>}
      {!supported && <p role="alert" className="text-sm text-destructive">Unsupported SDR view. Choose Rec.709 or SDR Rec.2020. HDR/log viewing is unavailable.</p>}
      <p className="text-xs text-muted-foreground">SDR view: ideal-black BT.1886, target primaries converted to sRGB, display gamut clipped. Legal output is expanded once for display. Stored overlay colors and LUT output remain unchanged.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || reading || !source || !transfer || !gamut || !range || !confirmed || mismatch || !supported} onClick={() => void verify()}>Verify still</Button>{busy && <Button variant="outline" onClick={cancel}>Cancel verification</Button>}</div>
      <p className="text-sm" role="status" aria-live="polite">{status.key === key ? status.text : status.key || busyKey ? "Source, interpretation or settings changed. Verify again; the previous result is no longer current." : "Confirm the source interpretation to verify."}</p>
    </CardContent>
  </Card>
}
