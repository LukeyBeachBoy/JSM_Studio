// The overlay must draw the configuration the MAPPER is running, not the one
// Studio has selected. A `loadConfig` binding switches profiles at runtime
// without Studio's knowledge, so its stored selection goes stale -- and a stale
// selection meant the overlay kept drawing the old profile's menus, including a
// pad menu the new profile does not have.
//
// Pure check of the rule the overlay applies. The overlay component itself is
// Tauri-only; what is worth locking is which path wins, and that a profile's
// menus resolve from it through its imports.
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
const {resolveIncludes} = load('JSM_GUI/jsm_gui_tauri/src/utils/configIncludes.ts');
const {resolveOverlayMenus} = load('JSM_GUI/jsm_gui_tauri/src/utils/overlayLayout.ts');

// --- the rule, mirrored from Overlay.tsx ---
const NOT_A_CHOSEN_PROFILE = ['profiles-library/applied-preview.txt', 'MappingDisabled.txt'];
const liveProfilePath = activeProfile => {
  const p = activeProfile?.trim().replace(/\\/g, '/');
  if (!p || !/\.txt$/i.test(p)) return null;
  return NOT_A_CHOSEN_PROFILE.some(s => s.toLowerCase() === p.toLowerCase()) ? null : p;
};

// Studio applies by copying the edited profile into applied-preview.txt and
// loading THAT, so the mapper reports the preview during ordinary use. Follow
// it and the overlay would render a file the user never edits.
assert.equal(liveProfilePath('profiles-library/applied-preview.txt'), null,
  'the preview Studio applies through is not a runtime switch');
assert.equal(liveProfilePath('MappingDisabled.txt'), null, 'mapping-off stub is not a runtime switch');
assert.equal(liveProfilePath(''), null);
assert.equal(liveProfilePath(undefined), null);
assert.equal(liveProfilePath('profiles-library/Wardogs Menu.txt'), 'profiles-library/Wardogs Menu.txt',
  'a real profile loaded at runtime must be followed');
assert.equal(liveProfilePath('profiles-library\\Wardogs Menu.txt'), 'profiles-library/Wardogs Menu.txt',
  'backslashes normalize');
assert.equal(liveProfilePath('PROFILES-LIBRARY/APPLIED-PREVIEW.TXT'), null, 'placeholder match is case-insensitive');

// --- the symptom this fixes ---
// The main profile puts a four-way menu on the right pad's click. The menu
// profile deliberately has none: clicking the pad left-clicks instead.
const template = [
  'RIGHT_GRID_SIZE = 3 3',
  'MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
].join('\n');
const main = [
  'RESET_MAPPINGS',
  'profiles-library/FPS Template.txt',
  'RIGHT_GRID_SHAPE = FOUR_WAY',
  'RT1 = MMOUSE',
  '# @overlay RIGHT:MISC2 at 0.8 0.75 size 286',
].join('\n');
const menu = [
  'RESET_MAPPINGS',
  'profiles-library/FPS Template.txt',
  'MISC2,RIGHT_TOUCHPAD_MODE = NONE',
  'MISC2 = LMOUSE',
  '# @overlay RIGHT at 0.8 0.75 size 286',
].join('\n');
const files = {
  'profiles-library/Wardogs.txt': main,
  'profiles-library/Wardogs Menu.txt': menu,
  'profiles-library/FPS Template.txt': template,
};
const menusFor = root => resolveOverlayMenus(resolveIncludes(root, files).effectiveText);

const mainMenus = menusFor('profiles-library/Wardogs.txt');
const menuMenus = menusFor('profiles-library/Wardogs Menu.txt');
const chordKeys = m => Object.keys(m).filter(k => k.includes(':'));

assert.ok(chordKeys(mainMenus).some(k => /MISC2/i.test(k)),
  `the combat profile should define a pad-click menu: ${JSON.stringify(Object.keys(mainMenus))}`);
assert.deepEqual(chordKeys(menuMenus), [],
  `the menu profile must define no pad-click menu: ${JSON.stringify(Object.keys(menuMenus))}`);

// Studio still points at the combat profile after a runtime switch; the mapper
// reports the menu profile. Choosing by the mapper is what removes the menu.
const studioSelection = 'profiles-library/Wardogs.txt';
const reported = 'profiles-library/Wardogs Menu.txt';
const chosen = liveProfilePath(reported) ?? studioSelection;
assert.equal(chosen, reported, 'the mapper’s profile must win over a stale selection');
assert.deepEqual(chordKeys(menusFor(chosen)), [],
  'following the mapper must stop the four-way menu being drawn');
// ...and the pre-fix behaviour is exactly the bug, so this test can fail.
assert.ok(chordKeys(menusFor(studioSelection)).length > 0,
  'using the stale selection is what drew the wrong menu');

// Ordinary use: no runtime switch, so the selection is still what to draw --
// and it must stay the selection, not the preview copy.
assert.equal(liveProfilePath('profiles-library/applied-preview.txt') ?? studioSelection, studioSelection,
  'without a runtime switch the overlay keeps using Studio’s selection');

console.log('PASS: overlay follows the mapper’s live profile, ignores the preview and mapping-off placeholders, and stops drawing a menu the switched-to profile does not define');
