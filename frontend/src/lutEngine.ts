import type { Setup } from "./editor.ts"
import {
  logDecodeAtGrid,
  sourceLumaWeights,
  sourceToTargetMatrices,
  srgbToTargetMatrices,
  targetLumaWeights,
} from "./lutColorData.ts"

const sourceInfo = {
  "Sony S-Log3": { gamut: "S-Gamut3.Cine", log: "S-Log3", floor: 0.0929, ceiling: 0.94, sources: ["https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf"] },
  "Panasonic V-Log": { gamut: "V-Gamut", log: "V-Log", floor: 0.1251, ceiling: 0.8906, sources: ["https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf"] },
  "Canon Log 3": { gamut: "Cinema Gamut", log: "Canon Log 3", floor: 0.04, ceiling: 0.9, sources: ["https://downloads.canon.com/nw/camera/products/cinema-eos/c300-mark-ii/white-papers/canon-c300-mk-ii-image-performance-wp.pdf"] },
  "ARRI LogC3": { gamut: "ARRI Wide Gamut 3", log: "ARRI LogC3", floor: 0.03, ceiling: 0.91, sources: ["https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2012-01-arrilog-c-logarithmic-cine-camera-image-encoding-data.pdf"] },
  "RED Log3G10": { gamut: "REDWideGamutRGB", log: "Log3G10", floor: 0, ceiling: 1, sources: ["https://www.red.com/download/ipp2-technical-paper"] },
  "Blackmagic Film Gen 5": { gamut: "Blackmagic Wide Gamut", log: "Blackmagic Film Generation 5", floor: 0.09246575342465753, ceiling: 1, sources: ["https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view"] },
} satisfies Record<string, { gamut: string; log: string; floor: number; ceiling: number; sources: string[] }>

const targets = {
  "Rec.709": { gamut: "ITU-R BT.709", transfer: "ITU-R BT.709" },
  "Rec.2020": { gamut: "ITU-R BT.2020", transfer: "ITU-R BT.2020" },
} as const

function multiply(matrix: number[], rgb: number[]): [number, number, number] {
  return [
    matrix[0] * rgb[0] + matrix[1] * rgb[1] + matrix[2] * rgb[2],
    matrix[3] * rgb[0] + matrix[4] * rgb[1] + matrix[5] * rgb[2],
    matrix[6] * rgb[0] + matrix[7] * rgb[1] + matrix[8] * rgb[2],
  ]
}

function encode(rgb: number[]): [number, number, number] {
  const alpha = 1.099
  const beta = 0.018
  return rgb.map((value) => value < beta ? 4.5 * value : alpha * Math.sign(value) * Math.abs(value) ** 0.45 - (alpha - 1)) as [number, number, number]
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function colorInTarget(hex: string, target: string): [number, number, number] {
  const srgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  if (target === "Rec.709") return srgb as [number, number, number]
  return encode(multiply(srgbToTargetMatrices[target as keyof typeof srgbToTargetMatrices], srgb.map(srgbToLinear)))
}

function nextFloat32(value: number, direction: 1 | -1) {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, value)
  view.setUint32(0, view.getUint32(0) + direction)
  return view.getFloat32(0)
}

function overlayFor(value: number, fillMode: boolean, bands: Setup["bands"], low: boolean, high: boolean, setup: Setup) {
  let color: string | null = null
  if (fillMode && bands.length) {
    let zone = 0
    while (zone < bands.length - 1 && value >= bands[zone].stop) zone += 1
    color = bands[zone].color
  } else {
    for (const band of bands) {
      if (value >= band.stop - band.width && value <= band.stop + band.width) color = band.color
    }
  }
  if (low && setup.low_signal_warning) color = setup.low_signal_hex
  if (high && setup.high_signal_warning) color = setup.high_signal_hex
  return color
}

function timestamp() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
}

function comments(setup: Setup, profile: (typeof sourceInfo)[keyof typeof sourceInfo], target: (typeof targets)[keyof typeof targets]) {
  const lines = [
    `Generated   : ${timestamp()}`,
    "Tool        : lut-builder  https://github.com/Today20092/lut_builder",
    `Cube size   : ${setup.cube_size}x${setup.cube_size}x${setup.cube_size}`,
    `Monochrome  : ${setup.monochrome ? "yes" : "no"}`,
    `Output range: ${setup.legal_range ? "Legal (64-940)" : "Full (0-1023)"}`,
    `IRE         : 0=code ${setup.legal_range ? "64" : "0"}, 100=code ${setup.legal_range ? "940" : "1023"} (${setup.legal_range ? "legal" : "full"}-range convention)`,
    "Purpose     : diagnostic scene-exposure transform; not a finished viewing transform",
    "",
    `Source      : ${setup.profile}`,
    `  Gamut     : ${profile.gamut}`,
    `  Log       : ${profile.log}`,
    `  Signal low: ${profile.floor.toFixed(3)}  (encoded-signal warning threshold)`,
    `  Signal high: ${profile.ceiling.toFixed(3)}  (encoded-signal warning threshold)`,
    "",
    `Target      : ${setup.target}`,
    `  Gamut     : ${target.gamut}`,
    `  Transfer  : ${target.transfer} (OETF)`,
    "",
  ]
  if (profile.sources.length) {
    lines.push("References  :", ...profile.sources.map((source) => `  ${source}`), "")
  }
  const mode = setup.band_mode === "ire" ? "IRE" : "Stops"
  const fill = setup.fill_mode ? " [Fill]" : ""
  if (setup.bands.length) {
    lines.push(`False Color Bands (${mode}${fill}):`)
    for (const band of setup.bands) {
      if (setup.fill_mode) {
        lines.push(setup.band_mode === "ire"
          ? `  ${band.stop.toFixed(0)} IRE  ->  ${band.color}  (fill zone)`
          : `  Stop ${band.stop >= 0 ? "+" : ""}${band.stop.toFixed(1)}  ->  ${band.color}  (fill zone)`)
      } else if (setup.band_mode === "ire") {
        lines.push(`  ${band.stop.toFixed(0)} IRE  +/-${band.width.toFixed(0)} IRE  ->  ${band.color}`)
      } else {
        lines.push(`  Stop ${band.stop >= 0 ? "+" : ""}${band.stop.toFixed(1)}  +/-${band.width.toFixed(2)} stops  ->  ${band.color}`)
      }
    }
  } else {
    lines.push("False Color Bands: none")
  }
  lines.push("")
  const warnings = []
  if (setup.low_signal_warning && setup.low_signal_hex) warnings.push(`  Low channel  ->  ${setup.low_signal_hex}`)
  if (setup.high_signal_warning && setup.high_signal_hex) warnings.push(`  High channel ->  ${setup.high_signal_hex}`)
  lines.push(warnings.length ? "Encoded-Signal Warnings (any channel crossing threshold):" : "Encoded-Signal Warnings: none", ...warnings)
  return lines
}

export async function generateCube(
  setup: Setup,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<string> {
  setup = validateBrowserSetup(setup)
  const profileKey = setup.profile as keyof typeof sourceInfo
  const targetKey = setup.target as keyof typeof targets
  const profile = sourceInfo[profileKey]
  const target = targets[targetKey]

  const size = setup.cube_size
  const tolerance = 0.5 / (size - 1)
  const sortedBands = [...setup.bands].sort((left, right) => left.stop - right.stop)
  const rows: string[] = []
  const sourceY = sourceLumaWeights[profileKey]
  const targetY = targetLumaWeights[targetKey]
  const transform = sourceToTargetMatrices[profileKey][targetKey]

  for (let blueIndex = 0; blueIndex < size; blueIndex += 1) {
    if (options.signal?.aborted) throw new Error("Generation cancelled.")
    const blue = blueIndex / (size - 1)
    const plane: string[] = []
    for (let greenIndex = 0; greenIndex < size; greenIndex += 1) {
      const green = greenIndex / (size - 1)
      for (let redIndex = 0; redIndex < size; redIndex += 1) {
        const red = redIndex / (size - 1)
        // shortcut: decoder tables cover the 17/33/65 lattice only; regenerate before adding arbitrary cube sizes.
        const linear = [red, green, blue].map((encoded) => logDecodeAtGrid[profileKey][Math.round(encoded * 64)])
        const luminance = linear[0] * sourceY[0] + linear[1] * sourceY[1] + linear[2] * sourceY[2]
        const stops = Math.log2(Math.max(luminance, 1e-6) / 0.18)
        let targetLinear = multiply(transform, linear)
        if (setup.monochrome && !setup.fill_mode) {
          const y = targetLinear[0] * targetY[0] + targetLinear[1] * targetY[1] + targetLinear[2] * targetY[2]
          targetLinear = [y, y, y]
        }
        const encoded = encode(targetLinear)
        const value = setup.band_mode === "ire"
          ? (encoded[0] * targetY[0] + encoded[1] * targetY[1] + encoded[2] * targetY[2]) * 100
          : stops
        const low = setup.low_signal_warning && Math.min(red, green, blue) <= profile.floor + tolerance
        const high = setup.high_signal_warning && Math.max(red, green, blue) >= profile.ceiling - tolerance
        const overlay = overlayFor(value, setup.fill_mode, sortedBands, low, high, setup)
        let final = overlay ? colorInTarget(overlay, setup.target) : encoded
        final = final.map((channel) => Math.max(0, Math.min(1, channel))) as [number, number, number]
        if (setup.legal_range) {
          const low = nextFloat32(64 / 1023, 1)
          const high = nextFloat32(940 / 1023, -1)
          final = final.map((channel) => channel * (high - low) + low) as [number, number, number]
        }
        plane.push(final.map((channel) => Math.fround(channel).toFixed(7)).join(" "))
      }
    }
    rows.push(plane.join("\n"))
    options.onProgress?.((blueIndex + 1) / size)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  const title = `${setup.profile} to ${setup.target} Custom Assist`
  const header = [`TITLE "${title}"`, ...comments(setup, profile, target).map((line) => `# ${line}`), `LUT_3D_SIZE ${size}`, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
  return `${header.join("\n")}\n${rows.join("\n")}\n`
}

export function validateBrowserSetup(setup: Setup): Setup {
  if (!setup || typeof setup !== "object") throw new Error("setup must be an object")
  if (![17, 33, 65].includes(setup.cube_size)) throw new Error("cube_size must be 17, 33, or 65")
  if (!Object.hasOwn(sourceInfo, setup.profile)) throw new Error(`unknown profile: ${setup.profile}`)
  if (!Object.hasOwn(targets, setup.target)) throw new Error(`unknown target: ${setup.target}`)
  if (!Array.isArray(setup.bands)) throw new Error("bands must be an array")
  if (setup.band_mode !== "stops" && setup.band_mode !== "ire") throw new Error("band_mode must be stops or ire")
  if (typeof setup.fill_mode !== "boolean" || typeof setup.monochrome !== "boolean" || typeof setup.legal_range !== "boolean") throw new Error("setup options must be booleans")
  if (typeof setup.low_signal_warning !== "boolean" || typeof setup.high_signal_warning !== "boolean") throw new Error("warning options must be booleans")
  if (typeof setup.output !== "string") throw new Error("output must be a string")
  const bands = setup.bands.map((band) => {
    if (!band || !Number.isFinite(band.stop) || !Number.isFinite(band.width) || band.width < 0 || !/^#[0-9a-f]{6}$/i.test(band.color)) {
      throw new Error("each band needs a finite stop, non-negative width, and hex color")
    }
    if (setup.band_mode === "ire" && (band.stop < 0 || band.stop > 100)) throw new Error("IRE band stop must be between 0 and 100")
    return { ...band, color: band.color.toLowerCase() }
  }).sort((left, right) => left.stop - right.stop)
  if (setup.low_signal_warning && !/^#[0-9a-f]{6}$/i.test(setup.low_signal_hex)) throw new Error("low_signal_hex must be a hex color when its warning is enabled")
  if (setup.high_signal_warning && !/^#[0-9a-f]{6}$/i.test(setup.high_signal_hex)) throw new Error("high_signal_hex must be a hex color when its warning is enabled")
  return { ...setup, bands }
}

export function cubeFilename(output: string) {
  const basename = output.replaceAll("\\", "/").split("/").at(-1) ?? ""
  const stem = basename.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "") || "lut"
  return `${stem}.cube`
}

export const browserProfiles = Object.keys(sourceInfo)
export const browserInterpretations = Object.fromEntries(Object.entries(sourceInfo).map(([name, info]) => [name, { transfer: info.log, gamut: info.gamut }]))
export const browserTargets = Object.keys(targets)
