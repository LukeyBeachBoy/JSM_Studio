// Isolated renderer with simulated native stick telemetry. No physical output.
// Menus (console v2, MenuEditor): the menu at full size is one focused control.
// Pointing a stick picks a slice at any angle, ◂ ▸ walk every slice of every
// shape and wrap, letting the stick go back picks a wheel's centre action, A
// opens the slice's binding sheet and B hands focus back to the preview; the
// page fits from wide to narrow windows.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
      await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    })
    await page.addInitScript(() => {
      document.hasFocus = () => true
      for (const [key, value] of Object.entries({ width: 2560, availWidth: 2560, height: 1440, availHeight: 1440 })) Object.defineProperty(window.screen, key, { value, configurable: true })
      let content = 'RESET_MAPPINGS\nLEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_MODE = MOUSE\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Menu test', path: 'profiles-library/Menu test.txt', content }),
        listLibraryProfiles: async () => ['Menu test'], loadLibraryProfile: async () => ({ name: 'Menu test', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.__menuStick = { x: 0, y: 0 }
      window.__menuLeftStick = { x: 0, y: 0 }
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ activeProfile: 'AppNavigation.txt', devices: [{ handle: 1, type: 24, status: { buttons: 0, leftStick: window.__menuLeftStick, rightStick: window.__menuStick, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('.app-shell').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1000)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'virtualMenus' })))
    const editor = page.locator('[data-virtual-menus-page]')
    await page.locator('[data-virtual-menus-page][data-empty]').waitFor()
    await editor.getByRole('radio', { name: /Weapon wheel/ }).click()
    await editor.getByRole('heading', { name: 'Weapon wheel', exact: true }).waitFor()
    assert.equal(await page.locator('[data-subpage]').count(), 0, 'the menu editor is the page itself')
    const preview = editor.locator('[data-menu-preview]')
    const slot = () => preview.getAttribute('aria-label')

    for (const shape of ['Wheel', 'Grid', 'Hotbar']) {
      await editor.getByRole('radio', { name: new RegExp(`^${shape}`) }).click()
      await preview.focus()
      const count = 8
      if (shape === 'Wheel') {
        // Continuous angles, diagonals included, pick directly, with either stick.
        for (const stick of ['__menuLeftStick', '__menuStick']) {
          for (let index = 0; index < count; index++) {
            await page.evaluate(({ stick, index, count }) => { const angle = index * 2 * Math.PI / count; window[stick] = { x: Math.sin(angle), y: Math.cos(angle) } }, { stick, index, count })
            await page.waitForTimeout(220)
            assert.match(await slot(), new RegExp(`slice ${index + 1} of ${count}`), `${stick} picks slice ${index + 1}`)
          }
          await page.evaluate(stick => { window[stick] = { x: 0, y: 0 } }, stick)
          await page.waitForTimeout(150)
        }
        assert.equal(await preview.evaluate(node => node === document.activeElement), true, 'the stick never moves focus off the preview')
      }
      // The arrows move to the slice that way on the drawing (at an edge they let
      // focus out of the preview instead of wrapping): every slice is reachable
      // from every other with them.
      const current = async () => (await slot()).match(/slice (\d+)/)?.[1]
      const seen = new Set([await current()])
      const queue = [...seen]
      while (queue.length) {
        const from = queue.shift()
        for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
          await preview.evaluate((node, index) => [...node.querySelectorAll('[role="button"][aria-label]')].find(region => region.getAttribute('aria-label').split(':')[1] === String(index))?.click(), Number(from) - 1)
          // A click on a slice also opens its sheet (A on the preview); close it again.
          const opened = page.getByRole('dialog').filter({ hasText: /sends/i }).last()
          if (await opened.isVisible().catch(() => false)) { await page.keyboard.press('Escape'); await opened.waitFor({ state: 'detached' }) }
          await preview.focus()
          await page.keyboard.press(key)
          if (!(await preview.evaluate(node => node === document.activeElement))) continue
          const to = await current()
          if (!seen.has(to)) { seen.add(to); queue.push(to) }
        }
      }
      assert.equal(seen.size, count, `${shape}: every slice reachable with the arrows`)
      await preview.focus()
      // A opens the slice's binding sheet; closing it hands focus back to the preview.
      await page.keyboard.press('Enter')
      const sheet = page.getByRole('dialog').filter({ hasText: /sends/i }).last()
      await sheet.waitFor()
      await page.keyboard.press('Escape')
      await sheet.waitFor({ state: 'detached' })
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-menu-preview'))
    }

    // A wheel's centre action: letting the stick back to the middle picks it.
    await editor.getByRole('radio', { name: /^Wheel/ }).click()
    await editor.getByRole('button', { name: /^More/ }).click()
    const details = page.getByRole('dialog', { name: /More$/ })
    await details.getByRole('switch', { name: /Centre action/ }).click()
    await page.keyboard.press('Escape')
    await details.waitFor({ state: 'detached' })
    await preview.focus()
    await page.evaluate(() => { window.__menuLeftStick = { x: 1, y: 0 } })
    await page.waitForTimeout(220)
    await page.evaluate(() => { window.__menuLeftStick = { x: 0, y: 0 } })
    await page.waitForTimeout(220)
    assert.match(await slot(), /centre: Holster/, 'returning the stick picks the centre action')
    assert.match(await editor.getByRole('complementary').innerText(), /Centre action/i)

    fs.mkdirSync(path.resolve(__dirname, '../tmp/parity-verification'), { recursive: true })
    for (const [width, height] of [[1517, 1000], [1024, 720], [800, 600], [480, 740]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(200)
      assert.equal(await page.evaluate(() => { const pane = document.querySelector('.shell-scroll'); return pane.scrollWidth > pane.clientWidth + 1 }), false, `editor fits ${width}`)
      await page.screenshot({ path: path.resolve(__dirname, `../tmp/parity-verification/menu-layout-${width}.png`) })
    }
    assert.deepEqual(errors, [])
    console.log('Menu layout and preview focus regression passed')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
