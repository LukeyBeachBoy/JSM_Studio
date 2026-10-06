const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const gui = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(gui, 'node_modules/typescript'))
const cache = new Map()
function load(relative) {
 if(cache.has(relative))return cache.get(relative).exports
 const module={exports:{}};cache.set(relative,module)
 const js=ts.transpileModule(fs.readFileSync(path.join(gui,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 new Function('module','exports','require',js)(module,module.exports,name=>name.startsWith('.')?load(path.relative(gui,path.resolve(gui,path.dirname(relative),name+'.ts'))):require(require.resolve(name,{paths:[gui]})))
 return module.exports
}
const curves=load('src/utils/accelCurve.ts')
const keymap=load('src/utils/keymap.ts')
const scope=load('src/utils/gyroSettingsScope.ts')
const serializer=load('src/utils/configSerializer.ts')
const params={curveType:'QUADRATIC',minSens:5,maxSens:21,minThreshold:0,maxThreshold:80,naturalVHalf:20,powerVRef:20,powerExponent:.5,sigmoidMid:20,sigmoidWidth:8,jumpTau:1.5}
const near=(a,b)=>assert(Math.abs(a-b)<.0001,`${a} != ${b}`)
const floor=(value,enabled=value>0)=>({...params,steadying:{cutoff:0,recovery:5,floor:value,enabled}})
near(curves.accelSensitivityAt(0,floor(2)),2)
near(curves.accelSensitivityAt(1,floor(2)),2.6005)
near(curves.accelSensitivityAt(3,floor(2)),3.8135)
near(curves.accelSensitivityAt(80,{...params,minThreshold:10}),17.25)
near(curves.accelSensitivityAt(90,{...params,minThreshold:10}),21)
for(const invalid of [-1,NaN,Infinity])near(curves.accelSensitivityAt(1,floor(invalid,true)),curves.accelSensitivityAt(1,floor(0,true)))
near(curves.accelSensitivityAt(1,floor(99)),curves.accelSensitivityAt(1,params))
for(const curveType of curves.ACCEL_CURVE_TYPES)for(const speed of [0,.001,1,3,4.99999,5,20,80,120]){
 const p={...params,curveType};const f=floor(2);f.curveType=curveType
 if(speed>=5)assert.equal(curves.accelSensitivityAt(speed,f),curves.accelSensitivityAt(speed,p))
 const legacy={...p,steadying:floor(0).steadying};const factor=Math.min(1,speed/5)
 assert.equal(curves.accelSensitivityAt(speed,legacy),factor*curves.accelSensitivityAt(speed*factor,p))
}
const source='RESET_MAPPINGS\nGYRO_SENS = 5 3\nGYRO_CUTOFF_RECOVERY = 5\nFUTURE_KEY = keep # comment\n'
assert.equal(keymap.parseSensitivityValues(source).steadyingFloorX,undefined)
let saved=keymap.updateKeymapEntry(source,'GYRO_STEADYING_FLOOR',[2,1.5])
let parsed=keymap.parseSensitivityValues(saved);assert.equal(parsed.steadyingFloorX,2);assert.equal(parsed.steadyingFloorY,1.5)
assert(saved.includes('FUTURE_KEY = keep # comment'))
saved=keymap.updateKeymapEntry(saved,'ZL,GYRO_STEADYING_FLOOR',[1,.75]);parsed=keymap.parseSensitivityValues(saved,{prefix:'ZL,'});assert.equal(parsed.steadyingFloorY,.75)
const exported=serializer.serializeConfig(serializer.parseConfigText(saved))
assert.equal(keymap.parseSensitivityValues(exported).steadyingFloorY,1.5)
assert.equal(keymap.parseSensitivityValues(exported,{prefix:'ZL,'}).steadyingFloorY,.75)
assert(scope.moveGyroSettingChord(saved,'ZL','ZR').includes('ZR,GYRO_STEADYING_FLOOR'))
assert.equal(keymap.parseSensitivityValues('GYRO_STEADYING_FLOOR = 2').steadyingFloorY,2)
assert.equal(keymap.parseSensitivityValues(keymap.removeKeymapEntry(saved,'GYRO_STEADYING_FLOOR')).steadyingFloorX,undefined)
const fixture=path.resolve(__dirname,'../tmp/gyro-steadying-native.csv')
const nativeSource = path.resolve(__dirname, '../JoyShockMapper/JoyShockMapper')
const nativeInputs = ['src/main.cpp', 'include/GyroSteadying.h', ...['Natural','Power','Quadratic','Sigmoid','Jump'].map(c=>`src/${c}Curve.cpp`)].map(p=>path.join(nativeSource,p))
if (!fs.existsSync(fixture) || nativeInputs.some(p=>fs.statSync(p).mtimeMs>fs.statSync(fixture).mtimeMs)) require('node:child_process').execFileSync(process.env.PYTHON || 'python', [path.resolve(__dirname, '../JoyShockMapper/tests/run_gyro_steadying_harness.py')], { stdio: 'inherit' })
let count=0
for(const line of fs.readFileSync(fixture,'utf8').trim().split(/\r?\n/)){
 const [curve,minThreshold,value,speed,expected]=line.split(',').map(Number)
 near(curves.accelSensitivityAt(speed,{...floor(value),curveType:curves.ACCEL_CURVE_TYPES[curve],minThreshold}),expected);count++
}
console.log(`PASS: ${count} native/frontend parity samples, all curves, legacy behavior, clamping, config round trips and shifted settings`)
