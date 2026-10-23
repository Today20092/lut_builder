import { NativeSelect } from "@/components/ui/native-select"
import { ChoiceField } from "./ChoiceField"
import { Trash2, Check, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Data, Effect } from "effect"
import { Button } from "@/components/ui/button"
import type { Setup } from "./editor"
import { browserProfiles, browserTargets } from "./lutEngine"
import { cubeSha256, MAX_CUBE_BYTES, parseImportedCube, type ImportedLut, type OutputTransfer } from "./importedLut"
import { decodeSetup } from "./setupSchema"
import { WorkspaceSheet } from "./WorkspaceSheet"

const field = "w-full min-w-0"
class LookImportError extends Data.TaggedError("LookImportError")<{message:string;cause?:unknown}> {}

export function ImportedLookSettings({setup,onChange}:{setup:Setup;onChange:(changes:Partial<Setup>)=>void}) {
  const [draft,setDraft] = useState<{name:string;cube:string;sha256:string;size:number}|null>(null)
  const [profile,setProfile] = useState(setup.profile)
  const [gamut,setGamut] = useState<ImportedLut["output_gamut"]>(setup.target === "Rec.2020" ? "Rec.2020" : "Rec.709")
  const [transfer,setTransfer] = useState<OutputTransfer>(setup.imported_lut?.output_transfer ?? "gamma2.2")
  const [range,setRange] = useState<"full"|"legal">(setup.legal_range ? "legal" : "full")
  const [status,setStatus] = useState("")
  const [busy,setBusy] = useState(false)
  const pending = useRef<AbortController|null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => {pending.current?.abort()},[setup])
  function cancel() {pending.current?.abort();pending.current=null;setBusy(false);setDraft(null);setStatus("LUT import cancelled. The current look was kept.")}
  async function choose(file:File) {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current=controller;setBusy(true);setDraft(null);setStatus("Reading and validating LUT…")
    const effect = Effect.tryPromise({
      try:async signal => {
        if (!/\.cube$/i.test(file.name)) throw new Error("Choose a .cube file containing a single baked 3D LUT.")
        if (file.size > MAX_CUBE_BYTES) throw new Error("Imported LUT exceeds the 16 MiB limit.")
        const cube = new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer())
        if (signal.aborted) throw new Error("LUT import cancelled.")
        const parsed = parseImportedCube(cube)
        return {name:file.name,cube,sha256:await cubeSha256(cube),size:parsed.size}
      },
      catch:cause => new LookImportError({message:cause instanceof Error ? cause.message : "Could not read this LUT. Choose the original .cube again.",cause}),
    })
    try {
      const next=await Effect.runPromise(effect,{signal:controller.signal})
      if (pending.current!==controller || controller.signal.aborted) return
      setDraft(next);setProfile(setup.profile);setGamut(setup.target === "Rec.2020" ? "Rec.2020" : "Rec.709");setRange(setup.legal_range ? "legal" : "full")
      setStatus(`${next.name}: ${next.size}³ table validated. Confirm its interpretation before applying.`)
    } catch(cause) {if (pending.current===controller && !controller.signal.aborted) setStatus(cause instanceof Error ? cause.message : "LUT import failed.")}
    finally {if(pending.current===controller){pending.current=null;setBusy(false)}}
  }
  async function confirm() {
    if (!draft) return
    const controller=new AbortController();pending.current?.abort();pending.current=controller;setBusy(true)
    const imported_lut:ImportedLut={version:1,name:draft.name,cube:draft.cube,sha256:draft.sha256,source_profile:profile,output_gamut:gamut,output_transfer:transfer,output_range:range}
    try {
      const next=await Effect.runPromise(decodeSetup({...setup,profile,target:gamut,legal_range:range==="legal",monochrome:false,ire_basis:"camera",imported_lut}),{signal:controller.signal})
      if(pending.current!==controller || controller.signal.aborted)return
      onChange(next);setDraft(null);setStatus("Imported look applied. Export includes source-exposure diagnostics.")
    } catch(cause) {if(!controller.signal.aborted)setStatus(cause instanceof Error ? cause.message : "Could not apply imported look.")}
    finally {if(pending.current===controller){pending.current=null;setBusy(false)}}
  }
  return <section className="grid min-w-0 gap-3" aria-label="Imported creative LUT">
    <p className="text-xs text-muted-foreground">Optional. Replace your viewing LUT with the combined export, at the original camera-log input. Never apply it after that look. Exposure is measured before the look.</p>
    {setup.imported_lut && <div className="grid gap-2 rounded-md border p-3 text-sm">
      <p className="break-all">{setup.imported_lut.name}</p>
      <p className="text-xs">{setup.imported_lut.source_profile} → {setup.imported_lut.output_gamut} / {setup.imported_lut.output_transfer} / {setup.imported_lut.output_range}</p>
      <Button variant="outline" onClick={()=>{cancel();onChange({imported_lut:undefined});setStatus("Imported look removed. Standard diagnostic pipeline restored.")}}><Trash2 data-icon="inline-start" aria-hidden="true" />Remove imported look</Button>
    </div>}
    <label className="grid gap-2 text-sm">Import .cube LUT<input ref={input} className="min-h-11 max-w-full min-w-0 text-sm" type="file" accept=".cube" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void choose(file)}} /></label>
    <p className="text-xs text-muted-foreground">Single 3D Iridas .cube, size 2–65, up to 16 MiB. 1D/shaper LUTs are unsupported; bake them into a 3D cube. Portable setups embed the exact LUT.</p>
    <WorkspaceSheet open={Boolean(draft)} title="Confirm imported LUT" onClose={cancel} returnFocus={input}>
    {draft && <fieldset className="grid gap-3" disabled={busy}>
      <legend className="mb-2 text-sm font-medium">Input and output</legend>
      <p className="break-all text-sm">{draft.name} · {draft.size}³</p>
      <p className="text-xs text-muted-foreground">Choose the actual input/output of this LUT. Filenames do not establish colorimetry. Applying also selects source-camera IRE and turns monochrome off to preserve the look.</p>
      <label className="grid gap-1 text-sm">LUT camera input<NativeSelect className={field} value={profile} onChange={e=>setProfile(e.target.value)}>{browserProfiles.map(p=><option key={p}>{p}</option>)}</NativeSelect></label>
      <ChoiceField label="LUT output primaries" value={gamut} onChange={value => setGamut(value as ImportedLut["output_gamut"])} options={browserTargets.map(value => ({ value, label: value }))} />
      <ChoiceField label="LUT output transfer" value={transfer} onChange={setTransfer} options={[{ value: "gamma2.2", label: "Gamma 2.2" }, { value: "gamma2.4", label: "Gamma 2.4" }, { value: "sRGB", label: "sRGB" }, { value: "BT.709", label: "BT.709 OETF" }]} />
      <ChoiceField label="LUT output range" value={range} onChange={setRange} options={[{ value: "full", label: "Full (0–1023)" }, { value: "legal", label: "Legal (64–940)" }]} />
      <Button onClick={()=>void confirm()}><Check data-icon="inline-start" aria-hidden="true" />Confirm and apply look</Button>
    </fieldset>}
    {draft && <Button variant="outline" onClick={cancel}><X data-icon="inline-start" aria-hidden="true" />Cancel LUT import</Button>}
    </WorkspaceSheet>
    {busy && !draft && <Button variant="outline" onClick={cancel}><X data-icon="inline-start" aria-hidden="true" />Cancel LUT import</Button>}
    <p className="break-words text-xs" role="status" aria-live="polite">{status}</p>
  </section>
}
