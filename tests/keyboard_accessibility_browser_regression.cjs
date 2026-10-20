const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 350 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const events = new EventTarget();
      window.chrome = { webview: {
        addEventListener: (...args) => events.addEventListener(...args),
        removeEventListener: (...args) => events.removeEventListener(...args),
      } };
      window.deliverKeyboardFrame = data => events.dispatchEvent(new MessageEvent('message', { data }));
    });
    await page.goto('http://127.0.0.1:1420/keyboard.html?accessibility');
    await page.waitForFunction(() => document.body.classList.contains('vk-document'));
    assert.equal(await page.locator('.vk-shell').count(), 0, 'no fabricated keyboard before a live frame');
    const frame = {
      open: true, ready: true, layout: 'standard', controllerType: 0,
      preferences: { appearance: 'theme', shortcuts: { standard: { move: 'R3', scale: 'R', reset: 'L+R', symbols: 'L' } } },
      stick: [0, 0], rows: [['a', 'b', 'c']], petals: [], left: 0, right: null,
      selected: 0, leftTouch: [-0.5, 0], rightTouch: null,
    };
    await page.evaluate(frame => window.deliverKeyboardFrame({ frame, theme: 'light', accent: 'violet' }), frame);
    await page.locator('.vk-shell').waitFor();
    assert.equal(await page.locator('.vk-key[data-left]').getAttribute('aria-label'), 'a');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('html').getAttribute('data-accent'), 'violet');
    frame.left = 2;
    await page.evaluate(frame => window.deliverKeyboardFrame({ frame, theme: 'dark', accent: 'cyan' }), frame);
    await page.waitForFunction(() => document.querySelector('.vk-key[data-left]')?.getAttribute('aria-label') === 'c');
    assert.equal(await page.locator('.vk-shell').count(), 1, 'live updates reuse a single keyboard');
    frame.open = false;
    await page.evaluate(frame => window.deliverKeyboardFrame({ frame }), frame);
    await page.locator('.vk-shell').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('PASS: accessibility renderer receives live frames, updates selection and theme, and closes without Tauri IPC');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
