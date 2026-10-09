const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const cache = new Map();
function load(file) {
 file=path.resolve(file); if(cache.has(file)) return cache.get(file).exports;
 const mod=new Module(file); cache.set(file,mod); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file));
 mod.require=name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file); return mod.exports;
}
const {configChanges,countChanges,revertConfigChange}=load('JSM_GUI/jsm_gui_tauri/src/utils/configChanges.ts');
const {readLayers,writeLayers,layerEntries,readLayerActions}=load('JSM_GUI/jsm_gui_tauri/src/utils/layers.ts');
const baseline=writeLayers('RESET_MAPPINGS\nN = SPACE\nW = TAB\n# @label N = Jump\nRSR,N = ENTER\n',[{id:'vehicles',name:'Vehicles',overrides:{N:'E',RIGHT_TOUCHPAD_SENS:'2'}}]);
const edited=writeLayers(baseline.replace('N = SPACE','N = F').replace('W = TAB','W = ESC').replace('Jump','Interact').replace('RSR,N = ENTER','RSR,N = LALT'),[{id:'vehicles',name:'Driving',overrides:{N:'Q',RIGHT_TOUCHPAD_SENS:'3'}}]);
assert.equal(countChanges(baseline,edited),7);
let changes=configChanges(baseline,edited);
const reverted=revertConfigChange(edited,baseline,changes.find(c=>c.key==='N'&&!c.layerId));
assert.equal(layerEntries(reverted).N,'SPACE');assert.equal(layerEntries(reverted).W,'ESC');assert.equal(layerEntries(reverted)['RSR,N'],'LALT');
assert.equal(readLayers(reverted)[0].overrides.N,'Q');
const revertedLayer=revertConfigChange(edited,baseline,changes.find(c=>c.key==='N'&&c.layerId));
assert.equal(readLayers(revertedLayer)[0].overrides.N,'E');assert.equal(readLayers(revertedLayer)[0].overrides.RIGHT_TOUCHPAD_SENS,'3');assert.equal(readLayers(revertedLayer)[0].name,'Driving');
let restored=edited; for(const change of changes) restored=revertConfigChange(restored,baseline,change);
assert.equal(countChanges(baseline,restored),0);
assert.equal(countChanges('N = SPACE\nW = E\n','W = E\n\nN = SPACE'),0);
const added=writeLayers(baseline,[...readLayers(baseline),{id:'new',name:'New',overrides:{N:'ENTER'}}],[{input:'RSR',verb:'hold',layerId:'new'}]);
const removed=revertConfigChange(added,baseline,configChanges(baseline,added).find(c=>c.kind==='layer'));
assert.equal(readLayers(removed).some(l=>l.id==='new'),false);assert.equal(readLayerActions(removed).length,0);
const duplicates='N = SPACE\nN = F\nW = TAB';
assert.equal(layerEntries(revertConfigChange(duplicates,'N = E\nW = TAB',configChanges('N = E\nW = TAB',duplicates)[0])).N,'E');
// Console v2 (P6): menus read per menu and slice, a reordered mode list is a change, and a controller's own layout lines are named.
{
  const {createVirtualMenu,writeVirtualMenus}=load('JSM_GUI/jsm_gui_tauri/src/utils/virtualMenus.ts');
  const {describeChange}=load('JSM_GUI/jsm_gui_tauri/src/utils/configChanges.ts');
  const m=createVirtualMenu('menu1');m.attachments=[{source:'RIGHT',activation:'COMMAND',input:'NONE',selection:'ACTIVATION_RELEASE',confirm:'NONE',cancel:'NONE'}];
  const base=writeLayers(writeVirtualMenus('N = SPACE\n',[m]),[{id:'a',name:'A',overrides:{}},{id:'b',name:'B',overrides:{}}]);
  const m2={...m,name:'Guns',actions:m.actions.map((x,i)=>i===2?{...x,binding:'G',label:'Grenade'}:x)};
  let edited=writeVirtualMenus(base,[m2]);edited=writeLayers(edited,[readLayers(edited)[1],readLayers(edited)[0]]);
  edited+='\n# @controller type-5 N = H\n# @controller-pad type-5 left\n';
  const all=configChanges(base,edited);
  assert.ok(all.some(c=>c.kind==='menu'&&c.menuField==='name'&&c.before==='Weapon Wheel'&&c.after==='Guns'),'menu rename read by name, not as a HEX blob');
  assert.ok(all.some(c=>c.kind==='menu'&&c.menuField==='slot:2'&&c.binding.after==='G'&&c.after==='Grenade'),'one slice');
  assert.ok(!all.some(c=>/^VIRTUAL_MENUS/i.test(c.key)),'the catalogue is never one opaque row');
  assert.ok(all.some(c=>c.kind==='order'&&c.before==='A · B'&&c.after==='B · A'),'reordering modes is a change');
  assert.ok(all.some(c=>c.kind==='controller'&&c.model==='type-5'&&c.key==='N'),'a controller variant line is named for its controller');
  assert.ok(all.some(c=>c.kind==='controller'&&c.key==='pad'));
  assert.equal(all.length,5);
  let undone=edited;for(const c of all) undone=revertConfigChange(undone,base,c);
  assert.equal(countChanges(base,undone),0,'every kind reverts');
  assert.match(describeChange(base,edited),/more$/);
}
console.log('PASS: menu, mode order and controller layout changes read by name and revert; selective reverts isolate bindings, modeshifts, labels, layer settings and names; layer lifecycle restores actions; order and whitespace ignored');
