import assert from "node:assert/strict"
import test,{after} from "node:test"
import {mkdtemp,writeFile,rm} from "node:fs/promises"
import {join} from "node:path"
import {pathToFileURL} from "node:url"
import {build,stop} from "esbuild"
import {JSDOM} from "jsdom"
import {Effect} from "effect"
import {generateCube} from "../src/lutEngine.ts"
const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost/"})
for(const key of ["window","document","Element","HTMLElement","Node"])globalThis[key]=key==="window"?dom.window:dom.window[key]
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
after(()=>dom.window.close())
const bundle=await build({bundle:true,external:["@base-ui/react/*","lucide-react","react","react/jsx-runtime","react-dom","react-dom/client"],format:"esm",jsx:"automatic",platform:"node",stdin:{contents:`export {ImportedLookSettings} from "./src/ImportedLookSettings.tsx";export {ImportedLookPreview} from "./src/ImportedLookPreview.tsx";export {CheckedImage,SdrViewDescription} from "./src/CameraVerification.tsx";export {default as React,act} from "react";export {createRoot} from "react-dom/client";`,resolveDir:process.cwd(),sourcefile:"imported-ui.ts"},write:false})
stop()
const directory=await mkdtemp(join(process.cwd(),"tests",".look-")),path=join(directory,"test.mjs")
await writeFile(path,bundle.outputFiles[0].text)
const {ImportedLookSettings,ImportedLookPreview,CheckedImage,SdrViewDescription,React,act,createRoot}=await import(pathToFileURL(path).href)
await rm(directory,{recursive:true})
const identity="LUT_3D_SIZE 2\n"+[0,1].flatMap(b=>[0,1].flatMap(g=>[0,1].map(r=>`${r} ${g} ${b}`))).join("\n")
const initial={profile:"Panasonic V-Log",target:"Rec.709",cube_size:17,bands:[{stop:0,width:.5,color:"#00ff00"}],band_mode:"stops",fill_mode:false,low_signal_warning:false,low_signal_hex:"",high_signal_warning:false,high_signal_hex:"",monochrome:true,legal_range:false,output:"camera.cube"}
function harness(Component,props){const container=document.createElement("div");document.body.append(container);const root=createRoot(container);return{container,root,render:()=>act(()=>root.render(React.createElement(Component,props))),button:text=>[...container.querySelectorAll("button")].find(b=>b.textContent===text)}}
async function fileInput(container,file){const input=container.querySelector("input[type=file]");Object.defineProperty(input,"files",{configurable:true,value:[file]});await act(async()=>{input.dispatchEvent(new window.Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,20))})}
const file=(name,text)=>({name,size:new TextEncoder().encode(text).length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer})

test("SDR help describes the declared imported output instead of the ordinary viewing transfer", async () => {
  const props = { setup: initial }
  const view = harness(SdrViewDescription, props)
  try {
    await view.render()
    assert.match(view.container.textContent, /ideal-black BT\.1886/)
    props.setup = { ...initial, imported_lut: { output_gamut: "Rec.2020", output_transfer: "gamma2.2", output_range: "legal" } }
    await view.render()
    assert.match(view.container.textContent, /Rec\.2020, gamma2\.2, legal output range/)
    assert.doesNotMatch(view.container.textContent, /BT\.1886/)
  } finally { await act(() => view.root.unmount()); view.container.remove() }
})

test("import requires explicit interpretation, preserves current look on failure/cancellation and removes deliberately",async()=>{
  const state={setup:{...initial},onChange(changes){state.setup={...state.setup,...changes};view.root.render(React.createElement(ImportedLookSettings,state))}}
  const view=harness(ImportedLookSettings,state)
  try{
    await view.render()
    await fileInput(view.container,file("view.cube",identity))
    assert.equal(state.setup.imported_lut,undefined)
    assert.match(view.container.textContent,/Confirm LUT interpretation/)
    await act(async()=>{view.button("Confirm and apply look").click();await new Promise(r=>setTimeout(r,20))})
    assert.equal(state.setup.imported_lut.name,"view.cube")
    assert.equal(state.setup.imported_lut.output_transfer,"gamma2.2")
    assert.equal(state.setup.monochrome,false)
    assert.equal(state.setup.ire_basis,"camera")
    const current=state.setup.imported_lut
    await fileInput(view.container,file("broken.cube","LUT_1D_SIZE 2"))
    assert.match(view.container.textContent,/single baked 3D/)
    assert.equal(state.setup.imported_lut,current)
    let resolve
    await fileInput(view.container,{name:"late.cube",size:42,arrayBuffer:()=>new Promise(r=>{resolve=r})})
    await act(()=>view.button("Cancel LUT import").click())
    await act(async()=>{resolve(new TextEncoder().encode(identity).buffer);await new Promise(r=>setTimeout(r,20))})
    assert.equal(state.setup.imported_lut,current)
    assert.match(view.container.textContent,/cancelled/)
    await act(()=>view.button("Remove imported look").click())
    assert.equal(state.setup.imported_lut,undefined)
  }finally{await act(()=>view.root.unmount());view.container.remove()}
})

test("sampled camera-code reference comparison is viewing only and stale workers are terminated",async()=>{
  const workers=[]
  globalThis.Worker=class{constructor(){workers.push(this)}postMessage(message){this.message=message;if(message.type==="generate")generateCube(message.setup).then(cube=>{if(!this.terminated)this.onmessage({data:{type:"complete",id:message.id,bytes:new TextEncoder().encode(cube).buffer}})})}terminate(){this.terminated=true}}
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity))
  const sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("")
  const setup={...initial,monochrome:false,ire_basis:"camera",imported_lut:{version:1,name:"look.cube",cube:identity,sha256,source_profile:initial.profile,output_gamut:"Rec.709",output_transfer:"gamma2.2",output_range:"full"}}
  const view=harness(ImportedLookPreview,{setup})
  try{
    await act(async()=>{view.root.render(React.createElement(ImportedLookPreview,{setup}));await new Promise(r=>setTimeout(r,1000))})
    // Effects launch after act flush; finish generation in a second act.
    await act(async()=>{await new Promise(r=>setTimeout(r,700))})
    const original=JSON.stringify(setup)
    assert.equal(view.container.querySelectorAll('[aria-label="Neutral camera patches at labeled stops"] [style]').length,9)
    await act(()=>view.button("Look").click())
    assert.equal(JSON.stringify(setup),original)
    assert.equal(view.button("Look").getAttribute("aria-pressed"),"true")
    await act(()=>view.root.render(React.createElement(ImportedLookPreview,{setup:{...setup,bands:[]}})))
    await act(()=>view.root.unmount())
    assert.ok(workers.every(w=>w.terminated))
  }finally{await act(()=>view.root.unmount());view.container.remove();delete globalThis.Worker}
})

test("verified media Look comparison keeps diagnostic artifact and pixel inspection",async()=>{
  const result={width:1,height:1,image:"data:image/png;base64,diagnostic",look_image:"data:image/png;base64,look",provenance:{warnings:[],comparison_unavailable:""},inspect:()=>Effect.succeed({x:0,y:0,source_rgb:[.4,.4,.4],output_rgb:[1,0,0],display_rgb:[1,0,0]}),cube:()=>Effect.succeed(new Blob(["diagnostic artifact"]))}
  const view=harness(CheckedImage,{result})
  try{await view.render();await act(()=>view.button("Look").click());assert.equal(view.container.querySelector("img").getAttribute("src"),result.look_image);await act(()=>view.button("Inspect pixel").click());assert.match(view.container.textContent,/Cube output RGB: 1.000000000, 0.000000000, 0.000000000/);assert.equal(await(await Effect.runPromise(result.cube())).text(),"diagnostic artifact")}finally{await act(()=>view.root.unmount());view.container.remove()}
})
