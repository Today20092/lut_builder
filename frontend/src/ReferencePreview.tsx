import { useEffect, useRef, useState } from 'react'
import { Data, Effect } from 'effect'
import { Button } from '@/components/ui/button'
import type { Setup } from './editor'
import { generateInWorker } from './lutWorkerClient'
import { applyCube, displayRgb, parseCube } from './verificationMath'
import { cameraInputFromSrgb } from './sampleMath'
import astronaut from './assets/astronaut.png'
import chelsea from './assets/chelsea.png'
import rocket from './assets/rocket.jpg'

const scenes = [
  { name: 'Portrait', url: astronaut, credit: 'NASA · public domain', profile: 'sRGB IEC61966-2.1' },
  { name: 'Nature · cat', url: chelsea, credit: 'Stefan van der Walt · CC0', profile: 'sRGB IEC61966-2.1' },
  { name: 'Outdoor · dusk', url: rocket, credit: 'SpaceX · public domain', profile: 'Adobe RGB (1998)' },
]
class SamplePreviewError extends Data.TaggedError('SamplePreviewError')<{ readonly message: string; readonly cause: unknown }> {}

export function ReferencePreview({ setup, draft }: { setup: Setup; draft: boolean }) {
  const [scene, setScene] = useState(0)
  const [custom, setCustom] = useState<{ url: string; name: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [result, setResult] = useState<{ key: string; url?: string; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const source = custom ?? scenes[scene]
  const key = JSON.stringify([source.url, setup, retry])
  const current = result?.key === key ? result : null

  useEffect(() => () => { if (custom) URL.revokeObjectURL(custom.url) }, [custom])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const work = Effect.gen(function* () {
        const image = new Image()
        image.src = source.url
        yield* Effect.tryPromise({ try: () => image.decode(), catch: cause => new SamplePreviewError({ message: 'Could not open this photo. Try a JPEG or PNG.', cause }) })
        const bytes = yield* generateInWorker(setup, () => {})
        return yield* Effect.try({
          try: () => {
            const canvas = document.createElement('canvas')
            const scale = Math.min(1, 384 / image.naturalWidth, 256 / image.naturalHeight)
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
            const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
            if (!context) throw new Error('Canvas is unavailable.')
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
            const cube = parseCube(new TextDecoder().decode(bytes))
            for (let i = 0; i < pixels.data.length; i += 4) {
              const camera = cameraInputFromSrgb([pixels.data[i] / 255, pixels.data[i + 1] / 255, pixels.data[i + 2] / 255], setup.profile)
              const display = displayRgb(applyCube(camera, cube), setup)
              pixels.data.set(display.map(value => Math.round(value * 255)), i)
            }
            context.putImageData(pixels, 0, 0)
            return canvas.toDataURL()
          },
          catch: cause => new SamplePreviewError({ message: 'Photo preview failed. Retry or choose another photo.', cause }),
        })
      })
      void Effect.runPromise(work, { signal: controller.signal }).then(url => {
        if (!controller.signal.aborted) setResult({ key, url })
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'Photo preview failed.' })
      })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, source.url, setup])

  function browse(direction: number) {
    setCustom(null)
    setScene((scene + direction + scenes.length) % scenes.length)
  }
  return <section className="grid min-w-0 gap-3 rounded-xl border bg-card p-4" aria-label="Reference photo preview">
    <h2 className="text-lg font-semibold">How will your LUT look on an image?</h2>
    <p className="text-sm text-muted-foreground">Illustrative photo preview · {draft ? 'unapplied palette draft' : 'current output settings'}</p>
    <div className="grid gap-3 sm:grid-cols-2 touch-pan-y" onTouchStart={event => { const touch = event.touches[0]; swipe.current = { x: touch.clientX, y: touch.clientY } }} onTouchCancel={() => { swipe.current = null }} onTouchEnd={event => {
      const start = swipe.current
      swipe.current = null
      if (!start) return
      const touch = event.changedTouches[0], dx = touch.clientX - start.x, dy = touch.clientY - start.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) browse(dx < 0 ? 1 : -1)
    }}>
      <figure><img className="h-56 w-full rounded object-contain bg-muted" src={source.url} alt={`${source.name} original`} /><figcaption className="mt-1 text-sm">Original · {source.name}</figcaption></figure>
      <figure>{current?.url ? <img className="h-56 w-full rounded object-contain bg-muted" src={current.url} alt="Illustrative LUT result" /> : <div className="flex h-56 items-center justify-center rounded bg-muted p-4 text-sm" role="status">{current?.error ?? 'Updating photo preview…'}</div>}<figcaption className="mt-1 text-sm">{draft ? 'Draft result' : 'LUT result'} · {setup.profile} → {setup.target}</figcaption></figure>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" aria-label="Previous scene" onClick={() => browse(-1)}>←</Button>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">Scene<select aria-label="Scene" className="min-h-11 min-w-0 flex-1 rounded border bg-background px-2" value={custom ? 'custom' : scene} onChange={event => { setCustom(null); setScene(Number(event.target.value)) }}>{scenes.map((scene, index) => <option value={index} key={scene.name}>{scene.name}</option>)}{custom && <option value="custom">Your photo</option>}</select></label>
      <Button type="button" variant="outline" aria-label="Next scene" onClick={() => browse(1)}>→</Button>
      {current?.error && <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>Retry preview</Button>}
    </div>
    <details className="text-sm"><summary className="cursor-pointer">About this illustration &amp; photo credits</summary><p className="mt-2">{custom ? 'Your photo is interpreted by the browser as a display image; untagged files use browser color defaults.' : `${scenes[scene].credit}. Embedded profile: ${scenes[scene].profile}.`} The browser converts to sRGB. Display light is treated as scene light, converted to the camera gamut and approximately log-encoded before applying the actual generated cube. This cannot recover camera exposure or prove profile accuracy.</p><a className="underline" href="https://scikit-image.org/docs/0.25.x/api/skimage.data.html" target="_blank" rel="noreferrer">Sample sources and licenses</a></details>
    <Button type="button" variant="outline" className="justify-self-start" onClick={() => input.current?.click()}>Use your own photo</Button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose display photo" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      if (file.size > 20 * 1024 * 1024) { setResult({ key, error: 'Choose a photo smaller than 20 MiB.' }); return }
      setCustom({ url: URL.createObjectURL(file), name: file.name })
    }} />
  </section>
}
