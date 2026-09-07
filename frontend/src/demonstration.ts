import type { Setup } from "./editor"

export function previewColorAt(colors: string[], luminance: number) {
  return colors[Math.round(Math.max(0, Math.min(1, luminance)) * (colors.length - 1))] ?? "#000000"
}

export function previewOverlayAt(colors: (string | null)[], luminance: number) {
  return colors[Math.round(Math.max(0, Math.min(1, luminance)) * (colors.length - 1))] ?? null
}

export function displayPreviewOverlayAt(
  colors: (string | null)[],
  luminance: number,
  minimum: number,
  maximum: number,
  unit: string,
) {
  const exposure = unit === "IRE"
    ? luminance * 100
    : Math.log2(Math.max(luminance, 1e-6) / 0.18)
  return previewOverlayAt(colors, (exposure - minimum) / (maximum - minimum))
}

export function overlayForExposure(setup: Setup, exposure: number) {
  if (setup.fill_mode && setup.bands.length) {
    const bands = [...setup.bands].sort((left, right) => left.stop - right.stop)
    return bands.find((band) => exposure < band.stop)?.color ?? bands.at(-1)!.color
  }
  let color: string | null = null
  for (const band of setup.bands) {
    if (Math.abs(exposure - band.stop) <= band.width) color = band.color
  }
  return color
}
