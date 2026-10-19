import { Data, Effect, Schema } from "effect"
import type { Setup } from "./editor.ts"
import { decodeSetup, SetupSchema, type SetupValidationError } from "./setupSchema.ts"
import { generateInWorker, type LutWorkerError } from "./lutWorkerClient.ts"

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
export type Preview = typeof PreviewSchema.Type

export class WorkspaceRuntimeError extends Data.TaggedError("WorkspaceRuntimeError")<{
  readonly message: string
  readonly cause: unknown
}> {}

const ErrorResponseSchema = Schema.Struct({ error: Schema.optional(Schema.String) })

type WorkspaceRuntime = {
  readonly browserOnly: boolean
  readonly capabilities: { readonly remotePreview: boolean; readonly cancellableGeneration: boolean; readonly generationProgress: boolean }
  readonly preview: (setup: Setup) => Effect.Effect<Preview | null, WorkspaceRuntimeError>
  readonly normalize: (input: unknown) => Effect.Effect<Setup, SetupValidationError | WorkspaceRuntimeError>
  readonly generate: (setup: Setup, filename: string, onProgress: (progress: number) => void) => Effect.Effect<{ blob: Blob; filename: string }, WorkspaceRuntimeError | LutWorkerError>
}

// Select once per workspace; presentation and setup-history ownership stay with callers.
export function createWorkspaceRuntime(token?: string): WorkspaceRuntime {
  const browserOnly = !token
  const request = <A>(path: string, setup: Setup, read: (response: Response) => Promise<A>, fallback: string) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(path, {
          method: "POST", signal,
          headers: { "Content-Type": "application/json", "X-LUT-Builder-Token": token! },
          body: JSON.stringify({ version: 1, ...setup }),
        })
        if (!response.ok) {
          const error = Schema.decodeUnknownSync(ErrorResponseSchema)(await response.json())
          throw new Error(error.error || fallback)
        }
        return read(response)
      },
      catch: (cause) => new WorkspaceRuntimeError({ message: cause instanceof Error ? cause.message : fallback, cause }),
    })
  const preview: WorkspaceRuntime["preview"] = (setup) => browserOnly
    ? Effect.succeed(null)
    : request("/preview", setup, async (response) => Schema.decodeUnknownSync(PreviewSchema)(await response.json()), "Request failed")
  return {
    capabilities: { remotePreview: !browserOnly, cancellableGeneration: browserOnly, generationProgress: browserOnly },
    browserOnly,
    preview,
    normalize: (input: unknown) => decodeSetup(input).pipe(Effect.flatMap((setup) =>
      preview(setup).pipe(Effect.map((result) => result?.setup ?? setup)))),
    generate: (setup: Setup, filename: string, onProgress: (progress: number) => void) => browserOnly
      ? generateInWorker(setup, onProgress).pipe(Effect.map((bytes) => ({
        blob: new Blob([bytes], { type: "text/plain;charset=utf-8" }), filename,
      })))
      : request("/generate", { ...setup, output: filename }, async (response) => ({
        blob: await response.blob(),
        filename: /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "lut.cube",
      }), "Generation failed"),
  }
}
