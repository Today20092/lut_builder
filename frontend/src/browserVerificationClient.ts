import { Data, Effect } from "effect"
import type { BrowserResult, VerificationJob } from "./browserVerificationWorker.ts"
import type { VideoInfo } from "./browserMedia.ts"

export class BrowserVerificationError extends Data.TaggedError("BrowserVerificationError")<{ readonly message: string }> {}

export function browserVerification(job: VerificationJob, progress: (text: string) => void) {
  return Effect.callback<BrowserResult | VideoInfo, BrowserVerificationError>((resume) => {
    let worker: Worker
    try { worker = new Worker(new URL("./browserVerificationWorker.ts", import.meta.url), { type: "module" }) }
    catch { resume(Effect.fail(new BrowserVerificationError({ message: "Could not start the decoder worker. Use a current browser with WebAssembly and workers enabled." }))); return }
    const timer = setTimeout(() => {
      worker.terminate()
      resume(Effect.fail(new BrowserVerificationError({ message: "Verification exceeded five minutes. Choose a shorter clip or use the local workspace." })))
    }, 300_000)
    worker.onmessage = (event: MessageEvent<{ type: string; text: string; message: string; value: BrowserResult | VideoInfo }>) => {
      if (event.data.type === "progress") progress(event.data.text)
      else {
        clearTimeout(timer)
        worker.terminate()
        resume(event.data.type === "complete" ? Effect.succeed(event.data.value) : Effect.fail(new BrowserVerificationError({ message: event.data.message })))
      }
    }
    worker.onerror = () => {
      clearTimeout(timer); worker.terminate()
      resume(Effect.fail(new BrowserVerificationError({ message: "The decoder worker failed. Reload and retry with a smaller supported source." })))
    }
    worker.postMessage(job)
    return Effect.sync(() => { clearTimeout(timer); worker.terminate() })
  })
}
