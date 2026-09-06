// PROTOTYPE: in-memory illustration, not a camera transform or LUT verifier.
import { applyLightnessProfile, hexToOklch, sampleOklabRamp } from "./editor.ts"
import type { Band, LightnessProfile } from "./editor.ts"

export const palettes = {
  spectrum: { name: "Exposure spectrum", description: "Cool shadows, green midtones, warm highlights", colors: ["#6d55d8", "#368ae8", "#52b4bd", "#64bb82", "#e7c861", "#ed9659", "#da626b"] },
  ocean: { name: "Ocean to amber", description: "A quieter transition from blue to gold", colors: ["#4769d8", "#54a9bb", "#d8c477", "#e8a360"] },
  contrast: { name: "Purple to lime", description: "Two distinct endpoints with a simple transition", colors: ["#8d58bd", "#8fce69"] },
}
export type Draft = { palette: keyof typeof palettes; brightness: LightnessProfile; intensity: number }
export const initialDraft: Draft = { palette: "spectrum", brightness: "custom", intensity: 100 }
export function recolor(bands: Band[], draft: Draft): Band[] {
  const anchors = applyLightnessProfile(palettes[draft.palette].colors.map(hexToOklch), draft.brightness)
    .map(a => ({ ...a, c: a.c * draft.intensity / 100 }))
  const lo = Math.min(...bands.map(b => b.stop))
  const hi = Math.max(...bands.map(b => b.stop))
  return bands.map(b => ({ ...b, color: sampleOklabRamp(anchors, hi === lo ? 0.5 : (b.stop - lo) / (hi - lo)) }))
}
export function initialBands(count = 7): Band[] {
  return recolor(Array.from({ length: count }, (_, i) => ({ stop: Math.round((-4 + 8 * i / (count - 1)) * 4) / 4, width: 0.4, color: "#ffffff" })), initialDraft)
}
export function moveBand(bands: Band[], index: number, stop: number): Band[] {
  if (!Number.isFinite(stop)) return bands
  return bands.map((b, i) => i === index ? { ...b, stop: Math.max(-7 + b.width, Math.min(7 - b.width, Math.round(stop * 4) / 4)) } : b)
}
export function editedColorPixel(rgb: number[], bands: Band[], opacity: number): number[] {
  const linear = rgb.map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
  const exposure = Math.log2(Math.max(1e-8, 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]) / 0.18)
  const band = bands.filter(b => Math.abs(exposure - b.stop) <= b.width).at(-1)
  if (!band) return rgb
  return rgb.map((v, i) => Math.round(v * (1 - opacity) + parseInt(band.color.slice(1 + 2 * i, 3 + 2 * i), 16) * opacity))
}
