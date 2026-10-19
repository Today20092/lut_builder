// Independent decoder evidence against native FFmpeg. Requires a production Pages build.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { deflateSync } from "node:zlib"

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const page = await browser.newPage()
const url = process.env.LUT_BUILDER_URL || "http://127.0.0.1:4178/lut_builder/"
const assets = resolve(process.env.VERIFICATION_BUILD || "../.scratch/browser39", "assets")
const worker = (await readdir(assets)).find((name) => /^browserVerificationWorker-.*\.js$/.test(name))
assert.ok(worker)
const dir = await mkdtemp(join(tmpdir(), "lut-decoder-parity-"))
const setup = { version: 1, profile: "Panasonic V-Log", cube_size: 17, target: "Rec.709", bands: [], low_signal_warning: false, high_signal_warning: false, low_signal_hex: "#000000", high_signal_hex: "#ffffff", legal_range: false, monochrome: false, fill_mode: false, band_mode: "stops", output: "checked.cube" }
const interpretation = { transfer: "V-Log", gamut: "V-Gamut", confirmed: true, matrix: "bt709", signalRange: "full", chroma: "left" }
function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 128 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString())
  return result.stdout
}
async function job(file, options) {
  return page.evaluate(async ({ worker, file, options }) => {
    const input = document.querySelector("#parity-file").files[0]
    return new Promise((resolve, reject) => {
      const w = new Worker(worker, { type: "module" })
      const timer = setTimeout(() => { w.terminate(); reject(new Error("Worker timed out")) }, 300000)
      w.onerror = (event) => { clearTimeout(timer); w.terminate(); reject(new Error(event.message)) }
      w.onmessage = async ({ data }) => {
        if (data.type === "progress") return
        clearTimeout(timer); w.terminate()
        if (data.type === "error") { reject(new Error(data.message)); return }
        if (data.value.frames) resolve(data.value)
        else {
          const source = data.value.source
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", source))].map((v) => v.toString(16).padStart(2, "0")).join("")
          resolve({ source: source.length <= 10000 ? Array.from(source) : [], hash, provenance: data.value.provenance })
        }
      }
      w.postMessage({ file: new File([input], file), ...options })
    })
  }, { worker: new URL(`assets/${worker}`, url).href, file, options })
}
function crc(bytes) { let c = -1; for (const b of bytes) { c ^= b; for (let n = 0; n < 8; n++) c = c >>> 1 ^ (0xedb88320 & -(c & 1)) } return (c ^ -1) >>> 0 }
function chunk(type, data) { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b }
try {
  await page.goto(url)
  await page.evaluate(() => { const input = document.createElement("input"); input.type = "file"; input.id = "parity-file"; document.body.append(input) })
  const select = async (file) => page.locator("#parity-file").setInputFiles(file)
  const header = Buffer.alloc(13); header.writeUInt32BE(256); header.writeUInt32BE(256, 4); header[8] = 16; header[9] = 2
  const scan = Buffer.alloc(256 * (256 * 6 + 1)), expected = new Float64Array(65536 * 3)
  for (let i = 0; i < 65536; i++) for (let c = 0; c < 3; c++) {
    const value = c === 0 ? i : c === 1 ? 65535 - i : (i * 17) % 65536
    scan.writeUInt16BE(value, Math.floor(i / 256) * 1537 + 1 + i % 256 * 6 + c * 2)
    expected[i * 3 + c] = value / 65535
  }
  const png = join(dir, "all-codes.png")
  await writeFile(png, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]))
  await select(png)
  assert.equal((await job("all-codes.png", { setup, interpretation })).hash, createHash("sha256").update(new Uint8Array(expected.buffer)).digest("hex"))
  console.log("PNG: all 65,536 uint16 values and asymmetric RGB/rows preserved exactly")

  for (const [codec, format, container] of [["ffv1", "yuv420p", "mkv"], ["ffv1", "yuv420p10le", "mkv"], ["ffv1", "yuv422p10le", "mkv"], ["libx264", "yuv420p", "mp4"], ["libx265", "yuv420p10le", "mp4"], ["prores_ks", "yuv422p10le", "mov"]]) {
    const path = join(dir, `${codec}-${format}.${container}`)
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=16x16:rate=2:duration=1", "-vf", "setpts=PTS+2/TB", "-pix_fmt", format, "-c:v", codec, "-threads", "1", "-color_range", "tv", "-colorspace", "bt709", "-chroma_sample_location", "left", path])
    await select(path)
    const video = await job(path, { probe: true })
    assert.equal(video.frames.length, 2)
    const raw = ffmpeg(["-i", path, "-vf", "select=eq(n\\,1)", "-frames:v", "1", "-pix_fmt", format, "-f", "rawvideo", "pipe:1"])
    await writeFile(path + ".raw", raw)
    const matrices = codec === "ffv1" && format === "yuv420p10le" ? ["bt709", "bt2020nc", "bt470bg", "smpte170m"] : ["bt709"]
    for (const matrix of matrices) for (const range of ["full", "limited"]) for (const chroma of ["left", "center", "topleft"]) {
      const check = await job(path, { setup, interpretation: { ...interpretation, matrix, signalRange: range, chroma }, video, ordinal: 1 })
      assert.equal(check.provenance.source.native_sha256, createHash("sha256").update(raw).digest("hex"))
      const native = ffmpeg(["-f", "rawvideo", "-pixel_format", format, "-video_size", "16x16", "-i", path + ".raw", "-frames:v", "1", "-vf", `zscale=matrixin=${matrix}:rangein=${range}:chromalin=${chroma}:matrix=gbr:range=full:filter=bilinear,format=gbrpf32le`, "-f", "rawvideo", "pipe:1"])
      let error = 0
      for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) error = Math.max(error, Math.abs(check.source[i * 3 + c] - native.readFloatLE(([2, 0, 1][c] * 256 + i) * 4)))
      assert.ok(error < 2e-6, `${codec} ${format} ${matrix} ${range} ${chroma}: ${error}`)
    }
    console.log("native parity", codec, format)
  }
  console.log("PASS; fixtures", dir)
} finally { await browser.close() }
