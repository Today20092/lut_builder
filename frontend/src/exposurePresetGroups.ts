import { Gauge, PaintBucket, Sun, type LucideIcon } from "lucide-react"
import type { BandPreset, ExposurePreset } from "./editor"

export const exposurePresetGroups: {
  mode: string
  summary: string
  icon: LucideIcon
  presets: {
    id: ExposurePreset
    arrangement?: BandPreset
    name: string
    detail: string
    starter?: boolean
  }[]
}[] = [
  {
    mode: "IRE",
    summary: "Separate bands placed on your camera’s recorded signal level. Exposure between them is left unmarked.",
    icon: Gauge,
    presets: [
      {
        id: "camera-ire",
        name: "Camera-log IRE",
        detail: "7 bands anchored to your camera’s log levels.",
        starter: true,
      },
      {
        id: "camera-ire",
        arrangement: "detailed",
        name: "Detailed IRE",
        detail: "9 camera-log bands for finer exposure checks.",
        starter: true,
      },
    ],
  },
  {
    mode: "Fill",
    summary: "Continuous color zones measured in stops from reference, covering the whole exposure range.",
    icon: PaintBucket,
    presets: [
      {
        id: "contrast-checker",
        name: "Contrast Checker",
        detail: "5 continuous zones for comparing face and scene contrast.",
        starter: true,
      },
      {
        id: "portrait-contrast",
        name: "Portrait contrast",
        detail: "Half-stop zones from −2 to +2 for comparing key and fill across a face.",
      },
      {
        id: "wide-contrast",
        name: "Wide contrast",
        detail: "One-stop zones from −4 to +4 for interiors, windows and strong lighting differences.",
      },
      {
        id: "reference-emphasis",
        name: "Reference emphasis",
        detail: "7 continuous zones with a bright green reference and quieter surrounding colors.",
      },
      {
        id: "contrast-checker",
        arrangement: "standard",
        name: "Standard Fill",
        detail: "5 false-color zones across the exposure range.",
      },
      {
        id: "contrast-checker",
        arrangement: "detailed",
        name: "Detailed Fill",
        detail: "9 false-color zones for a more detailed exposure map.",
        starter: true,
      },
    ],
  },
  {
    mode: "Stops",
    summary: "Separate bands measured in stops from reference. Exposure between them is left unmarked.",
    icon: Sun,
    presets: [
      {
        id: "three-band",
        name: "Three-band Exposure",
        detail: "Blue at −2, green at 0, orange at +2 stops.",
        starter: true,
      },
      {
        id: "highlight-placement",
        name: "Highlight placement",
        detail: "One-stop markers at +2, +3, +4 and +5 over a monochrome base; keeps imported looks.",
      },
      {
        id: "shadow-placement",
        name: "Shadow placement",
        detail: "One-stop markers at −2, −3, −4 and −5 over a monochrome base; keeps imported looks.",
      },
      {
        id: "three-band",
        arrangement: "standard",
        name: "Standard Stops",
        detail: "7 bands from −3 to +3 stops.",
        starter: true,
      },
      {
        id: "three-band",
        arrangement: "detailed",
        name: "Detailed Stops",
        detail: "10 bands from −4 to +5 stops.",
      },
    ],
  },
]
