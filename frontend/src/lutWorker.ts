import { Data, Effect } from "effect"
import { generateCube } from "./lutEngine.ts"
import type { Setup } from "./editor.ts"

type Request = { type: "generate"; id: string; setup: Setup } | { type: "cancel"; id: string }
type Response =
  | { type: "progress"; id: string; progress: number }
  | { type: "complete"; id: string; bytes: ArrayBuffer }
  | { type: "error"; id: string; error: string }

class WorkerGenerationError extends Data.TaggedError("WorkerGenerationError")<{
  readonly message: string
  readonly cause: unknown
}> {}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: Response, transfer?: Transferable[]) => void
}
const jobs = new Map<string, AbortController>()

scope.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    jobs.get(data.id)?.abort()
    return
  }
  const controller = new AbortController()
  jobs.set(data.id, controller)
  try {
      const cube = await Effect.runPromise(Effect.tryPromise({
        try: (signal) => generateCube(data.setup, {
          signal,
          onProgress: (progress) => scope.postMessage({ type: "progress", id: data.id, progress }),
        }),
        catch: (cause) => new WorkerGenerationError({
          message: cause instanceof Error ? cause.message : "Generation failed.",
          cause,
        }),
      }), { signal: controller.signal })
    const bytes = new TextEncoder().encode(cube)
    scope.postMessage({ type: "complete", id: data.id, bytes: bytes.buffer }, [bytes.buffer])
  } catch (error) {
      scope.postMessage({ type: "error", id: data.id, error: controller.signal.aborted ? "Generation cancelled." : error instanceof Error ? error.message : "Generation failed" })
  } finally {
    jobs.delete(data.id)
  }
}
