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

const {readLayers,writeLayers,projectLayer,foldLayer,convertModeshifts,inputUses,layerEntries,readLayerActions,setLayerActions,describeLayerActivation} = load('JSM_GUI/jsm_gui_tauri/src/utils/layers.ts');
const {parseConfigText,serializeConfig} = load('JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts');
const source = 'RESET_MAPPINGS\nN = SPACE\nRSR = NONE\nRSR,N = J\nRSR,W = U\nLSL,N = H\n# @label RSR,N = Squad talk\n# @overlay RIGHT:RSR at 0.5 0.5 size 300\n';
let text=convertModeshifts(source,{id:'comms',name:'Comms',overrides:{}},'RSR');
assert.ok(readLayerActions(text).some(action => action.input === 'RSR' && action.verb === 'hold' && action.layerId === 'comms'), 'migration preserves the original held activation');
// Setting the same action is idempotent.
text=setLayerActions(text,'RSR',[{input:'RSR',verb:'hold',layerId:'comms'}]);
assert.equal(readLayers(text)[0].overrides.N,'J');
assert.equal(layerEntries(text)['RSR,N'],undefined);
assert.equal(layerEntries(text)['LSL,N'],'H');
assert.equal(readLayers(text)[0].overrides['# @label N'],'Squad talk');
assert.equal(readLayers(text)[0].overrides['# @overlay RIGHT'],'at 0.5 0.5 size 300');
assert.equal(layerEntries(projectLayer(text,'' )).N,'SPACE');
assert.equal(layerEntries(projectLayer(text,'comms')).N,'J');
assert.deepEqual(readLayers(serializeConfig(parseConfigText(text))),readLayers(text),'save retains layer metadata');
let projection=projectLayer(text,'comms');
text=foldLayer(text,'comms',projection+'\nL,N = K');
assert.equal(readLayers(text)[0].overrides['L,N'],'K','chord inside layer');
assert.equal(layerEntries(text)['L,N'],undefined,'nested chord never leaks to Default');
projection=projectLayer(text,'comms');
text=foldLayer(text,'comms',projection.split('\n').filter(l=>!/^N =/.test(l)).join('\n'));
assert.equal(readLayers(text)[0].overrides.N,'NONE','clearing inherited binding blocks base');
const layer=readLayers(text)[0]; delete layer.overrides.N;
text=writeLayers(text,[layer]);
assert.equal(layerEntries(projectLayer(text,'comms')).N,'SPACE','reset inherits Default');
assert.ok(inputUses(text,'RSR').includes('Hold Comms'));
assert.ok(inputUses(text,'LSL').some(v=>v.startsWith('Shift trigger:')));
assert.ok(inputUses('N+S = ENTER','N').some(v=>v.startsWith('Chord:')));
assert.equal(inputUses('+ = ESC','+').length,0,'Plus is a button, not a simultaneous chord');
assert.equal(foldLayer(source,'',source),source,'no-op keeps exact original');
assert.equal(projectLayer(writeLayers('N = OLD\nN = NEW',[{id:'x',name:'X',overrides:{}}]),'x').match(/N =/g).length,1,'collapse inherited duplicate assignments');
assert.equal(readLayers('# @layer broken').length,0);
console.log('PASS: layers migrate, inherit, clear, nest chords, preserve annotations, round-trip and report input use');

const {sanitizeImportedConfig}=load('JSM_GUI/jsm_gui_tauri/src/utils/config.ts');
assert.deepEqual(readLayers(sanitizeImportedConfig(text)),readLayers(text),'Import must keep all layers');
const {appliedProfileLabel}=load('JSM_GUI/jsm_gui_tauri/src/utils/appliedProfile.ts');
assert.equal(appliedProfileLabel('profiles-library/.layers/applied-preview/0-Comms.txt','Wardogs'),'Wardogs · Comms');
assert.equal(appliedProfileLabel('profiles-library/.layers/Wardogs/1-Vehicles.txt','Desktop'),'Wardogs · Vehicles');

// A layer is a name and its overrides. What turns it on is bound to inputs,
// and more than one input may drive the same layer -- which the old model,
// with one trigger field per layer, could not express.
const vehicles = {id:'vehicles',name:'Vehicles',overrides:{N:'J'}};
const actions = [
  {input:'RSR',verb:'apply',layerId:'vehicles'},
  {input:'LSL',verb:'remove',layerId:'vehicles'},
  {input:'RSL',verb:'apply',layerId:'vehicles'},
];
const withActions = writeLayers('N = SPACE',[vehicles],actions);
assert.deepEqual(readLayers(withActions),[vehicles],'the layer carries no activation of its own');
assert.deepEqual(readLayerActions(withActions),actions);
assert.deepEqual(readLayers(serializeConfig(parseConfigText(withActions))),[vehicles]);
assert.deepEqual(readLayerActions(serializeConfig(parseConfigText(withActions))),actions,'activation survives a round trip');
assert.deepEqual(readLayers(sanitizeImportedConfig(withActions)),[vehicles]);
assert.deepEqual(readLayerActions(sanitizeImportedConfig(withActions)),actions,'and an import');
assert.deepEqual(inputUses(withActions,'RSR'),['Turn on Vehicles']);
assert.deepEqual(inputUses(withActions,'LSL'),['Turn off Vehicles']);
assert.deepEqual(inputUses(withActions,'RSL'),['Turn on Vehicles'],'a second input may drive the same layer');
// The one-line summary (title bar layer menu, Layers page) leads with what
// turns the layer on, lists every input, and names them as the pad does.
const paddles = {RSR:'R4',RSL:'R5',LSL:'L4',LSR:'L5'}, pad = input => paddles[input] ?? input;
assert.equal(describeLayerActivation(actions,'vehicles',pad),'Applied by R4 or R5 · Removed by L4');
assert.equal(describeLayerActivation([{input:'RSL',verb:'remove',layerId:'map'},{input:'LSL',verb:'hold',layerId:'map'},{input:'RSR',verb:'toggle',layerId:'map'}],'map',pad),'Held by L4 · Toggled by R4 · Removed by R5','activation first, whatever order it was bound in');
assert.equal(describeLayerActivation([{input:'RSL',verb:'remove',layerId:'map'}],'map',pad),'Nothing turns it on · Removed by R5','a layer inputs can only remove says so');
assert.equal(describeLayerActivation([],'map',pad),'Not bound to an input');
assert.equal(layerEntries(projectLayer(withActions,'vehicles')).N,'J');

// setLayerActions replaces one input and leaves the others alone.
const moved = setLayerActions(withActions,'RSL',[]);
assert.deepEqual(readLayerActions(moved),actions.filter(a=>a.input!=='RSL'));

// Deleting a layer takes its activation with it: an action pointing at a
// layer that is gone would otherwise sit in the file doing nothing.
assert.deepEqual(readLayerActions(writeLayers(withActions,[])),[]);

// A profile written before the move keeps working, and is migrated on write.
const legacy = '# @layer '+JSON.stringify({id:'vehicles',name:'Vehicles',trigger:'',applyTrigger:'RSR',removeTrigger:'RSR',overrides:{N:'J'}});
assert.deepEqual(readLayerActions(legacy),[{input:'RSR',verb:'toggle',layerId:'vehicles'}],'apply == remove was how a toggle had to be written');
assert.deepEqual(inputUses(legacy,'RSR'),['Toggle Vehicles']);
const migrated = writeLayers(legacy,readLayers(legacy));
assert.ok(migrated.includes('# @layer-action RSR = toggle vehicles'),'writing moves it onto the input');
assert.ok(!/"trigger"|applyTrigger|removeTrigger/.test(migrated),'and drops the old fields: '+migrated);
assert.deepEqual(readLayerActions(migrated),readLayerActions(legacy),'with no change in behaviour');

assert.equal(readLayers('# @layer '+JSON.stringify({id:'x',name:'X',overrides:{N:123}})).length,0,'an override must be text');

// A layer value set back by hand to what Default has stops being an override.
{
  const text = 'S = SPACE\nMIN_GYRO_SENS = 2 1.5\n# @layer '+JSON.stringify({id:'aim',name:'Aim',overrides:{S:'Q',MIN_GYRO_SENS:'3 1.5'}});
  const before = projectLayer(text,'aim');
  const edited = before.replace('S = Q','S = SPACE').replace('MIN_GYRO_SENS = 3 1.5','MIN_GYRO_SENS = 2.0 1.50');
  const layer = readLayers(foldLayer(text,'aim',edited,before))[0];
  assert.deepEqual(layer.overrides,{},'both follow Default again, numbers compared by value');
  const kept = readLayers(foldLayer(text,'aim',before.replace('S = Q','S = E'),before))[0];
  assert.equal(kept.overrides.S,'E','a different value is still an override');
}

console.log('PASS: activation belongs to inputs, several may drive one layer, it round-trips through save and import, and a pre-move profile still works and is migrated on write');
