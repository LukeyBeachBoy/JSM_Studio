const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        desktopBridge.getSlots = async () => ({enabled:true, activeSlot:1, slots:[
          {id:1,name:'Gaming',profileName:'Cyberpunk',buttons:[]},
          {id:2,name:'Desktop',profileName:'Desktop',buttons:[]}
        ]});
      ` });
    });
    await page.addInitScript(() => {
      const profiles = { Gamepad: 'RESET_MAPPINGS\nS = X_A\n', Desktop: 'RESET_MAPPINGS\nS = ENTER\n', Cyberpunk: 'RESET_MAPPINGS\nS = X_B\n', 'Quick Access Chord': 'RESET_MAPPINGS\nS = ENTER\n' };
      window.__deviceProfile = 'profiles-library/Gamepad.txt';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Gamepad', path: 'profiles-library/Gamepad.txt', content: profiles.Gamepad }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, path: `profiles-library/${name}.txt`, content: profiles[name] }),
        readConfigFile: async path => path.endsWith('/.slots/slot-1.txt') ? profiles.Gamepad
          : path.endsWith('/.slots/slot-2.txt') ? profiles.Desktop
          : profiles[path.replace(/^profiles-library\//, '').replace(/\.txt$/, '')] ?? null,
        getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: false, firmwareSoundPromptDone: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/applied-preview.txt', devices: [{ handle: 1, type: 24, activeProfile: window.__deviceProfile, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 } } }] });
        emit(); const timer = setInterval(emit, 80); return () => clearInterval(timer);
      } };
    });
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('[data-home-continue]').click({ timeout: 15000 });
    const editor = page.locator('.profile-chip');
    await editor.filter({ hasText: 'Gamepad' }).waitFor();
    for (const name of ['Desktop', 'Quick Access Chord', 'Desktop']) {
      await page.evaluate(name => { window.__deviceProfile = `profiles-library/${name}.txt`; }, name);
      await page.getByRole('button', { name: `Live configuration: ${name}. Select to edit`, exact: true }).waitFor();
      assert.match(await editor.innerText(), /Gamepad/, 'telemetry must not replace the editor selection');
      assert.equal(await page.locator('.state-button[data-state="live"]').count(), 0, 'the old editor cannot still claim to be live');
    }
    await page.screenshot({ path: 'tools/desktop-config-20261020/live-config-browser.png' });
    await page.getByRole('button', { name: 'Live configuration: Desktop. Select to edit', exact: true }).click();
    await editor.filter({ hasText: 'Desktop' }).waitFor();
    await page.locator('.state-button[data-state="live"]').waitFor();
    assert.equal(await page.locator('.titlebar__live-profile').count(), 0, 'matching live/editor identity needs no duplicate indicator');
    for (const path of ['profiles-library/.slots/slot-1.txt', 'profiles-library/.layers/slot-1/type-25-device-abcd/19645443654666599-Driving + Weapons.txt']) {
      await page.evaluate(path => { window.__deviceProfile = path; }, path);
      const badge = page.getByRole('button', { name: 'Live configuration: Cyberpunk. Select to edit', exact: true });
      await badge.waitFor();
      assert.match(await editor.innerText(), /Desktop/);
      assert.doesNotMatch(await badge.innerText(), /slot-1|196454|Driving/);
    }
    fs.mkdirSync('tests/tmp', { recursive: true });
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: width === 900 ? 600 : 900 });
      await page.waitForTimeout(400);
      const badge = page.locator('.titlebar__live-profile');
      const bounds = await badge.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, 'live badge remains inside the title bar');
      await page.screenshot({ path: `tests/tmp/live-config-name-${width}.png` });
    }
    await page.getByRole('button', { name: 'Live configuration: Cyberpunk. Select to edit', exact: true }).click();
    await editor.filter({ hasText: 'Cyberpunk' }).waitFor();
    assert.equal(await page.locator('.state-button[data-state="live"]').count(), 0, 'a newer source cannot claim the older slot snapshot is saved and live');
    await page.evaluate(() => { window.__deviceProfile = 'profiles-library/.slots/slot-2.txt'; });
    await page.getByRole('button', { name: 'Live configuration: Desktop. Select to edit', exact: true }).click();
    await editor.filter({ hasText: 'Desktop' }).waitFor();
    await page.locator('.state-button[data-state="live"]').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: controller, slot and scoped-layer identity; Edit live; snapshot freshness; desktop/minimum viewport');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
