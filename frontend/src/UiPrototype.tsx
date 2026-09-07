// PROTOTYPE: three structures on the existing / route, selected with ?variant=A|B|C.
// Does editing beside a clearly labeled preview feel understandable and precise?
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Expand, Film, Image as ImageIcon, Layers, Plus, RotateCcw, SlidersHorizontal, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Band } from "./editor"
import { editedColorPixel, initialBands, initialDraft, moveBand, palettes, recolor } from "./prototype-state"
import type { Draft } from "./prototype-state"
import referenceImage from "./assets/lut-preview-reference.jpg"

const variants = ["A", "B", "C"] as const
type Variant = typeof variants[number]
const variantNames = { A: "Workbench", B: "Guided workflow", C: "Graph first" }
const variantDescriptions = { A: "All the editing tools in one place, with a persistent preview.", B: "One decision at a time: position bands, choose colors, then inspect.", C: "A large exposure graph with a compact inspector for the selected band." }
const signed = (n: number) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}`

function PrototypeSwitcher({ variant, onChange }: { variant: Variant; onChange: (v: Variant) => void }) {
  const cycle = (direction: number) => onChange(variants[(variants.indexOf(variant) + direction + 3) % 3])
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector("dialog[open]") || (e.target as Element).closest("input,textarea,select,[contenteditable],[role=slider]")) return
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); cycle(e.key === "ArrowLeft" ? -1 : 1) }
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  })
  return <nav className="prototype-switcher" aria-label="Compare prototype layouts">
    <Button variant="ghost" size="icon-lg" onClick={() => cycle(-1)} aria-label="Previous layout"><ArrowLeft /></Button>
    <label>LAYOUT STUDY<select aria-label="Prototype layout" value={variant} onChange={e => onChange(e.target.value as Variant)}>{variants.map(v => <option key={v} value={v}>{v} · {variantNames[v]}</option>)}</select></label>
    <Button variant="ghost" size="icon-lg" onClick={() => cycle(1)} aria-label="Next layout"><ArrowRight /></Button>
  </nav>
}

function Section({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="p-section"><header className="p-section-head"><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{action}</header>{children}</section>
}

type Slots = { config: ReactNode; geometry: ReactNode; graph: ReactNode; colors: ReactNode; bands: ReactNode; preview: ReactNode }
export function VariantA(s: Slots) {
  return <>{s.config}<div className="p-workbench"><div className="p-editor"><Section title="Exposure bands" hint="Position your bands, then give them a color.">{s.geometry}{s.graph}</Section>{s.colors}{s.bands}</div>{s.preview}</div></>
}
export function VariantB(s: Slots & { step: number; setStep: (n: number) => void }) {
  return <>{s.config}<div className="p-guided"><div className="p-editor"><nav className="p-steps" aria-label="Editing steps">{["Place bands", "Choose colors", "Inspect bands"].map((label, i) => <button key={label} aria-current={s.step === i ? "step" : undefined} onClick={() => s.setStep(i)}><span>{i + 1}</span>{label}</button>)}</nav><Section title={["Where should the colors appear?", "How should your bands look?", "Check each exposure band"][s.step]} hint="The preview stays available as you work.">{s.step === 0 && s.geometry}{s.graph}</Section>{s.step === 1 && s.colors}{s.step === 2 && s.bands}<div className="p-step-actions"><Button variant="outline" disabled={s.step === 0} onClick={() => s.setStep(s.step - 1)}>Back</Button><Button disabled={s.step === 2} onClick={() => s.setStep(s.step + 1)}>Next: {s.step === 0 ? "choose colors" : "inspect bands"}<ArrowRight data-icon="inline-end" /></Button></div></div>{s.preview}</div></>
}
export function VariantC(s: Slots) {
  return <>{s.config}<div className="p-graph-first"><div className="p-editor"><Section title="Shape the exposure map" hint="Select a marker to inspect it. Drag to move in ¼-stop steps.">{s.graph}{s.geometry}</Section><div className="p-inspector-split">{s.bands}{s.colors}</div></div>{s.preview}</div></>
}

function ExposureGraph({ bands, selected, onSelect, onMove, onStart, high }: { bands: Band[]; selected: number; onSelect: (i: number) => void; onMove: (i: number, stop: number) => void; onStart: () => void; high: boolean }) {
  const rail = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  function drag(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const rect = rail.current!.getBoundingClientRect()
    const next = Math.round(((e.clientX - rect.left) / rect.width * 14 - 7) * 4) / 4
    if (next === bands[index].stop) return
    if (!dragging.current) { onStart(); dragging.current = true }
    onMove(index, next)
  }
  return <div className="p-graph-wrap"><div className="p-graph-legend"><span>SHADOWS</span><span>0 · middle gray</span><span>HIGHLIGHTS</span></div><div className="p-graph" ref={rail}>
    {Array.from({ length: 15 }, (_, i) => <div key={i} className={cn("p-tick", i === 7 && "p-zero")} style={{ left: `${i / 14 * 100}%` }}><span>{signed(i - 7)}</span></div>)}
    {bands.map((b, i) => <div key={i} className={cn("p-band-area", selected === i && "p-selected-area")} style={{ left: `${(b.stop - b.width + 7) / 14 * 100}%`, width: `${b.width * 2 / 14 * 100}%`, background: b.color }} />)}
    {bands.map((b, i) => <button key={i} role="slider" aria-label={`Band ${i + 1} position`} aria-valuemin={-7 + b.width} aria-valuemax={7 - b.width} aria-valuenow={b.stop} aria-valuetext={`${signed(b.stop)} stops`} className={cn("p-marker", selected === i && "p-marker-selected")} style={{ left: `${(b.stop + 7) / 14 * 100}%`, borderColor: b.color }} onPointerDown={e => { dragging.current = false; onSelect(i); e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => drag(e, i)} onPointerUp={e => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId) }} onClick={() => onSelect(i)} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onStart(); onSelect(i); onMove(i, b.stop + (e.key === "ArrowLeft" ? -0.25 : 0.25)) } }}>{i + 1}</button>)}
    {high && <span className="p-high-signal">High signal region</span>}
  </div><div className="p-graph-readout"><span><i style={{ background: bands[selected].color }} />Band {selected + 1}</span><strong>{signed(bands[selected].stop)} stops</strong><span>{signed(bands[selected].stop - bands[selected].width)} to {signed(bands[selected].stop + bands[selected].width)}</span><small>Bounds · stops from middle gray</small></div></div>
}

function Preview({ bands, variant }: { bands: Band[]; variant: Variant }) {
  const [mode, setMode] = useState("demo")
  const [source, setSource] = useState({ url: referenceImage, name: "Studio reference · sRGB", video: false })
  const [frame, setFrame] = useState("")
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [actualTime, setActualTime] = useState(0)
  const [gamma, setGamma] = useState("")
  const [gamut, setGamut] = useState("")
  const [range, setRange] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [comparison, setComparison] = useState("split")
  const [opacity, setOpacity] = useState(100)
  const [error, setError] = useState("")
  const [large, setLarge] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const expandedCanvas = useRef<HTMLCanvasElement>(null)
  const sourceUrl = source.video ? frame : source.url
  useEffect(() => () => { if (source.url.startsWith("blob:")) URL.revokeObjectURL(source.url) }, [source.url])
  useEffect(() => {
    if (!sourceUrl) return
    let current = true
    const image = new Image()
    image.onload = () => {
      if (!current) return
      for (const c of [canvas.current, expandedCanvas.current]) {
        if (!c) continue
        // ponytail: 960px, O(pixels × bands) illustration; move to a worker if editing lags.
        const width = Math.min(image.width, 960)
        c.width = width; c.height = Math.round(width * image.height / image.width)
        const context = c.getContext("2d")!
        context.drawImage(image, 0, 0, c.width, c.height)
        if (mode !== "demo" || comparison === "original") continue
        const pixels = context.getImageData(0, 0, c.width, c.height)
        for (let offset = 0; offset < pixels.data.length; offset += 4) {
          if (comparison === "split" && offset / 4 % c.width < c.width / 2) continue
          const rgb = editedColorPixel(Array.from(pixels.data.subarray(offset, offset + 3)), bands, opacity / 100)
          pixels.data.set(rgb, offset)
        }
        context.putImageData(pixels, 0, 0)
      }
    }
    image.onerror = () => { if (current) setError("This image cannot be decoded by the browser. Try a PNG or JPEG.") }
    image.src = sourceUrl
    return () => { current = false }
  }, [sourceUrl, bands, mode, comparison, opacity, large])
  function capture() {
    const v = video.current!
    if (!v.videoWidth) return
    const c = document.createElement("canvas")
    c.width = Math.min(v.videoWidth, 960); c.height = Math.round(c.width * v.videoHeight / v.videoWidth)
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height)
    setFrame(c.toDataURL()); setActualTime(v.currentTime)
  }
  function choose(file?: File) {
    if (!file) return
    if (file.size > 1024 ** 3) { setError("For this prototype, choose a file smaller than 1 GB."); return }
    const isVideo = file.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(file.name)
    if (!isVideo && !file.type.startsWith("image/")) { setError("Choose an image, MP4, MOV, or WebM file."); return }
    setError(""); setFrame(""); setDuration(0); setTime(0); setActualTime(0); setConfirmed(false); setGamma(""); setGamut(""); setRange("")
    setSource({ url: URL.createObjectURL(file), name: file.name, video: isVideo })
  }
  function seek(next: number) {
    const n = Math.max(0, Math.min(Math.max(0, duration - 0.001), next))
    setTime(n); if (video.current) video.current.currentTime = n
  }
  const header = <div className="p-preview-image-label"><span>{mode === "demo" ? "EXPOSURE DEMONSTRATION" : "UNPROCESSED SOURCE"}</span><span>{mode === "demo" ? "Not an exported LUT" : "Verification not connected"}</span></div>
  return <aside className="p-preview" aria-label="Image preview"><Section title="Live preview" hint="Keep the image in view while you edit." action={<Button variant="ghost" size="icon-lg" aria-label="Expand preview" onClick={() => { setLarge(true); dialog.current?.showModal() }}><Expand /></Button>}>
    <fieldset className="p-segment"><legend className="sr-only">Preview mode</legend>{[["demo", "Demonstration"], ["verify", "Camera-matched"]].map(([value, label]) => <label key={value}><input type="radio" name="preview-mode" value={value} checked={mode === value} onChange={() => setMode(value)} /><span>{label}</span></label>)}</fieldset>
    <div className="p-image-surface">{header}<canvas ref={canvas} aria-label="Sample image with illustrative exposure colors" />{!sourceUrl && <p>Choose a position to inspect the video frame.</p>}{mode === "demo" && comparison === "split" && <><span className="p-image-divider" /><span className="p-before">Original</span><span className="p-after">Band colors</span></>}</div>
    <p className="p-file-name">{source.video ? <Film /> : <ImageIcon />}<span>{source.name}</span></p>
    <div className="p-preview-actions"><Button variant="outline" onClick={() => input.current?.click()}><Upload data-icon="inline-start" />Choose image or video</Button><Button variant="ghost" size="sm" onClick={() => { setSource({ url: referenceImage, name: "Studio reference · sRGB", video: false }); setFrame(""); setError(""); setConfirmed(false) }}>Use sample</Button></div>
    <input ref={input} type="file" hidden accept="image/*,video/*,.mov,.mp4,.m4v,.webm" onChange={e => { choose(e.target.files?.[0]); e.target.value = "" }} />
    {source.video && <div className="p-video-controls"><video ref={video} key={source.url} src={source.url} preload="auto" muted playsInline className="p-decoder" onLoadedData={capture} onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuration(d); else setError("This video has no usable duration in the browser.") }} onSeeked={capture} onError={() => setError("The browser cannot decode this recording. FFmpeg support is planned; try an H.264 MP4 for this prototype.")} />
      <label>Choose a video position<input type="range" min="0" max={duration || 1} step="0.1" value={time} disabled={!duration} onChange={e => seek(Number(e.target.value))} /></label><div className="p-video-time"><Button variant="outline" size="sm" disabled={!duration} onClick={() => seek(time - 0.1)}>−0.1 s</Button><label><span className="sr-only">Requested time in seconds</span><input type="number" min="0" max={duration} step="0.1" value={Number(time.toFixed(2))} disabled={!duration} onChange={e => seek(Number(e.target.value))} /> s</label><Button variant="outline" size="sm" disabled={!duration} onClick={() => seek(time + 0.1)}>+0.1 s</Button></div><small>Browser position ≈ {actualTime.toFixed(2)} s. Exact FFmpeg frame selection is not connected.</small></div>}
    {error && <p role="alert" className="p-notice">{error}</p>}
    {mode === "demo" ? <><fieldset className="p-segment p-comparison"><legend>Compare</legend>{[["original", "Original"], ["split", "Split view"], ["colors", "Band colors"]].map(([value, label]) => <label key={value}><input type="radio" name="preview-comparison" value={value} checked={comparison === value} onChange={() => setComparison(value)} /><span>{label}</span></label>)}</fieldset><label className="p-field">Color overlay <strong>{opacity}%</strong><input type="range" min="0" max="100" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label><p className="p-caption">Illustrates band colors on an sRGB image. It does not recover camera exposure or verify a LUT. Treat a video frame here as a display-image illustration.</p></> : <div className="p-source-settings"><p className="p-notice">Prototype only. Your source selection works; exported-LUT processing is not connected.</p><h3>How was this recorded?</h3><p className="p-caption">No camera metadata has been read. Choose the source interpretation explicitly.</p><label className="p-field">Source gamma<select value={gamma} onChange={e => { setGamma(e.target.value); setConfirmed(false) }}><option value="">Choose gamma…</option><option>S-Log3</option><option>V-Log</option><option>sRGB / already graded</option></select></label><label className="p-field">Source gamut<select value={gamut} onChange={e => { setGamut(e.target.value); setConfirmed(false) }}><option value="">Choose gamut…</option><option>S-Gamut3.Cine</option><option>S-Gamut3</option><option>V-Gamut</option><option>sRGB / Rec.709 primaries</option></select></label><label className="p-field">Recording range<select value={range} onChange={e => { setRange(e.target.value); setConfirmed(false) }}><option value="">Choose range…</option><option>Video / limited</option><option>Full</option></select></label><p className="p-caption">Codec, bit depth, and matrix: not probed in this prototype.</p><Button variant="outline" disabled={!gamma || !gamut || !range} onClick={() => setConfirmed(true)}>{confirmed ? <Check data-icon="inline-start" /> : null}{confirmed ? "Interpretation recorded" : "Confirm interpretation"}</Button>{confirmed && <p role="status" className="p-caption">Saved for this mockup only. Color verification remains unavailable.</p>}</div>}
    <details className="p-state"><summary>Preview state</summary><pre>{JSON.stringify({ variant, mode, source: source.name, browserPosition: source.video ? actualTime : null, gamma, gamut, range, confirmed, comparison, opacity, lutVerification: "not connected" }, null, 2)}</pre></details>
  </Section><dialog ref={dialog} className="p-expanded" aria-labelledby="expanded-preview-title" onClose={() => setLarge(false)}><header><div><h2 id="expanded-preview-title">Expanded preview</h2><p>Inspect the same illustrative result at a larger size.</p></div><Button variant="outline" size="icon-lg" aria-label="Close expanded preview" onClick={() => dialog.current?.close()}><X /></Button></header>{header}<canvas ref={expandedCanvas} /><p className="p-caption">{source.name} · No calibrated or exported-LUT verification.</p></dialog></aside>
}

export default function UiPrototype() {
  const [variant, setVariant] = useState<Variant>(() => { const v = new URLSearchParams(location.search).get("variant"); return variants.includes(v as Variant) ? v as Variant : "A" })
  const [bands, setBands] = useState<Band[]>(() => initialBands())
  const [selected, setSelected] = useState(3)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [appliedDraft, setAppliedDraft] = useState<Draft>(initialDraft)
  const [undo, setUndo] = useState<{ bands: Band[]; draft: Draft } | null>(null)
  const [message, setMessage] = useState("Choose a palette, move a band, or compare the three layouts.")
  const [camera, setCamera] = useState("Panasonic V-Log / V-Gamut")
  const [target, setTarget] = useState("Rec.709")
  const [cubeSize, setCubeSize] = useState("33")
  const [high, setHigh] = useState(true)
  const [preset, setPreset] = useState("7")
  const [step, setStep] = useState(0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(appliedDraft)
  const paletteMatches = recolor(bands, appliedDraft).every((band, i) => band.color === bands[i].color)
  const colorPreview = recolor(initialBands(16), draft)
  const b = bands[selected]
  function changeVariant(v: Variant) { setVariant(v); const url = new URL(location.href); url.searchParams.set("variant", v); history.replaceState(null, "", url); setMessage(`${variantNames[v]} layout. Editing values are preserved.`) }
  function remember() { setUndo({ bands, draft: appliedDraft }) }
  function updateBand(index: number, patch: Partial<Band>) { if (Object.entries(patch).every(([key, value]) => bands[index][key as keyof Band] === value)) return; remember(); setBands(bands.map((band, i) => i === index ? { ...band, ...patch } : band)) }
  function apply() { remember(); setBands(recolor(bands, draft)); setAppliedDraft({ ...draft }); setMessage(`Colors applied to ${bands.length} bands. Positions and widths were preserved.`) }
  const config = <section className="p-config" aria-label="LUT configuration"><div className="p-config-heading"><SlidersHorizontal /><div><h2>Output setup</h2><p>Separate from the preview source</p></div></div><label className="p-field">Camera input<select value={camera} onChange={e => setCamera(e.target.value)}><option>Panasonic V-Log / V-Gamut</option><option>Sony S-Log3 / S-Gamut3.Cine</option></select></label><label className="p-field">LUT output<select value={target} onChange={e => setTarget(e.target.value)}><option>Rec.709</option><option>sRGB</option></select></label><label className="p-field">LUT size<select value={cubeSize} onChange={e => setCubeSize(e.target.value)}><option value="17">17 × 17 × 17</option><option value="33">33 × 33 × 33</option><option value="65">65 × 65 × 65</option></select></label><span className="p-config-note">Layout controls only.<br />No LUT is generated here.</span></section>
  const geometry = <fieldset className="p-geometry"><legend className="sr-only">Band positions</legend><label>Band arrangement<select aria-label="Band arrangement" value={preset} onChange={e => setPreset(e.target.value)}><option value="5">Simple · 5 bands</option><option value="7">Balanced · 7 bands</option><option value="10">Detailed · 10 bands</option></select></label><Button variant="outline" size="lg" onClick={() => { remember(); setBands(recolor(initialBands(Number(preset)), appliedDraft)); setSelected(0); setMessage(`Replaced arrangement with ${preset} bands. Undo is available.`) }}>Replace arrangement</Button><span>Drag step <strong>¼ stop</strong></span><Button variant="outline" size="lg" disabled={bands.length >= 12} onClick={() => { remember(); setBands([...bands, { stop: Math.min(6, bands.length - 4), width: 0.4, color: "#e5be6c" }]); setSelected(bands.length); setMessage("Band added. Edit its position below.") }}><Plus data-icon="inline-start" />Add band</Button></fieldset>
  const graph = <ExposureGraph bands={bands} selected={selected} onSelect={setSelected} onMove={(i, stop) => setBands(current => moveBand(current, i, stop))} onStart={remember} high={high} />
  const colors = <Section title="Color your bands" hint="Preview a palette here. Apply it when you like the result." action={<span className={cn("p-draft-status", dirty && "p-dirty")}>{dirty ? "Unapplied changes" : paletteMatches ? "Applied" : "Custom band colors"}</span>}>
    <fieldset className="p-palettes"><legend>1 · Choose a palette</legend>{Object.entries(palettes).map(([key, p]) => <label key={key} title={p.description}><input type="radio" name="palette" checked={draft.palette === key} onChange={() => setDraft({ ...draft, palette: key as Draft["palette"] })} /><span className="p-palette-swatch" style={{ background: `linear-gradient(90deg,${p.colors.join(",")})` }} /><span>{p.name}</span></label>)}</fieldset>
    <div className="p-color-fields"><label className="p-field">2 · Brightness progression<select aria-label="Brightness progression" value={draft.brightness} onChange={e => setDraft({ ...draft, brightness: e.target.value as Draft["brightness"] })}><option value="custom">Keep palette brightness</option><option value="ascending">Dark to bright</option><option value="even">Even brightness</option></select></label><label className="p-field">3 · Color intensity <strong>{draft.intensity}%</strong><input aria-label="Color intensity" type="range" min="0" max="100" value={draft.intensity} onChange={e => setDraft({ ...draft, intensity: Number(e.target.value) })} /></label></div>
    <div className="p-ramp-caption"><span>Draft palette</span><span>Shadows → Highlights</span></div><div className="p-ramp" aria-label="Draft palette preview">{colorPreview.map((band, i) => <span key={i} style={{ background: band.color }} />)}</div>
    <div className="p-apply-row"><p>{dirty ? "Your bands still use the previous colors." : paletteMatches ? "These palette settings are applied to your bands." : "Your bands have individual colors. Reapply to replace them."}<small>Changing colors does not move or resize bands.</small></p><Button disabled={!dirty && paletteMatches} onClick={apply}><Check data-icon="inline-start" />Apply to {bands.length} bands</Button></div>
    <details className="p-advanced"><summary>What changed from the old controls?</summary><p>“Ramp preset” is now a palette with a visible swatch. “Lightness profile” describes how brightness changes from shadows to highlights. The two confusing maximum buttons are replaced by one intensity control. Use the band color fields for exact colors.</p><p>Intensity scales the palette’s chroma. Colors are fitted to sRGB using the existing editor helper; this is not a new color-accuracy guarantee.</p></details>
  </Section>
  const bandEditor = <Section title={variant === "C" ? `Band ${selected + 1} inspector` : "Fine-tune bands"} hint="Widths are total coverage, centered on the band position.">
    <div className="p-selected-editor"><span className="p-band-number" style={{ borderColor: b.color }}>{selected + 1}</span><label className="p-field">Center · stops<input key={`center-${selected}-${b.stop}`} aria-label="Selected band center" type="number" min={-7 + b.width} max={7 - b.width} step="0.25" defaultValue={b.stop} onBlur={e => { if (e.target.value === "") { e.target.value = String(b.stop); return } const next = moveBand(bands, selected, Number(e.target.value)); if (next[selected].stop === b.stop) { e.target.value = String(b.stop); return } remember(); setBands(next) }} /></label><label className="p-field">Total width · stops<input key={`width-${selected}-${b.width}`} aria-label="Selected band total width" type="number" min="0.1" max={Math.max(0.1, 2 * (7 - Math.abs(b.stop)))} step="0.1" defaultValue={Number((b.width * 2).toFixed(2))} onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0.1) updateBand(selected, { width: Math.min(n / 2, 7 - Math.abs(b.stop)) }); else e.target.value = String(b.width * 2) }} /></label><label className="p-field">Color<input aria-label="Selected band color" type="color" value={b.color} onChange={e => updateBand(selected, { color: e.target.value })} /></label><Button variant="ghost" size="icon-lg" aria-label="Remove selected band" disabled={bands.length <= 1} onClick={() => { remember(); setBands(bands.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)); setMessage("Band removed. Undo is available.") }}><Trash2 /></Button></div>
    <div className={cn("p-band-list", variant === "C" && "p-band-list-compact")}><div className="p-band-list-head"><span>Band</span><span>Center</span><span>Coverage</span><span>Hex color</span></div>{bands.map((band, i) => <button className={cn("p-band-row", i === selected && "p-row-selected")} key={i} aria-pressed={i === selected} onClick={() => setSelected(i)}><span><i style={{ background: band.color }} />{i + 1}</span><strong>{signed(band.stop)}</strong><span>{signed(band.stop - band.width)} to {signed(band.stop + band.width)}</span><code>{band.color.toUpperCase()}</code></button>)}</div>
    <p className="p-caption">If bands overlap, the later band in this list wins.</p>
  </Section>
  const preview = <Preview bands={bands} variant={variant} />
  const slots = { config, geometry, graph, colors, bands: bandEditor, preview }
  return <main className={cn("ui-prototype", `p-variant-${variant}`)}>
    <div className="p-topline"><a className="p-brand" href="?variant=A"><Layers /><span>LUT BUILDER</span></a><span className="p-prototype-label">INTERACTIVE PROTOTYPE</span><span className="p-local">Local session · nothing saved</span></div>
    <header className="p-page-heading"><div><p className="p-eyebrow">EXPOSURE COLOR WORKSPACE</p><h1>Make exposure visible.</h1><p>{variantDescriptions[variant]}</p></div><Button variant="outline" disabled={!undo} onClick={() => { if (undo) { setBands(undo.bands); setAppliedDraft(undo.draft); setDraft(undo.draft); setSelected(Math.min(selected, undo.bands.length - 1)); setUndo(null); setMessage("Last band edit undone.") } }}><RotateCcw data-icon="inline-start" />Undo last edit</Button></header>
    {variant === "A" && <VariantA {...slots} />}{variant === "B" && <VariantB {...slots} step={step} setStep={setStep} />}{variant === "C" && <VariantC {...slots} />}
    <section className="p-footer-settings"><label><input type="checkbox" checked={high} onChange={e => setHigh(e.target.checked)} />Show high-signal region on graph</label><span>Graph label only. Image signal warnings are not simulated.</span></section>
    <footer className="p-output"><div><h2>Review before export</h2><p>{camera} → {target} · {cubeSize}³ cube · {bands.length} bands</p></div><span>Export is intentionally unavailable in this layout study.</span></footer>
    <p className="p-live-status" role="status">{message}</p><details className="p-state"><summary>Inspect prototype state · layout {variant} · {bands.length} bands · {dirty ? "draft colors pending" : "colors applied"}</summary><pre>{JSON.stringify({ variant, camera, target, cubeSize, selectedBand: selected + 1, draft, appliedDraft, dirty, highSignalLabel: high, bands }, null, 2)}</pre></details>
    {import.meta.env.DEV && <PrototypeSwitcher variant={variant} onChange={changeVariant} />}
  </main>
}
