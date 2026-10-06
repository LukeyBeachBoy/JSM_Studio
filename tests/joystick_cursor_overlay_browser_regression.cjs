// Real overlay renderer; simulate only the native Tauri boundary.
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const catalog = 'DEFINE cursor RADIAL 25 25 .2\n' + Array.from({ length: 25 }, (_, i) => `ACTION cursor ${i + 1} ${i % 9 + 1}`).join('\n') + '\nSOURCE cursor RSTICK HOLD L ACTIVATION_RELEASE NONE NONE JOYSTICK_CURSOR'
      const reveal = new URLSearchParams(location.search).get('reveal') || 'touch'
      const presentation = '\nPRESENTATION cursor ' + JSON.stringify({ name: 'Cursor', placement: { reveal }, actions: [] })
      const profile = 'VIRTUAL_MENUS = HEX:' + [...new TextEncoder().encode(catalog + presentation)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      const callbacks = new Map(), listeners = new Map(); let next = 1
      window.__TAURI_INTERNALS__ = {
        transformCallback: callback => { const id = next++; callbacks.set(id, callback); return id },
        unregisterCallback: id => callbacks.delete(id),
        invoke: async (command, args) => {
          if (command === 'plugin:event|listen') { listeners.set(args.handler, args.event); return args.handler }
          if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return }
          if (command === 'get_active_profile') return { path: 'test.txt', content: profile }
          if (command === 'load_appearance_preferences') return {}
          if (command === 'overlay_workarea') return { x: 0, y: 0, width: 400, height: 400 }
          return null
        },
      }
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: id => listeners.delete(id) }
      window.__emitMenu = (selected, cursor, open = true, navigating = true) => {
        const payload = { buttons: 0, leftPad: null, rightPad: null, leftStick: null, rightStick: null, virtualMenus: [{ id: 'cursor', source: 3, selected, open, cursor, navigating }], touchpadWidth: 1, touchpadHeight: 1 }
        for (const [id, event] of listeners) if (event === 'overlay-telemetry') callbacks.get(id)({ event, id, payload })
      }
    })
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1421') + '/overlay.html')
    await page.waitForTimeout(250)
    await page.evaluate(() => window.__emitMenu(0, { x: .5, y: .1 }))
    const dot = page.locator('[class*="_dot_"]')
    await dot.waitFor({ state: 'attached' })
    await page.evaluate(() => window.__emitMenu(0, { x: .5, y: .1 }))
    await page.waitForFunction(() => document.querySelector('[class*="_dot_"]')?.style.transform.includes('50cqw, 10cqh'))
    assert.equal(await dot.isVisible(), true)
    assert.equal(await page.locator('[data-selected="true"]').count(), 1)
    assert.equal(await dot.evaluate(node => getComputedStyle(node).width), '14px')
    await page.evaluate(() => window.__emitMenu(-1, { x: .5, y: .5 }))
    assert.match(await dot.getAttribute('style'), /50cqw, 50cqh/)
    assert.equal(await page.locator('[data-selected="true"]').count(), 0)
    assert.equal(await dot.isVisible(), true)
    await page.waitForTimeout(120) // Let the existing trackpad trail settle.
    await page.screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/joystick-cursor-overlay-centre.png') })
    await page.evaluate(() => window.__emitMenu(0, undefined))
    assert.equal(await dot.isVisible(), false)
    assert.equal(await page.locator('[data-trail]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')), true)
    await page.evaluate(() => window.__emitMenu(-1, undefined, false))
    assert.equal(await page.locator('[data-visible="true"]').count(), 0)
    for (const reveal of ['touch', 'navigate', 'ring', 'never']) {
      await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1421') + '/overlay.html?reveal=' + reveal)
      await page.waitForTimeout(250)
      for (const open of [false, true]) for (const navigating of [false, true]) for (const selected of [-1, 0]) {
        const expected = open && reveal !== 'never' && (reveal === 'touch' || navigating && (reveal === 'navigate' || selected >= 0))
        await page.evaluate(args => window.__emitMenu(args.selected, undefined, args.open, args.navigating), { selected, open, navigating })
        await page.waitForTimeout(30)
        await page.evaluate(args => window.__emitMenu(args.selected, undefined, args.open, args.navigating), { selected, open, navigating })
        assert.equal(await page.locator('[data-visible="true"]').count() > 0, expected, JSON.stringify({ reveal, open, navigating, selected }))
      }
    }
    console.log('PASS: real overlay activation/navigation/highlight visibility matrix and Never')
    assert.deepEqual(errors, [])
    console.log('PASS: gameplay overlay joystick cursor, shared trackpad dot, native selection, neutral preview, direct mode and closed-menu hiding')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
