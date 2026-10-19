import { applyCube, type RGB, type CubeTable } from "./cubeSampling.ts"

export const MAX_CUBE_BYTES = 16 * 1024 * 1024
export type OutputTransfer = "gamma2.2" | "gamma2.4" | "sRGB" | "BT.709"
export type ImportedLut = {
  version: 1; name: string; cube: string; source_profile: string
  output_gamut: "Rec.709" | "Rec.2020"; output_transfer: OutputTransfer
  output_range: "full" | "legal"; sha256: string
}

/** Stable, compact identity after validation; embedded text belongs only in portable files. */
export function setupIdentity<T extends {imported_lut?: ImportedLut}>(setup: T) {
  if (!setup.imported_lut) return setup
  const {name,version,sha256,source_profile,output_gamut,output_transfer,output_range} = setup.imported_lut
  const identity = {name,version,sha256,source_profile,output_gamut,output_transfer,output_range}
  return {...setup, imported_lut: identity}
}
type ImportedCube = CubeTable & { minimum: RGB; maximum: RGB }
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function parseImportedCube(text: string): ImportedCube {
  if (typeof text !== "string" || text.length > MAX_CUBE_BYTES || new TextEncoder().encode(text).length > MAX_CUBE_BYTES) throw new Error("Imported LUT must be UTF-8 text up to 16 MiB.")
  let size = 0
  const minimum: RGB = [0,0,0], maximum: RGB = [1,1,1]
  const seen = new Set<string>(), rows: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#",1)[0].trim()
    if (!line) continue
    const tokens = line.split(/\s+/), directive = tokens[0]
    if (["TITLE", "LUT_3D_SIZE", "DOMAIN_MIN", "DOMAIN_MAX"].includes(directive)) {
      if (seen.has(directive) || rows.length) throw new Error(`Duplicate or misplaced ${directive} header.`)
      seen.add(directive)
      if (directive === "TITLE") {
        if (!/^TITLE\s+"[^"\r\n]*"$/.test(line)) throw new Error("TITLE must contain a quoted name.")
      } else if (directive === "LUT_3D_SIZE") {
        if (tokens.length !== 2 || !/^\d+$/.test(tokens[1]) || Number(tokens[1]) < 2 || Number(tokens[1]) > 65) throw new Error("Imported 3D cube size must be an integer from 2 to 65.")
        size = Number(tokens[1])
      } else {
        if (tokens.length !== 4 || tokens.slice(1).some(t => !numberToken.test(t) || !Number.isFinite(Number(t)))) throw new Error(`${directive} needs exactly three finite numbers.`)
        const values = directive === "DOMAIN_MIN" ? minimum : maximum
        tokens.slice(1).forEach((v,i) => { values[i] = Number(v) })
      }
      continue
    }
    if (directive.startsWith("LUT_1D") || directive.includes("SHAPER")) throw new Error("1D and combined shaper LUTs are unsupported. Export a single baked 3D .cube LUT.")
    if (!size || tokens.length !== 3 || tokens.some(t => !numberToken.test(t) || !Number.isFinite(Number(t)))) throw new Error("Use a single 3D .cube with three finite numbers per row; unsupported directive or data.")
    const values=tokens.map(Number)
    if(values.some(v=>Math.abs(v)>3.4028234663852886e38))throw new Error("LUT output exceeds finite float32 export precision; rescale the source LUT.")
    rows.push(...values)
    if (rows.length > size**3*3) throw new Error("Imported LUT has extra table rows.")
  }
  if (!size || rows.length !== size**3*3) throw new Error("Imported LUT table is missing or truncated; expected size³ RGB rows.")
  if (minimum.some((v,i) => maximum[i] <= v || !Number.isFinite(maximum[i]-v))) throw new Error("DOMAIN_MAX must exceed DOMAIN_MIN with a finite span on every channel.")
  return { size, table: new Float64Array(rows), minimum, maximum }
}

export function sampleImportedCube(rgb: ArrayLike<number>, cube: ImportedCube): RGB {
  return applyCube([0,1,2].map(i => (rgb[i] - cube.minimum[i]) / (cube.maximum[i] - cube.minimum[i])), cube)
}

let lastHash: {text:string;digest:string}|undefined
export async function cubeSha256(text: string) {
  // Text is immutable; repeated band edits need not hash the same embedded asset again.
  if(lastHash?.text===text)return lastHash.digest
  if(!globalThis.crypto?.subtle)throw new Error("This browser cannot verify LUT identity. Open the app over HTTPS or localhost in a current browser.")
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,"0")).join("")
  lastHash={text,digest}
  return digest
}

export async function verifyImportedIdentity(imported: ImportedLut) {
  if (await cubeSha256(imported.cube) !== imported.sha256) throw new Error("Imported LUT identity check failed. Reattach the original .cube; no substitute was used.")
}

export function encodeOutput(value: number, transfer: OutputTransfer) {
  if (transfer === "gamma2.2" || transfer === "gamma2.4") return Math.sign(value) * Math.abs(value)**(1/Number(transfer.slice(5)))
  if (transfer === "sRGB") return value <= 0.0031308 ? 12.92*value : 1.055*value**(1/2.4)-0.055
  return value < 0.018 ? 4.5*value : 1.099 * Math.sign(value) * Math.abs(value)**0.45-0.099
}

export function decodeOutput(value: number, transfer: OutputTransfer) {
  if (transfer === "gamma2.2" || transfer === "gamma2.4") return Math.sign(value) * Math.abs(value)**Number(transfer.slice(5))
  if (transfer === "sRGB") return value <= 0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4
  return value < 0.081 ? value/4.5 : ((value+0.099)/1.099)**(1/0.45)
}

export function overlayInOutput(hex: string, imported: ImportedLut): RGB {
  let linear = [1,3,5].map(i => decodeOutput(Number.parseInt(hex.slice(i,i+2),16)/255,"sRGB"))
  if (imported.output_gamut === "Rec.2020") {
    // Colour's BT.709→BT.2020 matrix; exact BT.709 primaries avoid sRGB's rounded matrix.
    const matrix = [0.6274038959346987,0.3292830383778835,0.043313065687417246,0.06909728935823216,0.9195403950754586,0.011362315566309185,0.016391438875150228,0.08801330787722575,0.8955952532476239]
    linear = [0,3,6].map(row => matrix[row]*linear[0] + matrix[row+1]*linear[1] + matrix[row+2]*linear[2])
  }
  return linear.map(v => {
    const encoded = encodeOutput(v, imported.output_transfer)
    return imported.output_range === "legal" ? encoded*(876/1023)+64/1023 : encoded
  }) as RGB
}
