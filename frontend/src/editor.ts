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

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

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

const creationOrder = new WeakMap<Band, number>()
let nextCreationOrder = 0

function rememberCreationOrder(bands: Band[]) {
  for (const band of bands) {
    if (!creationOrder.has(band)) creationOrder.set(band, nextCreationOrder++)
  }
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
