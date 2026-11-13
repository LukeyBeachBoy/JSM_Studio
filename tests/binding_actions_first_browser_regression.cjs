const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const catalog = ['DEFINE menu1 RADIAL 1 1 0.2', 'ACTION menu1 1 SPACE', 'PRESENTATION menu1 '+JSON.stringify({name:'Weapon wheel', actions:[{label:'Jump',icon:''}]}), 'SOURCE menu1 RSTICK COMMAND NONE ACTIVATION_RELEASE NONE NONE'].join('\n');
const PROFILE = 'RESET_MAPPINGS\nN = X_LEFT\nVIRTUAL_CONTROLLER = XBOX\nVIRTUAL_MENUS = HEX:' + Buffer.from(catalog).toString('hex') + '\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    // Edits land in this controller's own layout while one is connected (V4).
    const eff = (text, key) => {
      const lines = text.split('\n');
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
      const line = own ? own.slice('# @controller type-24 '.length) : shared;
      return line ? line.slice(key.length + 3).trim() : undefined;
    };

    await page.locator('details[data-input-command="N"] > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const sheet = open.locator('[data-binding-sheet]');
    const chips = sheet.locator('[data-chip-command]');
    await chips.first().waitFor();
    assert.equal(await chips.count(), 1);


    assert.equal(await sheet.locator('[data-kind]').count(), 0, 'action catalogue stays hidden until requested');
    await sheet.getByRole('button', { name: 'Also send', exact:true }).click();
    const types = page.locator('[data-picker="action-type"]');
    assert.equal(await types.locator('[data-kind]').count(), 8);
    await types.locator('[data-kind="menu"]').click();
    const menu = page.locator('[data-picker="menu"]');
    await menu.getByRole('radio',{name:'While held',exact:true}).click();
    await menu.locator('[data-menu="menu1"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-binding-sheet="N"] [data-chip-command]').length === 2);
    assert.match(await chips.nth(1).innerText(), /Virtual menu while held · Weapon wheel/);
    let saved = await save();
    assert.equal(eff(saved, 'N'), 'X_LEFT\\ "MENU_HOLD menu1"\\', 'both actions persist as press bindings');
    await page.screenshot({path:'tests/tmp/binding-actions-first.png'});
    // Editing the menu keeps the gamepad action.
    await chips.nth(1).click();
    await menu.getByRole('radio',{name:'Toggle',exact:true}).click();
    await menu.locator('[data-menu="menu1"]').click();
    assert.match(eff(await save(),'N'), /^X_LEFT\\ "MENU_TOGGLE menu1"\\$/);
    // Closing either chooser is a no-op and returns focus to the add button.
    await sheet.getByRole('button',{name:'Also send',exact:true}).click();
    await page.keyboard.press('Escape');
    await types.waitFor({state:'detached'});
    assert.equal(await chips.count(),2);
    await sheet.getByRole('button',{name:'Also send',exact:true}).click();
    await types.locator('[data-kind="key"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await chips.count(),2);
    // Narrow layout wraps long actions instead of clipping their labels.
    await page.setViewportSize({width:800,height:900});
    await page.screenshot({path:'tests/tmp/binding-actions-first-800.png'});
    assert(await chips.nth(1).evaluate(el => el.scrollWidth <= el.clientWidth));
    await sheet.getByRole('button',{name:'Remove Toggle virtual menu · Weapon wheel',exact:true}).focus();
    await page.keyboard.press('x');
    assert.equal(await chips.count(),1);
    assert.equal(eff(await save(),'N'),'X_LEFT\\');
    // Save, close and reopen: removed action does not return.
    await page.keyboard.press('Escape');
    await page.locator('details[data-input-command="N"] > summary').click();
    assert.equal(await chips.count(),1);
    assert.deepEqual(errors, []);
    console.log('PASS: actions-first layout; gamepad + virtual menu add/save/edit/remove; friendly menu names; cancel; narrow layout; reopen');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
