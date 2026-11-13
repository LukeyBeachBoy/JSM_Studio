const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file, mod);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, file);
  return mod.exports;
}



const status = load('JSM_GUI/jsm_gui_tauri/src/utils/controllerStatus.ts');
const layouts = load('JSM_GUI/jsm_gui_tauri/src/utils/controllerLayouts.ts');
const {inputDefinitions} = load('JSM_GUI/jsm_gui_tauri/src/utils/layers.ts');
const {parseConfigText,serializeConfig} = load('JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts');
const geometry = load('JSM_GUI/jsm_gui_tauri/src/utils/stickGeometry.ts');
const plain = {rotation:0,restrictor:false,range:.7,calibration:{enabled:false,angles:[0,0,0,0],ranges:[1,1,1,1]}};
assert.deepEqual(geometry.transformStickGeometry({x:.9,y:.9},plain),{x:.9,y:.9});
assert.deepEqual(geometry.transformStickGeometry({x:0,y:.7},{...plain,restrictor:true}),{x:0,y:1});
const rotated=geometry.transformStickGeometry({x:1,y:0},{...plain,rotation:-90});
assert(Math.abs(rotated.x)<1e-8 && Math.abs(rotated.y-1)<1e-8);
assert.equal(geometry.rotationToUp({x:1,y:1}),-45);
const sharedGeometry='LEFT_STICK_ROTATION = 15\nLEFT_STICK_RESTRICTOR_RING = ON\n';
const editedGeometry=sharedGeometry+'LEFT_STICK_ROTATION = -12.5\nLEFT_STICK_RESTRICTOR_RING = OFF\nLEFT_STICK_RESTRICTOR_RANGE = 0.65\n';
const scopedGeometry=serializeConfig(parseConfigText(layouts.foldController(sharedGeometry,'type-25',sharedGeometry,editedGeometry)));
assert.deepEqual(geometry.readStickGeometry(layouts.projectController(scopedGeometry,'type-25'),'LEFT'),{...plain,rotation:-12.5,restrictor:false,range:.65});
assert.deepEqual(geometry.readStickGeometry(layouts.projectController(scopedGeometry,'type-24'),'LEFT'),{...plain,rotation:15,restrictor:true,range:.7});
assert.deepEqual(geometry.readStickGeometry(layouts.projectController(scopedGeometry,'type-25'),'RIGHT'),plain);
const {stickModeshiftSettings}=load('JSM_GUI/jsm_gui_tauri/src/utils/modeshift.ts');
for (const field of ['ROTATION','RESTRICTOR_RING','RESTRICTOR_RANGE']) assert(stickModeshiftSettings('LEFT').includes(`LEFT_STICK_${field}`));
const device = {handle: 1, type: 25, supportedButtons: 2**36-1};
for (let i=0;i<32;i++) {
 const command=`JOY${i+1}`;
 assert.deepEqual([...status.getPressedControllerCommandSet({...device,status:{buttons:2**i}})], [command]);
 assert(status.controllerSupportsInput(device,command));
 assert(!status.controllerSupportsInput({type:24},command));
 assert(inputDefinitions.some(b=>b.command===command));
}
assert.deepEqual([...status.getPressedControllerCommandSet({...device,status:{buttons:2**32+2**33}})], ['UP','RIGHT']);
for (const command of ['S','HOME','ZL','R3','RUP','TOUCH','MISC6','MUP','JOY33']) assert(!status.controllerSupportsInput(device,command),command);
assert(status.controllerSupportsInput(device,'LUP'));
assert(!status.controllerSupportsInput({...device,supportedButtons:3},'JOY3'));
const text='JOY1 = SPACE\nJOY32 = ENTER\nJOY1,JOY32 = TAB\n';
const roundtrip=serializeConfig(parseConfigText(text));
for (const line of text.trim().split('\n')) assert(roundtrip.includes(line));
const changed=layouts.foldController(text,'type-25',text,text+'JOY2 = E\n');
assert(layouts.projectController(changed,'type-25').includes('JOY2 = E'));
assert(!layouts.projectController(changed,'type-24').includes('JOY2 = E'));
assert(layouts.unavailableControllerInputs(text,{type:24}).some(row=>row.input==='JOY32'));
console.log('Azeron numbered input, capability, isolation, chord serialization and layout tests passed');

const {addAzeronCyberpunkLayout}=load('JSM_GUI/jsm_gui_tauri/src/utils/azeronCyberpunk.ts');
const {layerEntries,readLayers,readLayerActions}=load('JSM_GUI/jsm_gui_tauri/src/utils/layers.ts');
const source='RESET_MAPPINGS\nLEFT_STICK_MODE = LEFT_STICK\nS = X_A\nMISC2 = F\n';
const combined=addAzeronCyberpunkLayout(source);
assert.equal(layouts.controllerBase(combined),source,'Original shared game config is unchanged');
const steam=layerEntries(layouts.projectController(combined,'type-24'));
const cyborg=layerEntries(layouts.projectController(combined,'type-25'));
assert.equal(steam.S,'X_A'); assert.equal(steam.LEFT_STICK_MODE,'LEFT_STICK');
assert.equal(cyborg.LEFT_STICK_MODE,'NO_MOUSE');assert.equal(cyborg.LUP,'W');assert.equal(cyborg.JOY25,'ESC');
for (const key of ['LEFT_STICK_CARDINAL_WIDTH','LEFT_STICK_DIRECTION_DEADZONE','LEFT_STICK_DIRECTION_HYSTERESIS','LEFT_STICK_DIRECTION_RELEASE_MARGIN','LEFT_STICK_DEADZONE_INNER','LEFT_STICK_DEADZONE_OUTER']) assert.equal(cyborg[key],undefined, key+' inherits global preferences');
assert.equal(steam.LEFT_STICK_CARDINAL_WIDTH,undefined,'Steam layout is unchanged');
const projected=layouts.projectController(combined,'type-25');
assert.equal(layouts.foldController(combined,'type-25',projected,projected),combined,'Selecting another controller without edits preserves the original source exactly');
const driving=readLayers(projected).find(layer=>layer.id==='cyborg-driving');
assert.equal(driving.overrides.LEFT_STICK_MODE,'LEFT_STICK');assert.equal(driving.overrides.LUP,'NONE');
assert.equal(driving.overrides['# @label JOY1'],'Accelerate');
assert(readLayerActions(projected).some(a=>a.input==='JOY22'&&a.verb==='toggle'&&a.layerId==='cyborg-driving'));
assert.equal(readLayers(layouts.projectController(combined,'type-24')).length,0);
const serialized=serializeConfig(parseConfigText(combined));
assert.equal(layerEntries(layouts.projectController(serialized,'type-25')).JOY25,'ESC');
assert.equal(readLayers(layouts.projectController(serialized,'type-25'))[0].overrides.LEFT_STICK_MODE,'LEFT_STICK');
const declared=layouts.addControllerLayout(source,'type-25');
assert(layouts.savedControllerModels(declared).includes('type-25'));
assert(layouts.hasControllerVariant(declared,'type-25'));
assert(!layouts.savedControllerModels(layouts.resetControllerVariant(declared,'type-25')).includes('type-25'));
const offline=layouts.controllerEditorDevices('type-25',[{type:24,handle:7}]);
assert.equal(offline[0].type,25);assert.equal(offline[0].handle,0);assert.equal(offline[0].status,undefined);
assert.equal(offline.length,1, 'Other controllers never provide offline preview input');
assert.equal(layouts.controllerEditorDevices('type-24',[{type:25,handle:2},{type:24,handle:7}])[0].handle,7);
console.log('PASS: one game config, distinct Steam/Cyborg layouts, driving toggle, serialization and offline editing');
