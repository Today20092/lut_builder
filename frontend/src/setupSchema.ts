import { Data, Effect, Schema } from "effect"
import type { Setup } from "./editor.ts"
import { validateBrowserSetup } from "./lutEngine.ts"

const BandSchema = Schema.Struct({
  stop: Schema.Finite,
  width: Schema.Finite,
  color: Schema.String,
})

export const SetupSchema = Schema.Struct({
  profile: Schema.String,
  target: Schema.String,
  cube_size: Schema.Literals([17, 33, 65]),
  bands: Schema.mutable(Schema.Array(BandSchema)),
  band_mode: Schema.Literals(["stops", "ire"]),
  fill_mode: Schema.Boolean,
  low_signal_warning: Schema.Boolean,
  low_signal_hex: Schema.String,
  high_signal_warning: Schema.Boolean,
  high_signal_hex: Schema.String,
  monochrome: Schema.Boolean,
  legal_range: Schema.Boolean,
  output: Schema.String,
})

export class SetupValidationError extends Data.TaggedError("SetupValidationError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export function decodeSetup(input: unknown): Effect.Effect<Setup, SetupValidationError> {
  return Effect.try({
    try: () => validateBrowserSetup(Schema.decodeUnknownSync(SetupSchema)(input)),
    catch: (cause) => new SetupValidationError({
      message: cause instanceof Error ? cause.message : "Invalid LUT setup.",
      cause,
    }),
  })
}
