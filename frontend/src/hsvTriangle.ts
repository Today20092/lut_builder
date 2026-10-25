export type PickerPoint = { x: number; y: number }
export const hsvPickerCenter = 110
export const hsvTriangleRadius = 74

function rotate(point: PickerPoint, hue: number): PickerPoint {
  const angle = hue * Math.PI / 180
  const x = point.x - hsvPickerCenter
  const y = point.y - hsvPickerCenter
  return { x: hsvPickerCenter + x * Math.cos(angle) - y * Math.sin(angle), y: hsvPickerCenter + x * Math.sin(angle) + y * Math.cos(angle) }
}

/** Hue, white and black vertex weights in the unrotated triangle. */
export function triangleWeights(point: PickerPoint) {
  const hue = ((point.x - hsvPickerCenter) / hsvTriangleRadius + 0.5) / 1.5
  const white = (1 - hue - (point.y - hsvPickerCenter) / (hsvTriangleRadius * Math.sqrt(3) / 2)) / 2
  return [hue, white, 1 - hue - white] as const
}

export function hsvTrianglePoint(saturation: number, value: number, hue: number): PickerPoint {
  return rotate({ x: hsvPickerCenter + hsvTriangleRadius * (1.5 * saturation * value - 0.5), y: hsvPickerCenter + hsvTriangleRadius * Math.sqrt(3) / 2 * (1 - 2 * value + saturation * value) }, hue)
}

export function hsvTriangleValue(point: PickerPoint, hue: number) {
  const weights = triangleWeights(rotate(point, -hue)).map(weight => Math.max(0, weight))
  const total = weights[0] + weights[1] + weights[2]
  const value = (weights[0] + weights[1]) / total
  return { saturation: value > 1e-10 ? weights[0] / (weights[0] + weights[1]) : 0, value }
}

export function hsvTriangleContains(point: PickerPoint, hue: number) {
  return triangleWeights(rotate(point, -hue)).every(weight => weight >= -1e-7)
}

export function hueWheelPoint(hue: number): PickerPoint {
  return rotate({ x: hsvPickerCenter + 91, y: hsvPickerCenter }, hue)
}

export function hueWheelValue(point: PickerPoint) {
  return (Math.atan2(point.y - hsvPickerCenter, point.x - hsvPickerCenter) * 180 / Math.PI + 360) % 360
}
