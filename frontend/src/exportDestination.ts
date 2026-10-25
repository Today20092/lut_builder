import type { Setup } from "./editor.ts"
import { outputFilename } from "./outputFilename.ts"

export type ExportDestination = "general" | "s5iix"

export function destinationFilename(setup: Setup, destination: ExportDestination): string {
  return outputFilename(destination === "s5iix" ? { ...setup, output: "%id%.cube" } : setup)
}

export function exportCompatibility(setup: Setup, destination: ExportDestination): string[] {
  if (destination !== "s5iix") return []
  const issues: string[] = []
  if (setup.profile !== "Panasonic V-Log") issues.push("Select Panasonic V-Log to match the camera’s V-Log recording signal.")
  if (setup.cube_size > 33) issues.push("Use 17³ or 33³. The S5IIX does not accept 65³ LUTs.")
  if (setup.legal_range) issues.push("Use full-range LUT output, as recommended by Panasonic.")
  return issues
}
