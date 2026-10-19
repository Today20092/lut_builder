import { useCallback, useEffect, useRef, useState } from "react"
import { Data, Effect, Schema } from "effect"

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

class MediaSourceError extends Data.TaggedError("MediaSourceError")<{
  readonly message: string
  readonly cause: unknown
}> {}

const ErrorResponseSchema = Schema.Struct({ error: Schema.optional(Schema.String) })

function videoRequest<T>(path: string, body: object | File, decode: (input: unknown) => T, signal?: AbortSignal): Promise<T> {
  return Effect.runPromise(Effect.tryPromise({
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
    catch: (cause) => new MediaSourceError({ message: cause instanceof Error ? cause.message : "Video request failed", cause }),
  }), { signal })
}

function releaseVideo(source_id: string) {
  void Effect.runPromise(Effect.tryPromise({
    try: (signal) => fetch("/video/cancel", {
      method: "POST", keepalive: true, signal,
      headers: { "Content-Type": "application/json", "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN },
      body: JSON.stringify({ source_id }),
    }),
    catch: (cause) => new MediaSourceError({ message: "Video cancellation failed.", cause }),
  })).catch(() => {}) // Server expiry also cleans up if the page has disconnected.
}

function readImage(file: File) {
  return Effect.callback<string, MediaSourceError>((resume) => {
    const reader = new FileReader()
    reader.onload = () => resume(Effect.succeed(String(reader.result)))
    reader.onerror = () => resume(Effect.fail(new MediaSourceError({ message: "Could not read this image. Try a PNG, JPEG, or WebP file.", cause: reader.error })))
    reader.readAsDataURL(file)
    return Effect.sync(() => {
      reader.onload = null
      reader.onerror = null
      if (reader.readyState === FileReader.LOADING) reader.abort()
    })
  })
}

function displayableImage(url: string) {
  return Effect.callback<string, MediaSourceError>((resume) => {
    const image = new Image()
    image.onload = () => resume(Effect.succeed(url))
    image.onerror = () => resume(Effect.fail(new MediaSourceError({ message: "Could not read this image. Try a PNG, JPEG, or WebP file.", cause: null })))
    image.src = url
    return Effect.sync(() => { image.onload = null; image.onerror = null })
  })
}

type MediaState = {
  imageUrl: string
  imageName: string
  imageError: string
  video: VideoFrame | null
  videoBusy: string
  videoTime: string
  frameRevision: number
}

/** Owns display-media acquisition and source identity; native camera samples stay on the server. */
export function usePreviewMedia(referenceImage: string) {
  const selection = useRef(0)
  const source = useRef("")
  const pending = useRef<AbortController | null>(null)
  const [state, setState] = useState<MediaState>({
    imageUrl: referenceImage, imageName: "Reference photo", imageError: "",
    video: null, videoBusy: "", videoTime: "0", frameRevision: 0,
  })

  const invalidate = useCallback(() => {
    selection.current += 1
    pending.current?.abort()
    pending.current = null
    if (source.current) releaseVideo(source.current)
    source.current = ""
  }, [])

  useEffect(() => {
    const pagehide = () => {
      invalidate()
      setState((previous) => ({ ...previous, video: null, videoBusy: "" }))
    }
    window.addEventListener("pagehide", pagehide)
    return () => { invalidate(); window.removeEventListener("pagehide", pagehide) }
  }, [invalidate])

  const displayError = useCallback((imageError: string) => {
    setState((previous) => ({ ...previous, imageError }))
  }, [])

  function reference(message = "") {
    invalidate()
    setState((previous) => ({ ...previous, imageUrl: referenceImage, imageName: "Reference photo", imageError: message, video: null, videoBusy: "" }))
  }

  async function chooseVideo(file: File) {
    reference()
    const request = selection.current
    if (file.size === 0 || file.size > 256 * 1024 * 1024) {
      setState((previous) => ({ ...previous, imageError: "Choose a nonempty video up to 256 MB." }))
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setState((previous) => ({ ...previous, videoBusy: "Uploading and indexing decoded presentation frames…" }))
    try {
      // Allocation must finish so a late source ID can still be released after cancellation.
      const { source_id } = await videoRequest("start", {}, Schema.decodeUnknownSync(Schema.Struct({ source_id: Schema.String })))
      if (request !== selection.current) { releaseVideo(source_id); return }
      source.current = source_id
      const result = await videoRequest(`upload?source_id=${encodeURIComponent(source_id)}`, file, Schema.decodeUnknownSync(VideoFrameSchema), controller.signal)
      if (request !== selection.current) return
      setState((previous) => ({ ...previous, video: { ...result, name: file.name }, videoTime: "0", imageUrl: result.display, imageName: file.name }))
    } catch (error) {
      if (request === selection.current) {
        if (source.current) releaseVideo(source.current)
        source.current = ""
        setState((previous) => ({ ...previous, imageError: error instanceof Error ? error.message : "Video import failed" }))
      }
    } finally {
      if (request === selection.current) setState((previous) => ({ ...previous, videoBusy: "" }))
    }
  }

  async function selectVideoFrame(position: { time: string } | { index: number }) {
    if (!source.current) return
    pending.current?.abort()
    const request = ++selection.current
    const controller = new AbortController()
    pending.current = controller
    setState((previous) => ({ ...previous, frameRevision: previous.frameRevision + 1, videoBusy: "Decoding the selected presentation frame…", imageError: "" }))
    try {
      const result = await videoRequest("frame", { source_id: source.current, ...position }, Schema.decodeUnknownSync(VideoFrameSchema), controller.signal)
      if (request !== selection.current) return
      setState((previous) => ({ ...previous, video: { ...result, name: previous.video?.name }, imageUrl: result.display }))
    } catch (error) {
      if (request === selection.current) setState((previous) => ({ ...previous, imageError: `${error instanceof Error ? error.message : "Frame extraction failed"} The displayed frame is unchanged.` }))
    } finally {
      if (request === selection.current) setState((previous) => ({ ...previous, videoBusy: "" }))
    }
  }

  async function chooseImage(file: File) {
    invalidate()
    const request = selection.current
    setState((previous) => ({ ...previous, video: null, videoBusy: "", imageError: "" }))
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      setState((previous) => ({ ...previous, imageError: "Choose a still image up to 25 MB. The previous image is unchanged." }))
      return
    }
    const controller = new AbortController()
    pending.current = controller
    try {
      const url = await Effect.runPromise(readImage(file).pipe(Effect.flatMap(displayableImage)), { signal: controller.signal })
      if (request === selection.current) setState((previous) => ({ ...previous, imageUrl: url, imageName: file.name }))
    } catch (error) {
      if (request === selection.current && !controller.signal.aborted) setState((previous) => ({ ...previous, imageError: `${error instanceof Error ? error.message : "Could not read this image."} The previous image is unchanged.` }))
    }
  }

  return {
    ...state, chooseVideo, selectVideoFrame, chooseImage, reference,
    setVideoTime: (videoTime: string) => setState((previous) => ({ ...previous, videoTime })),
    displayError,
  }
}
