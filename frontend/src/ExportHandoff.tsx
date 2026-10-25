import { Button } from "@/components/ui/button"
import { exportCompatibility, type ExportDestination } from "./exportDestination"
import type { Setup } from "./editor"

export function ExportHandoff({ setup, destination, onDestination, onCameraSettings }: {
  setup: Setup; destination: ExportDestination; onDestination: (value: ExportDestination) => void; onCameraSettings: () => void
}) {
  const issues = exportCompatibility(setup, destination)
  return <section className="export-handoff" aria-label="Use your LUT">
    <fieldset className="grid gap-2">
      <legend className="mb-3 font-medium">Download format</legend>
      {([
        ["general", "General .cube", "Uses your output settings and filename for monitors and editing software."],
        ["s5iix", "Lumix S5IIX", "Checks V-Log, cube size and full range; uses an eight-character filename."],
      ] as const).map(([value, label, description]) => <label key={value} className="workspace-radio-choice">
        <input type="radio" name="export-destination" value={value} checked={destination === value} onChange={() => onDestination(value)} />
        <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
      </label>)}
    </fieldset>
    {issues.length > 0 && <div className="export-compatibility" role="status"><h3 className="font-semibold">Before exporting for the S5IIX</h3><ul className="list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><Button variant="outline" onClick={onCameraSettings} disabled={Boolean(setup.imported_lut)}>Use V-Log, 33³ and full range</Button><p>Changing camera keeps your bands. Review their exposure thresholds.</p>{setup.imported_lut && <p>Remove or replace the imported look in Configure before changing its camera input.</p>}</div>}
  </section>
}
