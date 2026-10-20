import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { ImagePlus, VideoIcon, ImageIcon, X, Check, ChevronLeft, ChevronRight, Expand, Minimize, Plus, Download, RefreshCw, History, FolderOpen, Upload, RotateCcw, Trash2, SlidersHorizontal, TriangleAlert, Undo2, Save } from "lucide-react"
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
import { Effect, Result } from "effect"

import { Button } from "@/components/ui/button"
import { PaletteEditor, type PalettePreview } from "./PaletteEditor"
import { BandStrip, ExposurePreview } from "./ExposurePreview"
import { ReferencePreview } from "./ReferencePreview"
import { KeyboardHelp } from "./KeyboardHelp"
import { isTypingTarget } from "./keyboard"
import { tailwindPalette } from "./tailwindPalette"
import { BandNumberInput } from "./BandNumberInput"
import { overlayForExposure } from "./demonstration"
import { usePreviewMedia } from "./previewMedia"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ContextHelp } from "./ContextHelp"
import referenceImage from "@/assets/lut-preview-reference.jpg"
import { CameraVerification, type SourceInterpretations } from "@/CameraVerification"
import { BrowserVerification } from "./BrowserVerification"
import { browserInterpretations, browserProfiles, browserTargets } from "@/lutEngine"
import { defaultFilenameTemplate, outputFilename } from "./outputFilename"
import { deleteSetupPreset, readSetupPresets, saveSetupPreset, readWorkspaceSession, writeWorkspaceSession, workspaceSessionBackup, setupPresetsBackup, type SetupPreset } from "@/setupPresets"
import { WorkspaceShell, WorkspacePanel } from "./WorkspaceShell"
import { WorkspaceActionText, WorkspaceDisclosure, WorkspaceTask } from "./WorkspaceTask"
import { ImportedLookSettings } from "./ImportedLookSettings"
import { ImportedLookPreview } from "./ImportedLookPreview"
import { MobileExposurePresets } from "./MobileExposurePresets"
import { useMobileWorkspace } from "./workspaceNavigation"
import { createWorkspaceRuntime, type Preview } from "./workspaceRuntime"
import { createSetupReplacement, createSetupWorkspace, reduceSetupWorkspace } from "./setupReplacement"
import {
  applyBandPreset,
  applyFillPreset,
  applyExposurePreset,
  bandId,
  changeMode,
  contrastTextColor,
  createBand,
  exportSetup,
  exposureReferenceValue,
  filterPalette,
  hexToHsv,
  hsvToHex,
  isHexColor,
  resizeBandWidth,
  removeBand,
  snapBandValue,
  stepBandValue,
  updateBand,
  updateFillBoundary,
  type FillPreset,
  type BandPreset,
  type ExposurePreset,
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

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function LutImagePreview({ preview, camera }: { preview: Preview | null; camera?: { setup: Setup; interpretations: SourceInterpretations } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const [comparison, setComparison] = useState("Split view")
  const [expanded, setExpanded] = useState(false)
  const [opacity, setOpacity] = useState(100)
  const videoInput = useRef<HTMLInputElement>(null)
  const {
    imageUrl, imageName, imageError, video, videoBusy, videoTime, frameRevision,
    chooseVideo, selectVideoFrame, chooseImage, reference, setVideoTime, displayError,
  } = usePreviewMedia(referenceImage)

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
    image.onerror = () => displayError("This image could not be displayed. Choose another still image.")
    image.src = imageUrl
    return () => { image.onload = null; image.onerror = null }
  }, [imageUrl, comparison, opacity, preview, expanded, displayError])

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
      {!camera && <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><ImagePlus data-icon="inline-start" aria-hidden="true" />Choose image</Button>}
      <Button type="button" variant="outline" onClick={() => videoInput.current?.click()}><VideoIcon data-icon="inline-start" aria-hidden="true" />Choose video</Button>
      {!camera && imageUrl !== referenceImage && <Button type="button" variant="ghost" onClick={() => reference()}><ImageIcon data-icon="inline-start" aria-hidden="true" />Reference photo</Button>}
      <input ref={inputRef} className="sr-only" tabIndex={-1} aria-label="Choose demonstration still image" type="file" accept="image/*" onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void chooseImage(file)
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
    {videoBusy && <div className="flex flex-wrap items-center gap-2"><p role="status" className="text-sm">{videoBusy}</p><Button type="button" variant="outline" onClick={() => reference("Video cancelled and temporary data released.")}><X data-icon="inline-start" aria-hidden="true" />Cancel video</Button></div>}
    {video && <div className="grid gap-3 rounded-md border p-3">
      <label className="grid gap-2 text-sm">Requested relative time in seconds
        <Input type="number" min="0" step="any" className={fieldClass} value={videoTime} onChange={(event) => setVideoTime(event.target.value)} disabled={!!videoBusy} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!!videoBusy || !videoTime.trim()} onClick={() => void selectVideoFrame({ time: videoTime })}><Check data-icon="inline-start" aria-hidden="true" />Select frame</Button>
        <Button type="button" variant="outline" disabled={!!videoBusy || video.frame.index === 0} onClick={() => void selectVideoFrame({ index: video.frame.index - 1 })}><ChevronLeft data-icon="inline-start" aria-hidden="true" />Previous frame</Button>
        <Button type="button" variant="outline" disabled={!!videoBusy || video.frame.index + 1 === video.frame.count} onClick={() => void selectVideoFrame({ index: video.frame.index + 1 })}><ChevronRight data-icon="inline-start" aria-hidden="true" />Next frame</Button>
        <Button type="button" variant="ghost" onClick={() => reference()}><X data-icon="inline-start" aria-hidden="true" />Release video</Button>
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
          ><Expand data-icon="inline-start" aria-hidden="true" />
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
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}><Minimize data-icon="inline-start" aria-hidden="true" />Close preview</Button>
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

const fieldClass = "w-full min-w-0"

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
    <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
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
        <div className={`flex min-w-0 items-center ${hideLabel ? "gap-1 sm:gap-2" : "gap-2"}`}>
        <Popover.Trigger
          ref={triggerRef}
          aria-label={`Open ${label} picker`}
          className={`flex ${hideLabel ? "size-7 sm:size-9" : "size-9"} shrink-0 items-center justify-center rounded-md border border-input outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={disabled}
        >
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded border border-black/10"
            style={{ backgroundColor: isHexColor(value) ? value : "#000000" }}
          />
        </Popover.Trigger>
        <Input aria-label={`${label} hex value`} title="Copy or paste a six-digit hex color, such as #2563eb" className={`${fieldClass} ${hideLabel ? "!px-1 sm:!px-2" : "!px-2"} min-w-0 font-mono text-xs`} value={hexValue} spellCheck={false} aria-invalid={!isHexColor(hexValue)}
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
              <Input
                aria-label={`${label} hex color`}
                aria-invalid={!isHexColor(value)}
                className={fieldClass}
                value={value}
                placeholder="#rrggbb"
                onChange={(event) => { const next = event.target.value; if (isHexColor(next)) setHue(hexToHsv(next).hue); onChange(next) }}
              />
              </div>
                {showPresets && <div className="grid min-w-0 gap-3">
                <Input aria-label={`Search ${label} palette`} className={fieldClass} value={search} placeholder="Search red-500 or #ef44" onChange={(event) => setSearch(event.target.value)} />
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
  onFocusSelect = onSelect,
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
  onFocusSelect?: (index: number) => void
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
      className="relative isolate flex h-28 touch-none overflow-hidden rounded-lg border bg-no-repeat bg-clip-padding"
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
          onFocus={() => onFocusSelect(index)}
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
                  onFocus={() => onFocusSelect(index)}
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
              onFocus={() => onFocusSelect(index)}
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
  return <ContextHelp label="About cube size">{text}</ContextHelp>
}

export function App() {
  const mobileWorkspace = useMobileWorkspace()
  const [runtime] = useState(() => createWorkspaceRuntime(window.LUT_BUILDER_TOKEN))
  const { browserOnly } = runtime
  const catalog = window.LUT_BUILDER_CATALOG ?? browserCatalog
  const [{ setup, selection: selectedBand, undo, revision, previousSetup, isLoadingSetup, loadStatus, palettePreview, bandStatus }, dispatch] = useReducer(
    reduceSetupWorkspace, undefined, () => createSetupWorkspace(window.LUT_BUILDER_SETUP ?? browserSetup),
  )
  const [setupReplacement] = useState(() => createSetupReplacement(runtime.normalize, dispatch))
  const setupLoads = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setupLoads.current = controller
    return () => controller.abort()
  }, [])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [validationError, setValidationError] = useState("")
  const [status, setStatus] = useState("")
  const [saveStatus, setSaveStatus] = useState("")
  const setLoadStatus = (value: string) => dispatch({ type: "load-status", value })
  const setBandStatus = (value: string) => dispatch({ type: "band-status", value })
  const [deletingPreset, setDeletingPreset] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const workerRef = useRef<AbortController | null>(null)
  const [setupPresets, setSetupPresets] = useState<SetupPreset[]>([])
  const [presetsBlocked, setPresetsBlocked] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionBlocked, setSessionBlocked] = useState(false)
  const [sessionStatus, setSessionStatus] = useState("")
  const [sessionRetry, setSessionRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void Effect.runPromise(Effect.all({
      presets: Effect.result(readSetupPresets(() => window.localStorage)),
      session: Effect.result(readWorkspaceSession(() => window.localStorage)),
    }), { signal: controller.signal }).then(({ presets, session }) => {
      if (controller.signal.aborted) return
      if (Result.isSuccess(presets)) { setSetupPresets(presets.success); setPresetsBlocked(false) }
      else dispatch({ type: "load-status", value: presets.failure.message })
      if (Result.isFailure(session)) {
        setSessionBlocked(true)
        setSessionStatus(session.failure.message)
      } else if (session.success) {
        dispatch({ type: "load-start", request: -1 })
        dispatch({ type: "load-commit", request: -1, setup: session.success, message: "Last session restored. Reselect any camera media to verify; media files are not stored." })
        setSessionStatus("Last session restored on this device.")
      }
      setSessionReady(true)
    }).catch(() => { /* An aborted mount must not replace the next mount's state. */ })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!sessionReady || sessionBlocked || isLoadingSetup) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void Effect.runPromise(Effect.result(writeWorkspaceSession(() => window.localStorage, setup)), { signal: controller.signal }).then((result) => {
        if (controller.signal.aborted) return
        setSessionStatus(Result.isFailure(result) ? result.failure.message : "Session saved on this device. Media must be reselected after reopening.")
      }).catch(() => undefined)
    }, 500)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [setup, sessionReady, sessionBlocked, isLoadingSetup, sessionRetry])
  const [presetName, setPresetName] = useState("")
  const [selectedPreset, setSelectedPreset] = useState("")
  const replacingPreset = setupPresets.some((preset) => preset.name.toLocaleLowerCase() === presetName.trim().toLocaleLowerCase())
  const [stopIncrement, setStopIncrement] = useState<1 | 0.5 | 0.25>(0.25)
  const [graphRange, setGraphRange] = useState(7)
  const [fillPreset, setFillPreset] = useState<FillPreset>("standard")
  const [bandPreset, setBandPreset] = useState<BandPreset>("standard")
  const [paletteRevision, setPaletteRevision] = useState(0)
  const [exposurePreset, setExposurePreset] = useState<ExposurePreset>("contrast-checker")
  const [removingBandIndex, setRemovingBandIndex] = useState<number | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const colorTriggers = useRef(new Map<number, HTMLButtonElement>())
  const setPalettePreview = useCallback((value: PalettePreview | null) => dispatch({ type: "palette-preview", value }), [])
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
    if (index !== selectedBand) setRemovingBandIndex(null)
  }

  useEffect(() => {
    if (!runtime.capabilities.remotePreview) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const next = await Effect.runPromise(runtime.preview(setup), { signal: controller.signal })
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
  }, [setup, runtime])

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
    setBandStatus("Last band edit restored.")
  }

  function addBand() {
    const band = createBand(setup.bands, mode === "ire" ? "ire" : "stops", catalog.palette)
    if (band) {
      dispatch({ type: "add", band })
      setBandStatus("")
    }
    else setBandStatus("No non-overlapping band position is available.")
  }

  async function generate() {
    if (isGenerating || isLoadingSetup) return
    setIsGenerating(true)
    setStatus(`Generating ${setup.cube_size}³ LUT…`)
    const controller = runtime.capabilities.cancellableGeneration ? new AbortController() : null
    if (controller) workerRef.current = controller
    try {
      const outcome = await Effect.runPromise(Effect.result(runtime.generate(setup, outputFilename(setup), (progress) => {
        setStatus(`Generating ${setup.cube_size}³ LUT… ${Math.round(progress * 100)}%`)
      })), { signal: controller?.signal })
      if (Result.isFailure(outcome)) throw outcome.failure
      const artifact = outcome.success
      const link = document.createElement("a")
      const url = URL.createObjectURL(artifact.blob)
      link.href = url
      link.download = artifact.filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setStatus(browserOnly ? "LUT downloaded. Calculations stayed on this device." : "LUT downloaded.")
    } catch (error) {
      setStatus(controller?.signal.aborted ? "Generation cancelled." : error instanceof Error ? error.message : "Generation failed")
    } finally {
      if (workerRef.current === controller) workerRef.current = null
      setIsGenerating(false)
    }
  }

  async function importFile(file: File) {
    await Effect.runPromise(setupReplacement.file(file), { signal: setupLoads.current?.signal }).catch(() => undefined)
  }

  function downloadConfig() {
    const link = document.createElement("a")
    link.href = URL.createObjectURL(
      new Blob([exportSetup(setup)], { type: "application/json" }),
    )
    link.download = outputFilename(setup).replace(/\.cube$/i, ".json")
    link.click()
    URL.revokeObjectURL(link.href)
    setSaveStatus("Setup file exported.")
  }

  function saveCurrentPreset() {
    if (presetsBlocked) return
    void Effect.runPromise(saveSetupPreset(() => window.localStorage, setupPresets, presetName, setup)).then((next) => {
      setSetupPresets(next)
      setPresetName("")
      setSaveStatus("Named LUT setup saved in this browser.")
    }).catch((error: unknown) => setSaveStatus(error instanceof Error ? error.message : "Could not save this preset."))
  }

  function applySelectedExposurePreset(preset: ExposurePreset, arrangement?: BandPreset) {
    setExposurePreset(preset)
    setPalettePreview(null)
    setPaletteRevision((value) => value + 1)
    setRemovingBandIndex(null)
    editSetup((current) => applyExposurePreset(current, catalog.palette, preset, arrangement), 0)
    setBandStatus("")
    toast.add({ title: "Preset applied", description: "Edit or undo in Bands.", type: "success" })
  }

  async function loadPreset() {
    const preset = setupPresets.find((item) => item.name === selectedPreset)
    if (!preset) return
    await Effect.runPromise(setupReplacement.preset(preset), { signal: setupLoads.current?.signal }).catch(() => undefined)
  }

  function removePreset() {
    if (presetsBlocked) return
    void Effect.runPromise(deleteSetupPreset(() => window.localStorage, setupPresets, selectedPreset)).then((next) => {
      setSetupPresets(next)
      setSelectedPreset("")
      setDeletingPreset(false)
      setLoadStatus("Named LUT setup deleted from this browser.")
    }).catch((error: unknown) => setLoadStatus(error instanceof Error ? error.message : "Could not update browser storage. Export your setup as JSON to keep a copy."))
  }

  function downloadSessionBackup() {
    void Effect.runPromise(workspaceSessionBackup(() => window.localStorage)).then((raw) => {
      if (raw === null) return setSessionStatus("No saved session backup is available. Export your current setup instead.")
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "lut-builder-session-backup.json"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }).catch((error: unknown) => setSessionStatus(error instanceof Error ? error.message : "Could not read the saved session."))
  }

  function downloadPresetsBackup() {
    void Effect.runPromise(setupPresetsBackup(() => window.localStorage)).then(raw => {
      if (raw === null) return setLoadStatus("No saved library backup is available.")
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url
      link.download = "lut-builder-saved-library-backup.json"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }).catch((error: unknown) => setLoadStatus(error instanceof Error ? error.message : "Could not download the saved library."))
  }

  function replaceDamagedLibrary() {
    void Effect.runPromise(deleteSetupPreset(() => window.localStorage, [], "")).then(() => {
      setSetupPresets([])
      setSelectedPreset("")
      setPresetsBlocked(false)
      setLoadStatus("Saved library replaced. Import individual setups from your backup to recover them.")
    }).catch((error: unknown) => setLoadStatus(error instanceof Error ? error.message : "Could not replace the saved library."))
  }

  const bandActions = <>
    <Button type="button" variant="outline" disabled={isGenerating || isLoadingSetup || !sessionReady} onClick={addBand}><Plus data-icon="inline-start" aria-hidden="true" />Add band</Button>
    <Button type="button" variant="ghost" aria-label="Undo last band edit" disabled={!undo || isGenerating || isLoadingSetup || !sessionReady} onClick={undoEdit}><Undo2 data-icon="inline-start" aria-hidden="true" /><WorkspaceActionText desktop="Undo last band edit" mobile="Undo" /></Button>
  </>
  return (
    <WorkspaceShell setup={setup} busy={isGenerating || isLoadingSetup || !sessionReady}
      illustration={(openBands) => <details id="photo-result" className="workspace-photo"><summary>Photo illustration · optional</summary><ReferencePreview setup={palettePreview?.valid ? palettePreview.setup : setup} draft={Boolean(palettePreview?.valid)} /><a href="#exposure-bands" className="inline-flex min-h-11 items-center text-sm underline" onClick={openBands}>Back to band editing</a></details>}
      shortcuts={<KeyboardHelp canUndo={Boolean(undo)} onUndo={undoEdit} />}
      stage={(openBands) => <>
        <ExposurePreview setup={setup} preview={palettePreview} minimum={graphMinimum} maximum={graphMaximum} unit={graphPreview.unit} />
        <fieldset disabled={isGenerating || isLoadingSetup || !sessionReady} className="workspace-graph">
          <ExposureGraph setup={setup} preview={graphPreview} increment={movementIncrement} selectedBand={selectedBand}
            onSelect={(index) => { selectBand(index); openBands() }}
            onFocusSelect={selectBand}
            onRemove={(index) => { editSetup((current) => removeBand(current, index)); setRemovingBandIndex(null); setBandStatus(`Removed band ${index + 1}. Undo last band edit restores it.`) }}
            onEditColor={(index) => { selectBand(index); openBands(); requestAnimationFrame(() => colorTriggers.current.get(bandId(setup.bands[index]))?.click()) }}
            onEditStart={() => dispatch({ type: "begin" })} onEditEnd={() => dispatch({ type: "end" })}
            onChange={(index, stop) => editSetup((current) => setup.fill_mode ? updateFillBoundary(current, index, stop, movementIncrement) : updateBand(current, index, { stop }), index)}
            onWidthChange={(index, width) => editSetup((current) => updateBand(current, index, { width }), index)} />
        </fieldset>
        <div className="workspace-band-toolbar"><div className="workspace-band-picker" aria-label="Select exposure band">
          {setup.bands.map((band, index) => <Button key={bandId(band)} type="button" variant={selectedBand === index ? "secondary" : "ghost"} aria-pressed={selectedBand === index} aria-label={`Select band ${index + 1}`} disabled={isGenerating || isLoadingSetup || !sessionReady} onClick={() => { selectBand(index); openBands() }}><span className="workspace-swatch" style={{ backgroundColor: band.color }} aria-hidden="true" />{index + 1}</Button>)}
        </div><div className="workspace-mobile-band-actions">{bandActions}</div></div>
        <ImportedLookPreview setup={setup} />
        <p className="workspace-stage-hint">Select a band to edit its color and exposure range.</p>
      </>}
      feedback={<>
        {sessionReady && presetsBlocked && loadStatus && <p role="alert" className="p-3 text-sm">{loadStatus}</p>}
        {(sessionBlocked || sessionStatus.startsWith("Could not")) && <p className="workspace-session-error" role="status">{sessionStatus}</p>}
        {sessionBlocked && <div className="grid gap-2 p-3"><Button type="button" variant="outline" onClick={downloadSessionBackup}><Download data-icon="inline-start" aria-hidden="true" />Download saved session backup</Button><Button type="button" variant="outline" onClick={() => { setSessionBlocked(false); setSessionRetry((value) => value + 1) }}><RefreshCw data-icon="inline-start" aria-hidden="true" />Replace saved session with current setup</Button></div>}
        {!sessionBlocked && sessionStatus.startsWith("Could not") && <Button type="button" variant="outline" onClick={() => setSessionRetry((value) => value + 1)}><RefreshCw data-icon="inline-start" aria-hidden="true" />Retry session save</Button>}
      </>}>
        <WorkspacePanel value="files">
        <p className="workspace-session-status" role="status">{!sessionBlocked && !sessionStatus.startsWith("Could not") ? sessionStatus || (!sessionReady ? "Restoring workspace…" : "") : ""}</p>
        <div className={loadStatus || isLoadingSetup || previousSetup ? "workspace-feedback" : "hidden"} aria-label="Setup loading feedback">
          <p role="status" className="text-sm">{isLoadingSetup ? "Loading setup…" : loadStatus}</p>
          {previousSetup && <Button type="button" variant="outline" onClick={setupReplacement.restore}><History data-icon="inline-start" aria-hidden="true" />Restore previous setup</Button>}
        </div>
        <WorkspaceDisclosure className="rounded-lg border p-4" title="Load setup · optional">
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Saved setup in this browser
                <NativeSelect className={fieldClass} value={selectedPreset} onChange={(event) => { setSelectedPreset(event.target.value); setDeletingPreset(false) }}><option value="">Choose a setup</option>{setupPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}</NativeSelect>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" disabled={!selectedPreset} onClick={() => void loadPreset()}><FolderOpen data-icon="inline-start" aria-hidden="true" />Load setup</Button>
                <Button type="button" variant={deletingPreset ? "destructive" : "ghost"} disabled={!selectedPreset} onClick={() => deletingPreset ? removePreset() : setDeletingPreset(true)}><Trash2 data-icon="inline-start" aria-hidden="true" />{deletingPreset ? "Confirm delete setup" : "Delete setup"}</Button>
                {deletingPreset && <Button type="button" variant="outline" onClick={() => setDeletingPreset(false)}><X data-icon="inline-start" aria-hidden="true" />Keep setup</Button>}
              <Button type="button" variant="outline" onClick={() => importInput.current?.click()}><Upload data-icon="inline-start" aria-hidden="true" />Import setup file</Button>
              <input ref={importInput} className="sr-only" tabIndex={-1} aria-label="Import setup JSON file" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = "" }} />
            </div>
              {deletingPreset && <p className="text-sm sm:col-span-2">Delete “{selectedPreset}” from this browser? This cannot be undone. Your current editing setup will stay open.</p>}
          </div>
        </WorkspaceDisclosure>
        </WorkspacePanel>
        <WorkspacePanel value="configuration">
        <Card id="configuration" className="scroll-mt-6">
          <CardHeader>
            <CardTitle><h2>Configuration</h2></CardTitle>
            <CardDescription>Match your recording and monitor. <a className="underline" href={`${import.meta.env.BASE_URL}docs/controls/#configuration`} target="_blank" rel="noreferrer">Profile, range, and output help (new tab)</a></CardDescription>
          </CardHeader>
          <CardContent><FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="camera-recording">Camera recording</FieldLabel>
              <NativeSelect id="camera-recording" className={fieldClass} value={setup.profile} disabled={Boolean(setup.imported_lut)} onChange={(e) => patchSetup({ profile: e.target.value })}>
                {catalog.profiles.map((profile) => <option key={profile} value={profile}>{profile} · {browserInterpretations[profile]?.gamut ?? "Profile gamut"}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="target-display">Target display</FieldLabel>
              <NativeSelect id="target-display" className={fieldClass} value={setup.target} disabled={Boolean(setup.imported_lut)} onChange={(e) => patchSetup({ target: e.target.value })}>
                {catalog.targets.map((target) => <option key={target}>{target}</option>)}
              </NativeSelect>
            </Field>
            <WorkspaceDisclosure className="sm:col-span-2 rounded-lg border p-3 text-sm" title={<>Output settings · {setup.cube_size}³ · {setup.legal_range ? "Legal range" : "Full range"}</>}>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field>
              <div className="flex items-center gap-1.5"><FieldLabel htmlFor="cube-size">Cube size</FieldLabel><InfoTooltip text="Higher cube sizes sample the transform more precisely but produce larger LUT files and take longer to generate." /></div>
              <NativeSelect id="cube-size" className={fieldClass} value={setup.cube_size} onChange={(e) => patchSetup({ cube_size: Number(e.target.value) })}>
                {[17, 33, 65].map((size) => <option key={size} value={size}>{size}³</option>)}
              </NativeSelect>
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={setup.monochrome} disabled={setup.fill_mode || Boolean(setup.imported_lut)} onChange={(e) => patchSetup({ monochrome: e.target.checked })} />
              Monochrome base
            </label>
            <fieldset className="grid gap-3 sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">LUT output range</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([false, true] as const).map((legal) => <label key={String(legal)} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-focus-visible:ring-2 has-focus-visible:ring-ring ${setup.legal_range === legal ? "border-foreground bg-muted" : ""}`}>
                  <input aria-label={legal ? "Video / Legal" : "Full / Data"} className="mt-1" type="radio" name="output-range" disabled={Boolean(setup.imported_lut)} checked={setup.legal_range === legal} onChange={() => patchSetup({ legal_range: legal })} />
                  <span className="grid gap-1"><span className="text-sm font-medium">{legal ? "Video / Legal" : "Full / Data"}</span><span className="text-xs text-muted-foreground">{legal ? "Packs output into 64–940 (10-bit). Use only when your LUT destination requires it." : "Uses the full 0–1 output range. Tool default; keep unless your LUT destination requires video levels."}</span></span>
                </label>)}
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">Which should I use?</summary>
                <div className="mt-3 grid max-w-prose gap-2">
                  <p>Match the monitor or device applying this LUT. Your camera model alone cannot determine this setting.</p>
                  <p>Camera HDMI range and monitor input range must also agree. Those settings are separate from LUT output range. If your device already converts levels, extra conversion inside the LUT can give incorrect black and white levels.</p>
                  <p>Check the device’s LUT instructions. For example, <a className="underline" href="https://guide.smallhd.com/a/1753041-look-3d-lut" target="_blank" rel="noreferrer">SmallHD has LUT data-range settings</a>, while <a className="underline" href="https://support.atomos.com/hc/en-us/articles/10342509794959-Input-Menu" target="_blank" rel="noreferrer">Atomos Legalize is an input conversion</a> with workflow-specific instructions. They are not interchangeable with this switch.</p>
                  <p>Validate a known grayscale ramp and gray patch through your actual camera and monitor setup. This switch changes output levels; it does not correct a mismatched incoming signal.</p>
                </div>
              </details>
            </fieldset>
            <WorkspaceDisclosure className="text-sm sm:col-span-2" title="Customize output filename">
            <div className="mt-3 grid max-w-2xl gap-2">
              <label className="grid gap-1 font-medium">Output filename template
                <Input aria-label="Output filename template" className={fieldClass} value={setup.output} onChange={(e) => patchSetup({ output: e.target.value })} />
              </label>
              <p className="text-xs text-muted-foreground">Use %inputgamma%, %targetgamma%, and %id%, or type a fixed name. The ID changes with your setup.</p>
              <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => patchSetup({ output: defaultFilenameTemplate })}><RotateCcw data-icon="inline-start" aria-hidden="true" />Use automatic filename</Button>
            </div>
            </WorkspaceDisclosure>
              </div>
            </WorkspaceDisclosure>
          </FieldGroup></CardContent>
        </Card>
        <div className="workspace-import-settings"><WorkspaceTask id="import" title="Imported creative LUT" icon={Upload} desktopInline>
          {setup.imported_lut && <p className="mb-3 text-xs text-muted-foreground">Input, display encoding, output range and color base belong to the confirmed look. Replace the imported file and confirm its interpretation to change them, or remove the look to use standard settings.</p>}
          <ImportedLookSettings setup={setup} onChange={patchSetup} />
        </WorkspaceTask></div>

        </WorkspacePanel>
        <WorkspacePanel value="presets">
          <div className="workspace-preset-panel">
            <h2 className="workspace-desktop-heading font-semibold">Exposure presets</h2>
            {mobileWorkspace ? <MobileExposurePresets setup={setup} palette={catalog.palette} onApply={applySelectedExposurePreset} /> : <section className="grid gap-2" aria-label="Exposure presets">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <label className="grid min-w-0 gap-1.5 text-sm font-medium">Start with a preset
                  <NativeSelect className={fieldClass} value={exposurePreset} onChange={(event) => setExposurePreset(event.target.value as ExposurePreset)}>
                    <option value="contrast-checker">Contrast Checker · 5 fill zones</option>
                    <option value="three-band">Three-band Exposure · Stops</option>
                    <option value="camera-ire">Camera-log IRE · 7 bands</option>
                  </NativeSelect>
                </label>
                <Button type="button" variant="outline" onClick={() => applySelectedExposurePreset(exposurePreset)}><Check data-icon="inline-start" aria-hidden="true" />Use preset</Button>
              </div>
              <WorkspaceDisclosure className="text-xs text-muted-foreground" title="Details">
                <div className="grid gap-2 pb-2">
              <p>{exposurePreset === "contrast-checker"
                ? "Dark green → light green → gray → light pink → bright pink. Boundaries: −1.5, −0.5, +0.5, +1.5 stops from 18% gray. Compare face and scene contrast; colors do not establish a universal safe skin exposure."
                : exposurePreset === "three-band" ? "Blue at −2, green at 0, orange at +2 stops. Each band is 0.6 stops wide on monochrome."
                  : `Seven standard false-color bands on monochrome, anchored to ${setup.profile} camera-log levels.`}</p>
              <p>Presets replace mode, positions, widths, and colors. Camera, output, and warning settings are preserved. Undo restores your bands.</p>
              <p>{setup.fill_mode ? "Drag dividers to resize zones. Edit colors in the table." : "Drag bands to move them, or edit values in the table."}</p>
              <p>Stops measure scene exposure; IRE measures camera-log levels; Fill colors every zone. <a className="underline" href={`${import.meta.env.BASE_URL}docs/controls/#exposure-bands`} target="_blank" rel="noreferrer">Bands and palette guide (new tab)</a></p>
                </div>
              </WorkspaceDisclosure>
            </section>}
          </div>
        </WorkspacePanel>
        <WorkspacePanel value="bands">
        <Card id="exposure-bands" className="min-w-0 scroll-mt-6 overflow-visible">
          <CardHeader className="grid gap-4">
            <div className="workspace-band-title">
              <CardTitle className="text-lg font-semibold"><h2>Exposure bands</h2></CardTitle>
            </div>
            <div className="workspace-band-actions flex items-center justify-between gap-2">
              {bandActions}
            </div>
            <WorkspaceTask id="band-settings" title="Band setup & graph settings" icon={SlidersHorizontal} lead={<>
            <fieldset className="grid grid-cols-3 gap-2" aria-label="Band mode">
              <legend className="sr-only">Band mode</legend>
              {([
                ["stops", "Stops", "Mark exposure", "−7   0   +7"],
                ["ire", "IRE", "Camera log level", "0   50   100"],
                ["fill", "Fill", "Color every zone", "Low → High"],
              ] as const).map(([value, title, description, scale]) => <label key={value} className={`relative grid min-w-0 cursor-pointer gap-2 rounded-lg border p-2.5 has-focus-visible:ring-2 has-focus-visible:ring-ring ${mode === value ? "border-foreground bg-muted" : "hover:bg-muted/50"}`}>
                <input className="absolute inset-0 size-full cursor-pointer opacity-0" type="radio" name="band-mode" value={value} checked={mode === value} onChange={() => editSetup((current) => changeMode(current, value, catalog.palette))} />
                  <span aria-hidden="true" className="workspace-mode-preview block">
                    <BandStrip setup={applyExposurePreset(setup, catalog.palette, value === "ire" ? "camera-ire" : value === "fill" ? "contrast-checker" : "three-band")} minimum={value === "ire" ? 0 : -7} maximum={value === "ire" ? 100 : 7} />
                </span>
                <span aria-hidden="true" className="flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>{scale}</span><span>{mode === value ? "✓" : ""}</span></span>
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </label>)}
            </fieldset>
            {mode === "ire" && <p className="text-xs text-muted-foreground">{setup.ire_basis === "camera" ? `${setup.profile} · camera-log input · full-code-range scale` : "Legacy setup · target-display IRE"}{setup.ire_basis !== "camera" && <> · <button type="button" className="font-medium text-foreground underline" onClick={() => editSetup((current) => changeMode(current, "ire", catalog.palette))}>Switch to camera-log IRE</button></>}</p>}
            </>}>
            <div className="mt-4 grid min-w-0 gap-5">
              <section className="grid gap-3" aria-label="Replace arrangement">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                {!setup.fill_mode && (
                  <>
                    <label className="grid min-w-0 gap-1.5 text-xs font-medium">Band preset
                      <NativeSelect className={fieldClass} value={bandPreset} onChange={(event) => setBandPreset(event.target.value as BandPreset)}>
                        <option value="standard">Standard · 7 bands</option>
                        <option value="detailed">Detailed · {mode === "ire" ? "9" : "10"} bands</option>
                      </NativeSelect>
                    </label>
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => editSetup((current) => applyBandPreset(current, catalog.palette, bandPreset))}><Check data-icon="inline-start" aria-hidden="true" />Apply preset</Button>
                  </>
                )}
                {setup.fill_mode && <>
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium">Fill preset
                    <NativeSelect className={fieldClass} value={fillPreset} onChange={(event) => setFillPreset(event.target.value as FillPreset)}>
                      <option value="standard">Standard · 5 zones</option>
                      <option value="detailed">Detailed · 9 zones</option>
                    </NativeSelect>
                  </label>
                  <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => editSetup((current) => applyFillPreset(current, catalog.palette, fillPreset))}><Check data-icon="inline-start" aria-hidden="true" />Apply preset</Button>
                </>}
                </div>
                <p className="text-xs text-muted-foreground">Replaces positions and colors. Undo restores them.</p>
              </section>
              {(!setup.fill_mode || setup.band_mode === "stops") && <section className="grid gap-3 border-t pt-4" aria-label="Adjust bands and graph">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {!setup.fill_mode && (
                <label className="grid min-w-0 gap-1.5 text-xs font-medium">All band widths ({mode === "ire" ? "IRE" : "stops"})
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
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium">Drag step
                    <NativeSelect aria-label="Movement increment" className={fieldClass} value={stopIncrement} onChange={(event) => setStopIncrement(Number(event.target.value) as 1 | 0.5 | 0.25)}>
                      <option value="1">1 stop</option><option value="0.5">½ stop</option><option value="0.25">¼ stop</option>
                    </NativeSelect>
                  </label>
                )}
              {setup.band_mode === "stops" && <label className="grid min-w-0 gap-1.5 text-xs font-medium sm:col-span-2">Visible range (± stops)
                <NativeSelect aria-label="Graph range in stops" className={fieldClass} value={graphRange} onChange={(event) => setGraphRange(Number(event.target.value))}>{Array.from({ length: 20 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>±{value} stops</option>)}</NativeSelect>
                <span className="text-xs font-normal text-muted-foreground">Zooms the graph; your bands stay unchanged.</span>
              </label>}
                </div>
              </section>}
            </div>
            </WorkspaceTask>
          </CardHeader>
          <CardContent className="grid gap-4">
            {graphPreview ? (
              <>
                <div className="relative overflow-x-auto">
                  <table className="band-table w-full table-fixed min-w-[29rem] text-sm" role="table" aria-label="Band colors and positions">
                    <caption className="caption-bottom pt-2 text-left text-xs text-muted-foreground sm:hidden">Scroll sideways for position, width, and remove.</caption>
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="w-44 px-3 py-2">Color</th><th className="px-3 py-2">{setup.fill_mode ? "Boundary to next color" : mode === "ire" ? "Position (IRE)" : "Position (stops)"}</th><th className="px-3 py-2">{setup.fill_mode ? "Coverage" : `Total width (${mode === "ire" ? "IRE" : "stops"})`}</th><th className="w-16 px-3 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{setup.bands.map((band, index) => (
                      <tr className={`border-t ${selectedBand === index ? "bg-accent/60" : ""}`} data-selected={selectedBand === index} key={bandId(band)} onFocus={() => selectBand(index)} onClick={() => selectBand(index)}>
                        <td className="p-2"><span className="band-field-label" aria-hidden="true">Color</span><ColorPicker hideLabel triggerRef={(element) => { if (element) colorTriggers.current.set(bandId(band), element); else colorTriggers.current.delete(bandId(band)) }} label={`Band ${index + 1} color`} value={band.color} onChange={(color) => editSetup((current) => updateBand(current, index, { color }), index)} /></td>
                        <td className="p-2"><span className="band-field-label" aria-hidden="true">{setup.fill_mode ? "Next boundary" : `Position (${mode === "ire" ? "IRE" : "stops"})`}</span>{setup.fill_mode && index === setup.bands.length - 1
                          ? <span className="text-muted-foreground">—</span>
                          : <BandNumberInput aria-label={setup.fill_mode ? `Boundary after color ${index + 1}` : `Band ${index + 1} ${mode === "ire" ? "IRE" : "stops"}`} className={fieldClass} step={movementIncrement} min={mode === "ire" ? 0 : undefined} max={mode === "ire" ? 100 : undefined} value={band.stop} onChange={(stop) => editSetup((current) => setup.fill_mode ? updateFillBoundary(current, index, stop, movementIncrement) : updateBand(current, index, { stop }), index)} />}</td>
                        <td className="p-2"><span className="band-field-label" aria-hidden="true">{setup.fill_mode ? "Coverage" : `Total width (${mode === "ire" ? "IRE" : "stops"})`}</span>{setup.fill_mode
                          ? <span className="text-muted-foreground">{index === setup.bands.length - 1 ? "Fills the rest" : "Until boundary"}</span>
                          : <BandNumberInput aria-label={`Band ${index + 1} total width`} className={fieldClass} min={0} step={0.2} value={band.width * 2} onChange={(width) => editSetup((current) => updateBand(current, index, { width: width / 2 }), index)} />}</td>
                        <td className="p-2"><Button
                          aria-label={removingBandIndex === index ? `Confirm remove band ${index + 1}` : `Remove band ${index + 1}`}
                          type="button"
                          size="sm"
                          className="h-11 w-11 !px-0"
                          variant={removingBandIndex === index ? "destructive" : "ghost"}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (removingBandIndex !== index) return setRemovingBandIndex(index)
                            editSetup((current) => removeBand(current, index))
                            setRemovingBandIndex(null)
                          }}
                        >{removingBandIndex === index ? <Check aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {setup.bands.length === 0 && <p className="p-4 text-sm text-muted-foreground">No bands yet. Choose Add band to start, or apply a preset above.</p>}
                </div>
                <p role="status" className="empty:hidden text-sm">{bandStatus}</p>
                <a className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href="#photo-result" onClick={() => { const photo = document.querySelector<HTMLDetailsElement>('.workspace-photo'); if (photo) photo.open = true }}>View photo result</a>
                {preview?.warnings.map((warning) => <p className="text-sm text-amber-700 dark:text-amber-300" key={warning}>{warning}</p>)}
              </>
            ) : <p className="text-sm text-muted-foreground">{browserOnly ? "The browser build creates LUTs locally; exposure preview is not included in this release." : "Preparing preview…"}</p>}
            {validationError && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{validationError}</p>}
          </CardContent>
        </Card>
        </WorkspacePanel>
        <WorkspacePanel value="palette">
          <PaletteEditor key={`${revision}:${paletteRevision}`} setup={setup} palette={catalog.palette} onApply={applyPalette} onPreview={setPalettePreview} />
        </WorkspacePanel>
        <WorkspacePanel value="configuration">
        <WorkspaceTask id="signal-warnings" title="Recorded-signal limit warnings" icon={TriangleAlert} desktopInline>
        <Card>
            <CardHeader>
              <CardTitle><h2>Recorded-signal limit warnings</h2></CardTitle>
              <CardDescription className="max-w-3xl">
                Mark this profile&apos;s recorded RGB code limits. These warnings cannot establish physical sensor clipping.
                {" "}<a className="underline" href={`${import.meta.env.BASE_URL}docs/signal-limits/#how-are-these-limits-calculated`} target="_blank" rel="noreferrer">How are these limits calculated? <span className="sr-only">(opens in a new tab)</span></a>
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
        </WorkspaceTask>
        </WorkspacePanel>
        <WorkspacePanel value="media">
        <WorkspaceDisclosure className="min-w-0 rounded-lg border p-4" title="Use original camera media · image or video"><div className="mt-4"><p className="mb-3 text-xs text-muted-foreground">Camera verification requires known source settings. <a className="underline" href={`${import.meta.env.BASE_URL}docs/verification/`} target="_blank" rel="noreferrer">Preview and source interpretation help (new tab)</a></p><WorkbenchPreview preview={preview} setup={{ ...setup, output: outputFilename(setup) }} catalog={catalog} browserOnly={browserOnly} /></div></WorkspaceDisclosure>
        </WorkspacePanel>
        <WorkspacePanel value="files">
        <Card>
          <CardHeader>
            <CardTitle className="workspace-section-heading"><h2>Save setup · optional</h2></CardTitle>
            <CardDescription>Keep your settings for next time.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">Preset name
              <Input className={fieldClass} value={presetName} onChange={(event) => setPresetName(event.target.value)} maxLength={80} />
            </label>
            <Button type="button" variant="outline" disabled={presetsBlocked} onClick={saveCurrentPreset}><Save data-icon="inline-start" aria-hidden="true" />{replacingPreset ? "Replace saved setup" : "Save current setup"}</Button>
            {presetsBlocked && sessionReady && <div className="grid gap-2 sm:col-span-2">
              <p className="text-sm">Saved setups could not be read. Saving is blocked to protect your existing work. Download the raw library backup before replacing it; replacement deletes every saved entry. Your current session is kept separately.</p>
              <Button type="button" variant="outline" onClick={downloadPresetsBackup}><Download data-icon="inline-start" aria-hidden="true" />Download saved library backup</Button>
              <Button type="button" variant="outline" className="border-destructive/40 text-foreground" onClick={replaceDamagedLibrary}><Trash2 data-icon="inline-start" aria-hidden="true" />Replace saved library with an empty library</Button>
            </div>}
            <Button type="button" variant="outline" onClick={downloadConfig}><Download data-icon="inline-start" aria-hidden="true" />Export setup file</Button>
            {replacingPreset && <p className="text-sm sm:col-span-2">A setup named “{presetName.trim()}” is already saved. Replacing it overwrites that saved copy.</p>}
            <p role="status" className="text-sm sm:col-span-2">{saveStatus}</p>
          </CardContent>
        </Card>
        </WorkspacePanel>
        <WorkspacePanel value="export">
        <aside className="grid min-w-0 gap-6" aria-label="LUT output">
        <Card id="export" className="scroll-mt-6">
          <CardHeader>
            <CardTitle><h2>Generate LUT</h2></CardTitle>
            <CardDescription>Build the final {setup.profile} to {setup.target} transformation. <a className="underline" href={`${import.meta.env.BASE_URL}docs/save-and-apply/`} target="_blank" rel="noreferrer">Saving and applying your LUT (new tab)</a></CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output · {setup.cube_size}³ .cube</span>
            <output className="break-all font-mono text-sm" aria-label="Output filename preview">{outputFilename(setup)}</output>
            <p className="text-sm">{setup.legal_range ? "Legal/video range" : "Full range"} · {setup.band_mode === "stops" ? "Exposure stops" : "IRE"} · {setup.fill_mode ? "Fill zones" : setup.monochrome ? "Bands on monochrome" : "Bands on color"}</p>
            <BandStrip setup={setup} minimum={graphMinimum} maximum={graphMaximum} />
            <ul aria-label="Output band colors and boundaries" className="grid gap-1">{setup.bands.map((band, index) => <li key={index} className="flex items-center gap-2 text-xs"><span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: band.color }} /><span>{setup.fill_mode ? `${index === 0 ? '−∞' : setup.bands[index - 1].stop} to ${index === setup.bands.length - 1 ? '+∞' : band.stop}` : `${Number((band.stop - band.width).toFixed(3))} to ${Number((band.stop + band.width).toFixed(3))}`} {setup.band_mode === "stops" ? "stops" : "IRE"}</span></li>)}</ul>
            {[[setup.low_signal_warning, "Low recorded signal", setup.low_signal_hex], [setup.high_signal_warning, "High recorded signal", setup.high_signal_hex]].map(([enabled, label, color]) => enabled && <p key={String(label)} className="flex items-center gap-2 text-xs"><span aria-hidden="true" className="size-3 rounded-full border" style={{ backgroundColor: String(color) }} />{label}</p>)}
            {palettePreview && <p className="text-xs text-muted-foreground" role="status">Your palette preview is not applied. This download uses the current band colors. <a href="#exposure-bands" className="underline">Return to palette preview</a>.</p>}
            {browserOnly && <p className="text-xs text-muted-foreground">Generated on this device. Export JSON to back up your setup; browser storage does not sync and may be cleared.</p>}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-3">
            <Button size="lg" className="w-full" disabled={isGenerating || Boolean(validationError)} onClick={generate}>
              {isGenerating ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              {isGenerating ? "Generating…" : "Generate LUT"}
            </Button>
            <p className="min-h-5 w-full text-sm text-muted-foreground" role="status" aria-live="polite">{status}</p>
          </CardFooter>
        </Card>

        </aside>
        </WorkspacePanel>
      {browserOnly && isGenerating && <Button type="button" variant="outline" onClick={() => workerRef.current?.abort()}><X data-icon="inline-start" aria-hidden="true" />Cancel generation</Button>}
    </WorkspaceShell>
  )
}

export default App
