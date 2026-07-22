import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

declare global {
  interface Window {
    LUT_BUILDER_TOKEN: string
    LUT_BUILDER_SETUP: {
      profile: string
      target: string
      cube_size: number
      bands: { stop: number; width: number }[]
      band_mode: string
      monochrome: boolean
      legal_range: boolean
      output: string
    }
  }
}

const defaultSetup = window.LUT_BUILDER_SETUP
const defaultBand = defaultSetup.bands[0]
const setup = [
  ["Camera", defaultSetup.profile],
  ["Target", defaultSetup.target],
  ["Cube", `${defaultSetup.cube_size}³`],
  ["Mode", defaultSetup.band_mode === "stops" ? "Stops" : "IRE"],
  ["Base", defaultSetup.monochrome ? "Monochrome" : "Color"],
  ["Signal", defaultSetup.legal_range ? "Legal range" : "Full range"],
]

export function App() {
  const [status, setStatus] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  async function generate() {
    setIsGenerating(true)
    setStatus(`Generating ${defaultSetup.cube_size}³ LUT…`)
    try {
      const response = await fetch("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LUT-Builder-Token": window.LUT_BUILDER_TOKEN,
        },
        body: "{}",
      })
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        throw new Error(result.error || "Generation failed")
      }
      const link = document.createElement("a")
      link.href = URL.createObjectURL(await response.blob())
      link.download = defaultSetup.output
      link.click()
      URL.revokeObjectURL(link.href)
      setStatus("LUT downloaded.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 py-10 sm:p-8 sm:py-14">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">
          LUT Builder
        </h1>
        <p className="text-muted-foreground">Local diagnostic LUT workspace</p>
      </header>

      <section className="grid flex-1 gap-5 md:grid-cols-[1.4fr_0.8fr]">
        <Card className="bg-preview-middle-grey text-white">
          <CardHeader>
            <CardTitle>Exposure preview</CardTitle>
            <CardDescription className="text-white/70">
              Useful middle-grey default
            </CardDescription>
          </CardHeader>
          <CardContent className="grid flex-1 place-items-center py-8">
            <div className="grid aspect-square w-3/5 max-w-64 place-items-center rounded-full border-2 border-white/50 text-center">
              <span>
                <strong className="block text-3xl">{defaultBand.stop} stop</strong>
                Suggested middle grey
                <br />
                ±{defaultBand.width} stops
              </span>
            </div>
          </CardContent>
          <CardFooter className="border-white/20 bg-black/10 text-white/75">
            Preview only — generation uses the shared Python engine.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default setup</CardTitle>
            <CardDescription>Ready to generate locally.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-3">
              {setup.map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3">
            <Button size="lg" disabled={isGenerating} onClick={generate}>
              {isGenerating && <Spinner data-icon="inline-start" />}
              {isGenerating ? "Generating…" : "Generate .cube"}
            </Button>
            <p
              className="min-h-5 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
          </CardFooter>
        </Card>
      </section>
    </main>
  )
}

export default App
