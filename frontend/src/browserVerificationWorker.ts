import { Effect } from "effect"
import { BrowserMedia, type VideoInfo } from "./browserMedia.ts"
import { browserInterpretations, generateCube } from "./lutEngine.ts"
import { decodeSetup } from "./setupSchema.ts"
import { applyCube, comparisonUnavailable, displayRgb, parseCube, type Interpretation } from "./verificationMath.ts"
import type { Setup } from "./editor.ts"

export type VerificationJob = { file: File; setup?: Setup; interpretation?: Interpretation; video?: VideoInfo; ordinal?: number; probe?: boolean; seconds?: number }
export type BrowserResult = { width: number; height: number; source: Float64Array; output: Float64Array; rgba: Uint8ClampedArray; cube: string; provenance: { comparison_unavailable: string; warnings: string[]; [key: string]: unknown } }

async function hash(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function run(job: VerificationJob) {
  const media = new BrowserMedia()
  try {
    self.postMessage({ type: "progress", text: "Loading the local media decoder…" })
    await media.load(job.file)
    if (job.probe) {
      self.postMessage({ type: "progress", text: "Inspecting video frames and recording metadata…" })
      const info = await media.probe(job.seconds)
      self.postMessage({ type: "complete", value: info })
      return
    }
    const setup = await Effect.runPromise(decodeSetup(job.setup))
    const interpretation = job.interpretation
    const expected = browserInterpretations[setup.profile]
    if (!interpretation?.confirmed || !expected || interpretation.transfer !== expected.transfer || interpretation.gamut !== expected.gamut) throw new Error("Confirm source transfer/gamut matching the LUT camera profile.")
    self.postMessage({ type: "progress", text: "Decoding preserved camera samples…" })
    const source = job.video ? await media.frame(job.video, job.ordinal ?? -1, interpretation) : await media.still()
    media.close()
    self.postMessage({ type: "progress", text: "Generating and applying the exact serialized cube…" })
    const cube = await generateCube(setup)
    const parsed = parseCube(cube)
    const output = new Float64Array(source.rgb.length)
    const rgba = new Uint8ClampedArray(source.width * source.height * 4)
    let clamped = 0
    for (let i = 0; i < source.rgb.length; i += 3) {
      const input = source.rgb.subarray(i, i + 3)
      for (const sample of input) { if (!Number.isFinite(sample)) throw new Error("Non-finite source samples."); if (sample < 0 || sample > 1) clamped++ }
      const result = applyCube(input, parsed)
      output.set(result, i)
      const display = displayRgb(result, setup)
      const pixel = i / 3 * 4
      rgba.set(display.map((value) => Math.round(value * 255)), pixel)
      rgba[pixel + 3] = 255
    }
    const provenance = {
      comparison_unavailable: comparisonUnavailable,
      warnings: clamped ? [`${clamped} source channels outside [0, 1] were clamped only at the cube input boundary.`] : [],
      source: { name: job.file.name, width: source.width, height: source.height, ...source.facts, native_sha256: await hash(source.native) },
      interpretation, setup, setup_sha256: await hash(JSON.stringify(setup)), cube_sha256: await hash(cube), cube_size: parsed.size,
      interpolation: "tetrahedral; red-fastest serialized cube table", clamped_channels: clamped,
      output: { target: setup.target, range: setup.legal_range ? "legal" : "full" },
      view: "Ideal-black BT.1886; target primaries to sRGB; display gamut clipped; sRGB transfer; round to 8 bits for display only",
      decoder: "@ffmpeg/core 0.12.10; software WebAssembly; native sample decode", arithmetic: "JavaScript float64",
    }
    const result: BrowserResult = { width: source.width, height: source.height, source: source.rgb, output, rgba, cube, provenance }
    self.postMessage({ type: "complete", value: result }, { transfer: [result.source.buffer, output.buffer, rgba.buffer] })
  } finally { media.close() }
}

self.onmessage = (event: MessageEvent<VerificationJob>) => {
  void Effect.runPromise(Effect.tryPromise({ try: () => run(event.data), catch: (cause) => cause })).catch((cause: unknown) => {
    self.postMessage({ type: "error", message: cause instanceof Error ? cause.message : String(cause) })
  })
}
