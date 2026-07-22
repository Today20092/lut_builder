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

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

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
  return {
    ...setup,
    bands: setup.bands.map((band, current) =>
      current === index ? { ...band, ...changes } : band,
    ),
  }
}

export function moveBand(setup: Setup, from: number, to: number): Setup {
  if (from === to || from < 0 || to < 0 || from >= setup.bands.length || to >= setup.bands.length) {
    return setup
  }
  const bands = [...setup.bands]
  const [band] = bands.splice(from, 1)
  bands.splice(to, 0, band)
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
  return JSON.stringify({ version: 1, ...setup }, null, 2)
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
  return validate(setup)
}
