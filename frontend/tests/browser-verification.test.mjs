import assert from "node:assert/strict"
import test from "node:test"
import { deflateSync } from "node:zlib"
import { applyCube, decodePfm, decodeYuv, displayRgb, inspectPng, parseCube } from "../src/verificationMath.ts"

const interpretation = { transfer: "V-Log", gamut: "V-Gamut", confirmed: true, matrix: "bt709", signalRange: "limited", chroma: "left" }

function pfm(values, little = true) {
  const header = Buffer.from(`PF\n2 1\n${little ? -1 : 1}\n`)
  const bytes = Buffer.alloc(values.length * 4)
  values.forEach((value, i) => little ? bytes.writeFloatLE(value, i * 4) : bytes.writeFloatBE(value, i * 4))
  return Buffer.concat([header, bytes])
}

test("PFM preserves excursions, endian, float precision and row order; rejects malformed sources", () => {
  const values = [-0.25, 0.125, 1.25, 0.5, 0.75, 1]
  for (const little of [true, false]) assert.deepEqual(Array.from(decodePfm(pfm(values, little)).rgb), values)
  const rows = pfm(values)
  rows[3] = 49; rows[5] = 50 // 1 × 2 instead of 2 × 1
  assert.deepEqual(Array.from(decodePfm(rows).rgb), [...values.slice(3), ...values.slice(0, 3)])
  assert.throws(() => decodePfm(pfm([NaN, 0, 0, 0, 0, 0])), /non-finite/)
  assert.throws(() => decodePfm(pfm(values).subarray(0, -1)), /truncated/)
  assert.throws(() => decodePfm(Buffer.from("PF\n999999999 999999999\n-1\n")), /pixels/)
})

function crc32(data) {
  let c = -1
  for (const byte of data) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return (c ^ -1) >>> 0
}
function chunk(name, data = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(data.length + 12)
  bytes.writeUInt32BE(data.length); bytes.write(name, 4); data.copy(bytes, 8)
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
  return bytes
}
function png(extra = [], depth = 16) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = depth; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), ...extra.map((name) => chunk(name)), chunk("IDAT", deflateSync(Buffer.alloc(7))), chunk("IEND")])
}
test("PNG contract rejects color tags, alpha metadata, orientation, 8-bit and corruption", () => {
  assert.deepEqual(inspectPng(png()), { width: 1, height: 1 })
  for (const tag of ["iCCP", "sRGB", "gAMA", "cHRM", "cICP", "mDCv", "cLLi", "acTL", "eXIf", "tRNS"]) assert.throws(() => inspectPng(png([tag])), /unsupported/)
  assert.throws(() => inspectPng(png([], 8)), /16-bit/)
  const corrupt = png(); corrupt[20] ^= 1
  assert.throws(() => inspectPng(corrupt), /checksum/)
})

test("native YUV decode preserves superblack/white and matches independent range/matrix equations", () => {
  for (const format of ["yuv420p", "yuv420p10le", "yuv422p10le"]) {
    const ten = format !== "yuv420p", scale = ten ? 4 : 1, vsub = format === "yuv422p10le" ? 1 : 2
    const samples = [0, 16, 235, 255].map((x) => x * scale)
    samples.push(...Array(2 / vsub).fill(100 * scale), ...Array(2 / vsub).fill(170 * scale))
    const bytes = Buffer.alloc(samples.length * (ten ? 2 : 1))
    samples.forEach((value, i) => ten ? bytes.writeUInt16LE(value, i * 2) : bytes.writeUInt8(value, i))
    for (const signalRange of ["limited", "full"]) for (const matrix of ["bt709", "bt2020nc", "bt470bg", "smpte170m"]) {
      const rgb = decodeYuv(bytes, 2, 2, format, { ...interpretation, signalRange, matrix })
      const [kr, kb] = matrix === "bt709" ? [0.2126, 0.0722] : matrix === "bt2020nc" ? [0.2627, 0.0593] : [0.299, 0.114]
      const limited = signalRange === "limited", max = ten ? 1023 : 255
      const cb = (100 - 128) * scale / (limited ? 224 * scale : max), cr = (170 - 128) * scale / (limited ? 224 * scale : max)
      for (let i = 0; i < 4; i++) {
        const y = (samples[i] - (limited ? 16 * scale : 0)) / (limited ? 219 * scale : max)
        const r = y + 2 * (1 - kr) * cr, b = y + 2 * (1 - kb) * cb, g = (y - kr * r - kb * b) / (1 - kr - kb)
        for (const [channel, expected] of [r, g, b].entries()) assert.ok(Math.abs(rgb[i * 3 + channel] - expected) < 1e-12)
      }
      assert.ok(rgb.some((value) => value < 0))
    }
  }
})

test("bilinear chroma siting differs at independently calculated sample positions", () => {
  const width = 8, height = 8
  const samples = new Uint16Array(width * height + 32).fill(512)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) samples[64 + y * 4 + x] = 400 + 20 * x + 40 * y
  const bytes = new Uint8Array(samples.buffer)
  for (const [chroma, cb] of [["left", 400 + 20 * 1.5 + 40 * 1.25], ["center", 400 + 20 * 1.25 + 40 * 1.25], ["topleft", 400 + 20 * 1.5 + 40 * 1.5]]) {
    const rgb = decodeYuv(bytes, width, height, "yuv420p10le", { ...interpretation, signalRange: "full", chroma })
    const expectedBlue = 512 / 1023 + 2 * (1 - 0.0722) * (cb - 512) / 1023
    assert.ok(Math.abs(rgb[(3 * width + 3) * 3 + 2] - expectedBlue) < 1e-12)
  }
})

test("serialized tetrahedral interpolation matches independent barycentric geometry in every tetrahedron", () => {
  const rows = [], size = 17
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) rows.push([r * r / 256, r * g / 256, g * b / 256].join(" "))
  const cube = parseCube(`LUT_3D_SIZE ${size}\n${rows.join("\n")}`)
  for (const f of [[0.2, 0.4, 0.8], [0.2, 0.8, 0.4], [0.4, 0.2, 0.8], [0.4, 0.8, 0.2], [0.8, 0.2, 0.4], [0.8, 0.4, 0.2]]) {
    const rgb = f.map((v) => (5 + v) / 16)
    // Products within the tetrahedron equal the lower node plus linear terms and min of fractions.
    const expected = [(25 + 11 * f[0]) / 256, (25 + 5 * f[0] + 5 * f[1] + Math.min(f[0], f[1])) / 256, (25 + 5 * f[1] + 5 * f[2] + Math.min(f[1], f[2])) / 256]
    applyCube(rgb, cube).forEach((value, c) => assert.ok(Math.abs(value - expected[c]) < 1e-14))
  }
  assert.deepEqual(applyCube([-1, -1, -1], cube), [0, 0, 0])
  assert.deepEqual(applyCube([2, 2, 2], cube), [1, 1, 1])
})

test("SDR policy uses ideal BT.1886 with legal expansion exactly once", () => {
  for (const legal_range of [true, false]) {
    const value = legal_range ? (64 + 0.5 * 876) / 1023 : 0.5
    const result = displayRgb([value, value, value], { target: "Rec.709", legal_range })
    result.forEach((channel) => assert.ok(Math.abs(channel - 0.4725) < 1e-12))
  }
  const red = displayRgb([1, 0, 0], { target: "Rec.2020", legal_range: false })
  assert.ok(Math.abs(red[0] - 1) < 1e-12); assert.equal(red[1], 0); assert.equal(red[2], 0)
})
