// Full renderer regression driven through simulated controller telemetry.
// Does not invoke a physical controller or installed mapper.
//
// Search every action (console v2): Y from any of the binding sheet's kind
// pickers opens the whole catalogue -- families on LB/RB in the kinds' order,
// groups on LT/RT -- and the pad must never lose focus in it: family and group
// changes, empty families, empty searches, the keyboard's PgUp/PgDn and [ ].
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
          leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: window.__focusTriggers?.left ?? 0, right: window.__focusTriggers?.right ?? 0 }, gyro: { x: 0, y: 0, z: 0 },
        } }] })
        emit(); const timer = setInterval(emit, 10); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = page.locator('details[data-input-command="N"]').first()
    await card.locator(':scope > summary').click()
    const pull = async side => {
      await page.evaluate(side => { window.__focusTriggers = { [side]: 1 } }, side)
      await page.waitForTimeout(120)
      await page.evaluate(() => { window.__focusTriggers = {} })
      await page.waitForTimeout(220)
    }
    const press = async key => {
      await page.evaluate(key => { window.__focusButtons = [key] }, key)
      await page.waitForTimeout(80)
      await page.evaluate(() => { window.__focusButtons = [] })
      await page.waitForTimeout(160)
    }
    const picker = page.getByRole('dialog', { name: 'Search every action', exact: true })
    const kindPicker = page.locator('[data-picker="key"]')
    // Open the Keyboard key picker from the sheet, then Y: Search every action.
    const open = async () => {
      if (!(await kindPicker.count())) {
        await card.locator('[data-kind="key"]').first().click()
        await kindPicker.waitFor()
        await page.waitForTimeout(200)
      }
      await press('N')
      await picker.waitFor()
      await page.waitForTimeout(150)
    }
    const tab = name => picker.locator('.action-picker__tabs').getByRole('button', { name, exact: true })
    const selected = () => picker.locator('.action-tab[aria-pressed="true"]').innerText()
    const group = () => picker.locator('.action-group-tab[aria-pressed="true"]').innerText()
    const focusedInside = async message => assert.ok(await picker.evaluate(el => el.contains(document.activeElement)), message)
    const focusedContent = async () => assert.ok(await picker.locator('.action-picker__content').evaluate(el => el.contains(document.activeElement)), 'focus lands on category content')

    await open()
    assert.ok(await picker.getByRole('searchbox').evaluate(el => el === document.activeElement), 'Search every action opens in its search box')
    assert.equal(await selected(), 'Keyboard key', 'it opens on the kind it came from')
    assert.match(await group(), /^Common in games/)
    assert.deepEqual(await picker.locator('.action-picker__tabs .action-tab[data-family]').allInnerTexts(),
      ['Keyboard key', 'Mouse', 'Gamepad button', 'Open a menu', 'Switch layer', 'Controller action', 'Load a config', 'Command'])
    await picker.getByRole('searchbox').press('ArrowDown')
    await focusedContent()
    await press('R')
    assert.equal(await selected(), 'Mouse')
    await focusedContent()
    await press('R'); await press('R')
    assert.equal(await selected(), 'Open a menu')
    assert.match(await picker.locator('.action-picker__content').innerText(), /No menus yet/)
    await focusedInside('empty Open a menu must keep controller focus inside the picker')
    await press('R')
    assert.equal(await selected(), 'Switch layer')
    await focusedInside('a family with no modes keeps focus inside')
    await press('R')
    assert.equal(await selected(), 'Controller action')
    assert.match(await group(), /^Gyro/)
    for (const expected of ['Calibrate', 'Rumble & sound', 'Light', 'Other', 'Gyro']) {
      await pull('right')
      assert.match(await group(), new RegExp(`^${expected}`))
      assert.equal(await selected(), 'Controller action', 'a trigger never changes the family')
      await focusedContent()
    }
    await press('R')
    assert.equal(await selected(), 'Load a config', 'the library is offered even when it is only this configuration')
    await focusedInside('Load a config keeps focus')
    await press('L')
    assert.equal(await selected(), 'Controller action')

    // Repeated full cycles cover wraparound and Command too.
    const names = await picker.locator('.action-picker__tabs .action-tab[data-family]').allInnerTexts()
    let index = names.indexOf(await selected())
    for (let step = 0; step < names.length * 2; step++) {
      await press('R'); index = (index + 1) % names.length
      assert.equal(await selected(), names[index])
      await focusedInside(`focus survives ${names[index]}`)
    }

    // The triggers step the Keyboard key family's groups, both ways, wrapping.
    await tab('Keyboard key').click()
    assert.match(await group(), /^Common in games/)
    for (const expected of ['Full keyboard', 'Numpad', 'System & media', 'Common in games']) {
      await pull('right')
      assert.match(await group(), new RegExp(`^${expected}`))
      assert.equal(await selected(), 'Keyboard key')
      await focusedContent()
    }
    await pull('left')
    assert.match(await group(), /^System & media/)
    // A one-group family has no group strip; a trigger there does nothing.
    await tab('Mouse').click()
    assert.equal(await picker.locator('.action-picker__groups').count(), 0)
    await pull('right')
    assert.equal(await selected(), 'Mouse')
    await focusedInside('a trigger in a one-group family keeps focus inside')

    // Search has no results; Down must still have a safe landing target.
    await tab('Keyboard key').click()
    await press('N') // Y
    const search = picker.getByRole('searchbox')
    assert.ok(await search.evaluate(el => el === document.activeElement))
    await search.fill('no-such-action-zzzz')
    await search.press('ArrowDown')
    await focusedInside('empty search must preserve focus')
    await press('R')
    assert.equal(await selected(), 'Mouse')
    assert.equal(await search.inputValue(), '')
    await focusedContent()

    // Keyboard shortcuts: PgUp/PgDn are LB/RB, [ and ] are LT/RT (console v2).
    await tab('Switch layer').click()
    await page.keyboard.press('PageDown')
    await page.waitForFunction(() => document.querySelector('.action-tab[aria-pressed="true"]')?.textContent === 'Controller action')
    await focusedInside('keyboard family step preserves focus')
    await tab('Keyboard key').click()
    await page.keyboard.press(']')
    await page.waitForFunction(() => /^Full keyboard/.test(document.querySelector('.action-group-tab[aria-pressed="true"]')?.textContent ?? ''))
    await focusedContent()
    await page.keyboard.press('[')
    await page.waitForFunction(() => /^Common in games/.test(document.querySelector('.action-group-tab[aria-pressed="true"]')?.textContent ?? ''))
    await page.keyboard.press('Tab')
    await focusedInside('Tab is trapped in the picker')
    // B leaves Search every action for the kind's own picker.
    await press('E')
    await picker.waitFor({ state: 'detached' })
    await kindPicker.waitFor()
    await press('E')
    await kindPicker.waitFor({ state: 'detached' })

    // Populated menus: Search every action offers Hold/Open/Close/Toggle for each.
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('__focusProfile', 'RESET_MAPPINGS\nN = SPACE\nVIRTUAL_MENU wheel TOUCH 2 2 .1\nVIRTUAL_MENU_ACTION wheel 1 SPACE\\\n')
    })
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    await card.locator(':scope > summary').click()
    await open()
    await tab('Gamepad button').click()
    await press('R')
    assert.equal(await selected(), 'Open a menu')
    await focusedContent()
    assert.match(await picker.locator('.action-picker__content button:focus').innerText(), /Hold wheel/)
    await press('S')
    await picker.waitFor({ state: 'detached' })
    await page.waitForFunction(() => /wheel/i.test(document.querySelector('details[data-input-command="N"]')?.textContent ?? ''))
    assert.deepEqual(errors, [])
    console.log('action picker controller focus regression: ok')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
