// Full renderer regression driven through simulated controller telemetry.
// Does not invoke a physical controller or installed mapper.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
      await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    })
    await page.addInitScript(() => {
      document.hasFocus = () => true
      const content = localStorage.getItem('__focusProfile') || 'RESET_MAPPINGS\nN = SPACE\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Focus test', path: 'profiles-library/Focus test.txt', content }),
        listLibraryProfiles: async () => ['Focus test'],
        loadLibraryProfile: async () => ({ name: 'Focus test', content }),
        getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
      }
      const bits = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, L: 8, R: 9, S: 12, E: 13, W: 14, N: 15 }
      window.__focusButtons = []
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ console: 'ready', activeProfile: 'AppNavigation.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: {
          buttons: window.__focusButtons.reduce((mask, key) => mask + 2 ** bits[key], 0),
          leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
        } }] })
        emit(); const timer = setInterval(emit, 10); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = page.locator('details[data-input-command="N"]').first()
    await card.locator('summary').first().click()
    const open = async () => {
      await card.getByRole('button', { name: 'Add command', exact: true }).click()
      await picker.waitFor()
      await page.waitForTimeout(100)
    }
    const picker = page.getByRole('dialog', { name: 'Choose an action', exact: true })
    const tab = name => picker.locator('.action-picker__tabs').getByRole('button', { name, exact: true })
    const selected = () => picker.locator('.action-tab[aria-pressed="true"]').innerText()
    const press = async key => {
      await page.evaluate(key => { window.__focusButtons = [key] }, key)
      await page.waitForTimeout(80)
      await page.evaluate(() => { window.__focusButtons = [] })
      await page.waitForTimeout(120)
    }
    const focusedInside = async message => assert.ok(await picker.evaluate(el => el.contains(document.activeElement)), message)
    const focusedContent = async () => assert.ok(await picker.locator('.action-picker__content').evaluate(el => el.contains(document.activeElement)), 'focus lands on category content')

    await open()
    await tab('Numpad').click()
    await picker.locator('.action-picker__content button').first().focus()
    await press('R')
    assert.equal(await selected(), 'Layers')
    await focusedContent() // Empty Layers already provides a Go to Layers button.
    await press('R')
    assert.equal(await selected(), 'Virtual menus')
    assert.match(await picker.locator('.action-picker__content').innerText(), /Create a menu/)
    await focusedInside('empty Virtual menus must keep controller focus inside the picker')
    assert.ok(await tab('Virtual menus').evaluate(el => el === document.activeElement), 'empty category focuses its selected tab')
    await press('R')
    assert.equal(await selected(), 'System & media', 'next bumper still reaches the picker')
    await focusedContent()
    await press('L')
    assert.equal(await selected(), 'Virtual menus')
    await press('LEFT')
    await focusedInside('D-pad remains inside empty category')
    await press('E')
    await picker.waitFor({ state: 'detached' })

    // Repeated full cycles cover wraparound, Custom and Configurations too.
    await open()
    const names = await picker.locator('.action-picker__tabs .action-tab[aria-pressed]').allInnerTexts()
    let index = names.indexOf(await selected())
    for (let step = 0; step < names.length * 2; step++) {
      await press('R'); index = (index + 1) % names.length
      assert.equal(await selected(), names[index])
      await focusedInside(`focus survives ${names[index]}`)
    }

    // Mouse tab clicks keep focus on the clicked tab; bumpers move to actions.
    await tab('Virtual menus').click()
    assert.ok(await tab('Virtual menus').evaluate(el => el === document.activeElement))
    await tab('Keyboard').click()
    assert.ok(await tab('Keyboard').evaluate(el => el === document.activeElement))
    await press('R')
    assert.equal(await selected(), 'Numpad')
    await focusedContent()

    // Search has no results; Down/Enter must still have a safe landing target.
    await press('N') // Y
    const search = picker.getByRole('searchbox')
    assert.ok(await search.evaluate(el => el === document.activeElement))
    await search.fill('no-such-action-zzzz')
    await search.press('ArrowDown')
    await focusedInside('empty search must preserve focus')
    assert.ok(await tab('Numpad').evaluate(el => el === document.activeElement))
    await press('R')
    assert.equal(await selected(), 'Layers')
    assert.equal(await search.inputValue(), '')
    await focusedContent()
    await press('N')
    await search.fill('no-such-action-zzzz')
    await search.press('Escape')
    await focusedContent()

    // Keyboard category shortcuts and Tab/Escape continue to work.
    await tab('Layers').focus()
    await page.keyboard.press(']')
    await page.waitForFunction(() => document.querySelector('.action-tab[aria-pressed="true"]')?.textContent === 'Virtual menus')
    assert.equal(await selected(), 'Virtual menus')
    await focusedInside('keyboard category step preserves focus')
    await page.keyboard.press(']')
    await page.waitForFunction(() => document.querySelector('.action-tab[aria-pressed="true"]')?.textContent === 'System & media')
    assert.equal(await selected(), 'System & media')
    await focusedContent()
    await page.keyboard.press('Tab')
    await focusedInside('Tab is trapped in the picker')
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'detached' })
    // A profile that opens directly on an unavailable menu has no old action
    // to unmount; the opening focus path must use the same safe fallback.
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('__focusProfile', 'RESET_MAPPINGS\nN = "MENU_OPEN missing"\n')
    })
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    await card.locator('summary').first().click()
    await card.getByRole('button', { name: /^Choose action/ }).first().click()
    await picker.waitFor()
    await page.waitForTimeout(100)
    assert.equal(await selected(), 'Virtual menus')
    assert.ok(await tab('Virtual menus').evaluate(el => el === document.activeElement), 'opening on an empty category focuses its tab')
    await press('R')
    assert.equal(await selected(), 'System & media')
    await focusedContent()
    await press('E')
    await picker.waitFor({ state: 'detached' })

    // Populated Virtual menus still focuses and chooses an actual action.
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('__focusProfile', 'RESET_MAPPINGS\nN = SPACE\nVIRTUAL_MENU wheel TOUCH 2 2 .1\nVIRTUAL_MENU_ACTION wheel 1 SPACE\\\n')
    })
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    await card.locator('summary').first().click()
    await open()
    await tab('Layers').click()
    await press('R')
    assert.equal(await selected(), 'Virtual menus')
    await focusedContent()
    assert.match(await picker.locator('.action-picker__content button:focus').innerText(), /Open wheel/)
    await press('S')
    await picker.waitFor({ state: 'detached' })
    assert.match(await card.innerText(), /Open menu · wheel/)
    assert.deepEqual(errors, [])
    console.log('action picker controller focus regression: ok')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
