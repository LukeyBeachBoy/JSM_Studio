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
const {addModeshift, readModeshift, writeModeshift, renameModeshift, removeModeshift, modeshiftTriggers} = load('JSM_GUI/jsm_gui_tauri/src/utils/modeshift.ts');
const face = {id:'face',title:'Face buttons',buttons:['N','S','E','W'].map(command=>({command,label:command}))};
const pad = {id:'right-pad',title:'Right trackpad',buttons:Array.from({length:25},(_,i)=>({command:`RT${i+1}`,label:`RT${i+1}`})),settings:['RIGHT_GRID_SIZE','RIGHT_GRID_REQUIRES_CLICK','RIGHT_TOUCH_STICK_MODE'],mode:{key:'RIGHT_TOUCHPAD_MODE',defaultValue:'GRID_AND_STICK'},grid:{sizeKey:'RIGHT_GRID_SIZE',clickKey:'RIGHT_GRID_REQUIRES_CLICK',stickKey:'RIGHT_TOUCH_STICK_MODE'}};
const original = '# retain me\nN = SPACE\nRIGHT_TOUCHPAD_MODE = MOUSE\nRIGHT_GRID_SIZE = 2 1\nRT1 = ENTER\n';
assert.equal(addModeshift(original,pad,''), original, 'empty trigger must not create a shift');
assert.throws(()=>writeModeshift(original,'','N','TAB'));
let text = addModeshift(original,pad,'MISC2');
text = writeModeshift(text,'MISC2','RIGHT_GRID_SIZE','3 2');
text = writeModeshift(text,'MISC2','RT6','ESC');
assert.equal(readModeshift(text,'MISC2','RIGHT_GRID_REQUIRES_CLICK'),'OFF');
assert.equal(readModeshift(text,'MISC2','RIGHT_TOUCH_STICK_MODE'),'NO_MOUSE');
assert.equal(readModeshift(text,'MISC2','RT1'),'ENTER', 'legacy grid binding retained in alternate card');
assert.ok(text.includes('RIGHT_TOUCHPAD_MODE = MOUSE\nRIGHT_GRID_SIZE = 2 1'), 'normal mode and grid unchanged');
text = addModeshift(text,face,'MISC2');
text = writeModeshift(text,'MISC2','N','TAB');
assert.equal(readModeshift(text,'MISC2','N'),'TAB');
text = addModeshift(text,pad,'L');
assert.deepEqual(modeshiftTriggers(text,pad), ['MISC2','L']);
assert.equal(renameModeshift(text,pad,'MISC2','L'),text,'cannot overwrite an existing trigger');
text = renameModeshift(text,pad,'MISC2','R');
assert.equal(readModeshift(text,'R','RT6'),'ESC');
assert.equal(readModeshift(text,'MISC2','N'),'TAB','renaming pad shift preserves face shift on same trigger');
text = removeModeshift(text,pad,'R');
assert.equal(readModeshift(text,'R','RT6'),undefined);
assert.equal(readModeshift(text,'L','RT1'),'ENTER');
assert.equal(readModeshift(text,'MISC2','N'),'TAB');
assert.ok(text.includes('# retain me'));
const spaced = '  misc2 , RIGHT_GRID_SIZE=2 2 # old\nMISC2,RIGHT_GRID_SIZE = 4 1\n';
assert.equal(readModeshift(spaced,'MISC2','RIGHT_GRID_SIZE'),'4 1');
assert.equal(writeModeshift(spaced,'MISC2','RIGHT_GRID_SIZE','3 3').match(/RIGHT_GRID_SIZE/g).length,1);
// --- a pad shift is the pad in one of its own modes ---
// A modeshift reconfigures one physical input to any mode it already supports,
// including the mode it is already in. The pad editor used to force a shift
// into the grid mode and expose only a cut-down version of it.
const {padModeshiftSettings, readShifted} = load('JSM_GUI/jsm_gui_tauri/src/utils/modeshift.ts');
const {getKeymapValue} = load('JSM_GUI/jsm_gui_tauri/src/utils/keymap.ts');
const realPad = {
  id:'right-pad', title:'Right trackpad',
  buttons:Array.from({length:25},(_,i)=>({command:`RT${i+1}`,label:`RT${i+1}`})),
  settings:padModeshiftSettings('RIGHT'),
  mode:{key:'RIGHT_TOUCHPAD_MODE',defaultValue:'GRID_AND_STICK',options:[]},
  grid:{sizeKey:'RIGHT_GRID_SIZE',clickKey:'RIGHT_GRID_REQUIRES_CLICK',stickKey:'RIGHT_TOUCH_STICK_MODE',clickButton:'MISC2',prefix:'RT'},
  pad:{side:'right',keyPrefix:'RIGHT'},
};

// Every per-pad key is owned, so removing a shift cannot orphan chorded lines.
for (const key of ['RIGHT_TOUCHPAD_MODE','RIGHT_GRID_SIZE','RIGHT_TOUCH_STICK_RADIUS','RIGHT_TOUCH_STICK_AXIS','RIGHT_TOUCH_RING_MODE','RIGHT_TOUCH_DEADZONE_INNER','RIGHT_TOUCHPAD_SENS','RIGHT_TOUCHPAD_DUAL_STAGE_MODE']) {
  assert.ok(padModeshiftSettings('RIGHT').includes(key), `${key} is not scoped to the pad shift`);
}

// Same mode on both sides: a pad already in MOUSE shifts to MOUSE, not to a grid.
const mousePad = 'RIGHT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_SENS = 3.3\n';
let shifted = addModeshift(mousePad, realPad, 'MISC2');
assert.equal(readModeshift(shifted,'MISC2','RIGHT_TOUCHPAD_MODE'),'MOUSE',
  'a new shift must inherit the mode the pad is already in');
assert.ok(shifted.includes('RIGHT_TOUCHPAD_MODE = MOUSE'), 'the normal mode is untouched');

// A shift overrides only what it assigns; everything else reads through.
assert.equal(readShifted(shifted,'MISC2','RIGHT_TOUCHPAD_SENS'),'3.3',
  'an unassigned setting must read as the value the shift inherits');
shifted = writeModeshift(shifted,'MISC2','RIGHT_TOUCHPAD_SENS','1.2');
assert.equal(readShifted(shifted,'MISC2','RIGHT_TOUCHPAD_SENS'),'1.2','the shifted value wins once assigned');
assert.equal(getKeymapValue(shifted,'RIGHT_TOUCHPAD_SENS'),'3.3','...without disturbing the normal value');

// The case the old editor made impossible: a shift into the grid mode that
// configures the touch stick, so a pad click can drive directional swipes.
let swipe = addModeshift('RIGHT_TOUCHPAD_MODE = MOUSE\n', realPad, 'MISC2');
swipe = writeModeshift(swipe,'MISC2','RIGHT_TOUCHPAD_MODE','GRID_AND_STICK');
swipe = writeModeshift(swipe,'MISC2','RIGHT_TOUCH_STICK_MODE','AIM');
swipe = writeModeshift(swipe,'MISC2','RIGHT_TOUCH_STICK_RADIUS','800');
swipe = writeModeshift(swipe,'MISC2','TUP','1');
assert.equal(readModeshift(swipe,'MISC2','RIGHT_TOUCH_STICK_MODE'),'AIM');
assert.equal(readModeshift(swipe,'MISC2','RIGHT_TOUCH_STICK_RADIUS'),'800');
assert.equal(readModeshift(swipe,'MISC2','TUP'),'1','swipe directions are bindable in a shift');
assert.equal(getKeymapValue(swipe,'RIGHT_TOUCHPAD_MODE'),'MOUSE','the pad is still a mouse when unshifted');

// Removing the shift takes all of its lines, including the stick settings that
// the old, narrower `settings` list did not know about.
const cleared = removeModeshift(swipe, realPad, 'MISC2');
assert.ok(!/^MISC2,RIGHT_/m.test(cleared), `orphaned pad lines left behind:\n${cleared}`);
assert.equal(getKeymapValue(cleared,'RIGHT_TOUCHPAD_MODE'),'MOUSE','removing a shift leaves the normal mode alone');

// A shift triggered by the pad's own click does not also demand a click to
// activate a region; any other trigger inherits whatever the normal mode does.
const needsClick = 'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_GRID_REQUIRES_CLICK = ON\n';
assert.equal(readModeshift(addModeshift(needsClick, realPad, 'MISC2'),'MISC2','RIGHT_GRID_REQUIRES_CLICK'),'OFF',
  'the click that triggered the shift should not be demanded twice');
assert.equal(readModeshift(addModeshift(needsClick, realPad, 'L'),'L','RIGHT_GRID_REQUIRES_CLICK'),'ON',
  'another trigger inherits the normal requires-click setting');

console.log('PASS: mandatory triggers, independent normal/alternate layouts, legacy bindings, multiple shifts, scoped rename/remove, whitespace handling, same-mode shifts, inherited read-through, shifted touch stick and full shift cleanup');
