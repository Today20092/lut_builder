import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg"
import { Schema } from "effect"
import coreURL from "@ffmpeg/core?url"
import wasmURL from "@ffmpeg/core/wasm?url"
import { decodePfm, decodeYuv, dimensions, inspectPng, pixelFormats, type Interpretation } from "./verificationMath.ts"

const Facts = Schema.Struct({
  width: Schema.Number, height: Schema.Number, pix_fmt: Schema.String,
  color_range: Schema.optional(Schema.String), color_space: Schema.optional(Schema.String),
  color_transfer: Schema.optional(Schema.String), color_primaries: Schema.optional(Schema.String),
  chroma_location: Schema.optional(Schema.String), sample_aspect_ratio: Schema.optional(Schema.String),
  side_data_list: Schema.optional(Schema.Array(Schema.Unknown)),
})
const Stream = Schema.Struct({
    ...Facts.fields, index: Schema.Number, codec_name: Schema.String, time_base: Schema.String,
    start_pts: Schema.Number,
    field_order: Schema.optional(Schema.String), tags: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    nb_read_packets: Schema.optional(Schema.String),
})
const Probe = Schema.Struct({
  streams: Schema.Array(Stream),
  frames: Schema.Array(Schema.Struct({ ...Facts.fields, pts: Schema.Number, interlaced_frame: Schema.optional(Schema.Number) })),
})
const Header = Schema.Struct({ streams: Schema.Array(Stream), format: Schema.Struct({ duration: Schema.String }) })
export type VideoInfo = { stream: typeof Stream.Type; frames: typeof Probe.Type.frames; bitDepth: number; seekSeconds: number; duration: number }
export type DecodedSource = { width: number; height: number; rgb: Float64Array; facts: Record<string, unknown>; native: Uint8Array }
const FRAME_LIMIT = 1_000
const TIMEOUT = 120_000

export class BrowserMedia {
  private ffmpeg = new FFmpeg()
  private file: File | null = null
  private logs: string[] = []
  private frameLogs: string[] = []

  async load(file: File) {
    if (!file.size || file.size > 512 * 1024 * 1024) throw new Error("Choose media up to 512 MiB.")
    this.file = file
    this.ffmpeg.on("log", ({ message }) => {
      if (/config in time_base:|n:\s*0\s+pts:/.test(message)) this.frameLogs.push(message.slice(0, 4096))
      this.logs.push(message.slice(0, 4096)); if (this.logs.length > 100) this.logs.shift()
    })
    await this.ffmpeg.load({ coreURL: new URL(coreURL, self.location.href).href, wasmURL: new URL(wasmURL, self.location.href).href })
    await this.ffmpeg.createDir("/source")
    await this.ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: "input", data: file }] }, "/source")
  }

  async probe(seconds = 0): Promise<VideoInfo> {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) throw new Error("Choose a seek time from 0 to 300 seconds.")
    const headerCode = await this.ffmpeg.ffprobe(["-v", "error", "-select_streams", "v:0", "-show_streams", "-show_format", "-of", "json", "/source/input", "-o", "/header.json"], 30_000)
    if (headerCode > 0) throw new Error(`Cannot inspect this video header: ${this.logs.slice(-5).join(" ")}`)
    const headerText = await this.ffmpeg.readFile("/header.json", "utf8")
    if (typeof headerText !== "string" || headerText.length > 1024 * 1024) throw new Error("Video header exceeds the metadata limit.")
    const header = Schema.decodeUnknownSync(Header)(JSON.parse(headerText))
    const stream = header.streams[0]
    if (!stream || !["h264", "hevc", "prores", "ffv1"].includes(stream.codec_name)) throw new Error("Supported video codecs: H.264, HEVC, ProRes 422 and FFV1.")
    dimensions(stream.width, stream.height)
    const duration = Number(header.format.duration)
    const [num, den] = stream.time_base.split("/").map(Number)
    if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || num <= 0 || den <= 0 || !Number.isSafeInteger(stream.start_pts)) throw new Error("Invalid video time base or start timestamp.")
    const start = stream.start_pts * num / den
    if (!Number.isFinite(duration) || duration <= 0 || duration - Math.max(0, start) > 300 || seconds >= duration) throw new Error("Choose a video no longer than five minutes and a time inside it.")
    if (!Object.hasOwn(pixelFormats, stream.pix_fmt) || stream.width % 2 || stream.height % 2) throw new Error("Use even-sized planar 4:2:0 8/10-bit or 4:2:2 10-bit video.")
    if (stream.tags?.rotate && Number(stream.tags.rotate) !== 0) throw new Error("Rotated video is unsupported.")
    if (![undefined, "unknown", "progressive"].includes(stream.field_order)) throw new Error("Interlaced video is unsupported.")
    const absolute = start + seconds
    const code = await this.ffmpeg.ffprobe(["-v", "error", "-select_streams", "v:0", "-read_intervals", `${absolute}%${absolute + 1}`, "-count_packets", "-show_streams", "-show_frames", "-show_entries", "stream=index,codec_name,width,height,pix_fmt,time_base,start_pts,field_order,nb_read_packets,color_range,color_space,color_transfer,color_primaries,chroma_location,sample_aspect_ratio:stream_tags=rotate:stream_side_data:frame=pts,width,height,pix_fmt,interlaced_frame,color_range,color_space,color_transfer,color_primaries,chroma_location,sample_aspect_ratio:frame_side_data", "-of", "json", "/source/input", "-o", "/probe.json"], TIMEOUT)
    if (code > 0) throw new Error("Video inspection failed or exceeded two minutes. Choose a shorter supported clip.")
    const text = await this.ffmpeg.readFile("/probe.json", "utf8")
    if (typeof text !== "string" || text.length > 32 * 1024 * 1024) throw new Error("Video metadata exceeds the inspection limit.")
    const probe = Schema.decodeUnknownSync(Probe)(JSON.parse(text))
    await this.ffmpeg.deleteFile("/probe.json")
    if (!probe.frames.length || probe.frames.length > FRAME_LIMIT) throw new Error("Selected interval must contain 1 to 1,000 frames. Choose another time or a shorter clip.")
    let previous = -Infinity
    for (const frame of probe.frames) {
      if (!Number.isSafeInteger(frame.pts) || frame.pts <= previous || frame.width !== stream.width || frame.height !== stream.height || frame.pix_fmt !== stream.pix_fmt || frame.interlaced_frame) throw new Error("Video has changing layout, interlacing or ambiguous frame timestamps.")
      previous = frame.pts
    }
    for (const facts of [stream, ...probe.frames]) {
      if (![undefined, "1:1", "0:1", "N/A"].includes(facts.sample_aspect_ratio)) throw new Error("Only square-pixel video is supported.")
      if (/rotation|display matrix|dovi|dolby|dynamic hdr/i.test(JSON.stringify(facts.side_data_list ?? []))) throw new Error("Rotation and dynamic HDR metadata are unsupported.")
    }
    const frames = probe.frames.filter((frame) => frame.pts * num / den >= absolute - num / den / 2)
    if (!frames.length) throw new Error("No frame at or after this time. Choose an earlier time.")
    return { stream, frames, bitDepth: pixelFormats[stream.pix_fmt as keyof typeof pixelFormats][0], seekSeconds: absolute, duration }
  }

  async still(): Promise<DecodedSource> {
    if (!this.file || this.file.size > 48 * 1024 * 1024 + 1024) throw new Error("Still limit: 48 MiB plus header.")
    const bytes = new Uint8Array(await this.file.arrayBuffer())
    if (bytes[0] === 80 && bytes[1] === 70) return { ...decodePfm(bytes), native: bytes, facts: { storage: "float32 RGB PFM", decoding: "RGB; no color transform or range scaling" } }
    const { width, height } = inspectPng(bytes)
    const code = await this.ffmpeg.exec(["-v", "error", "-threads", "1", "-i", "/source/input", "-frames:v", "1", "-pix_fmt", "rgb48le", "-threads", "1", "-f", "rawvideo", "/still.raw"], 30_000)
    if (code) throw new Error("PNG decoding failed or exceeded 30 seconds.")
    const raw = await this.ffmpeg.readFile("/still.raw")
    if (!(raw instanceof Uint8Array) || raw.length !== width * height * 6) throw new Error("PNG decoder returned an unexpected sample count.")
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const rgb = Float64Array.from({ length: width * height * 3 }, (_, i) => view.getUint16(i * 2, true) / 65535)
    return { width, height, rgb, native: bytes, facts: { storage: "uint16 RGB PNG", decoding: "rgb48le / 65535; no color transform or range scaling" } }
  }

  async frame(info: VideoInfo, ordinal: number, interpretation: Interpretation): Promise<DecodedSource> {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= info.frames.length) throw new Error("Select an existing frame.")
    const { width, height, pix_fmt } = info.stream
    this.logs = []
    this.frameLogs = []
    const code = await this.ffmpeg.exec(["-v", "info", "-copyts", "-threads", "1", "-noautorotate", "-noaccurate_seek", "-seek_timestamp", "1", "-ss", String(info.seekSeconds), "-i", "/source/input", "-map", `0:${info.stream.index}`, "-vf", `select=eq(pts\\,${info.frames[ordinal].pts}),showinfo`, "-frames:v", "1", "-vsync", "0", "-pix_fmt", pix_fmt, "-threads", "1", "-f", "rawvideo", "/frame.raw"], TIMEOUT)
    if (code) throw new Error("Frame decoding failed or exceeded two minutes. Choose an earlier frame or shorter clip.")
    const identity = this.frameLogs.find((line) => /n:\s*0\s+pts:/.test(line))
    const pts = Number(identity?.match(/pts:\s*(-?\d+)/)?.[1])
    const timeBase = this.frameLogs.find((line) => /config in time_base:/.test(line))?.match(/time_base:\s*(\d+\/\d+)/)?.[1]
    if (timeBase !== info.stream.time_base) throw new Error(`Decoded frame time base (${timeBase ?? "missing"}) differs from the selected frame (${info.stream.time_base}). Decoder frame logs: ${this.frameLogs.map((line) => line.slice(0, 256)).join(" | ") || "none"}`)
    if (pts !== info.frames[ordinal].pts || !identity?.includes(`fmt:${pix_fmt}`) || !identity.includes(`s:${width}x${height}`)) throw new Error(`Decoded frame identity or layout differs from the selected frame (${info.frames[ordinal].pts}, ${pix_fmt}, ${width}x${height}): ${identity ?? this.logs.slice(-5).join(" ")}`)
    const raw = await this.ffmpeg.readFile("/frame.raw")
    if (!(raw instanceof Uint8Array)) throw new Error("Missing native frame samples.")
    return { width, height, rgb: decodeYuv(raw, width, height, pix_fmt as keyof typeof pixelFormats, interpretation), native: raw, facts: {
      storage: pix_fmt, precision_bits: info.bitDepth,
      frame: { interval_index: ordinal, pts, time_base: info.stream.time_base, start_pts: info.stream.start_pts },
      reported: { stream: info.stream, frame: info.frames[ordinal] },
      decoding: `Native YCbCr; ${interpretation.matrix}; ${interpretation.signalRange}; ${interpretation.chroma}; bilinear chroma; float64 RGB, no transfer/gamut conversion`,
    } }
  }

  close() { this.ffmpeg.terminate(); this.file = null }
}
