import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react"
import { Popover } from "@base-ui/react/popover"
import { Data, Effect, Result, Schema } from "effect"

import { Button } from "@/components/ui/button"
import { PaletteEditor, type PalettePreview } from "./PaletteEditor"
import { ExposurePreview } from "./ExposurePreview"
import { ReferencePreview } from "./ReferencePreview"
import { KeyboardHelp } from "./KeyboardHelp"
import { isTypingTarget } from "./keyboard"
import { tailwindPalette } from "./tailwindPalette"
import { BandNumberInput } from "./BandNumberInput"
import { overlayForExposure } from "./demonstration"
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
import { CameraVerification, type SourceInterpretations } from "@/CameraVerification"
import { BrowserVerification } from "./BrowserVerification"
import { browserInterpretations, browserProfiles, browserTargets } from "@/lutEngine"
import { defaultFilenameTemplate, outputFilename } from "./outputFilename"
import { deleteSetupPreset, readSetupPresets, saveSetupPreset, type SetupPreset } from "@/setupPresets"
import { decodeSetup, SetupSchema, SetupValidationError } from "@/setupSchema"
import { generateInWorker } from "@/lutWorkerClient"
import {
  applyBandPreset,
  applyFillPreset,
  bandId,
  changeMode,
  contrastTextColor,
  createBand,
  createEditorState,
  exportSetup,
  exposureReferenceValue,
  filterPalette,
  hexToHsv,
  hsvToHex,
  importSetup,
  isHexColor,
  resizeBandWidth,
  removeBand,
  reduceEditor,
  snapBandValue,
  stepBandValue,
  updateBand,
  updateFillBoundary,
  type FillPreset,
  type BandPreset,
  type Mode,
  type PaletteColor,
  type Setup,
} from "@/editor"

type Catalog = {
  profiles: string[]
  source_interpretations: SourceInterpretations
  targets: string[]
  palette: PaletteColor[]
}

const PreviewSchema = Schema.Struct({
  minimum: Schema.Finite,
  maximum: Schema.Finite,
  unit: Schema.String,
  colors: Schema.Array(Schema.String),
  overlays: Schema.Array(Schema.NullOr(Schema.String)),
  input_overlays: Schema.Array(Schema.NullOr(Schema.String)),
  input_exposure: Schema.Array(Schema.Finite),
  legend: Schema.Array(Schema.Struct({ kind: Schema.String, color: Schema.String, label: Schema.String })),
  warnings: Schema.Array(Schema.String),
  setup: SetupSchema,
})
type Preview = typeof PreviewSchema.Type
const ErrorResponseSchema = Schema.Struct({ error: Schema.optional(Schema.String) })

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const VideoFrameSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  source_id: Schema.String,
  display: Schema.String,
  frame: Schema.Struct({ source_id: Schema.optional(Schema.String), index: Schema.Finite, pts: Schema.String, time_base: Schema.String, first_pts: Schema.String, relative_time: Schema.String, seconds: Schema.Finite, count: Schema.Finite }),
  facts: Schema.Struct({ stream: Schema.Record(Schema.String, Schema.Unknown), frame: Schema.Record(Schema.String, Schema.Unknown) }),
  source: Schema.Struct({ precision_bits: Schema.Finite, pixel_format: Schema.String }),
  provenance: Schema.Struct({ matrix: Schema.String, range: Schema.String, chroma_location: Schema.String, view: Schema.String }),
})
export type VideoFrame = typeof VideoFrameSchema.Type

class WorkspaceRequestError extends Data.TaggedError("WorkspaceRequestError")<{
  readonly message: string
  readonly cause: unknown
}> {}

function videoRequest<T>(path: string, body: object | File, decode: (input: unknown) => T, signal?: AbortSignal): Promise<T> {
  const operation = Effect.tryPromise({
    try: async (requestSignal) => {
      const response = await fetch(`/video/${path}`, {
        method: "POST",
        headers: { "Content-Type": body instanceof File ? "application/octet-stream" : "application/json", "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN },
        body: body instanceof File ? body : JSON.stringify(body),
        signal: requestSignal,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(Schema.decodeUnknownSync(ErrorResponseSchema)(result).error || "Video request failed")
      return decode(result)
    },
    catch: (cause) => new WorkspaceRequestError({ message: cause instanceof Error ? cause.message : "Video request failed", cause }),
  })
  return Effect.runPromise(operation, { signal })
}

function readImage(file: File): Effect.Effect<string, WorkspaceRequestError> {
  return Effect.callback((resume, signal) => {
    const reader = new FileReader()
    const abort = () => reader.abort()
    const cleanup = () => {
      signal.removeEventListener("abort", abort)
      reader.onload = null
      reader.onerror = null
      reader.onabort = null
    }
    reader.onload = () => {
      const data = String(reader.result)
      cleanup()
      resume(Effect.succeed(data))
    }
    reader.onerror = () => {
      cleanup()
      resume(Effect.fail(new WorkspaceRequestError({ message: "Could not read this image. Try a PNG, JPEG, or WebP file.", cause: reader.error })))
    }
    signal.addEventListener("abort", abort, { once: true })
    reader.readAsDataURL(file)
    return Effect.sync(() => {
      cleanup()
      if (reader.readyState === FileReader.LOADING) reader.abort()
    })
  })
}

function releaseVideo(source_id: string) {
  void Effect.runPromise(Effect.tryPromise({
    try: (signal) => fetch("/video/cancel", {
      method: "POST", keepalive: true, signal,
      headers: { "Content-Type": "application/json", "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN },
      body: JSON.stringify({ source_id }),
    }),
    catch: (cause) => new WorkspaceRequestError({ message: "Video cancellation failed.", cause }),
  })).catch(() => {}) // Server expiry also cleans up if the page has disconnected.
}

export function LutImagePreview({ preview, camera }: { preview: Preview | null; camera?: { setup: Setup; interpretations: SourceInterpretations } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const selection = useRef(0)
  const [imageUrl, setImageUrl] = useState(referenceImage)
  const [imageName, setImageName] = useState("Reference photo")
  const [imageError, setImageError] = useState("")
  const [comparison, setComparison] = useState("Split view")
  const [expanded, setExpanded] = useState(false)
  const [opacity, setOpacity] = useState(100)
  const videoInput = useRef<HTMLInputElement>(null)
  const imageRead = useRef<AbortController | null>(null)
  const videoSource = useRef("")
  const videoAbort = useRef<AbortController | null>(null)
  const [video, setVideo] = useState<VideoFrame | null>(null)
  const [videoBusy, setVideoBusy] = useState("")
  const [videoTime, setVideoTime] = useState("0")
  const [frameRevision, setFrameRevision] = useState(0)

  useEffect(() => {
    const cleanup = () => {
      videoAbort.current?.abort()
      if (videoSource.current) releaseVideo(videoSource.current)
    }
    window.addEventListener("pagehide", cleanup)
    return () => { cleanup(); window.removeEventListener("pagehide", cleanup) }
  }, [])

  function stopVideo() {
    selection.current += 1
    videoAbort.current?.abort()
    if (videoSource.current) releaseVideo(videoSource.current)
    videoSource.current = ""
    setVideo(null)
    setVideoBusy("")
  }

  async function chooseVideo(file: File) {
    stopVideo()
    const request = selection.current
    setImageUrl(referenceImage)
    setImageName("Reference photo")
    setImageError("")
    if (file.size === 0 || file.size > 256 * 1024 * 1024) {
      setImageError("Choose a nonempty video up to 256 MB.")
      return
    }
    setVideoBusy("Uploading and indexing decoded presentation frames…")
    const controller = new AbortController()
    videoAbort.current = controller
    try {
      const { source_id } = await videoRequest("start", {}, Schema.decodeUnknownSync(Schema.Struct({ source_id: Schema.String })))
      if (request !== selection.current) { releaseVideo(source_id); return }
      videoSource.current = source_id
      const result = await videoRequest(`upload?source_id=${encodeURIComponent(source_id)}`, file, Schema.decodeUnknownSync(VideoFrameSchema), controller.signal)
      if (request !== selection.current) return
      setVideo({ ...result, name: file.name })
      setVideoTime("0")
      setImageUrl(result.display)
      setImageName(file.name)
    } catch (error) {
      if (request === selection.current) {
        if (videoSource.current) releaseVideo(videoSource.current)
        videoSource.current = ""
        setImageError(error instanceof Error ? error.message : "Video import failed")
      }
    } finally {
      if (request === selection.current) setVideoBusy("")
    }
  }

  async function selectVideoFrame(position: { time: string } | { index: number }) {
    const request = ++selection.current
    setFrameRevision((value) => value + 1)
    setVideoBusy("Decoding the selected presentation frame…")
    setImageError("")
    const controller = new AbortController()
    videoAbort.current = controller
    try {
      const result = await videoRequest("frame", { source_id: videoSource.current, ...position }, Schema.decodeUnknownSync(VideoFrameSchema), controller.signal)
      if (request !== selection.current) return
      setVideo({ ...result, name: video?.name })
      setImageUrl(result.display)
    } catch (error) {
      if (request === selection.current) setImageError(`${error instanceof Error ? error.message : "Frame extraction failed"} The displayed frame is unchanged.`)
    } finally {
      if (request === selection.current) setVideoBusy("")
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d", { willReadFrequently: true })
    if (!canvas || !context) return

    const draw = (image: HTMLImageElement) => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)

      if (comparison === "Original" || !preview?.overlays.length) return
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      // ponytail: 960px illustration scans bands per pixel; use a worker if editing lags.
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (pixels.data[offset + 3] === 0 || (comparison === "Split view" && (offset / 4) % canvas.width < canvas.width / 2)) continue
        const red = pixels.data[offset] / 255
        const green = pixels.data[offset + 1] / 255
        const blue = pixels.data[offset + 2] / 255
        const encodedLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        const linearLuminance = srgbToLinear(red) * 0.2126 + srgbToLinear(green) * 0.7152 + srgbToLinear(blue) * 0.0722
        const exposure = preview.setup.band_mode === "ire"
            ? encodedLuminance * 100
            : Math.log2(Math.max(linearLuminance, 1e-6) / 0.18)
        const overlay = overlayForExposure(preview.setup, exposure)
        if (!overlay && preview.setup.monochrome) {
          const grey = Math.round(encodedLuminance * 255)
          for (let channel = 0; channel < 3; channel += 1) {
            pixels.data[offset + channel] = pixels.data[offset + channel] * (1 - opacity / 100) + grey * opacity / 100
          }
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

    const image = new Image()
    image.onload = () => draw(image)
    image.onerror = () => setImageError("This image could not be displayed. Choose another still image.")
    image.src = imageUrl
    return () => { image.onload = null; image.onerror = null }
  }, [imageUrl, comparison, opacity, preview, expanded])

  useEffect(() => () => imageRead.current?.abort(), [])

  function chooseImage(file: File) {
    stopVideo()
    const request = ++selection.current
    imageRead.current?.abort()
    setImageError("")
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      setImageError("Choose a still image up to 25 MB. The previous image is unchanged.")
      return
    }
    const controller = new AbortController()
    imageRead.current = controller
    void Effect.runPromise(readImage(file), { signal: controller.signal }).then((data) => {
      if (request !== selection.current) return
      const candidate = new Image()
      candidate.onerror = () => {
        if (request === selection.current) setImageError("Could not read this image. Try a PNG, JPEG, or WebP file. The previous image is unchanged.")
      }
      candidate.onload = () => {
        if (request !== selection.current) return
        setImageUrl(data)
        setImageName(file.name)
      }
      candidate.src = data
    }).catch((error: unknown) => {
      if (request === selection.current && !controller.signal.aborted) {
        setImageError(`${error instanceof Error ? error.message : "Could not read this image."} The previous image is unchanged.`)
      }
    })
  }

  const content = <div className="grid min-w-0 gap-3">
    {!camera && <>
    <canvas ref={canvasRef} className="aspect-video w-full rounded-md bg-black" height="540" width="960" aria-label={`Demonstration image: ${comparison}`} />
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium">Compare demonstration</legend>
      {["Original", "Split view", "Band colors"].map((choice) => <label key={choice} className="relative flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <input type="radio" name="demonstration-comparison" value={choice} checked={comparison === choice} onChange={() => setComparison(choice)} />{choice}
      </label>)}
    </fieldset>
    {comparison === "Split view" && <p className="text-xs text-muted-foreground">Original on the left. Band colors on the right.</p>}
    <label className="grid gap-2 text-sm font-medium">Viewing opacity · {opacity}%
      <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
    </label>
    <p className="text-xs text-muted-foreground">Opacity changes this view only, never the exported LUT.</p>
    </>}
    <div className="flex flex-wrap gap-2">
      {!camera && <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>Choose image</Button>}
      <Button type="button" variant="outline" onClick={() => videoInput.current?.click()}>Choose video</Button>
      {!camera && imageUrl !== referenceImage && <Button type="button" variant="ghost" onClick={() => { stopVideo(); setImageUrl(referenceImage); setImageName("Reference photo"); setImageError("") }}>Reference photo</Button>}
      <input ref={inputRef} className="sr-only" tabIndex={-1} aria-label="Choose demonstration still image" type="file" accept="image/*" onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) chooseImage(file)
        event.target.value = ""
      }} />
      <input ref={videoInput} className="sr-only" tabIndex={-1} aria-label={camera ? "Choose local camera video" : "Choose local demonstration video"} type="file" accept=".mp4,.mov,.mkv" onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void chooseVideo(file)
        event.target.value = ""
      }} />
    </div>
    <p className="break-all text-xs text-muted-foreground" role="status">{camera && !video ? "No camera video selected." : imageName} · {camera || video ? "Video stays on this computer in temporary server storage." : "Still images stay in this browser session. Maximum 25 MB."}</p>
    <p className="text-xs text-muted-foreground">Video: MP4/MOV/MKV, H.264, HEVC, ProRes 422 or FFV1. Progressive, square pixels, no rotation. Up to 256 MB, 1920 × 1080, 120 seconds and 10,000 frames. Processing limit: 60 seconds per stage. One video per app launch; expires after 15 idle minutes.</p>
    {videoBusy && <div className="flex flex-wrap items-center gap-2"><p role="status" className="text-sm">{videoBusy}</p><Button type="button" variant="outline" onClick={() => { stopVideo(); setImageUrl(referenceImage); setImageName("Reference photo"); setImageError("Video cancelled and temporary data released.") }}>Cancel video</Button></div>}
    {video && <div className="grid gap-3 rounded-md border p-3">
      <label className="grid gap-2 text-sm">Requested relative time in seconds
        <input type="number" min="0" step="any" className={fieldClass} value={videoTime} onChange={(event) => setVideoTime(event.target.value)} disabled={!!videoBusy} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!!videoBusy || !videoTime.trim()} onClick={() => void selectVideoFrame({ time: videoTime })}>Select frame</Button>
        <Button type="button" variant="outline" disabled={!!videoBusy || video.frame.index === 0} onClick={() => void selectVideoFrame({ index: video.frame.index - 1 })}>Previous frame</Button>
        <Button type="button" variant="outline" disabled={!!videoBusy || video.frame.index + 1 === video.frame.count} onClick={() => void selectVideoFrame({ index: video.frame.index + 1 })}>Next frame</Button>
        <Button type="button" variant="ghost" onClick={() => { stopVideo(); setImageUrl(referenceImage); setImageName("Reference photo") }}>Release video</Button>
      </div>
      <p role="status" className="text-sm">Selected {video.frame.seconds.toFixed(6)} s · exact {video.frame.relative_time} s · frame {video.frame.index + 1} of {video.frame.count}. PTS {video.frame.pts}, time base {video.frame.time_base}; first PTS {video.frame.first_pts}.</p>
      <p className="text-xs text-muted-foreground">First decoded presentation frame at or after the request. Previous/Next follows decoded frames, including variable frame rate.</p>
      <details>
        <summary className="cursor-pointer text-sm">Reported by file</summary>
        <dl className="mt-2 grid gap-2 text-xs">
          {["codec_name", "profile", "width", "height", "pix_fmt", "color_range", "color_space", "color_transfer", "color_primaries", "chroma_location", "sample_aspect_ratio", "field_order", "tags", "side_data_list"].map((key) => <div key={key} className="break-all"><dt className="font-medium">{key.replaceAll("_", " ")}</dt><dd>Stream: {JSON.stringify(video.facts.stream[key] ?? "unknown")} · Frame: {JSON.stringify(video.facts.frame[key] ?? "unknown")}</dd></div>)}
        </dl>
        <p className="mt-2 text-xs">Decoded component depth: {video.source.precision_bits} bits. Camera profile suggestions: none. Missing metadata stays unknown; codec and matrix do not identify camera gamma or gamut.</p>
      </details>
      {!camera && <details><summary className="cursor-pointer text-sm">Demonstration decoding assumptions</summary>
        <p className="mt-2 text-xs">Unconfirmed matrix {video.provenance.matrix}, range {video.provenance.range}, chroma location {video.provenance.chroma_location}. Supported frame tags take precedence over stream tags; missing or unsupported tags use BT.709 / limited / left for this illustration.</p>
        <p className="mt-2 text-xs">{video.provenance.view} Native {video.source.pixel_format} samples are retained separately for later verification. No exported LUT has been applied.</p>
      </details>}
    </div>}
    {imageError && <p className="text-sm text-destructive" role="alert">{imageError}</p>}
    {camera && video && !videoBusy && !imageError && <CameraVerification key={`${video.source_id}:${frameRevision}`} {...camera} video={video} />}
  </div>

  return (
    <aside tabIndex={0} className="min-w-0 self-start @min-[64rem]:sticky @min-[64rem]:top-6" aria-label={camera ? "Camera video selection" : "Demonstration preview"}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
        if (camera && event.target instanceof Element && event.target.closest("dialog")) return
        if (!camera && !expanded && event.key.toLowerCase() === "f") {
          event.preventDefault()
          expandRef.current?.click()
        } else if (video && !videoBusy && !event.repeat && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault()
          const next = Math.max(0, Math.min(video.frame.count - 1, video.frame.index + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1)))
          if (next !== video.frame.index) void selectVideoFrame({ index: next })
        }
      }}>
      <Card className="overflow-hidden border-white/15 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <CardTitle className="text-base">{camera ? "Camera video frame" : "Demonstration"}</CardTitle>
            <CardDescription>{camera ? "Select a native frame, confirm its interpretation, then verify." : "Illustrative band colors on an image or selected video frame."}</CardDescription>
          </div>
          <Button
            ref={expandRef}
            aria-keyshortcuts="f"
            hidden={!!camera}
            type="button"
            variant="ghost"
            onClick={() => { setExpanded(true); dialogRef.current?.showModal() }}
          >
            Expand preview
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 pb-4">
          {!camera && <p className="text-sm text-muted-foreground">A graded image cannot verify original camera exposure. This demonstration illustrates relative brightness and band colors; it does not apply the exported LUT.</p>}
          {!expanded && content}
        </CardContent>
      </Card>
      <dialog ref={dialogRef} aria-labelledby="expanded-preview-title" className="m-auto max-h-[90dvh] w-[min(72rem,calc(100%-2rem))] overflow-auto rounded-xl border bg-card p-4 text-card-foreground backdrop:bg-black/70" onClose={() => { setExpanded(false); expandRef.current?.focus() }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="expanded-preview-title" className="text-lg font-semibold">Expanded demonstration</h2>
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Close preview</Button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">Illustration only. A graded image cannot verify original camera exposure; this does not apply the exported LUT.</p>
        {expanded && content}
      </dialog>
    </aside>
  )
}

function WorkbenchPreview({ preview, setup, catalog, browserOnly }: { preview: Preview | null; setup: Setup; catalog: Catalog; browserOnly: boolean }) {
  const [mode, setMode] = useState("Camera-matched")
  const [sourceKind, setSourceKind] = useState("Still")
  if (browserOnly) return <BrowserVerification setup={setup} />
  return <div className="grid min-w-0 self-start gap-3 @min-[64rem]:sticky @min-[64rem]:top-6">
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-2 text-sm font-medium">Preview mode</legend>
      {["Demonstration", "Camera-matched"].map((choice) => <label key={choice} className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"><input type="radio" name="preview-mode" checked={mode === choice} onChange={() => setMode(choice)} />{choice}</label>)}
    </fieldset>
    {mode === "Camera-matched" && <fieldset className="flex gap-3"><legend>Camera source</legend>{["Still", "Video"].map((kind) => <label key={kind} className="flex h-9 items-center gap-2"><input type="radio" name="camera-source" checked={sourceKind === kind} onChange={() => setSourceKind(kind)} />{kind}</label>)}</fieldset>}
    {mode === "Demonstration" ? <LutImagePreview key="demo" preview={preview} /> : sourceKind === "Video" ? <LutImagePreview key="camera" preview={null} camera={{ setup, interpretations: catalog.source_interpretations ?? {} }} /> : <CameraVerification setup={setup} interpretations={catalog.source_interpretations ?? {}} />}
  </div>
}

declare global {
  interface Window {
    LUT_BUILDER_TOKEN: string
    LUT_BUILDER_SETUP: Setup
    LUT_BUILDER_CATALOG: Catalog
  }
}

const browserCatalog: Catalog = {
  profiles: browserProfiles,
  source_interpretations: {},
  targets: browserTargets,
  palette: [
    { name: "violet-800", hex: "#5b21b6" }, { name: "blue-600", hex: "#2563eb" },
    { name: "sky-400", hex: "#38bdf8" }, { name: "teal-400", hex: "#2dd4bf" },
    { name: "green-500", hex: "#22c55e" }, { name: "lime-400", hex: "#a3e635" },
    { name: "yellow-400", hex: "#facc15" }, { name: "orange-500", hex: "#f97316" },
    { name: "red-600", hex: "#dc2626" },
  ],
}

const browserSetup: Setup = {
  profile: "Sony S-Log3", target: "Rec.709", cube_size: 65,
  bands: [{ stop: 0, width: 0.3, color: "#22c55e" }], band_mode: "stops",
  fill_mode: false, low_signal_warning: false, low_signal_hex: "#5b21b6",
  high_signal_warning: false, high_signal_hex: "#dc2626", monochrome: true,
  legal_range: false, output: defaultFilenameTemplate,
}

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"

function postJson(path: string, setup: Setup, signal?: AbortSignal): Promise<Preview> {
  const request = Effect.tryPromise({
    try: async (requestSignal) => {
      const response = await fetch(path, {
        method: "POST",
        signal: requestSignal,
        headers: {
          "Content-Type": "application/json",
          "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN,
        },
        body: JSON.stringify({ version: 1, ...setup }),
      })
      if (!response.ok) {
        const result = Schema.decodeUnknownSync(ErrorResponseSchema)(await response.json())
        throw new Error(result.error || "Request failed")
      }
      return Schema.decodeUnknownSync(PreviewSchema)(await response.json())
    },
    catch: (cause) => new WorkspaceRequestError({
      message: cause instanceof Error ? cause.message : "Request failed",
      cause,
    }),
  })
  return Effect.runPromise(request, { signal })
}

export function ColorPicker({
  label,
  value,
  palette = tailwindPalette,
  disabled = false,
  hideLabel = false,
  triggerRef,
  onChange,
}: {
  label: string
  value: string
  palette?: PaletteColor[]
  disabled?: boolean
  hideLabel?: boolean
  triggerRef?: Ref<HTMLButtonElement>
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [showPresets, setShowPresets] = useState(false)
  const [hue, setHue] = useState(() => hexToHsv(isHexColor(value) ? value : "#000000").hue)
  const originalValue = useRef(value)
  const [hexDraft, setHexDraft] = useState(value)
  const hexValue = isHexColor(hexDraft) ? value : hexDraft
  const matches = useMemo(
    () => filterPalette(palette, search),
    [palette, search],
  )
  const presetGroups = Object.entries(matches.reduce<Record<string, PaletteColor[]>>((groups, color) => {
    const family = color.name.replace(/-\d+$/, "")
    ;(groups[family] ??= []).push(color)
    return groups
  }, {}))
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
        <div className="flex min-w-0 items-center gap-2">
        <Popover.Trigger
          ref={triggerRef}
          aria-label={`Open ${label} picker`}
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded border border-black/10"
            style={{ backgroundColor: isHexColor(value) ? value : "#000000" }}
          />
        </Popover.Trigger>
        <input aria-label={`${label} hex value`} title="Copy or paste a six-digit hex color, such as #2563eb" className={`${fieldClass} min-w-0 font-mono !px-2 text-xs`} value={hexValue} spellCheck={false} aria-invalid={!isHexColor(hexValue)}
          onChange={(event) => {
            const next = event.target.value
            setHexDraft(next)
            if (isHexColor(next)) onChange(next)
          }}
          onBlur={() => setHexDraft(value)}
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setHexDraft(value) } }} />
        </div>
        <Popover.Portal>
          <Popover.Positioner
            align="start"
            className="z-50"
              side="bottom"
              collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
            sideOffset={8}
          >
            <Popover.Popup data-workbench-popup
              aria-label={`${label} picker`}
                className="grid max-h-[var(--available-height)] w-80 max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" size="sm" variant="outline" aria-expanded={showPresets} onClick={() => setShowPresets((shown) => !shown)}>{showPresets ? "Custom color" : "Tailwind presets"}</Button>
                  <Popover.Close render={<Button size="sm" variant="ghost" />}>Done</Popover.Close>
                </div>
                <div className={showPresets ? "hidden" : "grid min-w-0 gap-3"}>
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
              </div>
                {showPresets && <div className="grid min-w-0 gap-3">
                <input aria-label={`Search ${label} palette`} className={fieldClass} value={search} placeholder="Search red-500 or #ef44" onChange={(event) => setSearch(event.target.value)} />
                  <div className="grid gap-3">
                    {presetGroups.length === 0 && <p className="text-xs text-muted-foreground">No matching colors.</p>}
                    {presetGroups.map(([family, colors]) => <div className="grid min-w-0 grid-cols-6 gap-1" key={family}>
                      <span className="col-span-6 text-xs text-muted-foreground">{family}</span>
                    {colors.map((color) => (
                        <button aria-label={color.name} aria-pressed={color.hex.toLowerCase() === value.toLowerCase()} className={`h-8 rounded border border-black/10 text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${color.hex.toLowerCase() === value.toLowerCase() ? "ring-2 ring-ring ring-offset-1" : ""}`} key={color.name} title={color.name} type="button" style={{ backgroundColor: color.hex, color: contrastTextColor(color.hex) }} onClick={() => { setHue(hexToHsv(color.hex).hue); onChange(color.hex) }}>{color.name.split("-").at(-1)}</button>
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
  onEditStart,
  onEditEnd,
  onEditColor,
  onRemove,
}: {
  setup: Setup
  preview: Pick<Preview, "minimum" | "maximum" | "unit">
  increment: number
  selectedBand: number
  onSelect: (index: number) => void
  onChange: (index: number, stop: number) => void
  onWidthChange: (index: number, width: number) => void
  onEditStart?: () => void
  onEditEnd?: () => void
  onEditColor?: (index: number) => void
  onRemove?: (index: number) => void
}) {
  const graph = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<number | null>(null)
  function focusBand(index: number) {
    const control = graph.current?.querySelector<HTMLButtonElement>(`[data-band-center="${index}"]`)
    pendingFocus.current = control ? null : index
    control?.focus()
  }
  useEffect(() => {
    if (pendingFocus.current === null) return
    const index = Math.min(pendingFocus.current, setup.bands.length - 1)
    const control = graph.current?.querySelector<HTMLButtonElement>(`[data-band-center="${index}"]`)
    ;(control ?? graph.current)?.focus()
    pendingFocus.current = null
  }, [setup.bands, selectedBand])
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
  const fillBands = setup.fill_mode ? [...setup.bands].sort((a, b) => a.stop - b.stop) : []
  const belowIndexes = interactiveBands.flatMap((band, index) =>
    band.stop < preview.minimum ? [index] : [],
  )
  const aboveIndexes = interactiveBands.flatMap((band, index) =>
    band.stop > preview.maximum ? [index] : [],
  )
  const tickStep = Math.max(1, Math.ceil((preview.maximum - preview.minimum) / 14))
  const ticks = setup.band_mode === "stops"
    ? [...new Set([preview.minimum, ...Array.from(
        { length: Math.floor(preview.maximum / tickStep) - Math.ceil(preview.minimum / tickStep) + 1 },
        (_, index) => (Math.ceil(preview.minimum / tickStep) + index) * tickStep,
      ), preview.maximum])]
    : Array.from({ length: 11 }, (_, index) => index * 10)
  const selected = interactiveBands[selectedBand]
  const unitLabel = setup.band_mode === "stops" ? "stops from reference" : preview.unit
  const selectedReadout = selected && (setup.fill_mode
    ? `Boundary ${selectedBand + 1} · ${selected.stop} ${preview.unit}`
    : `Band ${selectedBand + 1} · center ${selected.stop} ${preview.unit} · total width ${Number((selected.width * 2).toFixed(6))} ${preview.unit} · boundaries ${Number((selected.stop - selected.width).toFixed(6))} to ${Number((selected.stop + selected.width).toFixed(6))} ${preview.unit}${selected.stop < preview.minimum || selected.stop > preview.maximum ? " · outside visible range" : ""}`)

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? -1
          : null
    if (direction === null) return
    event.preventDefault()
    onSelect(index)
    onChange(index, stepBandValue(setup.bands[index].stop, direction, increment * (event.shiftKey ? 10 : 1), ...bounds))
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
      <span className="text-muted-foreground">Range {preview.minimum} to {preview.maximum} {preview.unit}{setup.band_mode === "stops" ? " · Reference 0 stops" : ` · Neutral reference ${exposureReferenceValue(setup).toFixed(1)} IRE`}</span>
    </div>
    <div
      ref={graph}
      tabIndex={setup.bands.length ? -1 : 0}
      role="group"
      aria-keyshortcuts="Delete Backspace Alt+ArrowLeft Alt+ArrowRight"
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || isTypingTarget(event.target) || event.ctrlKey || event.metaKey) return
        if (event.altKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && setup.bands.length) {
          event.preventDefault()
          const next = Math.max(0, Math.min(setup.bands.length - 1, selectedBand + (event.key === "ArrowLeft" ? -1 : 1)))
          onSelect(next)
          focusBand(next)
        } else if (!event.altKey && !event.shiftKey && (event.key === "Delete" || event.key === "Backspace")) {
          event.preventDefault()
          if (event.repeat || !onRemove || !setup.bands[selectedBand] || (setup.fill_mode && setup.bands.length <= 2)) return
          pendingFocus.current = selectedBand
          onRemove(selectedBand)
        }
      }}
      className="relative isolate flex h-28 touch-none overflow-hidden rounded-lg border"
        style={{ backgroundColor: fillBands[0]?.color, backgroundImage: fillBands.length > 1
          ? `linear-gradient(to right, ${fillBands.map((band, index) => `${band.color} ${index === 0 ? 0 : position(fillBands[index - 1].stop)}% ${index === fillBands.length - 1 ? 100 : position(band.stop)}%`).join(",")})`
          : undefined }}
      onPointerUp={onEditEnd}
      onPointerCancel={onEditEnd}
      onLostPointerCapture={onEditEnd}
      aria-label={`Editable exposure graph from ${preview.minimum} to ${preview.maximum} ${preview.unit}`}
    >
      {setup.band_mode === "ire" && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[1] border-l border-dashed border-current" style={{ left: `${position(exposureReferenceValue(setup))}%` }} />}
      {setup.fill_mode && fillBands.map((band, index) => {
        const left = index === 0 ? 0 : position(fillBands[index - 1].stop)
        const right = index === fillBands.length - 1 ? 100 : position(band.stop)
        return <button key={`fill-color-${bandId(band)}`} type="button" aria-label={`Edit fill color ${index + 1}`} title="Double-click to edit color; Enter or Space also opens the picker"
          data-band-center={index === setup.bands.length - 1 ? index : undefined}
          onFocus={() => onSelect(index)}
          className="absolute inset-y-0 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-foreground"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          onClick={(event) => { onSelect(index); if (event.detail === 0) onEditColor?.(index) }}
          onDoubleClick={() => onEditColor?.(index)} />
      })}
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
        {ticks.filter((tick) => tick === 0).map((tick) => (
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
            onPointerDown={() => { onSelect(index); focusBand(index) }}
            key={`width-${index}`}
            style={{
              backgroundColor: band.color,
              left: `${left}%`,
              width: `${right - left}%`,
            }}
          />
        )
      })}
      {!setup.fill_mode && selected && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[2] border-2 border-dashed border-white outline outline-1 outline-black"
          style={{ left: `${position(selected.stop - selected.width)}%`, width: `${position(selected.stop + selected.width) - position(selected.stop - selected.width)}%` }} />
      )}
      {setup.bands.map((band, index) => {
        if (setup.fill_mode && index === setup.bands.length - 1) return null
        const below = band.stop < preview.minimum
        const above = band.stop > preview.maximum
        const edge = below || above
        return (
          <Fragment key={bandId(band)}>
            {!setup.fill_mode && [-1, 1].map((side) => (
                <button
                  aria-label={`Resize ${side < 0 ? "left" : "right"} edge of band ${index + 1}`}
                  aria-valuemin={0.1}
                  aria-valuenow={band.width}
                  aria-valuetext={`${Number((band.width * 2).toFixed(6))} ${preview.unit} total width`}
                  className={`absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize bg-transparent outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-white after:shadow hover:after:w-1 focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "after:w-1" : ""}`}
                  key={`${bandId(band)}-${side}`}
                  role="slider"
                  style={{ left: `${position(band.stop + side * band.width)}%`, zIndex: selectedBand === index ? 30 : undefined }}
                  type="button"
                  onFocus={() => onSelect(index)}
                  onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
                    const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0
                    if (!direction) return
                    event.preventDefault()
                    onSelect(index)
                    onWidthChange(index, Math.max(0.1, Number((band.width + direction * side * (event.shiftKey ? 1 : 0.1)).toFixed(6))))
                  }}
                  onPointerDown={(event) => {
                    onEditStart?.()
                    onSelect(index)
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={(event) => handleWidthPointerMove(event, index)}
                />
            ))}
            {(!edge || selectedBand === index) && <button
              key={`handle-${bandId(band)}`}
              data-band-center={index}
              type="button"
              className={setup.fill_mode
                  ? `absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "after:w-1" : ""}`
                  : `absolute z-10 size-4 cursor-ew-resize rounded-full border-2 border-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedBand === index ? "ring-2 ring-ring ring-offset-2" : ""}`}
              style={{
                left: `${position(band.stop)}%`,
                zIndex: selectedBand === index ? 40 : undefined,
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
                title={`${band.stop} ${preview.unit}${edge ? " · outside visible range" : " · drag to move"}`}
              onClick={() => onSelect(index)}
              onFocus={() => onSelect(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onPointerDown={(event) => {
                onEditStart?.()
                onSelect(index)
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => handlePointerMove(event, index)}
            >
            </button>}
          </Fragment>
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

export function App() {
  const browserOnly = !window.LUT_BUILDER_TOKEN
  const catalog = window.LUT_BUILDER_CATALOG ?? browserCatalog
  const [{ setup, selection: selectedBand, undo, revision }, dispatch] = useReducer(reduceEditor, window.LUT_BUILDER_SETUP ?? browserSetup, createEditorState)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [validationError, setValidationError] = useState("")
  const [presetRead] = useState(() => Effect.runSync(Effect.result(readSetupPresets(() => window.localStorage))))
  const [status, setStatus] = useState(() => Result.isFailure(presetRead) ? presetRead.failure.message : "")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingSetup, setIsLoadingSetup] = useState(false)
  const loadRequest = useRef(0)
  const workerRef = useRef<AbortController | null>(null)
  const [setupPresets, setSetupPresets] = useState<SetupPreset[]>(() => Result.isSuccess(presetRead) ? presetRead.success : [])
  const [presetName, setPresetName] = useState("")
  const [selectedPreset, setSelectedPreset] = useState("")
  const [stopIncrement, setStopIncrement] = useState<1 | 0.5 | 0.25>(0.25)
  const [graphRange, setGraphRange] = useState(7)
  const [fillPreset, setFillPreset] = useState<FillPreset>("standard")
  const [bandPreset, setBandPreset] = useState<BandPreset>("standard")
  const [removingBandIndex, setRemovingBandIndex] = useState<number | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const colorTriggers = useRef(new Map<number, HTMLButtonElement>())
  const [palettePreview, setPalettePreview] = useState<PalettePreview | null>(null)
  const applyPalette = useCallback((next: Setup) => dispatch({ type: "edit", edit: () => next }), [])
  const mode: Mode = setup.fill_mode ? "fill" : setup.band_mode
  const graphMinimum = setup.band_mode === "ire" ? 0 : -graphRange
  const graphMaximum = setup.band_mode === "ire" ? 100 : graphRange
  const graphPreview = {
    minimum: graphMinimum,
    maximum: graphMaximum,
    unit: setup.band_mode === "ire" ? "IRE" : "stops",
  }
  const movementIncrement = mode === "ire" ? 1 : stopIncrement
  const selectBand = (index: number) => {
    dispatch({ type: "select", selection: index })
    setRemovingBandIndex(null)
  }

  useEffect(() => {
    if (browserOnly) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const next = await postJson("/preview", setup, controller.signal)
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
  }, [setup, browserOnly])

  function patchSetup(changes: Partial<Setup>) {
    dispatch({ type: "patch", changes })
  }

  function editSetup(edit: (current: Setup) => Setup, selection?: number) {
    dispatch({ type: "edit", edit, selection })
  }

  function undoEdit() {
    if (!undo || isGenerating || isLoadingSetup) return
    dispatch({ type: "undo" })
    setRemovingBandIndex(null)
  }

  function addBand() {
    const band = createBand(setup.bands, mode === "ire" ? "ire" : "stops", catalog.palette)
    if (band) {
      dispatch({ type: "add", band })
    }
    else setStatus("No non-overlapping band position is available.")
  }

  async function generate() {
    if (isGenerating || isLoadingSetup) return
    setIsGenerating(true)
    setStatus(`Generating ${setup.cube_size}³ LUT…`)
    const controller = browserOnly ? new AbortController() : null
    if (controller) workerRef.current = controller
    try {
      if (browserOnly) {
        const outcome = await Effect.runPromise(
          Effect.result(generateInWorker(setup, (progress) => {
            setStatus(`Generating ${setup.cube_size}³ LUT… ${Math.round(progress * 100)}%`)
          })),
          { signal: controller!.signal },
        )
        if (Result.isFailure(outcome)) throw outcome.failure
        const url = URL.createObjectURL(new Blob([outcome.success], { type: "text/plain;charset=utf-8" }))
        const link = document.createElement("a")
        link.href = url
        link.download = outputFilename(setup)
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setStatus("LUT downloaded. Calculations stayed on this device.")
        return
      }
      const response = await Effect.runPromise(Effect.tryPromise({
        try: async (signal) => {
          const next = await fetch("/generate", {
            method: "POST",
            signal,
            headers: {
              "Content-Type": "application/json",
              "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN,
            },
            body: JSON.stringify({ version: 1, ...setup, output: outputFilename(setup) }),
          })
          if (!next.ok) {
            const result = Schema.decodeUnknownSync(ErrorResponseSchema)(await next.json())
            throw new Error(result.error || "Generation failed")
          }
          return next
        },
        catch: (cause) => new WorkspaceRequestError({ message: cause instanceof Error ? cause.message : "Generation failed", cause }),
      }))
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
      setStatus(controller?.signal.aborted ? "Generation cancelled." : error instanceof Error ? error.message : "Generation failed")
    } finally {
      if (workerRef.current === controller) workerRef.current = null
      setIsGenerating(false)
    }
  }

  async function importFile(file: File) {
    const request = ++loadRequest.current
    setIsLoadingSetup(true)
    try {
      const text = await Effect.runPromise(Effect.tryPromise({
        try: () => file.text(),
        catch: (cause) => new SetupValidationError({ message: "Could not read this setup file.", cause }),
      }))
      const imported = await importSetup(text, async (candidate) => {
        const validated = await Effect.runPromise(decodeSetup(candidate))
        if (browserOnly) return validated
        const result = await postJson("/preview", validated)
        return result.setup
      })
      if (request !== loadRequest.current) return
      dispatch({ type: "import", setup: imported })
      setPalettePreview(null)
      setStatus(`Imported ${file.name}.`)
    } catch (error) {
      if (request === loadRequest.current) setStatus(error instanceof Error ? error.message : "Import failed")
    } finally {
      if (request === loadRequest.current) setIsLoadingSetup(false)
    }
  }

  function downloadConfig() {
    const link = document.createElement("a")
    link.href = URL.createObjectURL(
      new Blob([exportSetup(setup)], { type: "application/json" }),
    )
    link.download = outputFilename(setup).replace(/\.cube$/i, ".json")
    link.click()
    URL.revokeObjectURL(link.href)
    setStatus("Version-1 configuration exported.")
  }

  function saveCurrentPreset() {
    void Effect.runPromise(saveSetupPreset(() => window.localStorage, setupPresets, presetName, setup)).then((next) => {
      setSetupPresets(next)
      setPresetName("")
      setStatus("Named LUT setup saved in this browser.")
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not save this preset."))
  }

  async function loadPreset() {
    const preset = setupPresets.find((item) => item.name === selectedPreset)
    if (!preset) return
    const request = ++loadRequest.current
    setIsLoadingSetup(true)
    try {
      const validated = await Effect.runPromise(decodeSetup(preset.setup))
      const next = browserOnly ? validated : (await postJson("/preview", validated)).setup
      if (request !== loadRequest.current) return
      dispatch({ type: "import", setup: next })
      setPalettePreview(null)
      setStatus(`Loaded ${preset.name}.`)
    } catch (error) {
      if (request === loadRequest.current) setStatus(error instanceof Error ? error.message : "Could not load this preset.")
    } finally {
      if (request === loadRequest.current) setIsLoadingSetup(false)
    }
  }

  function removePreset() {
    void Effect.runPromise(deleteSetupPreset(() => window.localStorage, setupPresets, selectedPreset)).then((next) => {
      setSetupPresets(next)
      setSelectedPreset("")
      setStatus("Named LUT setup deleted from this browser.")
    }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not update browser storage. Export your setup as JSON to keep a copy."))
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[100rem] flex-col gap-6 p-4 py-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="grid gap-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Exposure workbench</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">LUT Builder</h1>
        <p className="text-muted-foreground">{browserOnly ? "Browser-based diagnostic scene-exposure LUT editor" : "Local diagnostic scene-exposure LUT editor"}</p>
        </div>
        <a className="inline-flex min-h-11 items-center text-sm underline" href="https://github.com/Today20092/lut_builder/issues/new/choose" target="_blank" rel="noreferrer">Report an issue · GitHub</a>
        <nav aria-label="Workbench sections" className="flex w-full items-center justify-between gap-1 text-sm font-medium sm:w-auto sm:gap-4">
          <span className="hidden sm:inline-flex"><KeyboardHelp canUndo={Boolean(undo)} onUndo={undoEdit} /></span>
          <a className="inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline" href="#configuration">01 Configure</a>
          <a className="inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline" href="#exposure-bands">02 Edit bands</a>
          <a className="inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline" href="#export">03 Download</a>
        </nav>
      </header>

      <fieldset disabled={isGenerating || isLoadingSetup} className="@container grid min-w-0 gap-6">
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Load setup · optional</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Saved setup in this browser
              <select className={fieldClass} value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value)}><option value="">Choose a setup</option>{setupPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}</select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" disabled={!selectedPreset} onClick={() => void loadPreset()}>Load setup</Button>
              <Button type="button" variant="ghost" disabled={!selectedPreset} onClick={removePreset}>Delete setup</Button>
              <Button type="button" variant="outline" onClick={() => importInput.current?.click()}>Import setup file</Button>
              <input ref={importInput} className="sr-only" tabIndex={-1} aria-label="Import setup JSON file" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = "" }} />
            </div>
            <p role="status" className="text-sm sm:col-span-2">{isLoadingSetup ? "Loading setup…" : status}</p>
          </div>
        </details>
        <Card id="configuration" className="scroll-mt-6">
          <CardHeader>
            <CardTitle><h2>Configuration</h2></CardTitle>
            <CardDescription>Match your recording and monitor.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Camera recording
              <select className={fieldClass} value={setup.profile} onChange={(e) => patchSetup({ profile: e.target.value })}>
                {catalog.profiles.map((profile) => <option key={profile} value={profile}>{profile} · {browserInterpretations[profile]?.gamut ?? "Profile gamut"}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Target display
              <select className={fieldClass} value={setup.target} onChange={(e) => patchSetup({ target: e.target.value })}>
                {catalog.targets.map((target) => <option key={target}>{target}</option>)}
              </select>
            </label>
            <details className="sm:col-span-2 rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Output settings · {setup.cube_size}³ · {setup.legal_range ? "Legal range" : "Full range"}</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              <span className="flex items-center gap-1.5">Cube size <InfoTooltip text="Higher cube sizes sample the transform more precisely but produce larger LUT files and take longer to generate." /></span>
              <select className={fieldClass} value={setup.cube_size} onChange={(e) => patchSetup({ cube_size: Number(e.target.value) })}>
                {[17, 33, 65].map((size) => <option key={size} value={size}>{size}³</option>)}
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
            <details className="text-sm sm:col-span-2">
              <summary className="cursor-pointer font-medium">Customize output filename</summary>
            <div className="mt-3 grid max-w-2xl gap-2">
              <label className="grid gap-1 font-medium">Output filename template
                <input aria-label="Output filename template" className={fieldClass} value={setup.output} onChange={(e) => patchSetup({ output: e.target.value })} />
              </label>
              <p className="text-xs text-muted-foreground">Use %inputgamma%, %targetgamma%, and %id%, or type a fixed name. The ID changes with your setup.</p>
              <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => patchSetup({ output: defaultFilenameTemplate })}>Use automatic filename</Button>
            </div>
            </details>
              </div>
            </details>
          </CardContent>
        </Card>

        <div className="grid min-w-0 items-start gap-6">
        <div className="grid min-w-0 gap-6">
        <Card id="exposure-bands" className="min-w-0 scroll-mt-6 overflow-visible">
          <ExposurePreview setup={setup} preview={palettePreview} minimum={graphMinimum} maximum={graphMaximum} unit={graphPreview.unit} />
          <CardHeader className="grid gap-4">
            <div>
              <CardTitle className="text-lg font-semibold"><h2>Exposure bands</h2></CardTitle>
              <CardDescription>{setup.fill_mode ? "Drag dividers to resize zones. Double-click a zone to recolor it." : "Drag bands to move them. Edit colors below."}</CardDescription>
            </div>
            <fieldset className="grid grid-cols-3 gap-2" aria-label="Band mode">
              <legend className="sr-only">Band mode</legend>
              {([
                ["stops", "Stops", "Mark exposure", "−3   0   +3"],
                ["ire", "IRE", "Mark brightness", "0   50   100"],
                ["fill", "Fill", "Color every zone", "Low → High"],
              ] as const).map(([value, title, description, scale]) => <label key={value} className={`relative grid min-w-0 cursor-pointer gap-2 rounded-lg border p-2.5 has-focus-visible:ring-2 has-focus-visible:ring-ring ${mode === value ? "border-foreground bg-muted" : "hover:bg-muted/50"}`}>
                <input className="sr-only" type="radio" name="band-mode" value={value} checked={mode === value} onChange={() => editSetup((current) => changeMode(current, value, catalog.palette))} />
                <span aria-hidden="true" className="flex h-8 overflow-hidden rounded border bg-background">
                  {(value === "fill" ? ["#5b21b6", "#2563eb", "#22c55e", "#facc15", "#dc2626"] : ["transparent", "#2563eb", "transparent", "#22c55e", "transparent", "#dc2626", "transparent"]).map((color, index) => <span key={index} className="flex-1" style={{ backgroundColor: color }} />)}
                </span>
                <span aria-hidden="true" className="flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>{scale}</span><span>{mode === value ? "✓" : ""}</span></span>
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </label>)}
            </fieldset>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={addBand}>+ Add band</Button>
              <Button type="button" variant="ghost" disabled={!undo} aria-keyshortcuts="Control+z Meta+z" onClick={undoEdit}>Undo last band edit</Button>
            </div>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Band setup &amp; graph settings</summary>
            <div className="grid min-w-0 gap-5">
              <div className="flex flex-wrap items-end gap-5">
                <div className="grid gap-1">
                <span className="mt-4 text-sm font-semibold">Replace arrangement</span>
                <div className="flex flex-wrap items-end gap-2">
                {!setup.fill_mode && (
                  <>
                    <label className="grid w-48 max-w-full gap-1 text-xs font-medium">Band preset
                      <select className={fieldClass} value={bandPreset} onChange={(event) => setBandPreset(event.target.value as BandPreset)}>
                        <option value="standard">Standard · 7 bands</option>
                        <option value="detailed">Detailed · {mode === "ire" ? "9" : "10"} bands</option>
                      </select>
                    </label>
                    <Button type="button" size="lg" variant="outline" onClick={() => editSetup((current) => applyBandPreset(current, catalog.palette, bandPreset))}>Apply preset</Button>
                  </>
                )}
                {!setup.fill_mode && (
                <label className="grid w-40 max-w-full gap-1 text-xs font-medium">Band width ({mode === "ire" ? "IRE" : "stops"})
                  <BandNumberInput
                    aria-label="All total widths"
                    className={fieldClass}
                    disabled={setup.bands.length === 0}
                    min={0}
                    placeholder="Mixed"
                    step={0.2}
                    value={setup.bands.length && setup.bands.every((band) => band.width === setup.bands[0].width) ? setup.bands[0].width * 2 : ""}
                    onChange={(width) => editSetup((current) => current.bands.reduce((result, _, index) => updateBand(result, index, { width: width / 2 }), current))}
                  />
                </label>
                )}
                {mode === "stops" && (
                  <label className="grid gap-1 text-xs font-medium">Drag step
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
                    <Button type="button" size="lg" variant="outline" onClick={() => editSetup((current) => applyFillPreset(current, catalog.palette, fillPreset))}>Apply preset</Button>
                  </>
                )}
                </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Applying a preset replaces band positions and colors. Undo restores them.</p>
              {setup.band_mode === "stops" && <label className="flex flex-wrap items-center gap-2 text-sm">Visible range · ±
                <select aria-label="Graph range in stops" className={`${fieldClass} !w-32`} value={graphRange} onChange={(event) => setGraphRange(Number(event.target.value))}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>±{value} stops</option>)}</select>
                <span className="text-xs text-muted-foreground">View only</span>
              </label>}
            </div>
            </details>
          </CardHeader>
          <CardContent className="grid gap-4">
            {graphPreview ? (
              <>
                <ExposureGraph
                  setup={setup}
                  preview={graphPreview}
                  increment={movementIncrement}
                  selectedBand={selectedBand}
                  onSelect={selectBand}
                  onRemove={(index) => {
                    editSetup((current) => removeBand(current, index))
                    setRemovingBandIndex(null)
                    setStatus(`Removed band ${index + 1}. Undo last band edit restores it.`)
                  }}
                  onEditColor={(index) => { selectBand(index); colorTriggers.current.get(bandId(setup.bands[index]))?.click() }}
                  onEditStart={() => dispatch({ type: "begin" })}
                  onEditEnd={() => dispatch({ type: "end" })}
                  onChange={(index, stop) => editSetup((current) => setup.fill_mode
                    ? updateFillBoundary(current, index, stop, movementIncrement)
                    : updateBand(current, index, { stop }), index)}
                  onWidthChange={(index, width) => editSetup((current) => updateBand(current, index, { width }), index)}
                />
                <div className="relative overflow-x-auto rounded-lg border">
                  <table className="w-full table-fixed min-w-[42rem] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="w-20 px-3 py-2">Band</th><th className="w-44 px-3 py-2">Color</th><th className="px-3 py-2">{setup.fill_mode ? "Boundary to next color" : mode === "ire" ? "Position (IRE)" : "Position (stops)"}</th><th className="px-3 py-2">{setup.fill_mode ? "Coverage" : `Total width (${mode === "ire" ? "IRE" : "stops"})`}</th><th className="w-32 px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{setup.bands.map((band, index) => (
                      <tr className={`border-t ${selectedBand === index ? "bg-accent/60" : ""}`} key={bandId(band)} onFocus={() => selectBand(index)} onClick={() => selectBand(index)}>
                        <th className="p-3 text-left font-medium" scope="row">{setup.fill_mode ? "Color" : "Band"} {index + 1}{selectedBand === index && <span className="block text-xs">Selected</span>}</th>
                        <td className="p-2"><ColorPicker hideLabel triggerRef={(element) => { if (element) colorTriggers.current.set(bandId(band), element); else colorTriggers.current.delete(bandId(band)) }} label={`Band ${index + 1} color`} value={band.color} onChange={(color) => editSetup((current) => updateBand(current, index, { color }), index)} /></td>
                        <td className="p-2">{setup.fill_mode && index === setup.bands.length - 1
                          ? <span className="text-muted-foreground">—</span>
                          : <BandNumberInput aria-label={setup.fill_mode ? `Boundary after color ${index + 1}` : `Band ${index + 1} ${mode === "ire" ? "IRE" : "stops"}`} className={fieldClass} step={movementIncrement} min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(stop) => editSetup((current) => setup.fill_mode ? updateFillBoundary(current, index, stop, movementIncrement) : updateBand(current, index, { stop }), index)} />}</td>
                        <td className="p-2">{setup.fill_mode
                          ? <span className="text-muted-foreground">{index === setup.bands.length - 1 ? "Fills the rest" : "Until boundary"}</span>
                          : <BandNumberInput aria-label={`Band ${index + 1} total width`} className={fieldClass} min={0} step={0.2} value={band.width * 2} onChange={(width) => editSetup((current) => updateBand(current, index, { width: width / 2 }), index)} />}</td>
                        <td className="p-2"><Button
                          aria-label={removingBandIndex === index ? `Confirm remove band ${index + 1}` : `Remove band ${index + 1}`}
                          type="button"
                          size="sm"
                          variant={removingBandIndex === index ? "destructive" : "ghost"}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (removingBandIndex !== index) return setRemovingBandIndex(index)
                            editSetup((current) => removeBand(current, index))
                            setRemovingBandIndex(null)
                          }}
                        >{removingBandIndex === index ? "Confirm remove" : "Remove"}</Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {setup.bands.length === 0 && <p className="p-4 text-sm text-muted-foreground">No bands yet. Choose Add band to start, or apply a preset above.</p>}
                </div>
                {preview?.warnings.map((warning) => <p className="text-sm text-amber-700 dark:text-amber-300" key={warning}>{warning}</p>)}
              </>
            ) : <p className="text-sm text-muted-foreground">{browserOnly ? "The browser build creates LUTs locally; exposure preview is not included in this release." : "Preparing preview…"}</p>}
            {validationError && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{validationError}</p>}
            <PaletteEditor key={revision} setup={setup} palette={catalog.palette} onApply={applyPalette} onPreview={setPalettePreview} />
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
              <CardTitle>Recorded-signal limit warnings</CardTitle>
              <CardDescription className="max-w-3xl">
                Mark this profile&apos;s recorded RGB code limits. These warnings cannot establish physical sensor clipping.
              </CardDescription>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-sm">How to interpret these warnings</summary>
                <p className="mt-2">Any encoded RGB channel can trigger a warning, including a low channel in a bright, saturated subject. The exported cube includes half a grid step of tolerance. Warnings override exposure bands; high wins if both trigger. A LUT sees processed RGB, not RAW sensor data. Purple/red are editable indicator colors, not proof of noise or sensor clipping.</p>
              </details>
            </CardHeader>
            <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-5">
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.low_signal_warning} onChange={(e) => patchSetup({ low_signal_warning: e.target.checked })} />
                  Low recorded-signal warning
                </label>
                <ColorPicker label="Low-limit indicator color" value={setup.low_signal_hex} disabled={!setup.low_signal_warning} onChange={(low_signal_hex) => patchSetup({ low_signal_hex })} />
              </div>
              <div className="grid gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.high_signal_warning} onChange={(e) => patchSetup({ high_signal_warning: e.target.checked })} />
                  High recorded-signal warning
                </label>
                <ColorPicker label="High-limit indicator color" value={setup.high_signal_hex} disabled={!setup.high_signal_warning} onChange={(high_signal_hex) => patchSetup({ high_signal_hex })} />
              </div>
            </CardContent>
        </Card>

        </div>
        <ReferencePreview setup={palettePreview?.valid ? palettePreview.setup : setup} draft={Boolean(palettePreview?.valid)} />
        <details className="min-w-0 rounded-lg border p-4"><summary className="cursor-pointer font-medium">Use original camera media · image or video</summary><div className="mt-4"><WorkbenchPreview preview={preview} setup={setup} catalog={catalog} browserOnly={browserOnly} /></div></details>
        <Card>
          <CardHeader>
            <CardTitle>Save setup · optional</CardTitle>
            <CardDescription>Keep your settings for next time.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">Preset name
              <input className={fieldClass} value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} />
            </label>
            <Button type="button" variant="outline" onClick={saveCurrentPreset}>Save current setup</Button>
            <Button type="button" variant="outline" onClick={downloadConfig}>Export setup file</Button>
            <p role="status" className="text-sm sm:col-span-2">{status}</p>
          </CardContent>
        </Card>
        <aside className="grid min-w-0 gap-6" aria-label="LUT output">
        <Card id="export" className="scroll-mt-6">
          <CardHeader>
            <CardTitle><h2>Generate LUT</h2></CardTitle>
            <CardDescription>Build the final {setup.profile} to {setup.target} transformation.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output · {setup.cube_size}³ .cube</span>
            <output className="break-all font-mono text-sm" aria-label="Output filename preview">{outputFilename(setup)}</output>
            <p className="text-sm">{setup.legal_range ? "Legal/video range" : "Full range"} · {setup.band_mode === "stops" ? "Exposure stops" : "IRE"} · {setup.fill_mode ? "Fill zones" : setup.monochrome ? "Bands on monochrome" : "Bands on color"}</p>
            <ul aria-label="Output band colors and boundaries" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{setup.bands.map((band, index) => <li key={index} className="grid gap-1 rounded border p-2 text-xs"><span className="h-6 rounded" style={{ backgroundColor: band.color }} /><span>{setup.fill_mode ? `${index === 0 ? '−∞' : setup.bands[index - 1].stop} to ${index === setup.bands.length - 1 ? '+∞' : band.stop}` : `${Number((band.stop - band.width).toFixed(3))} to ${Number((band.stop + band.width).toFixed(3))}`} {setup.band_mode === "stops" ? "stops" : "IRE"}</span><span className="font-mono">{band.color}</span></li>)}</ul>
            {[[setup.low_signal_warning, "Low recorded signal", setup.low_signal_hex], [setup.high_signal_warning, "High recorded signal", setup.high_signal_hex]].map(([enabled, label, color]) => enabled && <p key={String(label)} className="flex items-center gap-2 text-xs"><span className="size-5 rounded border" style={{ backgroundColor: String(color) }} />{label} · {color}</p>)}
            {palettePreview && <p className="text-xs text-muted-foreground" role="status">Your palette preview is not applied. This download uses the current band colors. <a href="#exposure-bands" className="underline">Return to palette preview</a>.</p>}
            {browserOnly && <p className="text-xs text-muted-foreground">Generated on this device. Export JSON to back up your setup; browser storage does not sync and may be cleared.</p>}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Button size="lg" className="w-full" disabled={isGenerating || Boolean(validationError)} onClick={generate}>
              {isGenerating && <Spinner data-icon="inline-start" />}
              {isGenerating ? "Generating…" : "Generate LUT"}
            </Button>
            <p className="min-h-5 w-full text-sm text-muted-foreground" role="status" aria-live="polite">{status}</p>
          </CardFooter>
        </Card>

        </aside>
        </div>
      </fieldset>
      {browserOnly && isGenerating && <Button type="button" variant="outline" onClick={() => workerRef.current?.abort()}>Cancel generation</Button>}
    </main>
  )
}

export default App
