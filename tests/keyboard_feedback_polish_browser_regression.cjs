const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 350 } })
    await page.goto('http://127.0.0.1:1420/keyboard.html?preview=1')
    await page.locator('.vk-shell').waitFor()
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js')
      const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
      const { KeyboardView } = await import('/src/keyboard/KeyboardView.tsx')
      const { defaultPreferences, previewFrame } = await import('/src/keyboard/bridge.ts')
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.replaceChildren(host)
      const root = createRoot(host)
      window.drawKeyboard = (x, layout = 'standard') => {
        const frame = previewFrame({ ...defaultPreferences, layout })
        frame.left = 15; frame.right = 15; frame.leftTouch = [x, -0.4]; frame.rightTouch = [-0.45, -0.3]
        root.render(React.createElement(KeyboardView, { frame }))
      }
      window.drawKeyboard(-0.51)
    })
    await page.locator('.vk-grid > .vk-thumb').first().waitFor()
    const colors = await page.locator('.vk-thumb').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).borderColor))
    assert.notEqual(colors[0], colors[1], 'distinct pad colors even on the same key')
    const positions = []
    for (const x of [-0.51, -0.505, -0.5, -0.495, -0.49]) {
      await page.evaluate(x => window.drawKeyboard(x), x)
      await page.waitForFunction(x => document.querySelector('.vk-thumb').style.left === `${(x + 1) * 50}%`, x)
      positions.push((await page.locator('.vk-thumb').first().boundingBox()).x)
    }
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i - 1] > 2 && positions[i] - positions[i - 1] < 3, 'continuous movement through a key boundary')
    await page.screenshot({ path: 'tmp/keyboard-continuous-pointers.png' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('http://127.0.0.1:1420/?mock')
    const onboarding = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await onboarding.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) await onboarding.getByRole('button', { name: 'Keep them', exact: true }).click()
    // Console v2: Settings ▸ Controller, its rows built from the kit.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })))
    await page.locator('.keyboard-settings').waitFor()
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
    // Rows line up: the keyboard's rows share the left edge of the category's own rows.
    const lookRow = page.locator('.keyboard-settings [role="radiogroup"][aria-label="Look"]')
    const navigateRow = page.getByRole('switch', { name: /Navigate this app with the controller/ })
    // The page slides in; let that finish, and scroll the row into view so the hover below cannot move it.
    await page.waitForTimeout(700)
    assert.ok(Math.abs((await lookRow.boundingBox()).x - (await navigateRow.boundingBox()).x) < 1, 'keyboard rows share the page\'s inset')
    await lookRow.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
    const before = await lookRow.boundingBox(); await lookRow.hover(); const hovered = await lookRow.boundingBox()
    assert.equal(before.x, hovered.x); assert.equal(before.y, hovered.y)
    assert.equal(await page.getByText('Set from the Mapping plate in the title bar, where Bind whole controller lives too.', { exact: true }).count(), 0)
    // The light colour's picker keeps its padding, now on its own sub-page.
    await page.getByRole('button', { name: /^Light colour when a configuration/ }).click()
    const padding = await page.locator('.prefs-light-picker').evaluate(e => [getComputedStyle(e).paddingTop, getComputedStyle(e).paddingBottom])
    assert.deepEqual(padding, ['12px', '16px'])
    await page.keyboard.press('Escape')
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    await page.locator('.keyboard-settings-opening').scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    await page.screenshot({ path: 'tmp/keyboard-settings-spacing-dark.png' })
    console.log('PASS: continuous pointer movement, independent colors, stable row/hint alignment, color-picker padding and redundant section removal')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
