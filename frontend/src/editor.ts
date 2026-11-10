import { cameraGray } from "./cameraReference.ts"
import type { RGB } from "./cubeSampling.ts"
import { setupIdentity, type ImportedLut } from "./importedLut.ts"

type Oklab = [number, number, number]
type ExposureScale = [number, number, number, number, number, number, number]

export type Band = { stop: number; width: number; color: string }
export type Mode = "stops" | "ire" | "fill"

export type Setup = {
  profile: string
  target: string
  cube_size: number
  bands: Band[]
  band_mode: "stops" | "ire"
  ire_basis?: "camera" | "target"
  fill_mode: boolean
  low_signal_warning: boolean
  low_signal_hex: string
  high_signal_warning: boolean
  high_signal_hex: string
  monochrome: boolean
  legal_range: boolean
  output: string
  imported_lut?: ImportedLut
}

type BandEditSnapshot = { setup: Setup; selection: number }
export type EditorState = BandEditSnapshot & {
  revision: number
  undo: (BandEditSnapshot & { after: Setup }) | null
  gesture: BandEditSnapshot | null
}

type EditorAction =
  | { type: "edit"; edit: (setup: Setup) => Setup; selection?: number }
  | { type: "add"; band: Band }
  | { type: "select"; selection: number }
  | { type: "import"; setup: Setup }
  | { type: "patch"; changes: Partial<Setup> }
  | { type: "begin" | "end" | "undo" }

export function createEditorState(setup: Setup): EditorState {
  return { setup, selection: 0, undo: null, gesture: null, revision: 0 }
}

export function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selection: Math.max(0, Math.min(action.selection, state.setup.bands.length - 1)),
      }
    case "import":
      return {
        ...state,
        setup: action.setup,
        selection: 0,
        undo: null,
        gesture: null,
        revision: state.revision + 1,
      }
    case "add": {
      const next = reduceEditor(state, {
        type: "edit",
        edit: (setup) => ({ ...setup, bands: orderBands([...setup.bands, action.band]) }),
      })
      return { ...next, selection: next.setup.bands.indexOf(action.band) }
    }
    case "patch":
      return {
        ...state,
        setup: { ...state.setup, ...action.changes },
        ...("imported_lut" in action.changes && action.changes.imported_lut !== state.setup.imported_lut
          ? { undo: null, gesture: null }
          : {}),
      }
    case "begin":
      return { ...state, gesture: { setup: state.setup, selection: state.selection } }
    case "end":
      return { ...state, gesture: null }
    case "undo": {
      if (!state.undo) return state
      const { setup, after, selection } = state.undo
      const changes: Partial<Setup> = { bands: setup.bands }
      if (setup.band_mode !== after.band_mode) changes.band_mode = setup.band_mode
      if (setup.ire_basis !== after.ire_basis) changes.ire_basis = setup.ire_basis
      if (setup.fill_mode !== after.fill_mode) changes.fill_mode = setup.fill_mode
      if (setup.monochrome !== after.monochrome) changes.monochrome = setup.monochrome
      return { ...state, setup: { ...state.setup, ...changes }, selection, undo: null }
    }
    case "edit": {
      const setup = action.edit(state.setup)
      if (JSON.stringify(setupIdentity(setup)) === JSON.stringify(setupIdentity(state.setup))) return state
      const selection = action.selection ?? state.selection
      const band = state.setup.bands[selection]
      const id = band && bandId(band)
      const index = setup.bands.findIndex((candidate) => bandId(candidate) === id)
      return {
        ...state,
        setup,
        selection: index < 0 ? Math.max(0, Math.min(selection, setup.bands.length - 1)) : index,
        undo: {
          ...(state.gesture ?? { setup: state.setup, selection: state.selection }),
          after: setup,
        },
      }
    }
  }
}

export type PaletteColor = { name: string; hex: string }
export const referenceEmphasisColors = [
  "#334e68",
  "#3b6c8e",
  "#4c8b93",
  "#22c55e",
  "#a3a044",
  "#a66b35",
  "#a33a3a",
] as const
export const darkToBrightColors: readonly string[] = [
  { l: 0.3, c: 0.06, h: 250 },
  { l: 0.46, c: 0.07, h: 230 },
  { l: 0.62, c: 0, h: 0 },
  { l: 0.78, c: 0.07, h: 80 },
  { l: 0.94, c: 0.035, h: 95 },
].map(oklchToHex)
const contrastZoneColors = [
  "#5b21b6",
  "#2563eb",
  "#38bdf8",
  "#2dd4bf",
  "#a6a6a6",
  "#facc15",
  "#f59e0b",
  "#f97316",
  "#dc2626",
]
export type OklchAnchor = { l: number; c: number; h: number; position?: number }
export type LightnessProfile = "ascending" | "even" | "custom"
export type GradientBlend = "colorful" | "direct"
export type HuePath = "shorter" | "longer"
export type PaletteMapping = "band-range" | "exposure"

export function exposureReferenceValue(
  setup: Pick<Setup, "band_mode"> & Partial<Pick<Setup, "profile" | "ire_basis">>,
) {
  if (setup.band_mode === "ire" && setup.ire_basis === "camera")
    return cameraGray[setup.profile as keyof typeof cameraGray]
  return setup.band_mode === "stops" ? 0 : (1.099 * 0.18 ** 0.45 - 0.099) * 100
}

export function exposurePaletteScale(
  setup: Pick<Setup, "band_mode"> & Partial<Pick<Setup, "profile" | "ire_basis">>,
): ExposureScale {
  if (setup.band_mode === "ire" && setup.ire_basis === "camera") {
    const reference = exposureReferenceValue(setup)
    return [
      reference / 4,
      reference / 2,
      (reference * 3) / 4,
      reference,
      reference + (100 - reference) / 4,
      reference + (100 - reference) / 2,
      reference + (100 - reference) * 0.8,
    ].map((value, index) => (index === 3 ? value : Number(value.toFixed(1)))) as ExposureScale
  }
  return setup.band_mode === "stops"
    ? [-3, -2, -1, 0, 1, 2, 3]
    : [10, 25, 35, exposureReferenceValue(setup), 55, 65, 80]
}
export type FillPreset = "standard" | "detailed"
export type BandPreset = "standard" | "detailed"

const NEW_BAND_COLOR_NAMES = ["red-500", "amber-500", "lime-500", "cyan-500", "blue-500", "violet-500", "pink-500"]

const FALSE_COLOR_NAMES = [
  "violet-800",
  "blue-600",
  "sky-400",
  "teal-400",
  "green-500",
  "lime-400",
  "yellow-400",
  "orange-500",
  "red-600",
]

const STOP_COLOR_LIMITS = [-3, -2, -1, -0.3, 0.3, 1, 2, 3]
const IRE_COLOR_LIMITS = [10, 25, 35, 38, 46, 55, 65, 80]
function ireColorLimits(setup: Setup) {
  if (setup.ire_basis !== "camera") return IRE_COLOR_LIMITS
  const scale = exposurePaletteScale(setup)
  const reference = exposureReferenceValue(setup)
  return [scale[0], scale[1], scale[2], reference - 2, reference + 2, scale[4], scale[5], scale[6]]
}
const STANDARD_FILL_COLOR_NAMES = ["blue-600", "sky-400", "lime-400", "yellow-400", "red-600"]

const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)

const hexToRgb = (hex: string) =>
  ([1, 3, 5] as const).map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255) as RGB

function hexToOklab(hex: string): Oklab {
  const [red, green, blue] = hexToRgb(hex).map(toLinear) as RGB
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabRgb([l, a, b]: Oklab): RGB {
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
  ]
}

function oklabToHex([l, a0, b0]: Oklab): string {
  let a = a0
  let b = b0
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const rgb = oklabRgb([l, a, b])
    // Matrix round trips can put sRGB boundary colors just outside the gamut.
    if (rgb.every((channel) => channel >= -1e-7 && channel <= 1 + 1e-7)) {
      return `#${rgb
        .map((channel) => {
          const value = Math.max(0, Math.min(1, channel))
          const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
          return Math.round(srgb * 255)
            .toString(16)
            .padStart(2, "0")
        })
        .join("")}`
    }
    a *= 0.9
    b *= 0.9
  }
  return oklabToHex([Math.max(0, Math.min(1, l)), 0, 0])
}

export function hexToOklch(hex: string): OklchAnchor {
  const [l, a, b] = hexToOklab(hex)
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

export function oklchToHex({ l, c, h }: OklchAnchor) {
  return oklabToHex(oklchToOklab({ l, c, h }))
}

function oklchToOklab({ l, c, h }: OklchAnchor): Oklab {
  const radians = ((((h % 360) + 360) % 360) * Math.PI) / 180
  return [Math.max(0, Math.min(1, l)), Math.max(0, c) * Math.cos(radians), Math.max(0, c) * Math.sin(radians)]
}

export function maxSrgbChroma(anchor: OklchAnchor) {
  let low = 0
  let high = 0.5
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const middle = (low + high) / 2
    const rgb = oklabRgb(oklchToOklab({ ...anchor, c: middle }))
    if (rgb.every((channel) => channel >= 0 && channel <= 1)) low = middle
    else high = middle
  }
  return low
}

export function oklabSeparation(left: OklchAnchor, right: OklchAnchor) {
  const first = oklchToOklab(left)
  const second = oklchToOklab(right)
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

let widestSrgbRampCache: [OklchAnchor, OklchAnchor] | undefined

export function widestSrgbRamp(): [OklchAnchor, OklchAnchor] {
  if (widestSrgbRampCache) return widestSrgbRampCache.map((anchor) => ({ ...anchor })) as [OklchAnchor, OklchAnchor]
  const candidates: OklchAnchor[] = []
  for (let l = 0.35; l <= 0.85; l += 0.05) {
    for (let h = 0; h < 360; h += 15) {
      const anchor = { l, c: 0, h }
      const c = maxSrgbChroma(anchor)
      if (c >= 0.1) candidates.push({ ...anchor, c })
    }
  }
  const [firstCandidate, secondCandidate] = candidates
  if (!firstCandidate || !secondCandidate) throw new Error("No sRGB hue/lightness samples have enough chroma.")
  let best: [OklchAnchor, OklchAnchor] = [firstCandidate, secondCandidate]
  let bestSeparation = 0
  // ponytail: coarse grid keeps this instant; refine the grid if endpoint precision becomes visible.
  for (const [left, leftCandidate] of candidates.entries()) {
    for (const rightCandidate of candidates.slice(left + 1)) {
      const sharedChroma = Math.min(leftCandidate.c, rightCandidate.c)
      const pair: [OklchAnchor, OklchAnchor] = [
        { ...leftCandidate, c: sharedChroma },
        { ...rightCandidate, c: sharedChroma },
      ]
      const separation = oklabSeparation(...pair)
      if (separation > bestSeparation) {
        best = pair
        bestSeparation = separation
      }
    }
  }
  widestSrgbRampCache = best
  return best.map((anchor) => ({ ...anchor })) as [OklchAnchor, OklchAnchor]
}

export function applyLightnessProfile(anchors: OklchAnchor[], profile: LightnessProfile) {
  if (profile === "custom" || anchors.length < 2) return anchors
  if (profile === "even") {
    const lightness = anchors.reduce((sum, anchor) => sum + anchor.l, 0) / anchors.length
    return anchors.map((anchor) => ({ ...anchor, l: lightness }))
  }
  return anchors.map((anchor, index) => ({
    ...anchor,
    l: 0.48 + (0.34 * index) / (anchors.length - 1),
  }))
}

export function vividRampAnchors(palette: PaletteColor[]) {
  const colors = new Map(palette.map(({ name, hex }) => [name, hex]))
  return FALSE_COLOR_NAMES.map((name) => colors.get(name))
    .filter((color): color is string => Boolean(color))
    .map(hexToOklch)
}

export function sampleOklabRamp(
  anchors: OklchAnchor[],
  amount: number,
  blend: GradientBlend = "direct",
  huePath: HuePath = "shorter",
) {
  const head = anchors[0]
  const tail = anchors.at(-1)
  if (!head || !tail) return "#000000"
  if (anchors.length === 1) return oklchToHex(head)
  const positions = anchors.map((anchor, index) => anchor.position ?? index / (anchors.length - 1))
  if (amount <= required(positions[0])) return oklchToHex(head)
  if (amount >= required(positions.at(-1))) return oklchToHex(tail)
  const left = positions.findIndex(
    (position, index) => index < positions.length - 1 && amount < required(positions[index + 1]) && amount >= position,
  )
  // left is -1 for NaN amounts or unsorted positions; the lookups below then fail loudly.
  const first = required(anchors[left])
  const second = required(anchors[left + 1])
  const start = required(positions[left])
  const fraction = (amount - start) / (required(positions[left + 1]) - start)
  if (blend === "colorful") {
    // Neutral colors have no meaningful hue; inherit the colored endpoint's hue.
    const firstHue = first.c < 0.000004 ? second.h : first.h
    const secondHue = second.c < 0.000004 ? firstHue : second.h
    let difference = secondHue - firstHue
    if (huePath === "shorter") {
      if (difference > 180) difference -= 360
      if (difference < -180) difference += 360
    } else {
      if (difference >= 0 && difference < 180) difference -= 360
      else if (difference < 0 && difference > -180) difference += 360
    }
    if (first.c < 0.000004 || second.c < 0.000004) difference = 0
    return oklchToHex({
      l: first.l + (second.l - first.l) * fraction,
      c: first.c + (second.c - first.c) * fraction,
      h: firstHue + difference * fraction,
    })
  }
  const [l1, a1, b1] = oklchToOklab(first)
  const [l2, a2, b2] = oklchToOklab(second)
  return oklabToHex([l1 + (l2 - l1) * fraction, a1 + (a2 - a1) * fraction, b1 + (b2 - b1) * fraction])
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new RangeError("Ramp sample is outside its anchors.")
  return value
}

export function activeRampAnchors(
  anchors: OklchAnchor[],
  profile: LightnessProfile,
  lowWarning: boolean,
  highWarning: boolean,
  reserveEndpoints = true,
) {
  const profiled = applyLightnessProfile(anchors, profile)
  return reserveEndpoints ? profiled.slice(lowWarning ? 1 : 0, highWarning ? -1 : undefined) : profiled
}

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export function hexToHsv(hex: string) {
  const [red, green, blue] = hexToRgb(hex)
  const maximum = Math.max(red, green, blue)
  const difference = maximum - Math.min(red, green, blue)
  const hue =
    difference === 0
      ? 0
      : maximum === red
        ? 60 * (((green - blue) / difference) % 6)
        : maximum === green
          ? 60 * ((blue - red) / difference + 2)
          : 60 * ((red - green) / difference + 4)
  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: maximum === 0 ? 0 : difference / maximum,
    value: maximum,
  }
}

export function hsvToHex(hue: number, saturation: number, value: number) {
  hue = ((hue % 360) + 360) % 360
  saturation = Math.max(0, Math.min(1, saturation))
  value = Math.max(0, Math.min(1, value))
  const chroma = value * saturation
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const match = value - chroma
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

export function snapBandValue(value: number, increment: number, minimum = -Infinity, maximum = Infinity) {
  const snapped = Number((Math.round(value / increment) * increment).toFixed(6))
  return Math.max(minimum, Math.min(maximum, snapped))
}

export function stepBandValue(
  value: number,
  direction: -1 | 1,
  increment: number,
  minimum = -Infinity,
  maximum = Infinity,
) {
  return Math.max(minimum, Math.min(maximum, Number((value + direction * increment).toFixed(6))))
}

export function contrastTextColor(hex: string) {
  const [red, green, blue] = hexToRgb(hex).map(toLinear) as RGB
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.059
  return whiteContrast >= darkContrast ? "#ffffff" : "#111827"
}

export function applyColorPreset(
  setup: Setup,
  palette: PaletteColor[],
  preset: "false-color" | "gradient",
  rampAnchors = vividRampAnchors(palette),
  lightnessProfile: LightnessProfile = "custom",
  reserveEndpoints = true,
  blend: GradientBlend = "direct",
  huePath: HuePath = "shorter",
  mapping: PaletteMapping = "band-range",
) {
  const colors = new Map(palette.map(({ name, hex }) => [name, hex]))
  const limits = setup.band_mode === "ire" ? ireColorLimits(setup) : STOP_COLOR_LIMITS
  const gradient = activeRampAnchors(
    rampAnchors,
    lightnessProfile,
    setup.low_signal_warning,
    setup.high_signal_warning,
    reserveEndpoints,
  )
  const minimum = Math.min(...setup.bands.map(({ stop }) => stop))
  const range = Math.max(1, Math.max(...setup.bands.map(({ stop }) => stop)) - minimum)
  return {
    ...setup,
    bands: setup.bands.map((band, index) => {
      if (preset === "gradient") {
        let amount = (band.stop - minimum) / range
        if (mapping === "exposure") {
          const reference = exposureReferenceValue(setup)
          const low = setup.bands[index - 1]?.stop ?? -Infinity
          const high = index === setup.bands.length - 1 ? Infinity : band.stop
          // Fill stops are boundaries, so sample inside each zone, including the reference zone.
          const value = !setup.fill_mode
            ? Math.abs(band.stop - reference) <= band.width
              ? reference
              : band.stop
            : low <= reference && reference < high
              ? reference
              : !Number.isFinite(low) || !Number.isFinite(high)
                ? band.stop
                : (low + high) / 2
          const scale = exposurePaletteScale(setup)
          amount = exposureAmount(scale, value)
          if (
            setup.fill_mode &&
            !(low <= reference && reference < high) &&
            (!Number.isFinite(low) || !Number.isFinite(high))
          )
            amount = high <= reference ? 0 : 1
        }
        return gradient.length > 0 ? copyBand(band, { color: sampleOklabRamp(gradient, amount, blend, huePath) }) : band
      }
      const colorIndex = limits.findIndex((limit) => band.stop <= limit)
      return copyBand(band, {
        color: colors.get(FALSE_COLOR_NAMES[colorIndex < 0 ? 8 : colorIndex] ?? "") ?? band.color,
      })
    }),
  }
}

/** Position of a value along the exposure scale, 0 to 1 across its six segments. */
function exposureAmount(scale: ExposureScale, value: number) {
  const upper = scale.findIndex((threshold) => value <= threshold)
  if (upper < 0) return 1
  const lower = scale[upper - 1]
  if (lower === undefined) return 0
  return (upper - 1 + (value - lower) / (required(scale[upper]) - lower)) / 6
}

export function applyFillPreset(setup: Setup, palette: PaletteColor[], preset: FillPreset) {
  const colors = new Map(palette.map(({ name, hex }) => [name, hex]))
  const detailed = preset === "detailed"
  const boundaries = detailed
    ? setup.band_mode === "ire"
      ? IRE_COLOR_LIMITS
      : STOP_COLOR_LIMITS
    : setup.band_mode === "ire"
      ? [10, 35, 55, 80]
      : [-1.25, -0.5, 0.5, 1.25]
  const names = detailed ? FALSE_COLOR_NAMES : STANDARD_FILL_COLOR_NAMES
  const finalStop = boundaries.at(-1)! + (setup.band_mode === "ire" ? 10 : 1)
  return {
    ...setup,
    fill_mode: true,
    monochrome: false,
    bands: names.map((name, index) => ({
      stop: boundaries[index] ?? finalStop,
      width: 0,
      color: colors.get(name) ?? setup.bands[index]?.color ?? "#ffffff",
    })),
  }
}

export function applyBandPreset(setup: Setup, palette: PaletteColor[], preset: BandPreset) {
  const detailed = preset === "detailed"
  let centers =
    setup.band_mode === "ire"
      ? detailed
        ? [10, 25, 35, 38, 46, 55, 65, 80, 95]
        : [10, 25, 40, 50, 60, 75, 90]
      : detailed
        ? [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
        : [-3, -2, -1, 0, 1, 2, 3]
  if (setup.band_mode === "ire" && setup.ire_basis === "camera") {
    const scale = exposurePaletteScale(setup)
    centers = detailed ? [...scale.slice(0, 3), scale[3] - 4, scale[3], scale[3] + 4, ...scale.slice(4)] : scale
  }
  return applyColorPreset(
    {
      ...setup,
      fill_mode: false,
      bands: centers.map((stop) => ({
        stop,
        width: setup.band_mode === "ire" ? 3 : 0.3,
        color: "#ffffff",
      })),
    },
    palette,
    "false-color",
  )
}

export type ExposurePreset =
  | "three-band"
  | "contrast-checker"
  | "camera-ire"
  | "reference-emphasis"
  | "portrait-contrast"
  | "wide-contrast"
  | "highlight-placement"
  | "shadow-placement"

const bandsOf = (width: number, stopsAndColors: [stop: number, color: string][]): Band[] =>
  stopsAndColors.map(([stop, color]) => ({ stop, width, color }))

export function applyExposurePreset(
  setup: Setup,
  palette: PaletteColor[],
  preset: ExposurePreset,
  arrangement?: BandPreset,
): Setup {
  let next: Setup = {
    ...setup,
    band_mode: "stops",
    fill_mode: false,
    monochrome: !setup.imported_lut,
    bands: [],
  }
  switch (preset) {
    case "camera-ire":
      next = applyBandPreset(
        { ...setup, band_mode: "ire", ire_basis: "camera", monochrome: !setup.imported_lut },
        palette,
        "standard",
      )
      break
    case "three-band":
      next.bands = bandsOf(0.3, [
        [-2, "#2563eb"],
        [0, "#22c55e"],
        [2, "#f97316"],
      ])
      break
    case "contrast-checker":
    case "reference-emphasis":
      next.fill_mode = true
      next.monochrome = false
      // Fill stores upper zone boundaries; the final zone extends beyond its stored boundary.
      next.bands = (preset === "contrast-checker" ? darkToBrightColors : referenceEmphasisColors).map(
        (color, index, colors) => ({ stop: index - (colors.length - 2) / 2, width: 0, color }),
      )
      break
    case "portrait-contrast":
    case "wide-contrast": {
      const step = preset === "portrait-contrast" ? 0.5 : 1
      next.fill_mode = true
      next.monochrome = false
      next.bands = contrastZoneColors.map((color, index) => ({
        stop: (index - 3.5) * step,
        width: 0,
        color,
      }))
      break
    }
    case "highlight-placement":
      next.bands = bandsOf(0.5, [
        [2, "#facc15"],
        [3, "#f59e0b"],
        [4, "#f97316"],
        [5, "#dc2626"],
      ])
      break
    case "shadow-placement":
      next.bands = bandsOf(0.5, [
        [-5, "#5b21b6"],
        [-4, "#2563eb"],
        [-3, "#38bdf8"],
        [-2, "#2dd4bf"],
      ])
      break
  }
  return arrangement
    ? next.fill_mode
      ? applyFillPreset(next, palette, arrangement)
      : applyBandPreset(next, palette, arrangement)
    : next
}

const creationOrder = new WeakMap<Band, number>()
let nextCreationOrder = 0

function rememberCreationOrder(bands: Band[]) {
  for (const band of bands) {
    if (!creationOrder.has(band)) creationOrder.set(band, nextCreationOrder++)
  }
}

export function resizeBandWidth(stop: number, edge: number) {
  return snapBandValue(Math.abs(edge - stop), 0.1, 0.1)
}

export function bandId(band: Band) {
  rememberCreationOrder([band])
  return creationOrder.get(band)!
}

function copyBand(band: Band, changes: Partial<Band>) {
  const updated = { ...band, ...changes }
  creationOrder.set(updated, bandId(band))
  return updated
}

export function createBand(bands: Band[], mode: "stops" | "ire", palette: PaletteColor[]) {
  const width = mode === "ire" ? 2 : 0.3
  const center = mode === "ire" ? 50 : 0
  const spacing = mode === "ire" ? 5 : 1
  const [minimum, maximum] = mode === "ire" ? [0, 100] : [-7, 7]
  const directions = bands.length % 2 ? [1, -1] : [-1, 1]
  let stop: number | undefined

  findStop: for (let distance = 1; distance <= (maximum - minimum) / spacing; distance++) {
    for (const direction of directions) {
      const candidate = center + direction * distance * spacing
      if (
        candidate >= minimum &&
        candidate <= maximum &&
        bands.every((band) => Math.abs(candidate - band.stop) >= width + band.width)
      ) {
        stop = candidate
        break findStop
      }
    }
  }

  if (stop === undefined) return undefined

  const usedColors = new Set(bands.map((band) => band.color.toLowerCase()))
  const preferredColors = NEW_BAND_COLOR_NAMES.flatMap((name) => {
    const color = palette.find((entry) => entry.name === name)
    return color ? [color] : []
  })
  const choices = preferredColors.length ? preferredColors : palette
  const color =
    choices.find(({ hex }) => !usedColors.has(hex.toLowerCase()))?.hex ??
    choices[bands.length % choices.length]?.hex ??
    "#eab308"
  return { stop, width, color }
}

export function orderBands(bands: Band[]) {
  rememberCreationOrder(bands)
  return [...bands].sort(
    (left, right) => left.stop - right.stop || creationOrder.get(left)! - creationOrder.get(right)!,
  )
}

export function changeMode(setup: Setup, mode: Mode, palette?: PaletteColor[]): Setup {
  const changed: Setup = {
    ...setup,
    band_mode: mode === "ire" ? "ire" : "stops",
    ...(mode === "ire" ? { ire_basis: "camera" as const } : {}),
    fill_mode: mode === "fill",
    monochrome: mode === "fill" ? false : setup.monochrome,
  }
  if (!palette) return changed
  if (mode === "fill") return applyFillPreset(changed, palette, "standard")
  return setup.band_mode === changed.band_mode && setup.ire_basis === changed.ire_basis && !setup.fill_mode
    ? changed
    : applyBandPreset(changed, palette, "standard")
}

export function updateBand(setup: Setup, index: number, changes: Partial<Band>): Setup {
  rememberCreationOrder(setup.bands)
  return {
    ...setup,
    bands: orderBands(
      setup.bands.map((band, current) => {
        if (current !== index) return band
        return copyBand(band, changes)
      }),
    ),
  }
}

export function removeBand(setup: Setup, index: number): Setup {
  return { ...setup, bands: setup.bands.filter((_, current) => current !== index) }
}

export function updateFillBoundary(setup: Setup, index: number, stop: number, increment: number): Setup {
  if (index < 0 || index >= setup.bands.length - 1) return setup
  const previous = setup.bands[index - 1]
  const next = setup.bands[index + 1]
  const minimum = previous ? previous.stop + increment : -Infinity
  const maximum = next && index !== setup.bands.length - 2 ? next.stop - increment : Infinity
  const boundary = Math.max(minimum, Math.min(maximum, stop))
  const bands = setup.bands.map((band, current) => (current === index ? copyBand(band, { stop: boundary }) : band))
  const last = bands.length - 1
  const lastBand = bands[last]
  const beforeLast = bands[last - 1]
  // The index guard above leaves at least two bands.
  if (lastBand && beforeLast)
    bands[last] = copyBand(lastBand, { stop: Math.max(lastBand.stop, beforeLast.stop + increment) })
  return { ...setup, bands }
}

export function filterPalette(palette: PaletteColor[], search: string) {
  const query = search.trim().toLowerCase()
  return query ? palette.filter(({ name, hex }) => name.includes(query) || hex.includes(query)) : palette
}

export function exportSetup(setup: Setup) {
  return JSON.stringify({ version: setup.imported_lut ? 3 : 1, ...setup, bands: orderBands(setup.bands) }, null, 2)
}

export async function importSetup(text: string, validate: (candidate: Setup) => Promise<Setup>) {
  const validated = await validate(parseSetupImport(text))
  return { ...validated, bands: orderBands(validated.bands) }
}

export function parseSetupImport(text: string): Setup {
  let candidate: unknown
  try {
    candidate = JSON.parse(text)
  } catch {
    throw new Error("Import must be valid JSON.")
  }
  if (!candidate || typeof candidate !== "object" || ![1, 2, 3].includes((candidate as { version: number }).version)) {
    throw new Error("Import must be a supported version-1, version-2 or version-3 LUT Builder configuration.")
  }
  if ((candidate as { version: number }).version === 3 && !(candidate as { imported_lut?: unknown }).imported_lut)
    throw new Error("Imported LUT is missing. Reattach the original .cube; no substitute was used.")
  if ((candidate as { version: number }).version !== 3 && (candidate as { imported_lut?: unknown }).imported_lut)
    throw new Error("Imported LUT setups require version 3 to prevent older applications silently dropping the look.")
  const setup = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "version")) as Setup
  return setup
}
