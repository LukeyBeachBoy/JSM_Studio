// Isolated renderer with simulated native menu telemetry. No physical output.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const expectControllerInputRing = require('./controller_input_focus_helper.cjs')
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
      let content = localStorage.getItem('__menuTestProfile') || 'RESET_MAPPINGS\nLEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_MENU_FUTURE = untouched\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Menu test', path: 'profiles-library/Menu test.txt', content }),
        listLibraryProfiles: async () => ['Menu test'], loadLibraryProfile: async () => ({ name: 'Menu test', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; localStorage.setItem('__menuTestProfile', next); window.__menuSaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.__menuButtons = 0
      window.__menuStick = { x: 0, y: 0 }
      window.__menuCursor = undefined
      window.__menuSelected = 2
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ activeProfile: 'AppNavigation.txt', devices: [{ handle: 1, type: 24, status: { buttons: window.__menuButtons, leftStick: { x: 0, y: 0 }, rightStick: window.__menuStick, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, virtualMenus: [{ id: 'menu1', source: 1, open: true, selected: window.__menuSelected, cursor: window.__menuCursor }] } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()

    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    // Console v2 (P4): "Picking from a wheel" is a card on the Sticks front; its chooser is a sub-page (UX review I4).
    await page.locator('#mapping-section-leftStick [data-value="WHEEL"]').click()
    await page.locator('[data-subpage] [data-wheel-chooser]').waitFor()
    await page.locator('[data-subpage] [data-wheel-new]').click()
    await page.getByRole('heading', { name: 'Left stick wheel', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    const left = page.locator('#mapping-section-leftStick')
    await left.getByText('Reserved for menu · Left stick wheel', { exact: true }).waitFor()
    assert.ok((await left.innerText()).includes('doesn’t move or look around'))
    assert.equal(await left.getByText('Bind to WASD', { exact: true }).count(), 0)
    await left.getByRole('button', { name: /Edit menu/ }).focus()
    await page.screenshot({ path: 'tmp/stick-menu-joysticks.png', fullPage: true, animations: 'disabled' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__menuSaved?.includes('VIRTUAL_MENUS = HEX:'))
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    assert.ok((await left.innerText()).includes('Reserved for menu'))
    await left.getByRole('button', { name: /Edit menu/ }).click()
    await page.getByRole('heading', { name: 'Left stick wheel', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    // Layout: the LS callout names the menu that holds the stick; its focus card says so.
    const card = page.locator('[data-overview-slot="left-stick"]')
    await card.getByText('Left stick wheel', { exact: true }).waitFor()
    await card.focus()
    assert.ok((await page.locator('[data-focus-card]').innerText()).includes('Reserved for Left stick wheel'))
    await page.screenshot({ path: 'tmp/stick-menu-overview.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    await page.locator('#mapping-section-leftStick [data-value="LOOK"]').click()
    assert.equal(await left.getByText('Reserved for menu · Left stick wheel', { exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Menus', exact: true }).click()
    await page.getByRole('heading', { name: 'Left stick wheel', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    // Using an existing wheel keeps you on Sticks, with the stick reserved for it (B would return to the Wheel card).
    await page.locator('#mapping-section-leftStick [data-value="WHEEL"]').click()
    await page.locator('[data-subpage] [data-wheel-chooser]').waitFor()
    await page.getByRole('button', { name: /Use Left stick wheel/ }).click()
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    await left.getByText('Reserved for menu · Left stick wheel', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Menus', exact: true }).click()
    await page.getByRole('heading', { name: 'Left stick wheel', exact: true }).waitFor()
    assert.equal(await page.locator('[data-virtual-menus-page] nav [data-menu-id]').count(), 1, 'reuse does not duplicate the menu')
    await page.evaluate(() => localStorage.setItem('__menuTestProfile', 'RESET_MAPPINGS\nLEFT_STICK_MODE = RADIAL_MENU\nLEFT_STICK_MENU_SIZE = 3\nLM1 = SPACE\nLM2 = A\nLM3 = B\n# @label LM1 = Jump\n'))
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    // A plain RADIAL_MENU wheel moves to Menus from Wheel ▸ Advanced ▸ Open in Menus in Fine-tune.
    await page.locator('#mapping-section-leftStick [data-stick-fine-tune-row]').click()
    await page.getByRole('button', { name: /Open in Menus/ }).click()
    await page.getByRole('heading', { name: 'Left stick wheel', exact: true }).waitFor()
    assert.ok((await page.locator('[data-menu-preview]').innerText()).includes('Jump'))
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__menuSaved?.includes('VIRTUAL_MENUS = HEX:'))
    const saved = await page.evaluate(() => window.__menuSaved)
    const packed = saved.match(/VIRTUAL_MENUS = HEX:([a-f0-9]+)/)[1]
    const decoded = Buffer.from(packed, 'hex').toString('utf8')
    assert.match(decoded, /ACTION menu1 1 SPACE/)
    assert.match(decoded, /SOURCE menu1 LSTICK ALWAYS NONE CONTINUOUS/)
    assert.equal(errors.length, 0, errors.join('\n'))
    console.log('PASS: joystick create/edit/detach, overview reservation and menu retention; no browser errors')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
