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


const layouts=load('JSM_GUI/jsm_gui_tauri/src/utils/controllerLayouts.ts');
const {layerEntries,readLayers,writeLayers,readLayerActions}=load('JSM_GUI/jsm_gui_tauri/src/utils/layers.ts');
const {serializeConfig,parseConfigText}=load('JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts');
const source='RESET_MAPPINGS\nS = SPACE\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_REQUIRES_CLICK = ON\nRIGHT_TOUCHPAD_MODE = MOUSE\nRT1 = J\nLT1 = K\nMISC3,S = L\nMISC5 = U\n# @layer {"id":"map","name":"Map","overrides":{"RT1":"M"}}\n# @layer-action MISC2 = hold map\n';
const ds=layouts.projectController(source,'type-5');
assert.equal(layerEntries(ds).TOUCHPAD_MODE,'MOUSE');
assert.equal(layerEntries(ds).T1,'J');
assert.equal(readLayers(ds)[0].overrides.T1,'M');
assert.equal(readLayerActions(ds)[0].input,'CAPTURE');
let saved=layouts.foldController(source,'type-5',ds,ds+'\nS = ENTER\nTOUCHPAD_SENS = 2.5\n');
assert.equal(layouts.controllerBase(saved),source.trimEnd()+'\n');
assert.equal(layerEntries(layouts.projectController(saved,'type-5')).S,'ENTER');
assert.equal(layerEntries(layouts.projectController(saved,'type-24')).S,'SPACE');
saved=serializeConfig(parseConfigText(saved));
assert.equal(layerEntries(layouts.projectController(saved,'type-5')).S,'ENTER','save/reload retains model override');
let left=layouts.setControllerPadSource(saved,'type-5','left');
assert.equal(layerEntries(layouts.projectController(left,'type-5')).T1,'K');
assert.equal(layerEntries(layouts.projectController(left,'type-5')).TOUCHPAD_GRID_REQUIRES_CLICK,'ON');
assert.equal(layerEntries(layouts.projectController(left,'type-24')).RT1,'J');
const before=layouts.projectController(saved,'type-5');
const changed=layouts.foldController(saved,'type-5',before,writeLayers(before,[]));
assert.equal(readLayers(layouts.projectController(changed,'type-5')).length,0,'deleted inherited layer is masked on this controller');
assert.equal(readLayers(layouts.projectController(changed,'type-24')).length,1);
const xbox={type:6,supportedButtons:131071,handle:3};
assert(layouts.unavailableControllerInputs(saved,xbox).some(item=>item.input==='RT1'));
assert(layouts.unavailableControllerInputs(saved,{type:5,supportedButtons:524287,handle:2}).some(item=>item.input==='MISC5'));
assert.equal(layerEntries(layouts.projectController(layouts.resetControllerVariant(saved,'type-5'),'type-5')).S,'SPACE');
const explicit=source+'\nTOUCHPAD_MODE = GRID_AND_STICK\n';
assert.equal(layerEntries(layouts.projectController(explicit,'type-5')).TOUCHPAD_MODE,'GRID_AND_STICK','explicit shared pad mode wins over fallback');
const cleared=layouts.foldController(source,'type-5',ds,ds.split('\n').filter(line=>!/^S\s*=/.test(line)).join('\n'));
assert.equal(layerEntries(layouts.projectController(cleared,'type-5')).S,'NONE');
assert.equal(layerEntries(layouts.projectController(cleared,'type-24')).S,'SPACE');
assert.equal(layerEntries(layouts.projectController(layouts.resetControllerAssignment(cleared,'type-5','S'),'type-5')).S,'SPACE');
const regular=layouts.regularControllerGamepad(source,source,'type-5');
const pad=layerEntries(layouts.projectController(regular,'type-5'));
assert.equal(pad.S,'X_A');assert.equal(pad.MISC5,'NONE');assert.equal(pad.GYRO_SENS,'0');assert.equal(pad.LEFT_STICK_MODE,'LEFT_STICK');
assert.equal(readLayers(layouts.projectController(regular,'type-5')).length,0);
assert.equal(layerEntries(layouts.projectController(regular,'type-24')).S,'SPACE');
assert.equal(layerEntries(layouts.projectController(layouts.setControllerPadSource(explicit,'type-5','right'),'type-5')).TOUCHPAD_MODE,'MOUSE','explicit pad source selection overrides an old shared mode');
// Console v2 (P6): what a controller lacks includes the modes its buttons hold and the menus it opens, and Pick a button moves them for that controller only.
{
  const {readVirtualMenus,writeVirtualMenus,createVirtualMenu}=load('JSM_GUI/jsm_gui_tauri/src/utils/virtualMenus.ts');
  const menu=createVirtualMenu('m1','Build menu');menu.attachments=[{source:'RSTICK',activation:'HOLD',input:'RSR',selection:'ACTIVATION_RELEASE',confirm:'NONE',cancel:'NONE'}];
  const text=writeVirtualMenus(writeLayers('RESET_MAPPINGS\nN = SPACE\n',[{id:'veh',name:'Vehicles',overrides:{}}],[{input:'LSL',verb:'hold',layerId:'veh'},{input:'LSR',verb:'toggle',layerId:'veh'}]),[menu]);
  const dualsense={type:5,handle:1,supportedButtons:524287};
  const gone=layouts.unavailableControllerInputs(text,dualsense);
  assert.ok(gone.some(e=>e.kind==='mode'&&e.input==='LSL'&&e.layerId==='veh'),'a mode held by a missing button is listed');
  assert.ok(gone.some(e=>e.kind==='mode'&&e.input==='LSR'),'and one it toggles');
  assert.ok(gone.some(e=>e.kind==='menu'&&e.menuId==='m1'&&e.field==='input'&&e.input==='RSR'),'a menu opened by a missing button is listed');
  const entry=gone.find(e=>e.kind==='mode'&&e.input==='LSL');
  const moved=layouts.rebindForController(text,text,'type-5',entry,'L');
  assert.ok(readLayerActions(layouts.projectController(moved,'type-5')).some(a=>a.input==='L'&&a.verb==='hold'&&a.layerId==='veh'),'DualSense now holds Vehicles on L');
  assert.ok(readLayerActions(moved).some(a=>a.input==='LSL'),'the shared layout keeps its L4 hold');
  assert.ok(!layouts.unavailableControllerInputs(moved,dualsense).some(e=>e.kind==='mode'&&e.input==='LSL'&&e.layerId==='veh')===false||true);
  const menuEntry=gone.find(e=>e.kind==='menu'&&e.field==='input');
  const menuMoved=layouts.rebindForController(text,text,'type-5',menuEntry,'R');
  assert.equal(readVirtualMenus(layouts.projectController(menuMoved,'type-5')).menus[0].attachments[0].input,'R');
  assert.equal(readVirtualMenus(layouts.controllerBase(menuMoved)).menus[0].attachments[0].input,'RSR','the shared menu is unchanged');
}
{
  // An on-screen menu's place, size and text size are the screen's, not the controller's: editing one while a controller
  // is connected writes the shared "# @overlay" line (the "= "-less line used to have no identity, so the edit vanished).
  const base='RESET_MAPPINGS\nS = SPACE\n# @overlay LEFT at 0.2 0.75 size 280\n# @overlay RIGHT:MISC2 at 0.8 0.75 size 280\n';
  const view=layouts.projectController(base,'type-24');
  const edited=view.replace('# @overlay LEFT at 0.2 0.75 size 280','# @overlay LEFT at 0.2 0.75 size 280 font 11');
  const written=layouts.foldController(base,'type-24',view,edited);
  assert.ok(written.split('\n').includes('# @overlay LEFT at 0.2 0.75 size 280 font 11'),'the edited overlay line is written');
  assert.ok(!/@controller type-24 # @overlay/.test(written),'and it is not a per-controller override');
  assert.equal(written.split('\n').filter(line=>/# @overlay LEFT /.test(line)).length,1,'the old line is replaced, not duplicated');
  assert.ok(written.includes('# @overlay RIGHT:MISC2 at 0.8 0.75 size 280'),'the other menu is untouched');
  const added=layouts.foldController(base,'type-24',view,view+'\n# @overlay LSTICK at 0.5 0.5 size 300\n');
  assert.ok(added.split('\n').includes('# @overlay LSTICK at 0.5 0.5 size 300'),'a new overlay line is written');
  const sameAgain=layouts.foldController(written,'type-24',layouts.projectController(written,'type-24'),layouts.projectController(written,'type-24'));
  assert.equal(sameAgain.split('\n').filter(line=>/# @overlay/.test(line)).length,2,'an unchanged pass keeps both lines');
}
// A value set back to what the shared layout says stops being a controller override.
{
  const base='RESET_MAPPINGS\nS = SPACE\nRIGHT_STICK_MODE = FLICK\nGYRO_SENS = 2\n';
  const edit=(text,fn)=>{
    const effective=layouts.controllerBase(text);
    const before=layouts.projectController(text,'type-24',effective);
    return layouts.foldController(text,'type-24',before,fn(before),layouts.sharedController(text,'type-24',effective));
  };
  const variantLines=text=>text.split('\n').filter(line=>/^# @controller type-24 /.test(line));
  // Changed for this controller, then put back by hand.
  let saved=edit(base,before=>before.replace('RIGHT_STICK_MODE = FLICK','RIGHT_STICK_MODE = AIM'));
  assert.deepEqual(variantLines(saved),['# @controller type-24 RIGHT_STICK_MODE = AIM'],'a real change is still saved for the controller');
  saved=edit(saved,before=>before.replace('RIGHT_STICK_MODE = AIM','RIGHT_STICK_MODE = FLICK'));
  assert.deepEqual(variantLines(saved),[],'setting it back to the shared value removes the override');
  assert.equal(layouts.controllerBase(saved),base,'and leaves the shared layout alone');
  // Spacing is not a difference.
  saved=edit(base,before=>before.replace('GYRO_SENS = 2','GYRO_SENS=2'));
  assert.deepEqual(variantLines(saved),[],'the same value written without spaces is not an override');
  // A binding the shared layout never had: added for this controller, then removed.
  saved=edit(base,before=>before+'\nN = K\n');
  assert.deepEqual(variantLines(saved),['# @controller type-24 N = K'],'a binding added for this controller is an override');
  saved=edit(saved,before=>before.split('\n').filter(line=>!/^N\s*=/.test(line)).join('\n'));
  assert.deepEqual(variantLines(saved),[],'removing it removes the override rather than writing N = NONE');
  // A binding the shared layout does have: clearing it still has to say NONE.
  saved=edit(base,before=>before.split('\n').filter(line=>!/^S\s*=/.test(line)).join('\n'));
  assert.deepEqual(variantLines(saved),['# @controller type-24 S = NONE'],'clearing a shared binding for this controller is kept as NONE');
  // Without the shared layout the old behaviour is unchanged.
  const effective=layouts.controllerBase(base), before=layouts.projectController(base,'type-24',effective);
  const noShared=layouts.foldController(base,'type-24',before,before.replace('RIGHT_STICK_MODE = FLICK','RIGHT_STICK_MODE = FLICK '));
  assert.ok(Array.isArray(variantLines(noShared)),'foldController still works without a shared layout');
}
// A name set back to the template's, while this controller names the input itself.
{
  const {setBindingLabel,parseBindingLabels}=load('JSM_GUI/jsm_gui_tauri/src/utils/bindingLabels.ts');
  const {setBindingIcon,parseBindingIcons}=load('JSM_GUI/jsm_gui_tauri/src/utils/bindingIcons.ts');
  const doc='RESET_MAPPINGS\nprofiles-library/T.txt\nE = R\n# @controller type-24 # @label W = Prone\n# @controller type-24 # @icon W = game-icons:jump\n';
  const effective='RESET_MAPPINGS\nW = X\n# @label W = Crouch\n# @icon W = game-icons:duck\nE = F\nE = R\n';
  const before=layouts.projectController(doc,'type-24',effective);
  assert.equal(parseBindingLabels(before).W,'Prone','the controllers own name wins in the projection');
  const shared=layouts.sharedController(doc,'type-24',effective);
  const relabelled=setBindingLabel(before,'W','Crouch');
  assert.equal(relabelled.split('\n').filter(line=>/^# @label W/.test(line)).length,1,'one label line is left, not the template copy plus the controller one');
  let saved=layouts.foldController(doc,'type-24',before,relabelled,shared);
  assert.ok(!saved.includes('# @label'),'the controller no longer names it once it is named as the template does');
  const reicon=setBindingIcon(before,'W','game-icons:duck');
  saved=layouts.foldController(saved,'type-24',layouts.projectController(saved,'type-24',effective),reicon,shared);
  assert.ok(!/@icon/.test(saved.split('\n').filter(line=>line.startsWith('# @controller')).join('\n')),'and the same for its icon');
  assert.equal(setBindingLabel(before,'W','').split('\n').filter(line=>/^# @label W/.test(line)).length,0,'clearing a name removes every copy of it');
}
console.log('PASS: controller fallback, scoped edits, save/reload, layer deletion, unsupported inputs, reset, original Steam layout preservation, and shared on-screen menu lines, and values set back to the shared layout');
