// Isolated renderer: saved placement only; no physical controller output.
// Menus ▸ Position on screen and Position all menus (console v2, MenuEditor):
// the screen to scale, across / down values, when it shows, every menu at once
// with overlaps and Match position with; and Opened by's one-set-at-a-time pager.
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      document.hasFocus = () => true
      for (const [key, value] of Object.entries({ width: 2560, availWidth: 2560, height: 1440, availHeight: 1440 })) Object.defineProperty(window.screen, key, { value, configurable: true })
      let content = localStorage.getItem('__positionProfile') || 'RESET_MAPPINGS\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Position test', path: 'profiles-library/Position test.txt', content }),
        listLibraryProfiles: async () => ['Position test'], loadLibraryProfile: async () => ({ name: 'Position test', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; localStorage.setItem('__positionProfile', next); window.__positionSaved = next; return { name } },
      }
      window.telemetry = { onSample: callback => { const emit = () => callback({ activeProfile: 'AppNavigation.txt', devices: [] }); emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer) } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('.app-shell').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1000)
    const go = tab => page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), tab)
    // Across / down are value rows ◂ ▸ step (console v2, like the Look rows).
    const row = (label, scope = page) => scope.getByRole('slider', { name: label, exact: true })
    const typeName = async value => {
      const keyboard = page.locator('[data-text-entry] [role="dialog"]'); await keyboard.waitFor()
      for (let i = 0; i < 30; i++) await page.keyboard.press('Backspace')
      await page.keyboard.type(value); await page.keyboard.press('Enter'); await keyboard.waitFor({ state: 'detached' })
    }
    const menus = page.locator('[data-virtual-menus-page]')
    const create = async (template, name) => {
      if (!await page.locator('[data-virtual-menus-page][data-empty]').count()) {
        await menus.getByRole('button', { name: /New menu/ }).click()
        await page.getByRole('dialog', { name: /New menu$/ }).getByRole('radio', { name: new RegExp(template) }).click()
      } else await menus.getByRole('radio', { name: new RegExp(template) }).click()
      await menus.locator('[data-menu-id]').filter({ hasText: template }).first().focus()
      await page.keyboard.press('y'); await typeName(name)
      await menus.getByRole('heading', { name, exact: true }).waitFor()
    }
    await go('virtualMenus')
    await create('Weapon wheel', 'Weapons')
    // Position on screen: the screen to scale, its across / down values, when it shows.
    await menus.getByRole('button', { name: /Position on screen/ }).click()
    let place = page.getByRole('dialog', { name: /Position on screen$/ })
    await place.waitFor()
    await place.getByRole('region', { name: 'Overlay screen preview', exact: true }).waitFor()
    assert.equal(await row('Horizontal position', place).count(), 1)
    assert.equal(await row('Vertical position', place).count(), 1)
    await row('Horizontal position', place).focus(); await page.keyboard.press('ArrowRight')
    assert.match(await place.getByRole('slider', { name: 'Overlay position', exact: true }).getAttribute('aria-valuetext'), /66% across/, 'the row steps the position by 1%')
    await page.keyboard.press('ArrowLeft')
    const appears = place.getByRole('radiogroup', { name: 'Appears' })
    await appears.focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    assert.match(await appears.innerText(), /Never/)
    await page.keyboard.press('Escape'); await place.waitFor({ state: 'detached' })
    // Opened by: one set of controls at a time; another way to open it, then Y removes it.
    await menus.getByRole('button', { name: /Opened by/ }).click()
    const details = page.getByRole('dialog', { name: /Opened by$/ })
    await details.waitFor()
    assert.match(await details.innerText(), /Controls 1 of 1/)
    await details.getByRole('button', { name: /Another way to open it/ }).click()
    assert.match(await details.innerText(), /Controls 2 of 2/)
    await details.getByRole('listbox', { name: 'Navigate with' }).focus()
    await page.keyboard.press('y')
    await details.getByText('Controls 1 of 1').waitFor()
    await page.keyboard.press('Escape'); await details.waitFor({ state: 'detached' })
    await create('Hotbar', 'Tools')
    // Position all menus: every menu, the hidden one too, matched and overlapping.
    await menus.getByRole('button', { name: /Position on screen/ }).click()
    place = page.getByRole('dialog', { name: /Position on screen$/ })
    await place.getByRole('button', { name: /Position all menus/ }).click()
    const dialog = page.getByRole('region', { name: 'Position virtual menus', exact: true })
    await dialog.waitFor()
    assert.equal(await dialog.locator('.virtual-menus__screen-menu').count(), 2)
    assert.equal(await dialog.getByText('Overlay hidden', { exact: true }).count(), 1, 'hidden overlays remain available for placement')
    const hotbar = await dialog.locator('[data-menu-id="menu2"]').boundingBox()
    assert.ok(Math.abs(hotbar.width / hotbar.height - 5) < .05, 'other menu shapes retain their screen proportions')
    await page.waitForTimeout(300)
    const screen = dialog.getByRole('slider', { name: 'Overlay position', exact: true })
    await screen.press('ArrowRight')
    await screen.press('Shift+ArrowDown')
    assert.match(await screen.getAttribute('aria-valuetext'), /51% across, 55% down/)
    const bounds = await screen.boundingBox()
    await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .3)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .4, { steps: 4 })
    await page.mouse.up()
    assert.match(await screen.getAttribute('aria-valuetext'), /80% across, 40% down/)
    await dialog.getByRole('button', { name: 'Use this position', exact: true }).click()
    assert.match(await screen.getAttribute('aria-valuetext'), /50% across, 50% down/)
    assert.match(await dialog.getByRole('status').innerText(), /Overlapping footprints: Weapons/)
    await dialog.getByRole('button', { name: /1 Weapons/ }).click()
    await screen.press('ArrowLeft')
    assert.equal(await dialog.locator('[data-menu-id="menu1"]').getAttribute('data-current'), 'true')
    fs.mkdirSync(path.resolve(__dirname, '../tmp/parity-verification'), { recursive: true })
    await page.screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/menu-position-workspace-wide.png') })
    await page.setViewportSize({ width: 680, height: 740 })
    assert.equal(await page.locator('[data-subpage] main').last().evaluate(node => node.scrollWidth > node.clientWidth + 1), false)
    await page.screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/menu-position-workspace-narrow.png') })
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !!window.__positionSaved)
    await page.reload()
    await page.locator('.app-shell').waitFor({ timeout: 30000 }); await page.waitForTimeout(1000)
    await go('virtualMenus')
    await menus.getByRole('button', { name: /Position on screen/ }).click()
    await page.getByRole('dialog', { name: /Position on screen$/ }).getByRole('button', { name: /Position all menus/ }).click()
    await dialog.waitFor()
    assert.match(await screen.getAttribute('aria-valuetext'), /49% across, 50% down/)
    await dialog.getByRole('button', { name: /2 Tools/ }).click()
    assert.match(await screen.getAttribute('aria-valuetext'), /50% across, 50% down/)
    assert.deepEqual(errors, [])
    console.log('PASS: position page, when it shows, controls pager and Y removal, all-menu page, keyboard/drag, matching, overlaps, narrow layout and persisted independent positions')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
