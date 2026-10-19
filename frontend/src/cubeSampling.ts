export type RGB = [number, number, number]
export type CubeTable = { size: number; table: Float64Array }

/** Tetrahedral sampling, red-fastest table. Clamp only the declared input boundary. */
export function applyCube(rgb: ArrayLike<number>, { size, table }: CubeTable): RGB {
  const positions = [0, 1, 2].map((c) => Math.max(0, Math.min(1, rgb[c])) * (size - 1))
  const low = positions.map((p) => Math.min(Math.floor(p), size - 2))
  const f = positions.map((p, c) => p - low[c])
  const order = [0, 1, 2].sort((a, b) => f[b] - f[a])
  const stride = [3, size * 3, size * size * 3]
  const a = low[0] * stride[0] + low[1] * stride[1] + low[2] * stride[2]
  const b = a + stride[order[0]], c = b + stride[order[1]], d = c + stride[order[2]]
  return [0, 1, 2].map((channel) => table[a + channel] * (1 - f[order[0]]) + table[b + channel] * (f[order[0]] - f[order[1]]) + table[c + channel] * (f[order[1]] - f[order[2]]) + table[d + channel] * f[order[2]]) as RGB
}
