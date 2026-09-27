// A configuration that extends a template: everything inherited shows as
// inherited, overrides are the only lines saved, and a value set back BY HAND
// to what the template says stops being an override.
//
// Setting a value back used to leave `KEY = <template value>` in the profile,
// still marked "Override", so the profile quietly stopped following the
// template for that value (a later template edit never reached it). Now the
// line is dropped -- the same result as "Use inherited", reached by setting the
// value -- for settings, multi-value settings, bindings, modeshifts, labels and
// the virtual controller alike. The change still counts against the saved
// file until it is saved; after saving, the line is gone.
//
// Also covered, found on the way:
//  - editing one axis of an inherited MIN_GYRO_SENS pair wrote the other as 0
//    (`MIN_GYRO_SENS = 3 0` under a template's `2 1.5`);
//  - a template's `# @label` did not reach the binding editor's name field;
//  - a sensitivity draft typed and set back still read as an unsaved change.
//
// Part 1 is pure (utils/inheritedOverrides). Part 2 drives the renderer with
// imports resolved through readConfigFile; mocks never touch a controller.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const APP = path.join(__dirname, '..', 'JSM_GUI', 'jsm_gui_tauri');
const ts = require(path.join(APP, 'node_modules', 'typescript'));
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

// ---------------------------------------------------------------------------
// Part 1: which lines an edit makes redundant
// ---------------------------------------------------------------------------
const { dropRedundantOverrides, sameValue } = load(path.join(APP, 'src/utils/inheritedOverrides.ts'));
const { resolveIncludes, INCLUDE_ROOT } = load(path.join(APP, 'src/utils/configIncludes.ts'));

const BASE = [
  'MIN_GYRO_SENS = 2.0 1.50',
  'GYRO_OFF = RS',
  'W = LCONTROL',
  '# @label W = Crouch',
  'N = R E',
  'RSR,W = X',
  'LEFT_STICK_DEADZONE_INNER = 0.12',
  'ZL = "say #1" RMOUSE',
].join('\n');
const resolverFor = files => text => resolveIncludes(INCLUDE_ROOT, { ...files, [INCLUDE_ROOT]: text }).effectiveText;
const resolve = resolverFor({ 'profiles-library/Base.txt': BASE });
const HEAD = 'RESET_MAPPINGS\nprofiles-library/Base.txt';
// One edit: the profile's own text before, and after the control wrote to it.
const edit = (before, after, using = resolve) => dropRedundantOverrides(`${HEAD}\n${before}`, `${HEAD}\n${after}`, using).slice(HEAD.length + 1);

assert.ok(sameValue('2 1.5', '2.0 1.50') && sameValue('75', '75.0') && sameValue('r  e', 'R E'));
assert.ok(!sameValue('R E', 'E R'), 'order is meaning: tap R, hold E is not tap E, hold R');
assert.ok(!sameValue('"SAY #1"', '"say #1"'), 'quoted text is compared exactly');

assert.equal(edit('', 'MIN_GYRO_SENS = 2 1.5'), '', 'numbers compare by value: 2 1.5 is the template\'s 2.0 1.50');
assert.equal(edit('MIN_GYRO_SENS = 3 1.5', 'MIN_GYRO_SENS = 2 1.5'), '', 'set back by hand drops the override');
assert.equal(edit('', 'MIN_GYRO_SENS = 2 1.6'), 'MIN_GYRO_SENS = 2 1.6', 'a different value stays');
assert.equal(edit('', 'n  =  r   e'), '', 'whitespace and case are layout, not value');
assert.equal(edit('', 'N = E R'), 'N = E R', 'a reordered binding is a different binding');
assert.equal(edit('N = T', 'RSR , W = X\nN = T'), 'N = T', 'modeshift keys normalise like the resolver\'s');
assert.equal(edit('', 'ZL = "say #1" RMOUSE'), '');
assert.equal(edit('', 'ZL = "SAY #1" RMOUSE'), 'ZL = "SAY #1" RMOUSE');
// Only what the edit touched: an equal line already in the file is left alone.
assert.equal(edit('W = LCONTROL', 'W = LCONTROL\nN = T'), 'W = LCONTROL\nN = T', 'a pre-existing override is not the edit\'s business');
// Notes and names travel with the line.
assert.equal(edit('W = Z', 'W = LCONTROL # hold to crouch'), 'W = LCONTROL # hold to crouch', 'a trailing note of its own keeps the line');
assert.equal(edit('# @label W = Prone\nW = Z', '# @label W = Prone\nW = LCONTROL'), '# @label W = Prone\nW = LCONTROL', 'a differing label keeps the binding it names');
assert.equal(edit('# @label W = Crouch\nW = Z', '# @label W = Crouch\nW = LCONTROL'), '# @label W = Crouch', 'the same label as the template does not');
assert.equal(edit('# @label W = Prone', '# @label W = Crouch'), '', 'a label set back to the template\'s is dropped too');
assert.equal(edit('', '# @label RSR,W ='), '# @label RSR,W =', 'an explicit "no name" is not inherited from anything');
// One setting under two names: activation is GYRO_ON or GYRO_OFF.
assert.equal(edit('GYRO_ON = RS', 'GYRO_OFF = RS'), '', 'back to the template\'s activation');
assert.equal(edit('GYRO_ON = X', 'GYRO_OFF = RS\nGYRO_ON = X'), 'GYRO_OFF = RS\nGYRO_ON = X', 'not while a later GYRO_ON decides it');
assert.equal(edit('', 'LEFT_STICK_DEADZONE_INNER = 0.12'), '');
const later = resolverFor({ 'profiles-library/Base.txt': `${BASE}\nSTICK_DEADZONE_INNER = 0.2` });
assert.equal(edit('', 'LEFT_STICK_DEADZONE_INNER = 0.12', later), 'LEFT_STICK_DEADZONE_INNER = 0.12', 'the template\'s later both-sides line is what it inherits');
// A reset after the import means nothing is inherited.
assert.equal(dropRedundantOverrides(`${HEAD}\nRESET_MAPPINGS`, `${HEAD}\nRESET_MAPPINGS\nW = LCONTROL`, resolve), `${HEAD}\nRESET_MAPPINGS\nW = LCONTROL`);
// Nothing imported, nothing inherited.
assert.equal(dropRedundantOverrides('RESET_MAPPINGS', 'RESET_MAPPINGS\nW = LCONTROL', resolverFor({})), 'RESET_MAPPINGS\nW = LCONTROL');
console.log('PASS (1/2): redundant overrides are recognised by value, respecting notes, names, aliases and resets');

// ---------------------------------------------------------------------------
// Part 2: the whole round trip in the app
// ---------------------------------------------------------------------------
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const TEMPLATE = [
  '# Shared FPS baseline',
  'MIN_GYRO_SENS = 2.0 1.50',
  'MAX_GYRO_SENS = 4 3',
  'MIN_GYRO_THRESHOLD = 5',
  'MAX_GYRO_THRESHOLD = 75.0',
  'GYRO_SMOOTH_THRESHOLD = 3',
  'GYRO_SMOOTH_TIME = 0.125',
  'GYRO_CUTOFF_SPEED = 1',
  'GYRO_SPACE = PLAYER_TURN',
  'GYRO_OFF = RS',
  'LEFT_STICK_MODE = NO_MOUSE',
  'RIGHT_STICK_MODE = FLICK',
  'LEFT_STICK_DEADZONE_INNER = 0.12',
  'RIGHT_STICK_DEADZONE_OUTER = 0.08',
  'ZL_MODE = NO_SKIP',
  'ZR_MODE = MUST_SKIP',
  'TRIGGER_THRESHOLD = 0.3',
  'LEFT_TOUCHPAD_MODE = MOUSE',
  'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'RIGHT_GRID_SIZE = 2 2',
  'RT1 = 1',
  'RT2 = 2',
  'S = SPACE',
  'E = R',
  'N = F',
  'W = LCONTROL',
  '# @label W = Crouch',
  'L = Q',
  'R = G',
  'ZL = RMOUSE',
  'ZR = LMOUSE',
  'LSL = TAB',
  'RSR = V',
  'RSR,W = X',
  'VIRTUAL_CONTROLLER = XBOX',
].join('\n') + '\n';
// Sets nothing of its own except one override equal to the template's, which
// was in the file before this session and must be left alone until edited.
const CHILD = ['RESET_MAPPINGS', 'profiles-library/FPS Template.txt', 'E = R', ''].join('\n');

// What saving adds to any profile, and is not an override.
const HEADER = new Set(['RESET_MAPPINGS', 'TELEMETRY_ENABLED = ON', 'TELEMETRY_PORT = 8974', 'AUTOCONNECT = ON', 'profiles-library/FPS Template.txt']);
const ownLines = text => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !HEADER.has(l) && (!l.startsWith('#') || l.startsWith('# @label'))).sort();

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(([child, template]) => {
      const profiles = { Child: child, 'FPS Template': template };
      window.__saved = [];
      window.__reads = [];
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Child', path: 'profiles-library/Child.txt', content: profiles.Child }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__saved.push({ name, content }); profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
        readConfigFile: async path => {
          window.__reads.push(path);
          const name = String(path).replace(/^profiles-library\//, '').replace(/\.txt$/, '');
          return Object.prototype.hasOwnProperty.call(profiles, name) ? profiles[name] : null;
        },
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Child.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, [CHILD, TEMPLATE]);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').filter({ hasText: 'Child' }).waitFor();
    await page.waitForFunction(() => (window.__reads || []).includes('profiles-library/FPS Template.txt'));

    // --- helpers -------------------------------------------------------------
    const nav = async name => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(400) };
    const state = () => page.locator('.state-button').first().innerText();
    // The origin marker nearest a control: "inherited:FPS Template", "override", or "none".
    const originNear = selector => page.evaluate(selector => {
      let el = document.querySelector(selector), marker = null;
      for (let i = 0; i < 5 && el && !marker; i++) { el = el.parentElement; marker = el?.querySelector('.origin-marker') }
      if (!marker) return 'none';
      const kind = marker.getAttribute('data-origin');
      return kind === 'inherited' ? `inherited:${marker.querySelector('small').textContent.replace('Inherited · ', '')}` : kind;
    }, selector);
    const field = label => `.main-pane input[aria-label="${label}"]`;
    const combo = label => `.main-pane [role=combobox][aria-label="${label}"]`;
    const group = label => `.main-pane [role=group][aria-label="${label}"]`;
    // A shift ("RSR,W") is a row in its input's Modeshifts lane now (3c).
    const card = command => command.includes(',')
      ? page.locator(`details[data-input-command="${command.split(',')[1]}"] [data-modeshift-row="${command.split(',')[0]}"]`).first()
      : page.locator(`details[data-input-command="${command}"]`).first();
    const cardOrigin = command => page.evaluate(command => {
      const [held, key] = command.includes(',') ? command.split(',') : [null, command];
      const marker = document.querySelector(held ? `.main-pane details[data-input-command="${key}"] [data-modeshift-row="${held}"] .origin-marker` : `.main-pane details[data-input-command="${command}"] .origin-marker`);
      return marker ? marker.getAttribute('data-origin') : 'none';
    }, command);
    const setNumber = async (label, value) => {
      const input = page.locator(field(label)).first();
      await input.scrollIntoViewIfNeeded();
      await input.fill(String(value)); await input.press('Enter');
      await page.waitForTimeout(200);
    };
    const pick = async (label, option) => {
      await page.locator(combo(label)).first().click();
      await page.getByRole('option', { name: option, exact: true }).first().click();
      await page.waitForTimeout(200);
    };
    const segment = async (label, option) => {
      await page.locator(group(label)).getByRole('button', { name: option, exact: true }).click();
      await page.waitForTimeout(200);
    };
    const open = async details => { if (!(await details.evaluate(e => e.tagName !== 'DETAILS' || e.open))) { await details.locator(':scope > summary').click(); await page.waitForTimeout(250) } };
    // The binding editor's action picker: `last` is the main block's key where
    // a name appears twice (Ctrl is left and right; the left one is first).
    const bindKey = async (details, key, which = 'last') => {
      await details.getByRole('button', { name: /^Choose action/ }).first().click();
      await page.locator('.action-picker button').filter({ hasText: new RegExp(`^${key}$`) })[which]().click();
      await page.waitForTimeout(300);
    };
    const gridColumns = async direction => {
      await nav('Trackpads');
      await page.locator('#trackpad-right button.summary-row[data-input-command="RIGHT_PAD"]').click();
      const columns = page.locator('.sheet button.summary-row').filter({ has: page.locator('.summary-row__label').getByText('Columns', { exact: true }) }).first();
      await columns.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-adjusting') === 'true');
      await page.keyboard.press(direction); await page.keyboard.press('Enter');
      const result = [await columns.locator('.summary-row__value').innerText(), await columns.locator('.summary-row__hint').innerText()];
      await page.keyboard.press('Escape');
      await page.locator('.sheet').waitFor({ state: 'detached' });
      return result;
    };
    const output = async label => {
      await page.locator('.mapping-plate').first().click();
      await page.getByRole('menuitem', { name: new RegExp(label) }).first().click();
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
    };
    // The input's name is set in its first command's settings sheet (3c).
    const openLabel = async () => {
      await card('W').locator('[data-command-row]').first().getByRole('button', { name: 'Command settings' }).click();
      return page.getByRole('dialog').last().locator('input[aria-label="Action name"]');
    };
    const closeLabel = async () => { const sheet = page.getByRole('dialog').last(); await sheet.locator('[data-modal-close]').click(); await sheet.waitFor({ state: 'detached' }) };
    const labelField = () => ({ inputValue: async () => { const f = await openLabel(); const value = await f.inputValue(); await closeLabel(); return value } });
    const setLabel = async text => { const f = await openLabel(); await f.fill(text); await f.press('Enter'); await page.waitForTimeout(200); await closeLabel() };
    const save = async () => {
      const count = await page.evaluate(() => window.__saved.length);
      await page.keyboard.press('Control+s');
      await page.waitForFunction(count => window.__saved.length > count, count);
      await page.waitForTimeout(200);
      return page.evaluate(() => window.__saved.at(-1).content);
    };

    // --- 1. everything the template sets is shown, and shown as inherited -----
    assert.equal(await state(), '✓ Applied', 'opening must not rewrite the file');
    await nav('Gyro');
    for (const [label, value] of [['Minimum sensitivity (X)', '2'], ['Minimum sensitivity (Y)', '1.5'], ['Maximum sensitivity (X)', '4'], ['Maximum sensitivity (Y)', '3'], ['Minimum threshold', '5'], ['Maximum threshold', '75']]) {
      assert.equal(await page.locator(field(label)).first().inputValue(), value, `${label} shows the template's value`);
      assert.equal(await originNear(field(label)), 'inherited:FPS Template', `${label} is marked as inherited`);
    }
    assert.equal(await originNear(group('Activation')), 'inherited:FPS Template');
    assert.match(await page.locator(combo('Activation input')).innerText(), /RS/);
    await page.locator('.main-pane button.summary-row').filter({ has: page.locator('.summary-row__label').getByText('Dampening', { exact: true }) }).click();
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.sheet .origin-marker')].map(m => `${m.getAttribute('data-setting-origin')}:${m.getAttribute('data-origin')}`).sort()),
      ['GYRO_CUTOFF_SPEED:inherited', 'GYRO_SMOOTH_THRESHOLD:inherited', 'GYRO_SMOOTH_TIME:inherited']);
    await page.keyboard.press('Escape');
    await page.locator('.sheet').waitFor({ state: 'detached' });

    await nav('Joysticks');
    assert.equal(await page.locator(combo('Right stick mode')).innerText(), 'Flick Stick');
    assert.equal(await originNear(combo('Right stick mode')), 'inherited:FPS Template');
    assert.equal(await originNear(combo('Left stick mode')), 'inherited:FPS Template');
    const deadzone = page.locator('.main-pane button.summary-row').filter({ has: page.locator('.summary-row__label').getByText('Deadzone', { exact: true }) });
    assert.equal(await deadzone.first().locator('.summary-row__value').innerText(), '0.12');
    assert.equal(await deadzone.first().locator('.summary-row__hint').innerText(), 'From FPS Template');

    await nav('Triggers');
    assert.equal(await page.locator(combo('Left trigger behavior')).innerText(), 'No skip');
    assert.equal(await originNear(combo('Left trigger behavior')), 'inherited:FPS Template');
    assert.equal(await page.locator(combo('Right trigger behavior')).innerText(), 'Must skip');

    await nav('Trackpads');
    for (const pad of ['LEFT_PAD', 'RIGHT_PAD']) {
      assert.equal(await page.locator(`button.summary-row[data-input-command="${pad}"] .summary-row__hint`).innerText(), 'From FPS Template', `${pad} mode is inherited`);
    }

    await nav('Buttons');
    for (const command of ['N', 'S', 'W', 'L', 'R', 'LSL', 'RSR']) assert.equal(await cardOrigin(command), 'inherited', `${command} is inherited`);
    assert.equal(await cardOrigin('E'), 'override', 'E = R is in the file: an override, even though it matches');
    await open(card('W'));
    assert.equal(await labelField().inputValue(), 'Crouch', 'the template\'s label names the inherited binding in its editor');
    assert.equal(await cardOrigin('RSR,W'), 'inherited', 'the template\'s modeshift is inherited');

    // --- 2. overrides: each kind, through its own control ----------------------
    await nav('Gyro');
    await setNumber('Minimum sensitivity (X)', 3);
    assert.equal(await page.locator(field('Minimum sensitivity (Y)')).first().inputValue(), '1.5', 'editing X must keep the inherited Y, not zero it');
    await setNumber('Maximum threshold', 60);
    await segment('Activation', 'Hold to enable');
    for (const selector of [field('Minimum sensitivity (X)'), field('Maximum threshold'), group('Activation')]) assert.equal(await originNear(selector), 'override', selector);
    await nav('Joysticks');
    await pick('Right stick mode', 'Mouse Aim');
    assert.equal(await originNear(combo('Right stick mode')), 'override');
    await nav('Triggers');
    await pick('Left trigger behavior', 'Must skip');
    assert.deepEqual(await gridColumns('ArrowRight'), ['3', 'Overrides FPS Template']);
    await output('Virtual DualShock 4');
    await nav('Buttons');
    await open(card('S'));
    await bindKey(card('S'), 'T');
    assert.equal(await cardOrigin('S'), 'override');
    await open(card('W')); await open(card('RSR,W'));
    await bindKey(card('RSR,W'), 'Y');
    assert.equal(await cardOrigin('RSR,W'), 'override');
    await setLabel('Prone');
    assert.equal(await state(), 'Apply 10 changes');

    const overridden = await save();
    assert.deepEqual(ownLines(overridden), [
      '# @label W = Prone', 'E = R', 'GYRO_ON = RS', 'MAX_GYRO_THRESHOLD = 60', 'MIN_GYRO_SENS = 3 1.5', 'RIGHT_GRID_SIZE = 3 2',
      'RIGHT_STICK_MODE = AIM', 'RSR,W = Y', 'S = T', 'VIRTUAL_CONTROLLER = DS4', 'ZL_MODE = MUST_SKIP',
    ], `exactly the overrides are saved, nothing inherited is copied in:\n${overridden}`);
    assert.match(overridden, /^profiles-library\/FPS Template\.txt$/m, 'the import line stays');

    // --- 3. set each one back BY HAND, no reset control ------------------------
    await nav('Gyro');
    await setNumber('Minimum sensitivity (X)', 2);
    await setNumber('Maximum threshold', 75);   // the template says 75.0
    await segment('Activation', 'Hold to disable');
    for (const selector of [field('Minimum sensitivity (X)'), field('Minimum sensitivity (Y)'), field('Maximum threshold'), group('Activation')]) {
      assert.equal(await originNear(selector), 'inherited:FPS Template', `${selector} follows the template again`);
    }
    await nav('Joysticks');
    await pick('Right stick mode', 'Flick Stick');
    assert.equal(await originNear(combo('Right stick mode')), 'inherited:FPS Template');
    await nav('Triggers');
    await pick('Left trigger behavior', 'No skip');
    assert.equal(await originNear(combo('Left trigger behavior')), 'inherited:FPS Template');
    assert.deepEqual(await gridColumns('ArrowLeft'), ['2', 'From FPS Template']);
    await output('Virtual Xbox');
    await nav('Buttons');
    await open(card('S'));
    await bindKey(card('S'), 'Space');
    assert.equal(await cardOrigin('S'), 'inherited');
    await open(card('W')); await open(card('RSR,W'));
    await bindKey(card('RSR,W'), 'X');
    assert.equal(await cardOrigin('RSR,W'), 'inherited');
    await setLabel('Crouch');
    assert.equal(await labelField().inputValue(), 'Crouch');
    // Unsaved relative to the file, which still has every one of those lines.
    assert.equal(await state(), 'Apply 10 changes', 'dropping the lines is a change to the saved file');

    const restored = await save();
    assert.deepEqual(ownLines(restored), ['E = R'], `setting values back removes their lines; the pre-existing E = R is left alone:\n${restored}`);
    assert.equal(await cardOrigin('E'), 'override');

    // --- 4. the pre-existing equal override goes once it is edited -------------
    await open(card('E'));
    await bindKey(card('E'), 'T');
    await bindKey(card('E'), 'R');
    assert.equal(await cardOrigin('E'), 'inherited');
    assert.equal(await state(), 'Apply 1 change');
    assert.deepEqual(ownLines(await save()), []);

    // --- 5. set back without saving in between: nothing to save ----------------
    await nav('Gyro');
    await setNumber('Minimum sensitivity (Y)', 2.5);
    assert.equal(await state(), 'Apply 1 change');
    await setNumber('Minimum sensitivity (Y)', 1.5);
    assert.equal(await state(), 'Apply Child', 'back to the saved text: no unsaved change, draft or not');
    assert.equal(await originNear(field('Minimum sensitivity (Y)')), 'inherited:FPS Template');

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS (2/2): a template\'s values are inherited everywhere, overrides save as themselves, and setting one back by hand makes it inherited again');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
