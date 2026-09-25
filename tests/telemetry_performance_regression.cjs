// The live preview must cost one update per displayed frame -- no more, and
// none at all while another app has focus.
//
// It used to publish on a fixed 1000/60 timer, which capped the preview at 60 Hz
// however fast the monitor ran. It now publishes on requestAnimationFrame, so
// the pace is the panel's, and reports the rate it measures to the backend so
// the emitter matches instead of sending frames the UI will never draw.
//
// Runs the real hook against a fake clock, fake frames and a fake bridge; no
// browser, no controller, no renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const source = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src/hooks/useTelemetry.ts', 'utf8');

let now = 0, nextId = 0, renders = 0, sample, callback, calibration;
let frameMs = 1000 / 120;              // a 120 Hz panel
const reported = [];                   // refresh rates handed to the backend
const timers = new Map();              // both setTimeout and rAF live here
const cleanups = [];
const listeners = new Map();           // one event may have several handlers
const target = prefix => ({
  addEventListener: (name, fn) => {
    const key = prefix + name;
    listeners.set(key, [...(listeners.get(key) ?? []), fn]);
  },
  removeEventListener: (name, fn) => {
    const key = prefix + name;
    const rest = (listeners.get(key) ?? []).filter(entry => entry !== fn);
    if (rest.length) listeners.set(key, rest); else listeners.delete(key);
  },
});
const fire = key => (listeners.get(key) ?? []).slice().forEach(fn => fn(now));
const doc = { ...target('doc:'), hidden: false, hasFocus: () => true };
const win = target('win:');

let stateIndex = 0;
const react = {
  useEffect: fn => { const undo = fn(); if (undo) cleanups.push(undo); },
  useState: initial => {
    const index = stateIndex++;
    return [initial, value => { if (index === 0) { renders++; sample = value; } }];
  },
};
const bridge = {
  onTelemetrySample: fn => { callback = fn; return () => { callback = null; }; },
  onCalibrationStatus: fn => { calibration = fn; return () => { calibration = null; }; },
  setUiRefreshHz: hz => { reported.push(hz); return Promise.resolve(); },
};

const exportsForHook = {};
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const schedule = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
new Function(
  'exports', 'require', 'document', 'window', 'performance',
  'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', compiled,
)(
  exportsForHook,
  name => (name === 'react' ? react : { desktopBridge: bridge }),
  doc, win, { now: () => now },
  schedule, id => timers.delete(id),
  // A frame lands at the next boundary of this display's cadence.
  fn => schedule(() => fn(now), frameMs), id => timers.delete(id),
);
exportsForHook.useTelemetry();

function advance(to) {
  while (true) {
    let earliest;
    for (const [id, t] of timers) if (t.at <= to && (!earliest || t.at < earliest[1].at)) earliest = [id, t];
    if (!earliest) break;
    now = earliest[1].at;
    timers.delete(earliest[0]);
    earliest[1].fn();
  }
  now = to;
}
function packets(count) {
  for (let i = 0; i < count; i += 1) { advance(now + frameMs); callback({ seq: i, devices: [] }); }
}

// --- The panel's rate is measured and reported, not assumed ----------------
advance(now + frameMs * 45);
assert.deepEqual(reported, [120], `a 120 Hz display must be reported as 120, got ${reported}`);

// --- One update per frame, at the display's rate and not a fixed 60 --------
renders = 0;
packets(120);
advance(now + frameMs * 2);
assert.ok(renders >= 118 && renders <= 121, `120 packets on a 120 Hz display gave ${renders} updates, not one per frame`);
assert.equal(sample.seq, 119, 'trailing packet must be published');

// Several packets inside one frame collapse into a single update: the preview
// draws the newest state rather than working through a backlog.
const beforeBurst = renders;
callback({ seq: 500 }); callback({ seq: 501 }); callback({ seq: 502 });
advance(now + frameMs * 2);
assert.equal(renders, beforeBurst + 1, 'a burst within one frame must publish once');
assert.equal(sample.seq, 502, 'and it must be the newest sample');

// --- Idle and background cost nothing --------------------------------------
const activeRenders = renders;
advance(now + 5000);
assert.equal(renders, activeRenders, 'stale packets must not run an animation loop');
fire('win:blur');
packets(120);
assert.equal(renders, activeRenders, 'background preview must not render');
assert.equal(timers.size, 0, 'nothing may stay scheduled while unfocused');

// --- Coming back is immediate ----------------------------------------------
fire('win:focus');
advance(now + frameMs);
assert.equal(sample.seq, 119);
assert.equal(renders, activeRenders + 1, 'focus restores the latest sample');

callback({ seq: 999 });
assert.ok(timers.size >= 1, 'a fresh packet schedules a frame');
doc.hidden = true; fire('doc:visibilitychange');
advance(now + 100);
assert.equal(renders, activeRenders + 1, 'a hidden window draws nothing');
doc.hidden = false; fire('doc:visibilitychange');
advance(now + frameMs);
assert.equal(sample.seq, 999, 'becoming visible again publishes what was missed');

// --- Unmount leaves nothing behind -----------------------------------------
callback({ seq: 1000 });
cleanups.forEach(undo => undo());
advance(now + 100);
assert.equal(sample.seq, 999, 'unmount cancels the queued update');
assert.equal(listeners.size, 0, 'every listener is removed');
assert.equal(callback, null);
assert.equal(calibration, null);

console.log(`PASS: refresh rate measured and reported (${reported[0]} Hz); one update per frame at the display's rate; bursts collapse; idle/background/hidden cost nothing; focus, visibility and cleanup verified`);
