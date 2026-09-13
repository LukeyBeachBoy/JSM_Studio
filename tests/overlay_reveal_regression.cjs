// When should a virtual menu appear?
//
// Two answers, and which one is right depends on when the regions fire. A menu
// whose regions fire on RELEASE is a confirmation, and showing it only once
// something is selected keeps the screen quiet. A menu whose regions fire the
// moment they are touched has to be up BEFORE you commit, or you are aiming at
// something you cannot see.
//
// So `# @overlay ... show touch|ring`. This checks both halves: that the option
// parses and round-trips through the profile, and that the running overlay
// actually behaves differently because of it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const SRC_ROOT = path.join(__dirname, '..', 'JSM_GUI/jsm_gui_tauri');
const URL = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/overlay.html';

// --- the real module, transpiled the way vite would -------------------------
const cache = new Map();
function loadModule(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const ts = require(path.join(SRC_ROOT, 'node_modules/typescript'));
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  cache.set(file, exports);
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = ['.ts', '.tsx', '/index.ts', ''].map(e => base + e).find(fs.existsSync);
    if (!resolved) throw new Error(`cannot resolve ${specifier} from ${file}`);
    return loadModule(resolved);
  };
  new Function('require', 'exports', 'module', js)(localRequire, exports, { exports });
  return exports;
}
const layout = loadModule(path.join(SRC_ROOT, 'src/utils/overlayLayout.ts'));

// --- part one: the option itself -------------------------------------------
function checkParsing() {
  // The defaults are the behaviour each surface already had, so adding this
  // option must not change a single existing profile.
  assert.equal(layout.defaultReveal('LEFT'), 'touch', 'a pad menu has always appeared on contact');
  assert.equal(layout.defaultReveal('RIGHT'), 'touch');
  assert.equal(layout.defaultReveal('LSTICK'), 'ring', 'a stick wheel has always waited for the ring');
  assert.equal(layout.defaultReveal('RSTICK'), 'ring');

  const parse = text => layout.parseOverlayPlacements(text);
  assert.equal(parse('# @overlay RSTICK at 0.5 0.5 show touch').RSTICK.reveal, 'touch');
  assert.equal(parse('# @overlay RSTICK at 0.5 0.5 show ring').RSTICK.reveal, 'ring');
  assert.equal(parse('# @overlay LEFT at 0.2 0.7 show ring').LEFT.reveal, 'ring');
  // Silence is the surface default...
  assert.equal(parse('# @overlay RSTICK at 0.5 0.5 size 300').RSTICK.reveal, 'ring');
  // ...and so is nonsense, rather than one of the two chosen at random.
  assert.equal(parse('# @overlay RSTICK at 0.5 0.5 show sometimes').RSTICK.reveal, 'ring');
  // It must not disturb the options that share the line.
  const both = parse('# @overlay LEFT at 0.2 0.7 size 320 show ring keys off font 20').LEFT;
  assert.equal(both.size, 320);
  assert.equal(both.showKeys, false);
  assert.equal(both.fontSize, 20);
  assert.equal(both.reveal, 'ring');

  // Writing: only a non-default is written, so a plain menu keeps a short line.
  const write = (pad, reveal) =>
    layout.setOverlayPlacement('', pad, '', { ...parse(`# @overlay ${pad} at 0.5 0.5`)[pad], reveal });
  assert.ok(write('RSTICK', 'touch').includes('show touch'), 'a non-default must be written');
  assert.ok(!write('RSTICK', 'ring').includes('show'), 'the default must not clutter the line');
  assert.ok(write('LEFT', 'ring').includes('show ring'));
  assert.ok(!write('LEFT', 'touch').includes('show'));
  // A placement from before this option existed carries no reveal at all, and a
  // hand-edited one can carry nonsense. Neither may reach the profile verbatim.
  for (const junk of [undefined, null, '', 'sometimes']) {
    const line = layout.setOverlayPlacement('', 'RSTICK', '', { ...parse('# @overlay RSTICK at 0.5 0.5').RSTICK, reveal: junk });
    assert.doesNotMatch(line, /show\s+(undefined|null|sometimes)/, `a reveal of ${JSON.stringify(junk)} must not be written verbatim`);
    assert.doesNotMatch(line, /show\s*$/, 'nor as a bare "show" with nothing after it');
    assert.equal(parse(line).RSTICK.reveal, 'ring', 'and it must read back as the default');
  }

  // And it survives the trip back out of the file it was written to.
  for (const pad of ['LEFT', 'RIGHT', 'LSTICK', 'RSTICK']) {
    for (const reveal of ['ring', 'touch']) {
      assert.equal(parse(write(pad, reveal))[pad].reveal, reveal, `${pad} ${reveal} must round-trip`);
    }
  }
  console.log('overlay reveal: the option parses, defaults to the existing behaviour, and round-trips');
}

// --- part two: the overlay actually behaves differently ---------------------
const profile = reveal => [
  'RIGHT_STICK_MODE = RADIAL_MENU',
  'RIGHT_STICK_MENU_SIZE = 4',
  'RIGHT_STICK_MENU_DEADZONE = 0.5',
  'RIGHT_STICK_DEADZONE_INNER = 0.15',
  'RM1 = 1', 'RM2 = 2', 'RM3 = 3', 'RM4 = 4',
  `# @overlay RSTICK at 0.5 0.5 size 280${reveal ? ` show ${reveal}` : ''}`,
].join('\n');

function installTauriStub(text) {
  const callbacks = {};
  let nextId = 1;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { const id = nextId++; callbacks[id] = cb; return id; },
    invoke(cmd, args) {
      if (cmd === 'plugin:event|listen') {
        window.__emit = payload => callbacks[args.handler]({ event: args.event, id: 1, payload });
        return Promise.resolve(1);
      }
      if (cmd === 'get_active_profile') return Promise.resolve({ path: 't.txt', content: text });
      if (cmd === 'overlay_workarea') return Promise.resolve({ x: 0, y: 0, width: 1920, height: 1080 });
      return Promise.resolve(null);
    },
  };
}

const packet = magnitude => ({
  buttons: 0, leftPad: null, rightPad: null, leftStick: null,
  rightStick: { x: 0, y: magnitude }, touchpadWidth: 0, touchpadHeight: 0,
});

(async () => {
  checkParsing();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    // Three tilts: resting, moved but still inside the menu dead zone, and out
    // in the ring. Only the middle one should tell the two modes apart.
    const probe = async reveal => {
      const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(installTauriStub, profile(reveal));
      await page.goto(URL);
      await page.waitForFunction(() => !!window.__emit);

      const at = async magnitude => {
        // Twice: the first packet for a menu is the one that mounts it.
        await page.evaluate(p => window.__emit(p), packet(magnitude));
        await page.waitForTimeout(40);
        await page.evaluate(p => window.__emit(p), packet(magnitude));
        await page.waitForTimeout(40);
        return {
          visible: await page.locator('[data-visible]').first().getAttribute('data-visible'),
          lit: await page.locator('[data-selected="true"]').count(),
        };
      };
      const result = {
        resting: await at(0.05),   // below the stick's own inner dead zone
        aiming: await at(0.3),     // moved, but inside the menu's 0.5 dead zone
        chosen: await at(0.9),     // out in the ring
      };
      assert.deepEqual(errors, [], 'no page errors');
      await page.close();
      return result;
    };

    const ring = await probe('ring');
    const touch = await probe('touch');
    const fallback = await probe(null);

    // A resting stick shows nothing either way. Anything else would put a menu
    // on screen while the player is not asking for one.
    assert.equal(ring.resting.visible, 'false', 'ring: a resting stick must show nothing');
    assert.equal(touch.resting.visible, 'false', 'touch: a resting stick must show nothing');

    // The point of the option.
    assert.equal(ring.aiming.visible, 'false', 'ring: still hidden inside the dead zone');
    assert.equal(touch.aiming.visible, 'true', 'touch: up while you are still aiming');
    assert.equal(touch.aiming.lit, 0, 'touch: nothing is selected yet, and nothing should look selected');

    // Out in the ring the two are identical -- the option changes when the menu
    // appears, never what it selects.
    assert.equal(ring.chosen.visible, 'true');
    assert.equal(touch.chosen.visible, 'true');
    assert.equal(ring.chosen.lit, 1);
    assert.equal(touch.chosen.lit, 1);

    // No directive at all must behave exactly as before the option existed.
    assert.deepEqual(fallback, ring, 'a profile without the option must be unchanged');

    console.log('overlay reveal: "touch" shows the wheel while aiming, "ring" waits, default unchanged');
  } finally {
    await browser.close();
  }
})();
