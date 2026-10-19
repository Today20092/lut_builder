import { Data, Effect, Schema } from "effect"
import type { Setup } from "./editor.ts"
import { validateBrowserSetup } from "./lutEngine.ts"
import { parseImportedCube, verifyImportedIdentity } from "./importedLut.ts"

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
  ire_basis: Schema.optional(Schema.Literals(["camera", "target"])),
  fill_mode: Schema.Boolean,
  low_signal_warning: Schema.Boolean,
  low_signal_hex: Schema.String,
  high_signal_warning: Schema.Boolean,
  high_signal_hex: Schema.String,
  monochrome: Schema.Boolean,
  legal_range: Schema.Boolean,
  output: Schema.String,
  imported_lut: Schema.optional(Schema.Struct({
    version: Schema.Literal(1), name: Schema.String, cube: Schema.String,
    source_profile: Schema.String,
    output_gamut: Schema.Literals(["Rec.709", "Rec.2020"]),
    output_transfer: Schema.Literals(["gamma2.2", "gamma2.4", "sRGB", "BT.709"]),
    output_range: Schema.Literals(["full", "legal"]), sha256: Schema.String,
  })),
})

export class SetupValidationError extends Data.TaggedError("SetupValidationError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export function decodeSetup(input: unknown): Effect.Effect<Setup, SetupValidationError> {
  return Effect.try({
    try: () => {
      const setup=validateBrowserSetup(Schema.decodeUnknownSync(SetupSchema)(input))
      if(setup.imported_lut)parseImportedCube(setup.imported_lut.cube)
      return setup
    },
    catch: (cause) => new SetupValidationError({
      message: cause instanceof Error ? cause.message : "Invalid LUT setup.",
      cause,
    }),
  }).pipe(Effect.flatMap(setup => setup.imported_lut ? Effect.tryPromise({
    try: async () => { await verifyImportedIdentity(setup.imported_lut!); return setup },
    catch: cause => new SetupValidationError({message: cause instanceof Error ? cause.message : "Imported LUT identity check failed.",cause}),
  }) : Effect.succeed(setup)))
}
