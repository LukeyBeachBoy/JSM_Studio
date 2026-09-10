const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const source = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src/hooks/useTelemetry.ts', 'utf8');
let now=0, nextId=0, renders=0, sample, callback, calibration, cleanup;
const timers=new Map(), listeners=new Map();
const target = prefix => ({
 addEventListener:(name,fn)=>listeners.set(prefix+name,fn),
 removeEventListener:name=>listeners.delete(prefix+name)
});
const doc={...target('doc:'),hidden:false,hasFocus:()=>true};
const win=target('win:');
let stateIndex=0;
const react={useEffect:fn=>{cleanup=fn()},useState:initial=>{
 const index=stateIndex++;
 return [initial,value=>{if(index===0){renders++;sample=value}}];
}};
const bridge={onTelemetrySample:fn=>{callback=fn;return()=>callback=null},onCalibrationStatus:fn=>{calibration=fn;return()=>calibration=null}};
const exportsForHook={};
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','require','document','window','performance','setTimeout','clearTimeout',compiled)(exportsForHook,
 name=>name==='react'?react:{desktopBridge:bridge},doc,win,{now:()=>now},
 (fn,delay)=>{const id=++nextId;timers.set(id,{fn,at:now+delay});return id},id=>timers.delete(id));
exportsForHook.useTelemetry();
function advance(to){
 while(true){let earliest;for(const [id,t] of timers)if(t.at<=to&&(!earliest||t.at<earliest[1].at))earliest=[id,t];
 if(!earliest)break;now=earliest[1].at;timers.delete(earliest[0]);earliest[1].fn();}now=to;
}
function packets(count){for(let i=0;i<count;i++){advance(now+1000/120);callback({seq:i,devices:[]})}}
packets(120);advance(now+20);
assert.ok(renders<=62&&renders>=59,`120 Hz packets caused ${renders} renders`);
assert.equal(sample.seq,119,'trailing packet must be published');
const activeRenders=renders;
advance(now+5000);assert.equal(renders,activeRenders,'stale packets must not run an animation loop');
listeners.get('win:blur')();packets(120);
assert.equal(renders,activeRenders,'background preview must not render');assert.equal(timers.size,0);
listeners.get('win:focus')();assert.equal(sample.seq,119);
assert.equal(renders,activeRenders+1,'focus restores latest sample immediately');
callback({seq:999});assert.equal(timers.size,1);
doc.hidden=true;listeners.get('doc:visibilitychange')();assert.equal(timers.size,0);
advance(now+100);assert.equal(renders,activeRenders+1);
doc.hidden=false;listeners.get('doc:visibilitychange')();assert.equal(sample.seq,999);
callback({seq:1000});cleanup();advance(now+100);
assert.equal(sample.seq,999,'unmount cancels queued update');assert.equal(listeners.size,0);assert.equal(callback,null);assert.equal(calibration,null);
console.log(`PASS: 120 packets -> ${activeRenders} preview updates; idle/background -> 0; latest packet, visibility, resume and cleanup verified`);
