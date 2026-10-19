import { logDecodeAtGrid, sourceToTargetMatrices } from './lutColorData.ts'
import type { RGB } from './verificationMath.ts'

const srgbToCamera = Object.fromEntries(Object.entries(sourceToTargetMatrices).map(([profile, targets]) => {
  const [a, b, c, d, e, f, g, h, i] = targets['Rec.709']
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  return [profile, [[e * i - f * h, c * h - b * i, b * f - c * e], [f * g - d * i, a * i - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]].map(row => row.map(value => value / determinant))]
}))

// Illustrative reconstruction: display-linear light is not original scene exposure.
export function cameraInputFromSrgb(rgb: RGB, profile: string): RGB {
  const matrix = srgbToCamera[profile]
  const grid = logDecodeAtGrid[profile as keyof typeof logDecodeAtGrid]
  if (!matrix || !grid) throw new Error('Unsupported sample preview profile.')
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return matrix.map(row => {
    const value = row.reduce((sum, coefficient, index) => sum + coefficient * linear[index], 0)
    if (value <= grid[0]) return 0
    const upper = grid.findIndex(node => node >= value)
    if (upper < 0) return 1
    // shortcut: invert the bundled 65-node decoder by interpolation; use exact encoders for calibrated scene reconstruction.
    return (upper - 1 + (value - grid[upper - 1]) / (grid[upper] - grid[upper - 1])) / 64
  }) as RGB
}
