import { Data, Effect } from "effect"
import type { Setup } from "./editor.ts"

type WorkerMessage =
  | { type: "progress"; id: string; progress: number }
  | { type: "complete"; id: string; bytes: ArrayBuffer }
  | { type: "error"; id: string; error: string }

export class LutWorkerError extends Data.TaggedError("LutWorkerError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export function generateInWorker(
  setup: Setup,
  onProgress: (progress: number) => void,
): Effect.Effect<ArrayBuffer, LutWorkerError> {
  return Effect.callback((resume, signal) => {
    const id = `${Date.now()}-${Math.random()}`
    let worker: Worker
    try {
      worker = new Worker(new URL("./lutWorker.ts", import.meta.url), { type: "module" })
    } catch (cause) {
      resume(Effect.fail(new LutWorkerError({ message: "This browser could not start Web Workers. Try a current browser with workers enabled, or use the local Python workspace. Your edits are preserved.", cause })))
      return
    }

    const finish = () => {
      worker.terminate()
      signal.removeEventListener("abort", cancel)
    }
    const cancel = () => worker.postMessage({ type: "cancel", id })
    signal.addEventListener("abort", cancel, { once: true })
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const result = event.data
      if (result.id !== id) return
      if (result.type === "progress") {
        onProgress(result.progress)
      } else if (result.type === "error") {
        finish()
        resume(Effect.fail(new LutWorkerError({ message: result.error || "Generation failed." })))
      } else {
        finish()
        resume(Effect.succeed(result.bytes))
      }
    }
    worker.onerror = (cause) => {
      finish()
      resume(Effect.fail(new LutWorkerError({ message: "Browser LUT generation failed.", cause })))
    }
    worker.postMessage({ type: "generate", id, setup })

    return Effect.sync(finish)
  })
}
