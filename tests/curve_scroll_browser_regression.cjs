// Bottom-setting visibility in the gyro curve editor (console v2: Gyro ▸ Fine-tune ▸ Speed ▸ Advanced); isolated renderer, no hardware output.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { prepare, openGyro, top, openFineTune, openRow } = require('./gyro_v2_helpers.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await prepare(page);
    await page.addInitScript(() => {
      const profiles = { Desktop: [
        'RESET_MAPPINGS',
        'RIGHT_TOUCHPAD_MODE = MOUSE',
        'MIN_GYRO_SENS = 1 1',
        'MAX_GYRO_SENS = 2 2',
        'MIN_GYRO_THRESHOLD = 5',
        'MAX_GYRO_THRESHOLD = 60',
        'ZL,MIN_GYRO_SENS = 0.5 0.5',
        'ZL,MAX_GYRO_SENS = 1 1',
        '',
      ].join('\n') };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', omega: 30,
          devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: true, pressure: 0.02, speed: 420 } } }] });
        emit(); const timer = setInterval(emit, 50); return () => clearInterval(timer);
      } };
    });
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await openGyro(page);
    await openFineTune(page, 'speed');
    await openRow(page, 'Advanced');
    const view = top(page).locator('[data-speed-advanced]');
    await view.waitFor();
    const curve = view.locator('.curve-plot__curve');
    assert.equal(await curve.getAttribute('data-curve'), 'LINEAR');
    const handles = () => view.evaluate(host => [...host.querySelectorAll('.curve-plot__handle')].map(h => h.getAttribute('data-handle')).join(','));
    assert.equal(await handles(), 'min,max', 'a linear curve has its slow and fast corners to drag');
    await view.getByText(/live 30 °\/s/).first().waitFor();

    for (const part of ['Speeds', 'Game & lean']) {
      await top(page).locator('[role="tab"]').filter({ hasText: new RegExp('^' + part) }).click();
      for (const viewport of [{ width: 1440, height: 650 }, { width: 1024, height: 720 }]) {
        await page.setViewportSize(viewport);
        const rows = view.locator('[data-part] [role="slider"], [data-part] [role="switch"], [data-part] > button');
        await rows.first().focus();
        for (let index = 1; index < await rows.count(); index++) await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(500);
        const lastVisible = await rows.last().evaluate(node => {
          const box = node.getBoundingClientRect(), frame = node.closest('main').getBoundingClientRect();
          return document.activeElement === node && box.top >= frame.top && box.bottom <= frame.bottom - 8;
        });
        assert.ok(lastVisible, `final ${part} setting fully visible at ${viewport.width}px`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.deepEqual(errors, []);
    console.log('PASS: curve editor bottom setting stays fully visible at short and narrow window sizes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
