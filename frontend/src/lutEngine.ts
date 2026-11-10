import type { RGB } from "./cubeSampling.ts"
import type { Setup } from "./editor.ts"
import { parseImportedCube, sampleImportedCube, overlayInOutput, verifyImportedIdentity } from "./importedLut.ts"
import {
  logDecodeAtGrid,
  sourceLumaWeights,
  sourceToTargetMatrices,
  srgbToTargetMatrices,
  targetLumaWeights,
} from "./lutColorData.ts"

export // Thresholds and their derivations: src/lut_builder/data.py (kept identical; parity-tested).
const sourceInfo = {
  "Sony S-Log3": {
    gamut: "S-Gamut3.Cine",
    log: "S-Log3",
    floor: 0.0929,
    ceiling: 0.867,
    sources: [
      "https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf",
      "https://www.sony-asia.com/electronics/support/articles/00145909",
    ],
  },
  "Panasonic V-Log": {
    gamut: "V-Gamut",
    log: "V-Log",
    floor: 0.1251,
    ceiling: 0.8905,
    sources: [
      "https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf",
      "https://gamut.io/product/baseluts-for-panasonic-s5ii-s5iix-and-s9/",
    ],
  },
  "Canon Log 3": {
    gamut: "Cinema Gamut",
    log: "Canon Log 3",
    floor: 0.1251,
    ceiling: 0.79,
    sources: [
      "https://downloads.canon.com/nw/camera/products/cinema-eos/c300-mark-ii/white-papers/canon-c300-mk-ii-image-performance-wp.pdf",
      "https://www.dvxuser.com/threads/c70-when-is-this-bad-boy-going-to-start-shipping.374091/page-3",
    ],
  },
  "ARRI LogC3": {
    gamut: "ARRI Wide Gamut 3",
    log: "ARRI LogC3",
    floor: 0.0928,
    ceiling: 0.9296,
    sources: [
      "https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2012-01-arrilog-c-logarithmic-cine-camera-image-encoding-data.pdf",
      "https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf",
      "https://www.arri.com/resource/blob/390448/2d469ae1e98110562fe347cea50a284b/arri-logc-false-color-specification-data.pdf",
    ],
  },
  "RED Log3G10": {
    gamut: "REDWideGamutRGB",
    log: "Log3G10",
    floor: 0.0916,
    ceiling: 0.7986,
    sources: [
      "https://www.red.com/download/ipp2-technical-paper",
      "https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS,%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf",
      "https://gamut.io/product/baseluts-for-red-komodo/",
    ],
  },
  "Blackmagic Film Gen 5": {
    gamut: "Blackmagic Wide Gamut",
    log: "Blackmagic Film Generation 5",
    floor: 0.09246575342465753,
    ceiling: 0.8561,
    sources: [
      "https://drive.google.com/file/d/1FF5WO2nvI9GEWb4_EntrBoV9ZIuFToZd/view",
      "https://gamut.io/product/baseluts-for-blackmagic-pocket-cinema-camera-6k-and-pocket-cinema-camera-4k/",
    ],
  },
} satisfies Record<string, { gamut: string; log: string; floor: number; ceiling: number; sources: string[] }>

const targets = {
  "Rec.709": { gamut: "ITU-R BT.709", transfer: "ITU-R BT.709" },
  "Rec.2020": { gamut: "ITU-R BT.2020", transfer: "ITU-R BT.2020" },
} as const

type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

// Colour data tables are plain number[]; check their shape once where they enter the engine.
function vec3(values: readonly number[]): RGB {
  const [a, b, c] = values
  if (values.length !== 3 || a === undefined || b === undefined || c === undefined) {
    throw new RangeError(`Expected 3 values, received ${values.length}`)
  }
  return [a, b, c]
}

function mat3(values: readonly number[]): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = values
  if (
    values.length !== 9 ||
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined ||
    f === undefined ||
    g === undefined ||
    h === undefined ||
    i === undefined
  ) {
    throw new RangeError(`Expected 9 values, received ${values.length}`)
  }
  return [a, b, c, d, e, f, g, h, i]
}

function dot(weights: RGB, [r, g, b]: RGB) {
  return weights[0] * r + weights[1] * g + weights[2] * b
}

function multiply(matrix: Mat3, rgb: RGB): RGB {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix
  const [r, g, b] = rgb
  return [m0 * r + m1 * g + m2 * b, m3 * r + m4 * g + m5 * b, m6 * r + m7 * g + m8 * b]
}

function encodeChannel(value: number) {
  const alpha = 1.099
  const beta = 0.018
  return value < beta ? 4.5 * value : alpha * Math.sign(value) * Math.abs(value) ** 0.45 - (alpha - 1)
}

function encode([r, g, b]: RGB): RGB {
  return [encodeChannel(r), encodeChannel(g), encodeChannel(b)]
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function colorInTarget(hex: string, target: string): [number, number, number] {
  const srgb = vec3([1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255))
  if (target === "Rec.709") return srgb
  const [r, g, b] = srgb
  return encode(
    multiply(mat3(srgbToTargetMatrices[target as keyof typeof srgbToTargetMatrices]), [
      srgbToLinear(r),
      srgbToLinear(g),
      srgbToLinear(b),
    ]),
  )
}

function nextFloat32(value: number, direction: 1 | -1) {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, value)
  view.setUint32(0, view.getUint32(0) + direction)
  return view.getFloat32(0)
}

function overlayFor(
  value: number,
  fillMode: boolean,
  bands: Setup["bands"],
  low: boolean,
  high: boolean,
  setup: Setup,
) {
  let color: string | null = null
  if (fillMode && bands.length) {
    let zone = 0
    while (zone < bands.length - 1 && value >= (bands[zone]?.stop ?? Infinity)) zone += 1
    color = bands[zone]?.color ?? null
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

function comments(
  setup: Setup,
  profile: (typeof sourceInfo)[keyof typeof sourceInfo],
  target: (typeof targets)[keyof typeof targets],
) {
  const lines = [
    `Generated   : ${timestamp()}`,
    "Tool        : lut-builder  https://github.com/Today20092/lut_builder",
    `Cube size   : ${setup.cube_size}x${setup.cube_size}x${setup.cube_size}`,
    `Monochrome  : ${setup.monochrome ? "yes" : "no"}`,
    `Output range: ${setup.legal_range ? "Legal (64-940)" : "Full (0-1023)"}`,
    setup.ire_basis === "camera"
      ? "IRE         : camera-log encoded luma; 0=code 0, 100=code 1023; independent of output range"
      : `IRE         : 0=code ${setup.legal_range ? "64" : "0"}, 100=code ${setup.legal_range ? "940" : "1023"} (${setup.legal_range ? "legal" : "full"}-range convention)`,
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
    setup.imported_lut
      ? `  Transfer  : ${setup.imported_lut.output_transfer} (confirmed imported output)`
      : `  Transfer  : ${target.transfer} (OETF)`,
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
        lines.push(
          setup.band_mode === "ire"
            ? `  ${band.stop.toFixed(0)} IRE  ->  ${band.color}  (fill zone)`
            : `  Stop ${band.stop >= 0 ? "+" : ""}${band.stop.toFixed(1)}  ->  ${band.color}  (fill zone)`,
        )
      } else if (setup.band_mode === "ire") {
        lines.push(`  ${band.stop.toFixed(0)} IRE  +/-${band.width.toFixed(0)} IRE  ->  ${band.color}`)
      } else {
        lines.push(
          `  Stop ${band.stop >= 0 ? "+" : ""}${band.stop.toFixed(1)}  +/-${band.width.toFixed(2)} stops  ->  ${band.color}`,
        )
      }
    }
  } else {
    lines.push("False Color Bands: none")
  }
  lines.push("")
  const warnings = []
  if (setup.low_signal_warning && setup.low_signal_hex) warnings.push(`  Low channel  ->  ${setup.low_signal_hex}`)
  if (setup.high_signal_warning && setup.high_signal_hex) warnings.push(`  High channel ->  ${setup.high_signal_hex}`)
  lines.push(
    warnings.length ? "Encoded-Signal Warnings (any channel crossing threshold):" : "Encoded-Signal Warnings: none",
    ...warnings,
  )
  return lines
}

export async function generateCube(
  setup: Setup,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: number) => void
    diagnostics?: boolean
  } = {},
): Promise<string> {
  setup = validateBrowserSetup(setup)
  const imported = setup.imported_lut
  const importedCube = imported ? parseImportedCube(imported.cube) : null
  if (imported) await verifyImportedIdentity(imported)
  const profileKey = setup.profile as keyof typeof sourceInfo
  const targetKey = setup.target as keyof typeof targets
  const profile = sourceInfo[profileKey]
  const target = targets[targetKey]

  const size = setup.cube_size
  // One grid step: every node of a threshold cell is flagged, so interpolation stays solid (matches engine.py).
  const tolerance = 1 / (size - 1)
  const sortedBands = [...setup.bands].sort((left, right) => left.stop - right.stop)
  const rows: string[] = []
  const sourceY = vec3(sourceLumaWeights[profileKey])
  const targetY = vec3(targetLumaWeights[targetKey])
  const transform = mat3(sourceToTargetMatrices[profileKey][targetKey])
  const decodeTable = logDecodeAtGrid[profileKey]

  for (let blueIndex = 0; blueIndex < size; blueIndex += 1) {
    if (options.signal?.aborted) throw new Error("Generation cancelled.")
    const blue = blueIndex / (size - 1)
    const plane: string[] = []
    for (let greenIndex = 0; greenIndex < size; greenIndex += 1) {
      const green = greenIndex / (size - 1)
      for (let redIndex = 0; redIndex < size; redIndex += 1) {
        const red = redIndex / (size - 1)
        // shortcut: decoder tables cover the 17/33/65 lattice only; regenerate before adding arbitrary cube sizes.
        const decode = (encoded: number) => decodeTable[Math.round(encoded * 64)] ?? Number.NaN
        const linear: RGB = [decode(red), decode(green), decode(blue)]
        const luminance = dot(sourceY, linear)
        const stops = Math.log2(Math.max(luminance, 1e-6) / 0.18)
        let targetLinear = multiply(transform, linear)
        if (setup.monochrome && !setup.fill_mode) {
          const y = dot(targetY, targetLinear)
          targetLinear = [y, y, y]
        }
        const encoded = encode(targetLinear)
        const value =
          setup.band_mode === "ire"
            ? setup.ire_basis === "camera"
              ? dot(sourceY, [red, green, blue]) * 100
              : dot(targetY, encoded) * 100
            : stops
        const low = setup.low_signal_warning && Math.min(red, green, blue) <= profile.floor + tolerance
        const high = setup.high_signal_warning && Math.max(red, green, blue) >= profile.ceiling - tolerance
        const overlay =
          options.diagnostics === false ? null : overlayFor(value, setup.fill_mode, sortedBands, low, high, setup)
        let final =
          imported && importedCube
            ? overlay
              ? overlayInOutput(overlay, imported)
              : sampleImportedCube([red, green, blue], importedCube)
            : overlay
              ? colorInTarget(overlay, setup.target)
              : encoded
        if (!imported) final = final.map((channel) => Math.max(0, Math.min(1, channel))) as [number, number, number]
        if (setup.legal_range && !imported) {
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
  const header = [
    `TITLE "${title}"`,
    ...comments(setup, profile, target).map((line) => `# ${line}`),
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ]
  if (imported)
    header.splice(
      1,
      0,
      `# Imported look: ${imported.sha256}`,
      `# Output: ${imported.output_gamut} ${imported.output_transfer} ${imported.output_range}; source-camera exposure before look; tetrahedral`,
    )
  return `${header.join("\n")}\n${rows.join("\n")}\n`
}

export function validateBrowserSetup(setup: Setup): Setup {
  if (!setup || typeof setup !== "object") throw new Error("setup must be an object")
  if (![17, 33, 65].includes(setup.cube_size)) throw new Error("cube_size must be 17, 33, or 65")
  if (!Object.hasOwn(sourceInfo, setup.profile)) throw new Error(`unknown profile: ${setup.profile}`)
  if (!Object.hasOwn(targets, setup.target)) throw new Error(`unknown target: ${setup.target}`)
  if (!Array.isArray(setup.bands)) throw new Error("bands must be an array")
  if (setup.band_mode !== "stops" && setup.band_mode !== "ire") throw new Error("band_mode must be stops or ire")
  if (setup.ire_basis !== undefined && setup.ire_basis !== "camera" && setup.ire_basis !== "target")
    throw new Error("ire_basis must be camera or target")
  if (
    typeof setup.fill_mode !== "boolean" ||
    typeof setup.monochrome !== "boolean" ||
    typeof setup.legal_range !== "boolean"
  )
    throw new Error("setup options must be booleans")
  if (typeof setup.low_signal_warning !== "boolean" || typeof setup.high_signal_warning !== "boolean")
    throw new Error("warning options must be booleans")
  if (typeof setup.output !== "string") throw new Error("output must be a string")
  const bands = setup.bands
    .map((band) => {
      if (
        !band ||
        !Number.isFinite(band.stop) ||
        !Number.isFinite(band.width) ||
        band.width < 0 ||
        !/^#[0-9a-f]{6}$/i.test(band.color)
      ) {
        throw new Error("each band needs a finite stop, non-negative width, and hex color")
      }
      if (setup.band_mode === "ire" && (band.stop < 0 || band.stop > 100))
        throw new Error("IRE band stop must be between 0 and 100")
      return { ...band, color: band.color.toLowerCase() }
    })
    .sort((left, right) => left.stop - right.stop)
  if (setup.low_signal_warning && !/^#[0-9a-f]{6}$/i.test(setup.low_signal_hex))
    throw new Error("low_signal_hex must be a hex color when its warning is enabled")
  if (setup.high_signal_warning && !/^#[0-9a-f]{6}$/i.test(setup.high_signal_hex))
    throw new Error("high_signal_hex must be a hex color when its warning is enabled")
  if (setup.imported_lut !== undefined) {
    const imported = setup.imported_lut
    if (
      !imported ||
      imported.version !== 1 ||
      typeof imported.name !== "string" ||
      !imported.name.length ||
      imported.name.length > 255 ||
      [...imported.name].some((character) => character.charCodeAt(0) < 32) ||
      typeof imported.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(imported.sha256)
    )
      throw new Error("Imported LUT needs version-1 identity and interpretation fields; reattach the original .cube.")
    if (imported.source_profile !== setup.profile || imported.output_gamut !== setup.target)
      throw new Error(
        "Imported LUT source/output interpretation does not match configuration. Reconfirm the LUT interpretation.",
      )
    if (
      !["gamma2.2", "gamma2.4", "sRGB", "BT.709"].includes(imported.output_transfer) ||
      !["full", "legal"].includes(imported.output_range)
    )
      throw new Error("Confirm an SDR output transfer and full/legal output range.")
    if ((imported.output_range === "legal") !== setup.legal_range)
      throw new Error("Imported LUT output range does not match configuration.")
    if (setup.monochrome || setup.ire_basis !== "camera")
      throw new Error("Imported looks require source-camera IRE and monochrome off to preserve the look.")
    if (!setup.fill_mode && bands.some((band) => band.width <= 0))
      throw new Error(
        "Imported diagnostic markers require a positive finite half-width; a zero-width level can miss every LUT node.",
      )
    if (typeof imported.cube !== "string") throw new Error("Imported LUT is missing; reattach the original .cube.")
  }
  return { ...setup, bands }
}

export function cubeFilename(output: string) {
  const basename = output.replaceAll("\\", "/").split("/").at(-1) ?? ""
  const stem =
    basename
      .replace(/\.[^.]*$/, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^[_-]+|[_-]+$/g, "") || "lut"
  return `${stem}.cube`
}

export const browserProfiles = Object.keys(sourceInfo)
export const browserInterpretations = Object.fromEntries(
  Object.entries(sourceInfo).map(([name, info]) => [name, { transfer: info.log, gamut: info.gamut }]),
)
export const browserTargets = Object.keys(targets)
