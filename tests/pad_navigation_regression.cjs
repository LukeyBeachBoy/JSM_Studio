// Native controller navigation: the pad-to-action rules Studio uses while its
// window has focus (design handoff, "native controller navigation").
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
function load(file) {
  file = path.resolve(file);
  const mod = new Module(file);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, file);
  return mod.exports;
}
const { PadNavigator, REPEAT_DELAY_MS, HOLD_BACK_MS, EXIT_TEST_MS } = load('JSM_GUI/jsm_gui_tauri/src/nav/padNavigator.ts');

const pad = (buttons = [], extra = {}) => ({
  buttons: new Set(buttons), leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, ...extra,
});
const kinds = actions => actions.map(a => a.kind === 'press' ? a.button : a.kind === 'move' ? `${a.direction}${a.repeat ? '*' : ''}` : a.kind);

// Presses fire once, on the way down, and map by position (A is south).
let nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad(['S']), 0)), ['A']);
assert.deepEqual(kinds(nav.update(pad(['S']), 16)), [], 'a held button fires once');
assert.deepEqual(kinds(nav.update(pad([]), 32)), []);
assert.deepEqual(kinds(nav.update(pad(['E', 'W', 'N', 'L', 'R']), 48)).sort(), ['B', 'LB', 'RB', 'X', 'Y']);

// Triggers page on a firm pull, with hysteresis so a half-released pull does not chatter.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad([], { triggers: { left: 0, right: 0.4 } }), 0)), [], 'short of the page-turn point');
assert.deepEqual(kinds(nav.update(pad([], { triggers: { left: 0, right: 0.5 } }), 16)), ['RT'], 'a soft pull, a little under half way, turns the page');
assert.deepEqual(kinds(nav.update(pad([], { triggers: { left: 0, right: 0.3 } }), 32)), [], 'still held above the release point');
assert.deepEqual(kinds(nav.update(pad([], { triggers: { left: 0, right: 0.2 } }), 48)), []);
assert.deepEqual(kinds(nav.update(pad([], { triggers: { left: 0, right: 0.7 } }), 64)), ['RT'], 'released, pulled again');

// Movement: one step, then repeats after the delay that get faster.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad(['DOWN']), 0)), ['down']);
assert.deepEqual(kinds(nav.update(pad(['DOWN']), REPEAT_DELAY_MS - 1)), []);
assert.deepEqual(kinds(nav.update(pad(['DOWN']), REPEAT_DELAY_MS)), ['down*']);
let t = REPEAT_DELAY_MS, gaps = [];
for (let step = 0; step < 12; step++) {
  let next = t + 1; while (!kinds(nav.update(pad(['DOWN']), next)).length) next++;
  gaps.push(next - t); t = next;
}
assert.ok(gaps[0] > gaps[gaps.length - 1], `repeats should accelerate: ${gaps.join(', ')}`);
assert.ok(Math.min(...gaps) >= 55, 'and never faster than the floor');

// The left stick moves too; positive y is up.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad([], { leftStick: { x: 0, y: 0.9 } }), 0)), ['up']);
assert.deepEqual(kinds(nav.update(pad([], { leftStick: { x: 0, y: 0.4 } }), 16)), [], 'hysteresis keeps the direction');
assert.deepEqual(kinds(nav.update(pad([], { leftStick: { x: 0, y: 0.1 } }), 32)), []);
assert.deepEqual(kinds(nav.update(pad([], { leftStick: { x: -0.8, y: 0.2 } }), 48)), ['left']);

// View and Menu act on release, and not at all when used together.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad(['-']), 0)), []);
assert.deepEqual(kinds(nav.update(pad([]), 16)), ['VIEW']);
assert.deepEqual(kinds(nav.update(pad(['-', '+']), 32)), []);
assert.deepEqual(kinds(nav.update(pad(['-']), 48)), []);
assert.deepEqual(kinds(nav.update(pad([]), 64)), [], 'a chord is not also a View press');

// Hold B for the guaranteed escape.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad(['E']), 0)), ['B']);
assert.deepEqual(kinds(nav.update(pad(['E']), HOLD_BACK_MS - 1)), []);
assert.deepEqual(kinds(nav.update(pad(['E']), HOLD_BACK_MS)), ['hold']);
assert.deepEqual(kinds(nav.update(pad(['E']), HOLD_BACK_MS + 500)), [], 'once per hold');

// Test mode: the profile owns the pad; only the View + Menu hold leaves it.
nav = new PadNavigator();
assert.deepEqual(kinds(nav.update(pad(['S', 'DOWN']), 0, true)), [], 'nothing navigates while testing');
assert.deepEqual(kinds(nav.update(pad(['-', '+']), 16, true)), []);
assert.deepEqual(kinds(nav.update(pad(['-', '+']), 16 + EXIT_TEST_MS, true)), ['exitTest']);
assert.deepEqual(kinds(nav.update(pad(['-', '+']), 16 + EXIT_TEST_MS + 16)), [], 'leaving test does not replay the held buttons');
assert.deepEqual(kinds(nav.update(pad([]), 16 + EXIT_TEST_MS + 32)), [], 'nor jump to the title bar on release');

// Right stick scrolls, faster the further it is pushed, and not inside the deadzone.
nav = new PadNavigator();
nav.update(pad([], { rightStick: { x: 0, y: -0.1 } }), 0);
assert.deepEqual(kinds(nav.update(pad([], { rightStick: { x: 0, y: -0.1 } }), 16)), []);
const slow = nav.update(pad([], { rightStick: { x: 0, y: -0.5 } }), 32).find(a => a.kind === 'scroll');
const fast = nav.update(pad([], { rightStick: { x: 0, y: -1 } }), 48).find(a => a.kind === 'scroll');
assert.ok(slow.dy > 0 && fast.dy > slow.dy * 2, `down on the stick scrolls down, faster when pushed further: ${slow.dy}, ${fast.dy}`);

// Taps that start and end between two snapshots (telemetry reaches the UI at
// the display rate) still count, once each.
nav = new PadNavigator();
const tap = (buttons, since, at) => kinds(nav.update(pad(buttons, { pressedSince: new Set(since) }), at));
assert.deepEqual(tap([], ['DOWN'], 0), ['down'], 'a D-pad tap entirely between snapshots moves');
assert.deepEqual(tap(['DOWN'], ['DOWN'], 16), ['down'], 'the next tap, still down in this snapshot, moves once');
assert.deepEqual(tap(['DOWN'], ['DOWN'], 32), ['down'], 'released and pressed again between snapshots moves again');
assert.deepEqual(tap(['DOWN'], [], 48), [], 'held with no new press waits for the repeat');
assert.deepEqual(tap([], ['S'], 64), ['A'], 'a face-button tap between snapshots presses');
assert.deepEqual(tap(['S'], ['S'], 80), ['A'], 'a press seen both ways fires once');
assert.deepEqual(tap([], ['-'], 96), ['VIEW'], 'View tapped between snapshots acts as its release');

// After a reset with latch (a global chord handed the pad back), what is still
// held fires nothing until it is let go and pressed again.
nav = new PadNavigator();
nav.update(pad([]), 0);
nav.reset(true);
assert.deepEqual(kinds(nav.update(pad(['ZR', 'DOWN'], { triggers: { left: 0, right: 1 } }), 16)), [], 'RT and the D-pad still held from the chord do nothing');
assert.deepEqual(kinds(nav.update(pad(['ZR', 'DOWN'], { triggers: { left: 0, right: 1 } }), 16 + REPEAT_DELAY_MS * 2)), [], 'and do not repeat');
assert.deepEqual(kinds(nav.update(pad([]), 1000)), []);
assert.deepEqual(kinds(nav.update(pad(['ZR'], { triggers: { left: 0, right: 1 } }), 1016)), ['RT'], 'pulled again, it pages');

console.log('PASS: presses on the way down, trigger hysteresis, accelerating repeat, stick movement, View/Menu on release, hold-B escape, test-mode exit chord, right-stick scroll');
