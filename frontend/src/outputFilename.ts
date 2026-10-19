import type { Setup } from "./editor"
import { cubeFilename } from "./lutEngine"

export const defaultFilenameTemplate = "%inputgamma%-%targetgamma%-%id%.cube"

export function outputFilename(setup: Setup) {
  // A content ID stays stable on repeat downloads and changes with the setup.
  let hash = 2166136261
  for (const character of JSON.stringify([
    setup.profile, setup.target, setup.cube_size, setup.band_mode, setup.fill_mode,
    ...(setup.ire_basis === "camera" ? ["camera-log-ire"] : []),
    setup.bands.map(({ stop, width, color }) => [stop, width, color]),
    setup.low_signal_warning, setup.low_signal_hex, setup.high_signal_warning,
    setup.high_signal_hex, setup.monochrome, setup.legal_range,
  ])) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  const tokens: Record<string, string> = {
    inputgamma: setup.profile.replace(/[^A-Za-z0-9_-]+/g, "-"),
    targetgamma: setup.target.replace(/[^A-Za-z0-9_-]+/g, "-"),
    id: (hash >>> 0).toString(16).padStart(8, "0"),
  }
  return cubeFilename(setup.output.replace(/%(inputgamma|targetgamma|id)%/gi, (_, token: string) => tokens[token.toLowerCase()]))
}
