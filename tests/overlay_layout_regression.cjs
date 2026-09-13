// The overlay draws which region your thumb has selected. If its idea of that
// disagrees with JoyShockMapper's, the overlay confidently highlights one action
// while the pad fires a different one -- strictly worse than no overlay.
//
// So this does not test the TypeScript against itself. It compiles the REAL
// touchGridCell/touchFourWayCell out of TouchGridRouting.h, runs both over the
// same grid of coordinates, and requires every answer to match.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const HEADER = path.join(ROOT, 'JoyShockMapper/JoyShockMapper/include/TouchGridRouting.h');
const VCVARS = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat';

// --- the TypeScript under test, transpiled the same way vite would -----------
// Relative imports are resolved and evaluated for real rather than stripped:
// resolveOverlayMenus genuinely depends on the label and keymap parsers, and
// testing it with those missing would be testing a different function.
const SRC_ROOT = path.join(ROOT, 'JSM_GUI/jsm_gui_tauri');
const moduleCache = new Map();

function loadModule(relative) {
  const file = path.join(SRC_ROOT, relative);
  if (moduleCache.has(file)) return moduleCache.get(file);
  const ts = require(path.join(SRC_ROOT, 'node_modules/typescript'));
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  moduleCache.set(file, exports);
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = ['.ts', '.tsx', '/index.ts', ''].map(ext => base + ext).find(fs.existsSync);
    if (!resolved) throw new Error(`cannot resolve ${specifier} from ${relative}`);
    return loadModule(path.relative(SRC_ROOT, resolved));
  };
  const module = { exports };
  new Function('module', 'exports', 'require', js)(module, exports, localRequire);
  moduleCache.set(file, module.exports);
  return module.exports;
}
const loadOverlayLayout = () => loadModule('src/utils/overlayLayout.ts');

// --- the C++ under test ------------------------------------------------------
function runBackend(cases) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'overlayparity-'));
  fs.copyFileSync(HEADER, path.join(tmp, 'TouchGridRouting.h'));
  // Always emit a real float literal: `0f` is not valid C++, and a JS number of
  // 0 or 1 stringifies without a decimal point.
  const f = (v) => `${Number(v).toFixed(6)}f`;
  const rows = cases.map(c =>
    `  std::printf("%d\\n", touchGridCell(true, ${f(c.x)}, ${f(c.y)}, ${c.columns}, ${c.rows}, ` +
    `GridShape::${c.shape}, ${f(c.deadzone)}));`).join('\n');
  fs.writeFileSync(path.join(tmp, 'parity.cpp'),
    `#include "TouchGridRouting.h"\n#include <cstdio>\nint main(){\n${rows}\n  return 0;\n}\n`);
  // vcvars64.bat shells out to vswhere.exe and only finds it via the Installer
  // directory. Depending on how this test is launched that directory is not on
  // PATH (and %ProgramFiles(x86)% does not survive every shell), so put it there
  // explicitly rather than depending on the caller's environment.
  const installer = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer';
  fs.writeFileSync(path.join(tmp, 'b.bat'),
    `@echo off\r\nset "PATH=${installer};%PATH%"\r\ncall "${VCVARS}" >nul\r\n` +
    `cl /nologo /EHsc /std:c++17 "${tmp}\\parity.cpp" /Fe:"${tmp}\\parity.exe"\r\n`);
  const build = spawnSync('cmd.exe', ['/d', '/c', path.join(tmp, 'b.bat')], { cwd: tmp, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`backend did not compile:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(path.join(tmp, 'parity.exe'), { encoding: 'utf8' });
  if (run.status !== 0) throw new Error('backend harness failed to run');
  return run.stdout.trim().split(/\r?\n/).map(Number);
}

const { hitTestRegion, parseOverlayPlacements, resolveOverlayMenus, setOverlayPlacement, toUnit } = loadOverlayLayout();

// --- parity sweep ------------------------------------------------------------
// Telemetry is -1..1; the backend is 0..1. Sweeping in telemetry space and
// converting with the overlay's own toUnit is deliberate: a bug in that
// conversion is exactly the kind of drift this test exists to catch.
const layouts = [
  { shape: 'RECTANGLE', columns: 2, rows: 2, deadzone: 0 },
  { shape: 'RECTANGLE', columns: 3, rows: 3, deadzone: 0 },
  { shape: 'RECTANGLE', columns: 5, rows: 1, deadzone: 0 },
  { shape: 'FOUR_WAY', columns: 2, rows: 2, deadzone: 0 },
  { shape: 'FOUR_WAY', columns: 2, rows: 2, deadzone: 0.15 },
  { shape: 'FOUR_WAY', columns: 2, rows: 2, deadzone: 0.5 },
  // A wheel's segment boundaries are angles, so float-vs-double drift shows up
  // as a whole segment of disagreement rather than a single edge coordinate.
  { shape: 'RADIAL', columns: 4, rows: 1, deadzone: 0 },
  { shape: 'RADIAL', columns: 6, rows: 1, deadzone: 0.2 },
  { shape: 'RADIAL', columns: 8, rows: 1, deadzone: 0 },
  { shape: 'RADIAL', columns: 8, rows: 1, deadzone: 0.25 },
  { shape: 'RADIAL', columns: 4, rows: 3, deadzone: 0.1 },
];

const cases = [];
for (const layout of layouts) {
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const tx = -1 + (2 * i) / 20;
      const ty = -1 + (2 * j) / 20;
      cases.push({ ...layout, tx, ty, x: toUnit(tx), y: toUnit(ty) });
    }
  }
}

const backend = runBackend(cases);
assert.equal(backend.length, cases.length, 'backend returned the wrong number of answers');

let mismatches = 0;
cases.forEach((c, index) => {
  const menu = {
    shape: c.shape,
    columns: c.columns,
    rows: c.rows,
    deadzone: c.deadzone,
    regions: Array.from({ length: c.shape === 'FOUR_WAY' ? 4 : c.columns * c.rows }, () => ({})),
  };
  const mine = hitTestRegion(menu, c.tx, c.ty);
  if (mine !== backend[index]) {
    if (mismatches++ < 5) {
      console.error(
        `  ${c.shape} ${c.columns}x${c.rows} dz=${c.deadzone} at (${c.tx.toFixed(2)}, ${c.ty.toFixed(2)}): ` +
        `overlay says ${mine}, backend says ${backend[index]}`);
    }
  }
});
assert.equal(mismatches, 0, `${mismatches} of ${cases.length} coordinates disagree with the backend`);

// --- placement directives ----------------------------------------------------
// reveal is per surface: a pad menu has always appeared on contact, a stick
// wheel only once the stick reaches the ring. DEF is the pad shape.
const DEF = { showLabels: true, showKeys: true, fontSize: 14, reveal: 'touch' };
const config = [
  '# @overlay RIGHT at 0.82 0.74 size 300',
  '# @overlay LEFT at 0.18 0.74',
  '# @overlay RIGHT:MISC2 at 0.5 0.5 size 360',
  'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
].join('\n');

const places = parseOverlayPlacements(config);
assert.deepEqual(places.RIGHT, { x: 0.82, y: 0.74, size: 300, ...DEF }, 'right pad placement');
assert.deepEqual(places.LEFT, { x: 0.18, y: 0.74, size: 280, ...DEF }, 'omitted size falls back to the default');
assert.deepEqual(places['RIGHT:MISC2'], { x: 0.5, y: 0.5, size: 360, ...DEF }, 'per-layer placement');

// Each menu is positioned independently: moving a layer must not move the base.
const moved = setOverlayPlacement(config, 'RIGHT', 'MISC2', { x: 0.25, y: 0.33, size: 400, ...DEF });
const after = parseOverlayPlacements(moved);
assert.deepEqual(after['RIGHT:MISC2'], { x: 0.25, y: 0.33, size: 400, ...DEF }, 'layer placement was rewritten');
assert.deepEqual(after.RIGHT, { x: 0.82, y: 0.74, size: 300, ...DEF }, 'base placement untouched');
assert.equal(moved.split('\n').filter(l => l.includes('@overlay RIGHT:MISC2')).length, 1,
  'rewriting a placement must replace its line, not append a second one');

// A pad with no placement at all still gets a usable default rather than 0,0.
const bare = parseOverlayPlacements('RIGHT_TOUCHPAD_MODE = GRID_AND_STICK');
assert.deepEqual(bare, {}, 'no directives means no placements, and the caller defaults');

// Out-of-range values are clamped rather than throwing the window off-screen.
const silly = parseOverlayPlacements('# @overlay LEFT at 9 -4 size 99999');
assert.equal(silly.LEFT.x, 1, 'x clamped to the work area');
assert.equal(silly.LEFT.y, 0, 'y clamped to the work area');
assert.equal(silly.LEFT.size, 900, 'size clamped to something drawable');

// --- label / key / font options ----------------------------------------------
const opts = parseOverlayPlacements([
  '# @overlay LEFT at 0.2 0.8 size 240 keys off font 20',
  '# @overlay RIGHT at 0.8 0.8 labels off',
].join('\n'));
assert.equal(opts.LEFT.showKeys, false, 'keys off');
assert.equal(opts.LEFT.showLabels, true, 'labels default on when only keys was set');
assert.equal(opts.LEFT.fontSize, 20, 'font size read');
assert.equal(opts.RIGHT.showLabels, false, 'labels off');
assert.equal(opts.RIGHT.showKeys, true, 'keys default on');
assert.equal(opts.RIGHT.fontSize, 14, 'font falls back to the default');
assert.equal(parseOverlayPlacements('# @overlay LEFT at 0.2 0.8 font 900').LEFT.fontSize, 48,
  'absurd font size is clamped rather than making one region fill the screen');

// Options survive a round trip, and defaults are not written back as noise.
const styled = setOverlayPlacement('', 'LEFT', '', { x: 0.2, y: 0.8, size: 240, showLabels: true, showKeys: false, fontSize: 20 });
assert.match(styled, /keys off/, 'non-default option is written');
assert.doesNotMatch(styled, /labels on/, 'a default must not be written back as clutter');
assert.deepEqual(parseOverlayPlacements(styled).LEFT,
  { x: 0.2, y: 0.8, size: 240, showLabels: true, showKeys: false, fontSize: 20, reveal: 'touch' }, 'round trip');
// The placement handed to setOverlayPlacement above predates `reveal` and has no
// such field. Writing it raw put the literal "show undefined" into the profile.
assert.doesNotMatch(styled, /show undefined/, 'a missing option must not be written as a word');

// --- layer discovery ----------------------------------------------------------
// Reads fall through to the unchorded value, so a chord that overrides only the
// RIGHT pad used to also produce a LEFT:<layer> menu identical to LEFT's base
// one, stacked invisibly on top of it in both the editor and the overlay.
const layered = resolveOverlayMenus([
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SIZE = 2 2',
  'LT1 = W',
  'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'RIGHT_GRID_SIZE = 2 2',
  'RT1 = R',
  'MISC2,RIGHT_GRID_SHAPE = FOUR_WAY',
].join('\n'));
assert.deepEqual(Object.keys(layered).sort(), ['LEFT', 'RIGHT', 'RIGHT:MISC2'],
  'a chord touching only the right pad must not invent a left-pad menu');

// A layer that rebinds a region (rather than a pad setting) still counts.
const boundLayer = resolveOverlayMenus([
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SIZE = 2 2',
  'LT1 = W',
  'RSL,LT1 = M',
].join('\n'));
assert.deepEqual(Object.keys(boundLayer).sort(), ['LEFT', 'LEFT:RSL'],
  'a chorded region binding defines a layer for that pad');

// --- icons --------------------------------------------------------------------
const iconsMod = loadModule('src/utils/bindingIcons.ts');
const iconCfg = [
  'RT1 = R',
  '# @icon RT1 = game-icons:reload-gun-barrel',
  '# @icon LT3 = lucide:map',
  '# @icon LT4 = not a valid name',
].join('\n');
const parsedIcons = iconsMod.parseBindingIcons(iconCfg);
assert.equal(parsedIcons.RT1, 'game-icons:reload-gun-barrel', 'icon parsed');
assert.equal(parsedIcons.LT3, 'lucide:map', 'second icon parsed');
assert.equal(parsedIcons.LT4, undefined, 'a malformed name is ignored rather than stored');
assert.deepEqual(iconsMod.referencedIconSets(parsedIcons).sort(), ['game-icons', 'lucide'],
  'only the sets actually used are reported, so only those get loaded');

// Round trip, replace, and remove.
const added = iconsMod.setBindingIcon('RT2 = F', 'RT2', 'lucide:hand');
assert.equal(iconsMod.parseBindingIcons(added).RT2, 'lucide:hand', 'icon written');
const replaced = iconsMod.setBindingIcon(added, 'RT2', 'lucide:swords');
assert.equal(iconsMod.parseBindingIcons(replaced).RT2, 'lucide:swords', 'icon replaced');
assert.equal(replaced.split('\n').filter(l => l.includes('@icon RT2')).length, 1,
  'replacing must not leave a second line behind');
assert.equal(iconsMod.parseBindingIcons(iconsMod.setBindingIcon(replaced, 'RT2', '')).RT2, undefined,
  'an empty name removes the icon');
assert.equal(iconsMod.setBindingIcon('RT2 = F', 'RT2', 'nonsense').includes('@icon'), false,
  'a malformed name is never written');

// The overlay carries the icon through to the region it belongs to.
const iconMenus = resolveOverlayMenus([
  'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'RIGHT_GRID_SIZE = 2 1',
  'RT1 = R',
  'RT2 = F',
  '# @icon RT1 = lucide:refresh-cw',
].join('\n'));
assert.equal(iconMenus.RIGHT.regions[0].icon, 'lucide:refresh-cw', 'region carries its icon');
assert.equal(iconMenus.RIGHT.regions[1].icon, '', 'a region with no icon carries an empty string');

// --- stick radial menus -------------------------------------------------------
// A stick wheel is configured by a different family of settings but is the same
// thing as a pad wheel, so it must resolve through the same code path.
const stickMenus = resolveOverlayMenus([
  'LEFT_STICK_MODE = RADIAL_MENU',
  'LEFT_STICK_MENU_SIZE = 8',
  'LEFT_STICK_MENU_DEADZONE = 0.4',
  'LM1 = 1', 'LM2 = 2', 'LM3 = 3', 'LM4 = 4',
  'LM5 = 5', 'LM6 = 6', 'LM7 = 7', 'LM8 = 8',
  '# @label LM1 = Rifle',
  '# @icon LM1 = game-icons:ak47',
  '# @overlay LSTICK at 0.5 0.5 size 340',
].join('\n'));
assert.ok(stickMenus.LSTICK, 'a stick in RADIAL_MENU mode produces a menu');
assert.equal(stickMenus.LSTICK.shape, 'RADIAL', 'a stick menu is always a wheel');
assert.equal(stickMenus.LSTICK.regions.length, 8, 'segment count comes from _STICK_MENU_SIZE');
assert.equal(stickMenus.LSTICK.regions[0].command, 'LM1', 'segments are LM1.., not LT1..');
assert.equal(stickMenus.LSTICK.regions[0].label, 'Rifle', 'labels work on a stick menu');
assert.equal(stickMenus.LSTICK.regions[0].icon, 'game-icons:ak47', 'icons work on a stick menu');
assert.equal(stickMenus.LSTICK.deadzone, 0.4, 'the stick menu deadzone is read');
assert.deepEqual(stickMenus.LSTICK.placement, { x: 0.5, y: 0.5, size: 340, ...DEF, reveal: 'ring' },
  'a stick menu is placed by the same @overlay directive');

// A stick in any other mode is not a menu.
assert.deepEqual(
  Object.keys(resolveOverlayMenus(['LEFT_STICK_MODE = AIM', 'LM1 = 1'].join('\n'))), [],
  'a stick that is not in RADIAL_MENU mode produces no menu');

// Fewer than two segments is not a wheel, matching touchGridRegionCount.
assert.deepEqual(
  Object.keys(resolveOverlayMenus(['LEFT_STICK_MODE = RADIAL_MENU', 'LEFT_STICK_MENU_SIZE = 1', 'LM1 = 1'].join('\n'))), [],
  'one segment is not a wheel');

// The stick default matches the backend's 0.35 rather than the pad's 0.1.
const defaulted = resolveOverlayMenus([
  'RIGHT_STICK_MODE = RADIAL_MENU', 'RIGHT_STICK_MENU_SIZE = 4', 'RM1 = A', 'RM2 = B', 'RM3 = C', 'RM4 = D',
].join('\n'));
assert.equal(defaulted.RSTICK.deadzone, 0.35, 'stick deadzone defaults to the backend value');

// Layers work on sticks too, and a chord touching only the stick must not
// conjure a pad menu (the bug that produced phantom LEFT:MISC2 menus).
const stickLayer = resolveOverlayMenus([
  'LEFT_STICK_MODE = RADIAL_MENU', 'LEFT_STICK_MENU_SIZE = 4',
  'LM1 = A', 'LM2 = B', 'LM3 = C', 'LM4 = D',
  'RSL,LM1 = Z',
].join('\n'));
assert.deepEqual(Object.keys(stickLayer).sort(), ['LSTICK', 'LSTICK:RSL'],
  'a chorded stick segment defines a layer for that stick and nothing else');

// --- pad geometry -------------------------------------------------------------
const geom = loadModule('src/utils/padGeometry.ts');
assert.equal(geom.padAspect({ touchpadWidth: 1920, touchpadHeight: 1920 }), 1, 'square pad');
assert.equal(geom.padAspect({ touchpadWidth: 1920, touchpadHeight: 960 }), 2, 'wide pad');
assert.equal(geom.padAspect(null), 1, 'no device falls back to square');
assert.equal(geom.padAspect({ touchpadWidth: 0, touchpadHeight: 0 }), 1, 'no touchpad falls back');
assert.equal(geom.padAspect({ touchpadWidth: 9999, touchpadHeight: 1 }), 4, 'absurd ratio is clamped');

// A menu's height follows the pad, so one stored width keeps the right shape.
assert.deepEqual(geom.menuBox(300, 1), { width: 300, height: 300 }, 'square menu');
assert.deepEqual(geom.menuBox(300, 2), { width: 300, height: 150 }, 'wide menu');

// The same fractional placement must land in the same relative spot on any
// screen -- that is the whole point of storing fractions rather than pixels.
const hd = geom.placeMenu({ x: 0.8, y: 0.75, size: 300 }, 1, { x: 0, y: 0, width: 1920, height: 1080 });
const uhd = geom.placeMenu({ x: 0.8, y: 0.75, size: 300 }, 1, { x: 0, y: 0, width: 3840, height: 2160 }, 2);
assert.equal((hd.x + hd.width / 2) / 1920, (uhd.x + uhd.width / 2) / 3840, 'same relative x at 4K');
assert.equal((hd.y + hd.height / 2) / 1080, (uhd.y + uhd.height / 2) / 2160, 'same relative y at 4K');

// A menu near an edge is nudged fully on screen rather than half cut off.
const edge = geom.placeMenu({ x: 1, y: 1, size: 300 }, 1, { x: 0, y: 0, width: 1920, height: 1080 });
assert.equal(edge.x + edge.width, 1920, 'clamped to the right edge');
assert.equal(edge.y + edge.height, 1080, 'clamped to the bottom edge');

// Dragging maps back to the fraction that would reproduce it.
const back = geom.placementFromScreen(1536, 810, { x: 0, y: 0, width: 1920, height: 1080 });
assert.equal(back.x, 0.8, 'x round trips');
assert.equal(back.y, 0.75, 'y round trips');

console.log(`overlay layout: ${cases.length} coordinates agree with the backend; placements, options and geometry OK`);
