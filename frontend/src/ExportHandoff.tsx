import { HelpLink } from "./HelpLink"
import { Button } from "@/components/ui/button"
import { exportCompatibility, type ExportDestination } from "./exportDestination"
import type { Setup } from "./editor"

export function ExportHandoff({ setup, destination, onDestination, onCameraSettings, downloaded }: {
  setup: Setup; destination: ExportDestination; onDestination: (value: ExportDestination) => void; onCameraSettings: () => void; downloaded: boolean
}) {
  const issues = exportCompatibility(setup, destination)
  return <section className="export-handoff" aria-label="Use your LUT">
    <fieldset className="grid gap-2">
      <legend className="mb-3 font-medium">Where will you use this LUT?</legend>
      {([
        ["general", "General .cube", "Keep a general-purpose file; check your device’s requirements."],
        ["s5iix", "Lumix S5IIX", "V-Log View Assist · camera size, range and filename checks."],
        ["monitor", "External monitor", "Load into a user LUT slot for your camera log signal."],
        ["editor", "Editing software", "Inspect exposure before a display conversion or creative grade."],
      ] as const).map(([value, label, description]) => <label key={value} className="workspace-radio-choice">
        <input type="radio" name="export-destination" value={value} checked={destination === value} onChange={() => onDestination(value)} />
        <span><span className="font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
      </label>)}
    </fieldset>
    {issues.length > 0 && <div className="export-compatibility" role="status"><h3 className="font-semibold">Before exporting for the S5IIX</h3><ul className="list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><Button variant="outline" onClick={onCameraSettings} disabled={Boolean(setup.imported_lut)}>Use V-Log, 33³ and full range</Button><p>Changing camera keeps your bands. Review their exposure thresholds.</p>{setup.imported_lut && <p>Remove or replace the imported look in Configure before changing its camera input.</p>}</div>}
    {destination === "s5iix" && <p className="text-muted-foreground">The camera download uses an eight-character settings ID as its filename, compatible with SD / SDHC cards.</p>}
    <details open={downloaded || undefined}><summary>{destination === "s5iix" ? "Load it into your S5IIX" : "After download"}</summary><div className="grid gap-3 pt-3">
    {destination === "s5iix" ? <>
      <ol className="list-decimal pl-5 space-y-2"><li>Copy the .cube file to the root of your SD card. Keep its short filename; if renaming, use letters and numbers only, with at most 8 characters before .cube for SD / SDHC cards.</li><li>On the camera, open LUT Library, choose a slot, then Load and select the card and file. Loading into a used slot replaces its LUT.</li><li>Set Photo Style to V-Log. In V-Log View Assist, choose your LUT under LUT Select and enable LUT View Assist (Monitor).</li></ol>
      <p>Use View Assist for exposure monitoring. REAL TIME LUT applies the diagnostic colors to the recorded image. Enable HDMI assist only when you want those colors on the HDMI output.</p>
      <HelpLink className="underline" href="https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2X/html/DC-S5M2X_DVQP2992_eng/0093.html" target="_blank" rel="noreferrer">Panasonic V-Log View Assist instructions</HelpLink>
      <HelpLink className="underline" href="https://eww.pavc.panasonic.co.jp/dscoi/DC-S5M2X/html/DC-S5M2X_DVQP2992_eng/0072.html" target="_blank" rel="noreferrer">Panasonic LUT file requirements</HelpLink>
    </> : <p>{destination === "monitor" ? "Check the monitor’s supported cube sizes and input range, then load this file into a user LUT slot. Feed it the selected camera log signal, before any other viewing LUT." : destination === "editor" ? "Apply this LUT to the selected camera log signal before a display conversion or creative grade. Use it for exposure inspection; disable it for your final image unless false color is intended." : "Choose a destination for application guidance. Match the selected camera log signal and confirm your device’s supported cube size and range before loading."}</p>}
    <p className="text-muted-foreground">Input: {setup.profile}. Output: {setup.target}{setup.imported_lut ? ` / ${setup.imported_lut.output_transfer}` : ""}, {setup.legal_range ? "legal" : "full"} range. Avoid applying a second log-to-display conversion.</p>
    </div></details>
  </section>
}
