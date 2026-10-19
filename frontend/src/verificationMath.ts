import type { Setup } from "./editor.ts"

export const MAX_PIXELS = 4_194_304
export type RGB = [number, number, number]
export type Interpretation = { transfer: string; gamut: string; confirmed: boolean; matrix: string; signalRange: string; chroma: string }
export const comparisonUnavailable = "Source comparison unavailable: no camera-to-SDR reference viewing transform is established. Raw log is not an sRGB original."

export function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new Error("Source must contain 1 to 4,194,304 pixels.")
}

export function decodePfm(bytes: Uint8Array) {
  let offset = 0
  const lines = []
  for (let i = 0; i < 3; i++) {
    const end = bytes.indexOf(10, offset)
    if (end < offset || end - offset > 128) throw new Error("Invalid PFM header.")
    lines.push(new TextDecoder().decode(bytes.subarray(offset, end)).replace(/\r$/, ""))
    offset = end + 1
  }
  if (lines[0] !== "PF" || !/^\d+\s+\d+$/.test(lines[1]) || !/^[+-]?1(?:\.0*)?$/.test(lines[2])) throw new Error("Use RGB PFM with scale exactly +1 or -1.")
  const [width, height] = lines[1].split(/\s+/).map(Number)
  dimensions(width, height)
  if (bytes.length !== offset + width * height * 12) throw new Error("PFM contains truncated or extra data.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const rgb = new Float64Array(width * height * 3)
  for (let y = 0; y < height; y++) for (let x = 0; x < width * 3; x++) {
    const value = view.getFloat32(offset + ((height - 1 - y) * width * 3 + x) * 4, Number(lines[2]) < 0)
    if (!Number.isFinite(value)) throw new Error("PFM contains non-finite samples.")
    rgb[y * width * 3 + x] = value
  }
  return { width, height, rgb }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function inspectPng(bytes: Uint8Array) {
  if (bytes.subarray(0, 8).join() !== "137,80,78,71,13,10,26,10") throw new Error("Choose an untagged 16-bit RGB PNG or RGB PFM.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0, height = 0, imageData = false, ended = false
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk.")
    const size = view.getUint32(offset)
    const end = offset + size + 12
    if (end > bytes.length) throw new Error("Truncated PNG data.")
    const kind = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8))
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) throw new Error("PNG checksum failed.")
    if (["iCCP", "sRGB", "gAMA", "cHRM", "cICP", "mDCv", "cLLi", "acTL", "eXIf", "tRNS"].includes(kind)) throw new Error("Color-tagged, animated, oriented or transparent PNG is unsupported. Export unchanged camera RGB; do not merely remove tags from a graded image.")
    if (offset === 8 && kind !== "IHDR") throw new Error("PNG must start with IHDR.")
    if (kind === "IHDR") {
      if (offset !== 8 || size !== 13 || bytes[offset + 16] !== 16 || bytes[offset + 17] !== 2 || bytes.slice(offset + 18, offset + 21).some(Boolean)) throw new Error("Use non-interlaced 16-bit RGB PNG without alpha.")
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12)
      dimensions(width, height)
    } else if (kind === "IDAT") imageData = true
    else if (kind === "IEND") {
      if (size || end !== bytes.length || !imageData) throw new Error("Invalid PNG end.")
      ended = true
    } else if (kind[0] === kind[0].toUpperCase() && kind !== "PLTE") throw new Error("Unsupported critical PNG chunk.")
    offset = end
  }
  if (!ended) throw new Error("PNG is missing its end marker.")
  return { width, height }
}

export const pixelFormats = { yuv420p: [8, 2], yuv420p10le: [10, 2], yuv422p10le: [10, 1] } as const

export function decodeYuv(bytes: Uint8Array, width: number, height: number, format: keyof typeof pixelFormats, interpretation: Interpretation) {
  dimensions(width, height)
  const spec = pixelFormats[format]
  if (!spec || width % 2 || height % 2) throw new Error("Unsupported native pixel layout.")
  const [bits, vertical] = spec
  const coefficients: Record<string, [number, number]> = { bt709: [0.2126, 0.0722], bt470bg: [0.299, 0.114], smpte170m: [0.299, 0.114], bt2020nc: [0.2627, 0.0593] }
  if (!Object.hasOwn(coefficients, interpretation.matrix) || !["limited", "full"].includes(interpretation.signalRange) || !["left", "center", "topleft"].includes(interpretation.chroma)) throw new Error("Confirm matrix, transport range and chroma location.")
  const [kr, kb] = coefficients[interpretation.matrix]
  const cw = width / 2, ch = height / vertical, pixels = width * height
  if (bytes.length !== (pixels + 2 * cw * ch) * (bits / 8 > 1 ? 2 : 1)) throw new Error("Native frame byte count does not match its declared layout.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sample = (i: number) => bits === 8 ? bytes[i] : view.getUint16(i * 2, true)
  const shift = 2 ** (bits - 8), max = 2 ** bits - 1
  const limited = interpretation.signalRange === "limited"
  const xOffset = interpretation.chroma === "center" ? 0.5 : 0
  const yOffset = interpretation.chroma === "topleft" || vertical === 1 ? 0 : 0.5
  function chroma(plane: number, x: number, y: number) {
    const cx = Math.max(0, Math.min(cw - 1, (x - xOffset) / 2))
    const cy = Math.max(0, Math.min(ch - 1, (y - yOffset) / vertical))
    const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(x0 + 1, cw - 1), y1 = Math.min(y0 + 1, ch - 1)
    const base = pixels + plane * cw * ch
    const a = sample(base + y0 * cw + x0) * (1 - cx + x0) + sample(base + y0 * cw + x1) * (cx - x0)
    const b = sample(base + y1 * cw + x0) * (1 - cx + x0) + sample(base + y1 * cw + x1) * (cx - x0)
    return ((a * (1 - cy + y0) + b * (cy - y0)) - 128 * shift) / (limited ? 224 * shift : max)
  }
  const rgb = new Float64Array(pixels * 3)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    const luma = (sample(i) - (limited ? 16 * shift : 0)) / (limited ? 219 * shift : max)
    const cb = chroma(0, x, y), cr = chroma(1, x, y)
    rgb[i * 3] = luma + 2 * (1 - kr) * cr
    rgb[i * 3 + 1] = luma - 2 * kb * (1 - kb) / (1 - kr - kb) * cb - 2 * kr * (1 - kr) / (1 - kr - kb) * cr
    rgb[i * 3 + 2] = luma + 2 * (1 - kb) * cb
  }
  return rgb
}

export function parseCube(text: string) {
  const size = Number(/^LUT_3D_SIZE (\d+)$/m.exec(text)?.[1])
  if (![17, 33, 65].includes(size)) throw new Error("Unsupported cube size.")
  const rows = text.split(/\r?\n/).filter((line) => /^[-+.\d]/.test(line)).flatMap((line) => line.trim().split(/\s+/).map(Number))
  if (rows.length !== size ** 3 * 3 || rows.some((value) => !Number.isFinite(value))) throw new Error("Invalid serialized cube table.")
  return { size, table: new Float64Array(rows) }
}

export function applyCube(rgb: ArrayLike<number>, cube: ReturnType<typeof parseCube>): RGB {
  const { size, table } = cube
  const positions = [0, 1, 2].map((c) => Math.max(0, Math.min(1, rgb[c])) * (size - 1))
  const low = positions.map((p) => Math.min(Math.floor(p), size - 2))
  const f = positions.map((p, c) => p - low[c])
  const order = [0, 1, 2].sort((a, b) => f[b] - f[a])
  const stride = [3, size * 3, size * size * 3]
  const a = low[0] * stride[0] + low[1] * stride[1] + low[2] * stride[2]
  const b = a + stride[order[0]], c = b + stride[order[1]], d = c + stride[order[2]]
  return [0, 1, 2].map((channel) => table[a + channel] * (1 - f[order[0]]) + table[b + channel] * (f[order[0]] - f[order[1]]) + table[c + channel] * (f[order[1]] - f[order[2]]) + table[d + channel] * f[order[2]]) as RGB
}

export function displayRgb(rgb: ArrayLike<number>, setup: Pick<Setup, "target" | "legal_range">): RGB {
  let linear = [0, 1, 2].map((c) => Math.max(0, setup.legal_range ? (rgb[c] - 64 / 1023) / (876 / 1023) : rgb[c]) ** 2.4)
  if (setup.target === "Rec.2020") {
    const [r, g, b] = linear
    linear = [1.6604910021084345 * r - 0.5876411387885495 * g - 0.07284986331988483 * b, -0.12455047452159074 * r + 1.13289989712596 * g - 0.00834942260436948 * b, -0.01815076335490522 * r - 0.10057889800800739 * g + 1.1187296613629125 * b]
  } else if (setup.target !== "Rec.709") throw new Error("Only Rec.709 and SDR Rec.2020 viewing are supported.")
  return linear.map((value) => {
    value = Math.max(0, Math.min(1, value))
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  }) as RGB
}
