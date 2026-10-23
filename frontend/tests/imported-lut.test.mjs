import test from "node:test"
import assert from "node:assert/strict"
import { parseImportedCube, sampleImportedCube } from "../src/importedLut.ts"
import { cubeSha256 } from "../src/importedLut.ts"
import { generateCube } from "../src/lutEngine.ts"
import { parseCube, applyCube, displayRgb } from "../src/verificationMath.ts"
import { Effect } from "effect"
import { decodeSetup } from "../src/setupSchema.ts"
import { exportSetup, importSetup } from "../src/editor.ts"
import { saveSetupPreset, readSetupPresets } from "../src/setupPresets.ts"
import { outputFilename } from "../src/outputFilename.ts"

export const identity = "LUT_3D_SIZE 2\n" + [0,1].flatMap(b => [0,1].flatMap(g => [0,1].map(r => `${r} ${g} ${b}`))).join("\n")

test("strict imported cube honors red-fastest axes and nonunit domain", () => {
  const cube = parseImportedCube("DOMAIN_MIN -1 -2 -3\nDOMAIN_MAX 1 2 3\n" + identity)
  assert.deepEqual(sampleImportedCube([0.5,0,-1.5], cube), [0.75,0.5,0.25])
  assert.deepEqual(sampleImportedCube([-100,100,0], cube), [0,1,.5])
  for (const text of [identity+"\n0 0 0", identity.replace("1 1 1", "NaN 1 1"),identity.replace("1 1 1","1e100 1 1"), "LUT_1D_SIZE 2", "DOMAIN_MIN 1 0 0\n"+identity, "LUT_3D_SIZE 2\n"+identity]) {
    assert.throws(() => parseImportedCube(text))
  }
})

test("named presets retain embedded identity, fail visibly on missing assets and report quota failure",async()=>{
  const setup=await compositionSetup()
  let saved
  const storage={getItem:()=>saved??null,setItem:(_key,value)=>{saved=value}}
  await Effect.runPromise(saveSetupPreset(()=>storage,[],"Travel look",setup))
  assert.equal(JSON.parse(saved).version,2)
  assert.equal(JSON.parse(saved).presets[0].setup.version,3)
  assert.deepEqual((await Effect.runPromise(readSetupPresets(()=>storage)))[0].setup.imported_lut,setup.imported_lut)
  const damaged=JSON.parse(saved)
  delete damaged.presets[0].setup.imported_lut
  saved=JSON.stringify(damaged)
  await assert.rejects(Effect.runPromise(readSetupPresets(()=>storage)),/damaged/)
  await assert.rejects(Effect.runPromise(saveSetupPreset(()=>({setItem(){throw new Error("quota")}}),[],"Travel look",setup)),/Export setup JSON/)
})

export async function compositionSetup(text=identity) {
  return {profile:"Panasonic V-Log",target:"Rec.709",cube_size:33,bands:[{stop:0,width:0.8,color:"#808080"}],band_mode:"stops",ire_basis:"camera",fill_mode:false,low_signal_warning:false,low_signal_hex:"",high_signal_warning:false,high_signal_hex:"",monochrome:false,legal_range:false,output:"composed.cube",imported_lut:{version:1,name:"look.cube",cube:text,source_profile:"Panasonic V-Log",output_gamut:"Rec.709",output_transfer:"gamma2.2",output_range:"full",sha256:await cubeSha256(text)}}
}

test("cancelling named library validation stops before hashing the next imported asset", async () => {
  const setup = await compositionSetup()
  const second = await compositionSetup(identity + "\n# second imported asset")
  await cubeSha256("invalidate cached digest before controlled verification")
  const raw = JSON.stringify({ version: 2, presets: [setup, second].map((value, i) => ({ name: String(i), setup: JSON.parse(exportSetup(value)) })) })
  const originalDigest = crypto.subtle.digest
  let release
  let started
  let calls = 0
  const hashing = new Promise(resolve => { started = resolve })
  const held = new Promise(resolve => { release = resolve })
  crypto.subtle.digest = async (...args) => { calls++; started(); await held; return originalDigest.apply(crypto.subtle, args) }
  const controller = new AbortController()
  try {
    const reading = Effect.runPromiseExit(readSetupPresets(() => ({ getItem: () => raw })), { signal: controller.signal })
    await hashing
    controller.abort()
    const exit = await reading
    assert.equal(exit._tag, "Failure")
    release()
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(calls, 1, "interruption must stop collection traversal")
  } finally {
    release()
    crypto.subtle.digest = originalDigest
  }
})

test("Panasonic V-Log composition preserves base and outputs correctly encoded display colors", async () => {
  const setup = await compositionSetup()
  const cube = parseCube(await generateCube(setup))
  assert.deepEqual(applyCube([2/32,8/32,25/32],cube),[2/32,8/32,25/32])
  const overlay = applyCube([14/32,14/32,14/32],cube)
  const expected = ((128/255+0.055)/1.055)**(2.4/2.2)
  assert.ok(overlay.every(v => Math.abs(v-expected)<1e-7))
  assert.ok(displayRgb(overlay,setup).every(v => Math.abs(v-128/255)<2e-7))
  const portable = exportSetup(setup)
  assert.equal(JSON.parse(portable).version,3)
  const restored = await importSetup(portable,s => Effect.runPromise(decodeSetup(s)))
  assert.deepEqual(restored.imported_lut,setup.imported_lut)
  await assert.rejects(Effect.runPromise(decodeSetup({...setup,imported_lut:{...setup.imported_lut,sha256:"0".repeat(64)}})),/identity/)
  await assert.rejects(importSetup(JSON.stringify({...JSON.parse(portable),imported_lut:undefined}),s=>Effect.runPromise(decodeSetup(s))),/missing/)
  await assert.rejects(importSetup(JSON.stringify({...JSON.parse(portable),version:1}),s=>Effect.runPromise(decodeSetup(s))),/version 3/)
  for(const changes of [{profile:"Sony S-Log3"},{target:"Rec.2020"},{monochrome:true},{legal_range:true},{ire_basis:"target"},{bands:[{stop:0,width:0,color:"#ffffff"}]}])await assert.rejects(Effect.runPromise(decodeSetup({...setup,...changes})))
  const named={...setup,output:"%targetgamma%-%id%.cube"}
  assert.match(outputFilename(named),/gamma2-2/)
  assert.notEqual(outputFilename(named),outputFilename({...named,imported_lut:{...named.imported_lut,sha256:"0".repeat(64)}}))
})
