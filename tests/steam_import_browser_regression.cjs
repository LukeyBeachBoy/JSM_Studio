// Import from Steam, driven through the real dialog: list -> review -> import.
//
// Covers what only the UI path does: the review names what will not carry
// over before anything is written, and the import picks final names from the
// library -- here "Wardogs Steam" already exists, so the main configuration
// becomes "Wardogs Steam 2" and the action set's binding back to it must be
// rewritten to that name, or switching sets would load the wrong file.
//
// Isolated renderer checks; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/steam', name), 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ v3, v2 }) => {
      const profiles = { Desktop: 'RESET_MAPPINGS\nN = SPACE\n', 'Wardogs Steam': 'RESET_MAPPINGS\nS = ENTER\n' };
      window.__profiles = profiles;
      const layouts = [
        { path: 'C:\\Steam\\steamapps\\common\\Steam Controller Configs\\1\\config\\1203220\\controller_triton.vdf', title: 'Wardogs Steam', game: 'Wardogs', appId: '1203220', controllerType: 'controller_triton', source: 'personal', modifiedMs: Date.parse('2026-09-28'), text: v3 },
        { path: 'C:\\Steam\\controller_base\\templates\\gamepad_fps.vdf', title: 'Gamepad With Camera Controls', game: 'Steam template', appId: null, controllerType: 'controller_neptune', source: 'template', modifiedMs: 0, text: v2 },
      ];
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { profiles[name] = content; return { name } },
        createLibraryProfile: async (preferred = 'New configuration') => {
          let name = preferred
          for (let n = 2; name in profiles; n++) name = `${preferred} ${n}`
          profiles[name] = 'RESET_MAPPINGS\n'
          return { name, path: `profiles-library/${name}.txt`, content: profiles[name] }
        },
        deleteLibraryProfile: async name => { delete profiles[name]; return { success: true } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
        listSteamLayouts: async () => layouts.map(({ text, ...layout }) => layout),
        readSteamLayout: async path => layouts.find(layout => layout.path === path).text,
      };
      window.telemetry = { onSample: cb => { cb({ console: '', activeProfile: 'profiles-library/Desktop.txt', devices: [] }); return () => {} } };
    }, { v3: fixture('wardogs_v3.vdf'), v2: fixture('gamepad_v2.vdf') });
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    page.setDefaultTimeout(10000);
    const artifacts = path.resolve(__dirname, '../tmp/steam-import'); fs.mkdirSync(artifacts, { recursive: true });
    const shot = name => page.screenshot({ path: path.join(artifacts, name + '.png') });

    await page.getByRole('button', { name: /^Configurations/ }).first().click();
    await page.getByRole('button', { name: 'Import from Steam' }).click();

    // The list: the person's own layouts, then Valve's templates.
    const dialog = page.getByRole('dialog', { name: 'Choose a Steam layout' });
    await dialog.waitFor();
    await dialog.getByText('Your layouts · 1').waitFor();
    await dialog.getByText('Steam templates · 1').waitFor();
    const first = dialog.getByRole('button', { name: /Wardogs Steam/ });
    assert.match(await first.innerText(), /Wardogs · Steam Controller/);
    assert.ok(await first.evaluate(el => el === document.activeElement), 'the first layout has focus, for a controller');
    await shot('list');

    // Review, before anything exists.
    await first.click();
    const review = page.getByRole('dialog', { name: 'Wardogs Steam' });
    await review.waitFor();
    const status = await review.getByRole('status').innerText();
    assert.match(status, /2 approximated/);
    assert.match(status, /2 not converted/);
    await review.getByText('Not converted · 2').waitFor();
    await review.getByText(/"Ping" is a Steam Input API game action/).waitFor();
    assert.match(await review.innerText(), /Wardogs Steam - Menus\.txt/);
    assert.ok(await review.getByRole('button', { name: 'Import 2 configurations' }).evaluate(el => el === document.activeElement), 'Import has focus once the review is up');
    assert.equal(await page.evaluate(() => Object.keys(window.__profiles).length), 2, 'reviewing writes nothing');
    await shot('review');

    // Back returns to the list without losing it; then import for real.
    await review.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('dialog', { name: 'Choose a Steam layout' }).getByRole('button', { name: /Wardogs Steam/ }).click();
    await page.getByRole('button', { name: 'Import 2 configurations' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => 'Wardogs Steam 2' in window.__profiles);

    const profiles = await page.evaluate(() => window.__profiles);
    assert.equal(profiles['Wardogs Steam'], 'RESET_MAPPINGS\nS = ENTER\n', 'an existing configuration is never overwritten');
    const main = profiles['Wardogs Steam 2'];
    const menus = profiles['Wardogs Steam - Menus'];
    assert.ok(main && menus, `both sets were created: ${Object.keys(profiles)}`);
    assert.match(main, /^LSR = "profiles-library\/Wardogs Steam - Menus\.txt"$/m);
    assert.match(menus, /^LSR = "profiles-library\/Wardogs Steam 2\.txt"$/m, 'the set switches back to the renamed configuration');
    assert.match(main, /^TELEMETRY_ENABLED = ON$/m, 'saved through the normal header, so Studio can watch it run');
    assert.match(main, /# @layer \{"id":"vehicle"/);
    assert.match(main, /# - Not converted: R5:/);
    await shot('imported');

    assert.deepEqual(errors, []);
    console.log('PASS: Import from Steam lists, reviews and imports a layout, renaming its set references to the names the library chose');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
