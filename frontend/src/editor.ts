export type Band = { stop: number; width: number; color: string }
export type Mode = "stops" | "ire" | "fill"

export type Setup = {
  profile: string
  target: string
  cube_size: number
  bands: Band[]
  band_mode: "stops" | "ire"
  fill_mode: boolean
  low_signal_warning: boolean
  low_signal_hex: string
  high_signal_warning: boolean
  high_signal_hex: string
  monochrome: boolean
  legal_range: boolean
  output: string
}

export type PaletteColor = { name: string; hex: string }

const NEW_BAND_COLOR_NAMES = [
  "red-500", "amber-500", "lime-500", "cyan-500",
  "blue-500", "violet-500", "pink-500",
]

const FALSE_COLOR_NAMES = [
  "violet-800", "blue-600", "sky-400", "teal-400", "green-500",
  "lime-400", "yellow-400", "orange-500", "red-600",
]

const STOP_COLOR_LIMITS = [-3, -2, -1, -0.3, 0.3, 1, 2, 3]
const IRE_COLOR_LIMITS = [10, 25, 35, 38, 46, 55, 65, 80]

function mixOklab(left: string, right: string, amount: number) {
  const toLinear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  const toOklab = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map((start) => toLinear(Number.parseInt(hex.slice(start, start + 2), 16) / 255))
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
  }
  const [l1, a1, b1] = toOklab(left)
  const [l2, a2, b2] = toOklab(right)
  const l = l1 + (l2 - l1) * amount
  const a = a1 + (a2 - a1) * amount
  const b = b1 + (b2 - b1) * amount
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const toHex = (value: number) => {
    const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255).toString(16).padStart(2, "0")
  }
  return `#${toHex(4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss)}${toHex(-1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss)}${toHex(-0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss)}`
}

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

export function hexToHsv(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const maximum = Math.max(red, green, blue)
  const difference = maximum - Math.min(red, green, blue)
  const hue = difference === 0 ? 0
    : maximum === red ? 60 * (((green - blue) / difference) % 6)
      : maximum === green ? 60 * ((blue - red) / difference + 2)
        : 60 * ((red - green) / difference + 4)
  return { hue: hue < 0 ? hue + 360 : hue, saturation: maximum === 0 ? 0 : difference / maximum, value: maximum }
}

export function hsvToHex(hue: number, saturation: number, value: number) {
  hue = ((hue % 360) + 360) % 360
  saturation = Math.max(0, Math.min(1, saturation))
  value = Math.max(0, Math.min(1, value))
  const chroma = value * saturation
  const segment = hue / 60
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1))
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  const match = value - chroma
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`
}

export function snapBandValue(
  value: number,
  increment: number,
  minimum = -Infinity,
  maximum = Infinity,
) {
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
  return snapBandValue(value + direction * increment, increment, minimum, maximum)
}

export function wheelStepDirection(
  deltaY: number,
  ctrlKey: boolean,
  metaKey: boolean,
): -1 | 0 | 1 {
  if (ctrlKey || metaKey || deltaY === 0) return 0
  return deltaY < 0 ? 1 : -1
}

export function contrastTextColor(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  const whiteContrast = 1.05 / (luminance + 0.05)
  const darkContrast = (luminance + 0.05) / 0.059
  return whiteContrast >= darkContrast ? "#ffffff" : "#111827"
}

export function applyColorPreset(
  setup: Setup,
  palette: PaletteColor[],
  preset: "false-color" | "gradient",
) {
  const colors = new Map(palette.map(({ name, hex }) => [name, hex]))
  const limits = setup.band_mode === "ire" ? IRE_COLOR_LIMITS : STOP_COLOR_LIMITS
  const gradient = FALSE_COLOR_NAMES.map((name) => colors.get(name)).filter((color): color is string => Boolean(color))
  const minimum = Math.min(...setup.bands.map(({ stop }) => stop))
  const range = Math.max(1, Math.max(...setup.bands.map(({ stop }) => stop)) - minimum)
  return {
    ...setup,
    bands: setup.bands.map((band) => {
      if (preset === "gradient" && gradient.length > 1) {
        const position = (band.stop - minimum) / range * (gradient.length - 1)
        const left = Math.min(Math.floor(position), gradient.length - 2)
        return { ...band, color: mixOklab(gradient[left], gradient[left + 1], position - left) }
      }
      const colorIndex = limits.findIndex((limit) => band.stop <= limit)
      return { ...band, color: colors.get(FALSE_COLOR_NAMES[colorIndex < 0 ? 8 : colorIndex]) ?? band.color }
    }),
  }
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

export function createBand(
  bands: Band[],
  mode: "stops" | "ire",
  palette: PaletteColor[],
) {
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
  const color = choices.find(({ hex }) => !usedColors.has(hex.toLowerCase()))?.hex
    ?? choices[bands.length % choices.length]?.hex
    ?? "#eab308"
  return { stop, width, color }
}

export function orderBands(bands: Band[]) {
  rememberCreationOrder(bands)
  return [...bands].sort(
    (left, right) =>
      left.stop - right.stop || creationOrder.get(left)! - creationOrder.get(right)!,
  )
}

export function changeMode(setup: Setup, mode: Mode): Setup {
  return {
    ...setup,
    band_mode: mode === "ire" ? "ire" : "stops",
    fill_mode: mode === "fill",
    monochrome: mode === "fill" ? false : setup.monochrome,
  }
}

export function updateBand(
  setup: Setup,
  index: number,
  changes: Partial<Band>,
): Setup {
  rememberCreationOrder(setup.bands)
  return {
    ...setup,
    bands: orderBands(
      setup.bands.map((band, current) => {
        if (current !== index) return band
        const updated = { ...band, ...changes }
        creationOrder.set(updated, creationOrder.get(band)!)
        return updated
      }),
    ),
  }
}

export function updateFillBoundary(
  setup: Setup,
  index: number,
  stop: number,
  increment: number,
): Setup {
  if (index < 0 || index >= setup.bands.length - 1) return setup
  const minimum = index === 0 ? -Infinity : setup.bands[index - 1].stop + increment
  const maximum = index === setup.bands.length - 2
    ? Infinity
    : setup.bands[index + 1].stop - increment
  const boundary = Math.max(minimum, Math.min(maximum, stop))
  const bands = setup.bands.map((band, current) =>
    current === index ? { ...band, stop: boundary } : band,
  )
  const last = bands.length - 1
  bands[last] = { ...bands[last], stop: Math.max(bands[last].stop, bands[last - 1].stop + increment) }
  return { ...setup, bands }
}

export function filterPalette(palette: PaletteColor[], search: string) {
  const query = search.trim().toLowerCase()
  return query
    ? palette.filter(
        ({ name, hex }) => name.includes(query) || hex.includes(query),
      )
    : palette
}

export function exportSetup(setup: Setup) {
  return JSON.stringify({ version: 1, ...setup, bands: orderBands(setup.bands) }, null, 2)
}

export async function importSetup(
  text: string,
  validate: (candidate: Setup) => Promise<Setup>,
) {
  let candidate: unknown
  try {
    candidate = JSON.parse(text)
  } catch {
    throw new Error("Import must be valid JSON.")
  }
  if (!candidate || typeof candidate !== "object" || (candidate as { version?: number }).version !== 1) {
    throw new Error("Import must be a version-1 LUT Builder configuration.")
  }
  const setup = Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== "version"),
  ) as Setup
  return validate({ ...setup, bands: orderBands(setup.bands) })
}
