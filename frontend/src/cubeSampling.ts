export type RGB = [number, number, number]
export type CubeTable = { size: number; table: Float64Array }

const CHANNELS = [0, 1, 2] as const
type Channel = (typeof CHANNELS)[number]

/** Tetrahedral sampling, red-fastest table. Clamp only the declared input boundary. */
export function applyCube(rgb: ArrayLike<number>, { size, table }: CubeTable): RGB {
  const positions = CHANNELS.map((c) => Math.max(0, Math.min(1, rgb[c] ?? 0)) * (size - 1)) as RGB
  const lowOf = (p: number) => Math.min(Math.floor(p), size - 2)
  const [l0, l1, l2] = positions.map(lowOf) as RGB
  const f = positions.map((p) => p - lowOf(p)) as RGB
  const order: [Channel, Channel, Channel] = [0, 1, 2]
  order.sort((a, b) => f[b] - f[a])
  const stride: RGB = [3, size * 3, size * size * 3]
  const a = l0 * stride[0] + l1 * stride[1] + l2 * stride[2]
  const b = a + stride[order[0]],
    c = b + stride[order[1]],
    d = c + stride[order[2]]
  const [f0, f1, f2] = [f[order[0]], f[order[1]], f[order[2]]] as RGB
  // Non-finite input yields NaN indices; reading undefined and propagating NaN is intended.
  const at = (i: number) => table[i] as number
  return CHANNELS.map(
    (channel) =>
      at(a + channel) * (1 - f0) + at(b + channel) * (f0 - f1) + at(c + channel) * (f1 - f2) + at(d + channel) * f2,
  ) as RGB
}
