import assert from "node:assert/strict"
import test from "node:test"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {generateCube} from "../src/lutEngine.ts"
import {cubeSha256,parseImportedCube,sampleImportedCube} from "../src/importedLut.ts"
import {parseCube,applyCube,displayRgb} from "../src/verificationMath.ts"

const nonlinear="LUT_3D_SIZE 5\n"+[0,.25,.5,.75,1].flatMap(b=>[0,.25,.5,.75,1].flatMap(g=>[0,.25,.5,.75,1].map(r=>`${r*r+.1*g} ${.8*g*g+.05*b} ${.6*b*b+.2*r}`))).join("\n")
const base={profile:"Panasonic V-Log",target:"Rec.709",cube_size:17,bands:[],band_mode:"stops",ire_basis:"camera",fill_mode:false,low_signal_warning:false,low_signal_hex:"#ff0000",high_signal_warning:false,high_signal_hex:"#ffffff",monochrome:false,legal_range:false,output:"parity.cube"}

test("imported transforms match Python at every serialized node including gamma/range/gamut and priority",async()=>{
  const imported={version:1,name:"nonlinear.cube",cube:nonlinear,sha256:await cubeSha256(nonlinear),source_profile:base.profile,output_gamut:base.target,output_transfer:"gamma2.2",output_range:"full"}
  const setups=[{...base,cube_size:33,imported_lut:imported}]
  for(const transfer of ["gamma2.2","gamma2.4","sRGB","BT.709"])for(const target of ["Rec.709","Rec.2020"])for(const legal of [false,true]) {
    setups.push({...base,target,legal_range:legal,bands:[{stop:0,width:1,color:"#336699"},{stop:1,width:1,color:"#808080"}],low_signal_warning:true,high_signal_warning:true,imported_lut:{...imported,output_gamut:target,output_transfer:transfer,output_range:legal?"legal":"full"}})
  }
  for(const cube_size of [33,65])setups.push({...base,cube_size,imported_lut:imported,bands:[{stop:0,width:.25,color:"#ffffff"}]})
  const python=spawnSync("uv",["run","--locked","python","frontend/tests/python-lut-reference.py"],{cwd:fileURLToPath(new URL("../../",import.meta.url)),input:JSON.stringify(setups),encoding:"utf8",maxBuffer:32*1024*1024})
  assert.equal(python.status,0,python.stderr)
  const reference=JSON.parse(python.stdout)
  let maximum=0
  for(const [i,setup] of setups.entries()) {
    const cube=parseCube(await generateCube(setup))
    for(let node=0;node<reference[i].length;node++) for(let channel=0;channel<3;channel++) {
      const error=Math.abs(cube.table[node*3+channel]-reference[i][node][channel]);maximum=Math.max(maximum,error)
      assert.ok(error<=2e-7,`case${i},node${node},channel${channel}: ${error}`)
    }
    if(i===0) {
      const direct=sampleImportedCube([3/32,11/32,27/32],parseImportedCube(nonlinear))
      assert.ok(applyCube([3/32,11/32,27/32],cube).every((v,c)=>Math.abs(v-direct[c])<2e-7))
    }
  }
  console.log(`Imported Python/browser serialized parity: ${setups.length} cases; maximum absolute channel error ${maximum}`)
})

test("view-only Look does not change diagnostics or export and output transfer display agrees with sRGB",async()=>{
  const gray="LUT_3D_SIZE 2\n"+Array(8).fill("0.3 0.3 0.3").join("\n")
  const imported={version:1,name:"gray.cube",cube:gray,sha256:await cubeSha256(gray),source_profile:base.profile,output_gamut:base.target,output_transfer:"gamma2.4",output_range:"full"}
  const setup={...base,bands:[{stop:0,width:1,color:"#336699"}],imported_lut:imported}
  const look=parseCube(await generateCube(setup,{diagnostics:false}))
  assert.ok(applyCube([7/16,7/16,7/16],look).every(v=>Math.abs(v-.3)<1e-7))
  const diagnostic=parseCube(await generateCube(setup))
  const displayed=displayRgb(applyCube([7/16,7/16,7/16],diagnostic),setup)
  assert.ok(displayed.every((v,c)=>Math.abs(v-[.2,.4,.6][c])<4e-7))
})
