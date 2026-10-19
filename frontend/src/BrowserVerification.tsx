import { useEffect, useRef, useState } from "react"
import { Effect } from "effect"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckedImage, SdrViewDescription } from "./CameraVerification"
import { browserInterpretations } from "./lutEngine"
import { browserVerification } from "./browserVerificationClient"
import type { Interpretation } from "./verificationMath"
import { browserVerifiedResult, type VerifiedResult } from "./verifiedResult"
import type { VideoInfo } from "./browserMedia"
import type { BrowserResult } from "./browserVerificationWorker"
import type { Setup } from "./editor"
import { isTypingTarget } from "./keyboard"
import { setupIdentity } from "./importedLut"

const field = "h-9 min-w-0 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
const emptyInterpretation: Interpretation = { transfer: "", gamut: "", matrix: "", signalRange: "", chroma: "", confirmed: false }

function checkedBrowserResult(result: BrowserResult, setup: Setup): VerifiedResult {
  const canvas = document.createElement("canvas")
  canvas.width = result.width; canvas.height = result.height
  const context = canvas.getContext("2d", { colorSpace: "srgb" })
  if (!context) throw new Error("Could not prepare the SDR display image. Verify again.")
  // Canvas receives only the final SDR view, never camera samples.
  context.putImageData(new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height), 0, 0)
  const image = canvas.toDataURL("image/png")
  let lookImage: string | undefined
  if (result.lookRgba) {
    context.putImageData(new ImageData(new Uint8ClampedArray(result.lookRgba),result.width,result.height),0,0)
    lookImage = canvas.toDataURL("image/png")
  }
  return browserVerifiedResult(result, setup, image, lookImage)
}

export function BrowserVerification({ setup }: { setup: Setup }) {
  const [kind, setKind] = useState("Still")
  const [file, setFile] = useState<File | null>(null)
  const [video, setVideo] = useState<VideoInfo | null>(null)
  const [ordinal, setOrdinal] = useState("0")
  const [seconds, setSeconds] = useState("0")
  const [interpretation, setInterpretation] = useState(emptyInterpretation)
  const [depth, setDepth] = useState("")
  const [rangeConfirmed, setRangeConfirmed] = useState(false)
  const [result, setResult] = useState<{ key: string; value: VerifiedResult } | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [inputKey, setInputKey] = useState("")
  const pending = useRef<AbortController | null>(null)
  const key = JSON.stringify([setupIdentity(setup), kind, ordinal, seconds, interpretation, depth, rangeConfirmed])
  const current = result?.key === key ? result.value : null
  if (result && !current) setResult(null)
  if (inputKey !== key) { setInputKey(key); setBusy(false); setStatus("") }
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [])
  useEffect(() => () => { pending.current?.abort(); pending.current = null }, [key])
  useEffect(() => {
    const completed = current
    return () => { if (completed) void Effect.runPromise(completed.release()).catch(() => {}) }
  }, [current])

  function clear() {
    pending.current?.abort(); pending.current = null
    setResult(null); setBusy(false); setStatus("")
  }
  function choose(next: File | null) {
    clear(); setFile(next); setVideo(null); setOrdinal("0"); setSeconds("0"); setDepth(""); setRangeConfirmed(false); setInterpretation(emptyInterpretation)
  }
  function change(name: keyof Interpretation, value: string | boolean) {
    setInterpretation((old) => ({ ...old, confirmed: false, [name]: value }))
  }
  async function run(probe: boolean) {
    if (!file) return
    clear()
    const controller = new AbortController()
    pending.current = controller; setBusy(true)
    try {
      const value = await Effect.runPromise(browserVerification({ file, probe, seconds: Number(seconds), ...(probe ? {} : { setup, interpretation, video: kind === "Video" ? video ?? undefined : undefined, ordinal: Number(ordinal) }) }, (text) => { if (!controller.signal.aborted) setStatus(text) }), { signal: controller.signal })
      if (pending.current !== controller || controller.signal.aborted) return
      if ("frames" in value) { setVideo(value); setStatus("Video inspected. Select a frame and confirm its interpretation.") }
      else { setResult({ key, value: checkedBrowserResult(value, setup) }); setStatus("Verified against the exact serialized cube. Download the checked cube below to retain these bytes.") }
    } catch (cause) {
      if (pending.current === controller && !controller.signal.aborted) setStatus(`Verification failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false) } }
  }
  const expected = browserInterpretations[setup.profile]
  const mismatch = interpretation.transfer !== expected?.transfer || interpretation.gamut !== expected?.gamut
  const frameIndex = Number(ordinal)
  const frame = video?.frames[frameIndex]
  const videoReady = kind !== "Video" || (video && frame && ordinal !== "" && Number.isInteger(frameIndex) && interpretation.matrix && interpretation.signalRange && interpretation.chroma && depth === String(video.bitDepth))
  const ready = file && !busy && interpretation.confirmed && !mismatch && videoReady && (kind === "Video" || rangeConfirmed)
  function stepFrame(direction: number, count = 1) {
    if (busy || !video || !Number.isInteger(frameIndex) || !frame) return
    const next = Math.max(0, Math.min(video.frames.length - 1, frameIndex + direction * count))
    if (next !== frameIndex) { setOrdinal(String(next)); change("confirmed", false) }
  }
  return <Card tabIndex={0} className="min-w-0 self-start" aria-label="Browser camera verification" onKeyDown={(event) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
      (event.target instanceof Element && event.target.closest('dialog, [aria-label="Verified image preview"]'))) return
    if (kind === "Video" && video && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault()
      stepFrame(event.key === "ArrowLeft" ? -1 : 1, event.shiftKey ? 10 : 1)
    }
  }}>
    <CardHeader><CardTitle>Preview and camera verification</CardTitle><CardDescription>Apply the exact exported LUT to your camera still or selected video frame, entirely on this device.</CardDescription></CardHeader>
    <CardContent className="grid min-w-0 gap-3">
      <p className="text-xs text-muted-foreground">The decoder downloads from this site when used (about 31 MB). Media and LUTs stay on your device. Verification can take several minutes; Cancel releases its worker and memory.</p>
      <fieldset className="flex gap-3"><legend>Camera source</legend>{["Still", "Video"].map((value) => <label key={value} className="flex h-9 items-center gap-2"><input type="radio" name="browser-camera-source" checked={kind === value} onChange={() => { choose(null); setKind(value) }} />{value}</label>)}</fieldset>
      <label className="grid gap-2 text-sm font-medium">Choose camera {kind.toLowerCase()}<input key={kind} type="file" accept={kind === "Still" ? ".png,.pfm" : ".mov,.mp4,.mkv"} onChange={(event) => { choose(event.target.files?.[0] ?? null); event.target.value = "" }} /></label>
      <p className="break-all text-sm">{file?.name ?? "No source selected."}</p>
      <p className="text-xs text-muted-foreground">{kind === "Still" ? "Untagged, non-interlaced 16-bit RGB PNG without alpha, or float32 RGB PFM; up to 48 MiB plus header. Export unchanged camera RGB without a viewing transform. JPEG and RAW are unsupported." : "H.264, HEVC, ProRes 422 or FFV1; planar 4:2:0 8/10-bit or 4:2:2 10-bit, progressive square pixels. Up to 512 MiB and five minutes. Inspect a one-second interval, then choose a frame from it. No rotation or dynamic HDR."} Maximum 4,194,304 pixels.</p>
      {kind === "Video" && <><label className="grid gap-1 text-sm">Seek time (seconds from stream start)<input className={field} type="number" min="0" max="300" step="0.1" value={seconds} onChange={(event) => { clear(); setSeconds(event.target.value); setVideo(null); setOrdinal("0"); change("confirmed", false) }} /></label><Button variant="outline" disabled={!file || busy || seconds === "" || !Number.isFinite(Number(seconds)) || Number(seconds) < 0 || Number(seconds) > 300} onClick={() => void run(true)}>Inspect video</Button></>}
      {video && kind === "Video" && <>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !frame || frameIndex <= 0} onClick={() => stepFrame(-1)}>Previous frame</Button><Button variant="outline" disabled={busy || !frame || frameIndex >= video.frames.length - 1} onClick={() => stepFrame(1)}>Next frame</Button></div>
        <label className="grid gap-1 text-sm">Frame in inspected interval (from 0)<input className={field} type="number" min="0" max={video.frames.length - 1} step="1" value={ordinal} onChange={(event) => { setOrdinal(event.target.value); change("confirmed", false) }} /></label>
        <p className="text-xs">{video.frames.length} frames in this interval · {video.stream.width} × {video.stream.height} · {video.stream.codec_name} · {video.stream.pix_fmt}</p>
        {frame && <p className="text-xs">Selected interval frame {ordinal} · PTS {frame.pts} · time base {video.stream.time_base} · stream start PTS {video.stream.start_pts}. Frame metadata takes precedence; suggestions remain unconfirmed.</p>}
          <p className="text-xs text-muted-foreground">Reported video transfer / primaries: {frame?.color_transfer ?? video.stream.color_transfer ?? "unknown"} / {frame?.color_primaries ?? video.stream.color_primaries ?? "unknown"}</p>
          {frame && ((frame.color_transfer && !["unknown", "unspecified"].includes(frame.color_transfer) && frame.color_transfer.toLowerCase() !== interpretation.transfer.toLowerCase()) || (frame.color_primaries && !["unknown", "unspecified"].includes(frame.color_primaries) && frame.color_primaries.toLowerCase() !== interpretation.gamut.toLowerCase())) && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">Reported transfer/primaries differ from the selected source interpretation. This may be a transformed proxy or inaccurate metadata; verify only if your recording/export workflow confirms the samples are still camera-encoded.</p>}
        {([ ["YCbCr matrix", "matrix", ["bt709", "bt470bg", "smpte170m", "bt2020nc"], "color_space"], ["Signal range", "signalRange", ["limited", "full"], "color_range"], ["Chroma location", "chroma", ["left", "center", "topleft"], "chroma_location"] ] as const).map(([label, name, options, fact]) => <label key={name} className="grid gap-1 text-sm">{label}<span className="text-xs text-muted-foreground">Reported: {frame?.[fact] ?? video.stream[fact] ?? "unknown"}{name === "signalRange" ? " (pc = full; tv = limited)" : ""}</span><select className={field} value={interpretation[name]} onChange={(event) => change(name, event.target.value)}><option value="">Unknown / unconfirmed</option>{options.map((value) => <option key={value}>{value}</option>)}</select></label>)}
        <label className="grid gap-1 text-sm">Component bit depth<select className={field} value={depth} onChange={(event) => { setDepth(event.target.value); change("confirmed", false) }}><option value="">Unknown / unconfirmed</option><option>{video.bitDepth}</option></select></label>
      </>}
      {([ ["Source transfer function", "transfer"], ["Source gamut", "gamut"] ] as const).map(([label, name]) => <label key={name} className="grid gap-1 text-sm">{label}<select className={field} value={interpretation[name]} onChange={(event) => change(name, event.target.value)}><option value="">Unknown / unconfirmed</option>{[...new Set(Object.values(browserInterpretations).map((value) => value[name]))].map((value) => <option key={value}>{value}</option>)}</select></label>)}
      {kind === "Still" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rangeConfirmed} onChange={(event) => { setRangeConfirmed(event.target.checked); change("confirmed", false) }} />Normalized camera RGB code values; any transport conversion was resolved before export. PNG / 65535; PFM unchanged.</label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={interpretation.confirmed} onChange={(event) => change("confirmed", event.target.checked)} />I confirm the source transfer/gamut{kind === "Video" ? ", matrix, transport range, chroma location and component depth" : " and RGB range"} from my recording/export workflow. No viewing transform or grading is baked in.</label>
      {interpretation.transfer && interpretation.gamut && mismatch && <p role="alert" className="text-sm text-destructive">Source interpretation must match the selected LUT camera profile ({setup.profile}).</p>}
      <p className="text-xs text-muted-foreground">The file cannot prove its log profile. The result checks the declared pipeline, not sensor exposure. <SdrViewDescription setup={setup} /> Source excursions are preserved until the cube boundary.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={!ready} onClick={() => void run(false)}>Verify {kind === "Video" ? "selected frame" : "still"}</Button>{busy && <Button variant="outline" onClick={() => { clear(); setStatus("Verification cancelled. No result is shown.") }}>Cancel verification</Button>}<Button variant="outline" disabled={!file} onClick={() => choose(null)}>Release source</Button></div>
      <p role="status" aria-live="polite" className="text-sm">{status}</p>
      {current?.provenance.warnings.map((warning) => <p key={warning} className="text-sm text-amber-700 dark:text-amber-300">{warning}</p>)}
      {current && <CheckedImage key={current.provenance.cube_sha256 as string} result={current} />}
    </CardContent>
  </Card>
}
