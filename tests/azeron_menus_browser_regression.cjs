const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { MenusPage } = await import('/src/components/menus/MenusPage.tsx')
      const { createVirtualMenu, writeVirtualMenus, readVirtualMenus } = await import('/src/utils/virtualMenus.ts')
      const menu = createVirtualMenu('weapons', 'Weapon wheel')
      menu.attachments = [{ source: 'RIGHT', activation: 'COMMAND', input: 'NONE', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE' }]
      const host = document.createElement('div'); host.id = 'menu-test'
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#171717;overflow:auto'
      document.body.append(host)
      const root = createRoot(host)
      let text = writeVirtualMenus('JOY1 = SPACE\n', [menu])
      const draw = () => root.render(React.createElement(MenusPage, {
        text, setText: next => { text = typeof next === 'function' ? next(text) : next; draw() },
        configName: 'Test', deviceType: 25,
      }))
      window.menuCatalog = () => readVirtualMenus(text).menus
      window.menuText = () => text
      window.clearMenus = () => { text = writeVirtualMenus(text, []); draw() }
      draw()
    })
    const host = page.locator('#menu-test')
    await host.getByRole('button', { name: 'Use thumbstick', exact: true }).click()
    assert.equal(await page.evaluate(() => window.menuCatalog()[0].attachments[0].source), 'LSTICK')
    assert.match(await host.innerText(), /Tilt the thumbstick to pick/)
    assert.match(await page.evaluate(() => window.menuText()), /JOY1 = SPACE/)
    await host.getByRole('button', { name: /Opened by/ }).click()
    const navigate = page.getByRole('listbox', { name: 'Navigate with' })
    await navigate.waitFor()
    assert.match(await navigate.innerText(), /Thumbstick/)
    assert.doesNotMatch(await navigate.innerText(), /pad|Right stick/i)
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.clearMenus())
    await host.getByRole('radio', { name: /Quick wheel/ }).click()
    assert.equal(await page.evaluate(() => window.menuCatalog()[0].attachments[0].source), 'LSTICK')
    assert.deepEqual(errors, [])
    console.log('PASS: Azeron menu repair, thumbstick instructions, input choices, new menu defaults and binding preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
