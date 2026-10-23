import { useEffect, useState } from "react"
import { Effect } from "effect"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Eye, ScanLine } from "lucide-react"
import type { Setup } from "./editor"
import { generateInWorker } from "./lutWorkerClient"
import { applyCube, displayRgb, parseCube } from "./verificationMath"
import { parseImportedCube, sampleImportedCube, setupIdentity } from "./importedLut"
import { logDecodeAtGrid } from "./lutColorData"

type Patch={stop:number;look:string;diagnostic:string}

/** Compare actual exported samples against the look on original neutral camera codes. */
export function ImportedLookPreview({setup}:{setup:Setup}) {
  const [diagnostics,setDiagnostics]=useState(true)
  const [result,setResult]=useState<{key:string;patches:Patch[]}|null>(null)
  const [error,setError]=useState("")
  const key=JSON.stringify(setupIdentity(setup))
  useEffect(()=>{
    if(!setup.imported_lut)return
    const controller=new AbortController()
    void Effect.runPromise(generateInWorker(setup,()=>{}),{signal:controller.signal}).then(bytes=>{
      if(controller.signal.aborted)return
      const combined=parseCube(new TextDecoder().decode(bytes))
      const look=parseImportedCube(setup.imported_lut!.cube)
      const decodes=logDecodeAtGrid[setup.profile as keyof typeof logDecodeAtGrid]
      const patches=[-6,-4,-2,-1,0,1,2,4,6].map(stop=>{
        const desired=0.18*2**stop
        const index=decodes.reduce((best,value,i)=>Math.abs(value-desired)<Math.abs(decodes[best]-desired)?i:best,0)
        const input=[index/64,index/64,index/64]
        const css=(rgb:number[])=>`rgb(${displayRgb(rgb,setup).map(v=>Math.round(v*255)).join(" ")})`
        return {stop:Math.log2(Math.max(decodes[index],1e-6)/0.18),look:css(sampleImportedCube(input,look)),diagnostic:css(applyCube(input,combined))}
      })
      setResult({key,patches});setError("")
    }).catch(cause=>{if(!controller.signal.aborted){setResult(null);setError(cause instanceof Error?cause.message:"Could not prepare imported LUT preview.")}})
    return ()=>controller.abort()
  },[setup,key])
  if(!setup.imported_lut)return null
  const current=result?.key===key?result:null
  return <section className="grid min-w-0 gap-3" aria-label="Imported look comparison">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Camera exposure reference</h3><ToggleGroup variant="outline" value={[diagnostics ? "diagnostics" : "look"]} onValueChange={(values)=>{if(values.length)setDiagnostics(values[0]==="diagnostics")}} aria-label="Exposure preview viewing mode"><ToggleGroupItem value="look"><Eye data-icon="inline-start" aria-hidden="true" />Look</ToggleGroupItem><ToggleGroupItem value="diagnostics"><ScanLine data-icon="inline-start" aria-hidden="true" />Look + diagnostics</ToggleGroupItem></ToggleGroup></div>
    <div className="grid grid-cols-9 gap-0.5" aria-label="Neutral camera patches at labeled stops">{current?.patches.map((p,i)=><div key={i} className="min-w-0 text-center"><div className="h-12 rounded-sm border" style={{backgroundColor:diagnostics?p.diagnostic:p.look}}/><span className="text-[10px] tabular-nums">{p.stop>0?"+":""}{p.stop.toFixed(1)}</span></div>)}</div>
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">About this comparison</summary><p className="mt-2">Original neutral camera codes, labeled in stops. Diagnostics use the sampled exported {setup.cube_size}³ transform; thin markers can blur or miss grid nodes. Look uses the imported transform directly. Viewing mode never changes export.</p></details>
    {!current&&!error&&<p role="status" className="text-xs">Updating sampled LUT preview…</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}
