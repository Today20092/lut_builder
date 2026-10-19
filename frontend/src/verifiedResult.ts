import { Data, Effect, Schema } from "effect"
import type { BrowserResult } from "./browserVerificationWorker.ts"
import type { Setup } from "./editor.ts"
import { displayRgb } from "./verificationMath.ts"

export const CheckedStillSchema = Schema.Struct({
  request_id: Schema.String,
  width: Schema.Finite,
  height: Schema.Finite,
  image: Schema.String,
  look_image: Schema.optional(Schema.String),
  provenance: Schema.StructWithRest(
    Schema.Struct({ comparison_unavailable: Schema.String, warnings: Schema.Array(Schema.String) }),
    [Schema.Record(Schema.String, Schema.Unknown)],
  ),
})
const RgbSchema = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite])
const PixelSchema = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, source_rgb: RgbSchema, output_rgb: RgbSchema, display_rgb: RgbSchema })
export type VerifiedPixel = typeof PixelSchema.Type
type Metadata = Pick<typeof CheckedStillSchema.Type, "width" | "height" | "image" | "look_image" | "provenance">
export type VerifiedResult = Metadata & {
  inspect: (x: number, y: number) => Effect.Effect<VerifiedPixel, VerifiedResultError>
  cube: () => Effect.Effect<Blob, VerifiedResultError>
  release: () => Effect.Effect<void, VerifiedResultError>
}
export class VerifiedResultError extends Data.TaggedError("VerifiedResultError")<{ message: string; cause?: unknown }> {}
type Request = (path: string, payload: object, signal?: AbortSignal) => Promise<Response>

function verifiedResult(metadata: Metadata, inspect: (x: number, y: number, signal: AbortSignal) => Promise<VerifiedPixel>, cube: (signal: AbortSignal) => Promise<Blob>, release: () => Promise<void>): VerifiedResult {
  let released = false
  const access = <A>(read: (signal: AbortSignal) => Promise<A>) => Effect.tryPromise({
    try: async (signal) => {
      if (released) throw new Error("This verified result is no longer current. Verify again.")
      const value = await read(signal)
      if (released) throw new Error("This verified result is no longer current. Verify again.")
      return value
    },
    catch: (cause) => new VerifiedResultError({ message: cause instanceof Error ? cause.message : String(cause), cause }),
  })
  return {
    ...metadata,
    inspect: (x, y) => access(async (signal) => {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= metadata.width || y >= metadata.height) throw new Error("Choose a pixel inside the original frame.")
      return inspect(x, y, signal)
    }),
    cube: () => access(cube),
    release: () => Effect.tryPromise({
      try: async () => { if (!released) { released = true; await release() } },
      catch: (cause) => new VerifiedResultError({ message: "Could not release the verified result.", cause }),
    }),
  }
}

export function localVerifiedResult(result: typeof CheckedStillSchema.Type, request: Request): VerifiedResult {
  const identity = { request_id: result.request_id }
  return verifiedResult(result,
    async (x, y, signal) => Schema.decodeUnknownSync(PixelSchema)(await (await request("/verify-pixel", { ...identity, x, y }, signal)).json()),
    async (signal) => (await request("/verify-cube", identity, signal)).blob(),
    async () => { await request("/verify-cancel", identity) },
  )
}

export function browserVerifiedResult(result: Omit<BrowserResult, "rgba">, setup: Pick<Setup, "target" | "legal_range" | "imported_lut">, image: string, look_image?: string): VerifiedResult {
  const view = { target: setup.target, legal_range: setup.legal_range, imported_lut: setup.imported_lut }
  return verifiedResult({ width: result.width, height: result.height, image, look_image, provenance: result.provenance },
    async (x, y) => {
      const i = (y * result.width + x) * 3
      const output = result.output.subarray(i, i + 3)
      return Schema.decodeUnknownSync(PixelSchema)({ x, y, source_rgb: Array.from(result.source.subarray(i, i + 3)), output_rgb: Array.from(output), display_rgb: displayRgb(output, view) })
    },
    async () => new Blob([result.cube]),
    async () => {},
  )
}
