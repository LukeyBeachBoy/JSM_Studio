// Importing a Steam Input layout converts it into Studio configurations.
//
// The fixtures are hand-written layouts in Steam's own two file versions:
// wardogs_v3.vdf uses every feature with a Studio counterpart (action sets, an
// action layer, a mode shift, menus, long/double/soft presses, labels) plus two
// things that have none, and gamepad_v2.vdf is the older bare-binding format
// Valve's templates still ship in. The rule under test throughout: whatever has
// an equivalent is converted, and whatever has not is named -- in the report
// and in the file -- never dropped.
//
// Isolated: the converter and the real save path, no browser and no runtime.
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
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  return mod.exports;
}
const src = 'JSM_GUI/jsm_gui_tauri/src/utils/';
const { convertSteamLayout, parseVdf, vdfNode, vdfString, translateBinding } = load(src + 'steamLayout.ts');
const { ensureHeaderLines } = load(src + 'config.ts');
const { parseConfigText, serializeConfig } = load(src + 'configSerializer.ts');
const { getKeymapValue } = load(src + 'keymap.ts');
const { readLayers, readLayerActions } = load(src + 'layers.ts');
const { parseBindingLabels } = load(src + 'bindingLabels.ts');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/steam', name), 'utf8');
const value = (text, key) => getKeymapValue(text, key);

// --- KeyValues: what real Steam files contain ------------------------------
{
  const tree = parseVdf('﻿"root"\n{\n  // a comment\n  "a" "x \\"quoted\\""\n  bare value [$WIN32]\n  "b" { "c" "1" }\n  "a" "second"\n}\n');
  const root = vdfNode(tree, 'ROOT');
  assert.equal(vdfString(root, 'a'), 'x "quoted"', 'escapes, case-insensitive keys, BOM and comments');
  assert.equal(vdfString(root, 'bare'), 'value', 'unquoted tokens; a platform conditional is not a key');
  assert.equal(root.filter(([key]) => key === 'a').length, 2, 'repeated keys are kept, not merged -- "group" repeats');
  assert.equal(vdfString(vdfNode(root, 'b'), 'c'), '1');
  assert.throws(() => convertSteamLayout('"UserLocalConfigStore" { }'), /not a Steam Input layout/);
}

// --- Binding strings --------------------------------------------------------
assert.deepEqual(translateBinding('key_press LEFT_SHIFT, Sprint, , '), { kind: 'token', token: 'LSHIFT', label: 'Sprint' });
assert.equal(translateBinding('key_press KEYPAD_7').token, 'N7');
assert.equal(translateBinding('key_press FORWARD_SLASH').token, '/');
assert.equal(translateBinding('mouse_button FORWARD').token, 'FMOUSE');
assert.equal(translateBinding('xinput_button shoulder_left').token, 'X_LB', 'Valve writes xinput names in either case');
assert.equal(translateBinding('controller_action CHANGE_PRESET 2 0 1').kind, 'set');
assert.equal(translateBinding('game_action Default Ping').kind, 'skip');
assert.equal(translateBinding('key_press PAUSE').kind, 'skip', 'a key JoyShockMapper cannot press is reported, not guessed');

// --- Version 3: everything with a counterpart -------------------------------
const result = convertSteamLayout(fixture('wardogs_v3.vdf'), { fileName: 'wardogs_v3.vdf' });
assert.equal(result.title, 'Wardogs Steam');
assert.equal(result.controllerType, 'controller_triton');
assert.deepEqual(result.sets.map(set => set.name), ['Wardogs Steam', 'Wardogs Steam - Menus'], 'one configuration per action set');
const [main, menus] = result.sets.map(set => set.text);

// Face buttons and their activators.
assert.equal(value(main, 'S'), 'SPACE');
assert.equal(value(main, 'E'), '^C\\', 'a toggle press keeps toggling');
assert.equal(value(main, 'W'), 'R E', 'Full + Long press is tap/hold');
assert.equal(value(main, 'HOLD_PRESS_TIME'), '250', "Steam's long-press time becomes the hold time");
assert.equal(value(main, 'N'), '1');
assert.equal(value(main, 'N,N'), '2', 'double press');
assert.equal(value(main, 'DBL_PRESS_WINDOW'), '200');
assert.deepEqual(
  { S: 'Jump', E: 'Crouch', W: 'Reload', L3: 'Sprint', ZL: 'Aim', ZR: 'Fire', '-': 'Scoreboard' },
  Object.fromEntries(Object.entries(parseBindingLabels(main)).filter(([key]) => ['S', 'E', 'W', 'L3', 'ZL', 'ZR', '-'].includes(key))),
  "Steam's binding labels become Studio labels");

// D-pad, bumpers, menu buttons.
assert.equal(value(main, 'UP'), '3');
assert.equal(value(main, 'RIGHT'), 'SCROLLUP');
assert.equal(value(main, '+'), 'ESC');
assert.equal(value(main, 'R'), 'MMOUSE');

// Sticks: joystick output needs the virtual controller; flick stick; the
// mode-shifted radial menu is chorded onto its trigger (L4).
assert.equal(value(main, 'LEFT_STICK_MODE'), 'LEFT_STICK');
assert.equal(value(main, 'VIRTUAL_CONTROLLER'), 'XBOX');
assert.equal(value(main, 'RIGHT_STICK_MODE'), 'FLICK');
assert.equal(value(main, 'R3'), 'V');
assert.equal(value(main, 'LSL,RIGHT_STICK_MODE'), 'RADIAL_MENU');
assert.equal(value(main, 'LSL,RIGHT_STICK_MENU_SIZE'), '4');
assert.deepEqual([1, 2, 3, 4].map(n => value(main, `LSL,RM${n}`)), ['5', '6', '7', '8'], 'radial items in Steam order, clockwise from up');
assert.equal(value(main, 'LSL'), undefined, 'the mode shift button itself sends nothing');

// Trackpads: mouse with its click on the right; a 4-button touch menu as a 2x2 grid on the left.
assert.equal(value(main, 'RIGHT_TOUCHPAD_MODE'), 'MOUSE');
assert.equal(value(main, 'MISC2'), 'LMOUSE', 'right pad click');
assert.equal(value(main, 'LEFT_TOUCHPAD_MODE'), 'GRID_AND_STICK');
assert.equal(value(main, 'LEFT_GRID_SIZE'), '2 2');
assert.deepEqual([1, 2, 3, 4].map(n => value(main, `LT${n}`)), ['F1', 'F2', 'F3', 'F4']);
assert.equal(value(main, 'LEFT_GRID_SHAPE'), 'RECTANGLE');
assert.ok(!/SCROLL_WHEEL|scroll/i.test(main.split('# Not carried')[0].replace(/SCROLL(UP|DOWN)/g, '')), 'an inactive group is not imported');

// Triggers: soft pull is the trigger press, the click is the full pull.
assert.equal(value(main, 'ZL'), 'RMOUSE');
assert.equal(value(main, 'ZLF'), 'LCONTROL');
assert.equal(value(main, 'ZL_MODE'), 'NO_SKIP');
assert.equal(value(main, 'ZR'), 'LMOUSE');
assert.equal(value(main, 'ZRF'), undefined);

// Gyro to mouse, approximated: Steam measures speed differently.
assert.equal(value(main, 'GYRO_OUTPUT'), 'MOUSE');
assert.equal(value(main, 'GYRO_SENS'), '2');

// Action sets load each other by name.
assert.equal(value(main, 'LSR'), '"profiles-library/Wardogs Steam - Menus.txt"');
assert.equal(value(menus, 'LSR'), '"profiles-library/Wardogs Steam.txt"');
assert.equal(value(menus, 'S'), 'ENTER');
assert.ok(/^RESET_MAPPINGS$/m.test(menus), 'an action set replaces the whole layout, as in Steam');

// The action layer: its overrides, and R4 applying it in Default and removing
// it from inside -- which Studio writes as one toggle.
const layers = readLayers(main);
assert.deepEqual(layers.map(layer => [layer.id, layer.name, layer.overrides]), [['vehicle', 'Vehicle', { S: 'F' }]]);
assert.deepEqual(readLayerActions(main, layers), [{ input: 'RSR', verb: 'toggle', layerId: 'vehicle' }]);

// --- Nothing disappears silently --------------------------------------------
const missed = result.report.filter(item => item.status !== 'converted');
assert.deepEqual(missed.map(item => [item.status, item.where]).sort(), [
  ['approximated', 'Gyro'],
  ['approximated', 'Right trackpad'],
  ['skipped', 'Gyro activation'],
  ['skipped', 'R5'],
].sort());
assert.match(missed.find(item => item.where === 'R5').detail, /Ping.*game action/);
for (const item of missed) {
  assert.ok(main.includes(`${item.where}: ${item.detail}`), `"${item.where}" is listed in the file as well as the dialog`);
}
assert.equal(result.counts.skipped, 2);
assert.equal(result.counts.approximated, 2);
assert.ok(result.counts.converted >= 30, `counts every converted input: ${result.counts.converted}`);

// --- Saving keeps it all -----------------------------------------------------
const saved = serializeConfig(parseConfigText(ensureHeaderLines(main)));
assert.equal(serializeConfig(parseConfigText(saved)), saved, 'a second save changes nothing');
for (const key of ['S', 'W', 'N,N', 'LSL,RM3', 'LT4', 'ZLF', 'LSR', 'GYRO_SENS']) {
  assert.equal(value(saved, key), value(main, key), `${key} survives Save`);
}
assert.deepEqual(readLayers(saved), layers);
assert.deepEqual(parseBindingLabels(saved), parseBindingLabels(main));
assert.ok(saved.includes('# - Not converted: R5:'), 'the notes survive Save');

// --- An input Studio does not know is reported, not dropped ------------------
{
  const clash = fixture('wardogs_v3.vdf').replace('"button_back_left"', '"button_back_right_upper_unused"')
    .replace('"mode_shift right_joystick 10"', '"key_press 9"');
  const converted = convertSteamLayout(clash);
  assert.ok(converted.report.some(item => item.status === 'skipped' && item.where.includes('button back right upper unused')), 'an input Studio cannot place is named');
  assert.equal(value(converted.sets[0].text, 'LSL'), undefined);
}

// --- Version 2: Valve's template format --------------------------------------
const v2 = convertSteamLayout(fixture('gamepad_v2.vdf'));
assert.equal(v2.title, 'Gamepad With Camera Controls', 'the title comes from its localization');
assert.equal(v2.sets.length, 1);
const pad = v2.sets[0].text;
assert.equal(value(pad, 'S'), 'X_A');
assert.equal(value(pad, 'ZL_MODE'), 'X_LT', 'analog trigger output');
assert.equal(value(pad, 'ZLF'), undefined, 'a full pull that only repeats the analog trigger is not doubled up');
assert.equal(value(pad, 'RIGHT_TOUCH_STICK_MODE'), 'RIGHT_STICK');
assert.equal(value(pad, 'MISC2'), 'X_RS');
assert.equal(value(pad, '+'), 'X_START', 'switch_bindings');
assert.equal(value(pad, 'LSL'), 'X_A');
assert.equal(v2.counts.skipped, 0);

// A name typed in the dialog names every configuration and its references.
const renamed = convertSteamLayout(fixture('wardogs_v3.vdf'), { title: 'My Wardogs' });
assert.deepEqual(renamed.sets.map(set => set.name), ['My Wardogs', 'My Wardogs - Menus']);
assert.equal(value(renamed.sets[1].text, 'LSR'), '"profiles-library/My Wardogs.txt"');

console.log('PASS: Steam layouts convert to Studio configurations, and everything that cannot is reported');
