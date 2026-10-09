// Menus (console v2, MenuEditor + MenuEditorMore). Isolated renderer: the mocks
// never reach a controller or the mapper. Proves on the new screens what the
// old editor did: start from nothing (now the Kit's templates), name a menu,
// pick a slice and name it, change the shape and count (grid columns kept), set
// how it opens with player words, and delete it -- and that the catalogue is
// always written to Default (D16), whichever mode is being edited.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      document.hasFocus = () => true
      let content = 'RESET_MAPPINGS\nLEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_MENU_FUTURE = untouched\n# @layer {"id":"veh","name":"Vehicles","overrides":{"N":"H"}}\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Menu test', path: 'profiles-library/Menu test.txt', content }),
        listLibraryProfiles: async () => ['Menu test'], loadLibraryProfile: async () => ({ name: 'Menu test', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__menuSaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.telemetry = { onSample: callback => { const emit = () => callback({ activeProfile: 'AppNavigation.txt', devices: [] }); emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer) } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('.app-shell').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    const go = tab => page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), tab)
    const save = async () => { await page.evaluate(() => { window.__menuSaved = '' }); await page.keyboard.press('Control+s'); await page.waitForFunction(() => !!window.__menuSaved); return page.evaluate(() => window.__menuSaved) }
    const catalog = text => { const packed = [...text.matchAll(/^VIRTUAL_MENUS = HEX:([a-f0-9]+)/gm)].pop()?.[1]; return packed ? Buffer.from(packed, 'hex').toString('utf8') : '' }
    const typeName = async value => {
      const keyboard = page.locator('[data-text-entry] [role="dialog"]')
      await keyboard.waitFor()
      for (let i = 0; i < 30; i++) await page.keyboard.press('Backspace')
      await page.keyboard.type(value); await page.keyboard.press('Enter')
      await keyboard.waitFor({ state: 'detached' })
    }

    // Edit a mode first: the catalogue must still go to Default (D16).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'layers' })))
    await page.locator('[data-mode-id="veh"]').click()
    await go('virtualMenus')
    const menusPage = page.locator('[data-virtual-menus-page]')
    await menusPage.waitFor()
    // Nothing made yet: the Kit's empty state, templates up front (one lead line, no second heading).
    assert.equal(await page.locator('[data-virtual-menus-page][data-empty]').count(), 1)
    assert.match(await menusPage.innerText(), /Hold a button, point at what you want, let go/)
    assert.equal(await menusPage.locator('h2').count(), 0, 'the page header is the only heading')
    assert.equal(await menusPage.getByRole('radio', { name: /Start empty/ }).getAttribute('data-hints'), 'A:Start empty;B:Back')
    assert.deepEqual(await menusPage.getByRole('radio').evaluateAll(els => els.map(el => el.querySelector('b')?.textContent)), ['Weapon wheel', 'Quick wheel', 'Hotbar', 'Start empty'])
    await menusPage.getByRole('radio', { name: /Weapon wheel/ }).click()
    await menusPage.getByRole('heading', { name: 'Weapon wheel', exact: true }).waitFor()
    let text = await save()
    assert.match(catalog(text), /^DEFINE menu1 RADIAL 8 8 0\.2$/m)
    assert.match(catalog(text), /^SOURCE menu1 RSTICK COMMAND NONE ACTIVATION_RELEASE NONE NONE$/m)
    assert.doesNotMatch(text.split('\n').filter(line => line.startsWith('# @layer {')).join('\n'), /VIRTUAL_MENUS/, 'not written into the Vehicles mode')
    assert.match(text, /^UNKNOWN_MENU_FUTURE = untouched$/m)
    assert.match(await menusPage.innerText(), /Tilt the right stick to pick, let go to use/)

    // The preview is the focused control: ◂ ▸ pick the slice.
    const preview = menusPage.locator('[data-menu-preview]')
    await preview.focus()
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
    assert.match(await menusPage.getByRole('complementary').innerText(), /Slice 3 of 8/i)
    assert.match(await menusPage.innerText(), /Sends 3/)
    // A opens the binding sheet for the slice (BIND's sheet: When you… / sends).
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog').filter({ hasText: /sends/i }).last()
    await sheet.waitFor()
    assert.match(await sheet.innerText(), /Keyboard key/)
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })
    // Y: icon and name. The name is typed on the on-screen keyboard.
    await preview.focus(); await page.keyboard.press('y')
    const names = page.getByRole('dialog', { name: /Icon and name/ })
    await names.waitFor()
    await names.getByRole('button', { name: /^Name/ }).click()
    await typeName('Grenade')
    await page.keyboard.press('Escape')
    text = await save()
    assert.match(catalog(text), /"label":"Grenade"/)

    // Shape and count: Grid keeps its columns stepper; fewer slices drops the last ones.
    await menusPage.getByRole('radio', { name: /Grid/ }).click()
    const slices = menusPage.getByRole('slider', { name: 'Zones', exact: true })
    await slices.focus(); await page.keyboard.press('ArrowLeft')
    const columns = menusPage.getByRole('slider', { name: 'Columns', exact: true })
    await columns.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
    text = await save()
    assert.match(catalog(text), /^DEFINE menu1 TOUCH 7 5 0\.2$/m)

    // Opened by: its own page. How it opens is a row of cards; only the rows that
    // apply to that choice are shown; the opener is pressed or picked.
    await menusPage.getByRole('button', { name: /Opened by/ }).click()
    const details = page.getByRole('dialog', { name: /Opened by$/ })
    await details.waitFor()
    const opens = details.getByRole('radiogroup', { name: 'How it opens' })
    assert.equal(await opens.getByRole('radio', { name: /From a button/ }).getAttribute('aria-checked'), 'true')
    assert.equal(await details.getByRole('button', { name: /^Opener/ }).count(), 0, 'no opener row until the menu has an opener')
    await opens.getByRole('radio', { name: /While held/ }).click()
    await details.getByRole('button', { name: /^Opener/ }).click()
    const capture = page.getByRole('dialog', { name: /Opener$/ })
    await capture.waitFor()
    await capture.locator('[role="option"]:has(svg[data-glyph="R"])').click()
    await capture.waitFor({ state: 'detached' })
    const picks = details.getByRole('listbox', { name: 'When it picks' })
    assert.equal(await details.getByRole('button', { name: /^Confirm button/ }).count(), 0, 'no confirm row until it picks on a press')
    await picks.focus(); await page.keyboard.press('ArrowRight')
    assert.match(await picks.innerText(), /On a press/)
    assert.equal(await details.getByRole('button', { name: /^Confirm button/ }).count(), 1, 'confirm applies when it picks on a press')
    text = await save()
    assert.match(catalog(text), /^SOURCE menu1 RSTICK HOLD R CLICK NONE NONE$/m)
    await page.keyboard.press('Escape'); await details.waitFor({ state: 'detached' })
    // More: its own page; renames the menu and deletes it in place.
    await menusPage.getByRole('button', { name: /^More/ }).click()
    const more = page.getByRole('dialog', { name: /More$/ })
    await more.waitFor()
    await more.getByRole('button', { name: /^Menu name/ }).click()
    await typeName('Guns')
    await more.getByRole('button', { name: /Delete this menu/ }).click()
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-keep'))
    await page.keyboard.press('Escape')
    await more.getByRole('button', { name: /Delete this menu/ }).click()
    await more.getByRole('alertdialog').getByRole('button', { name: 'Delete Guns' }).click()
    await more.waitFor({ state: 'detached' })
    await page.locator('[data-virtual-menus-page][data-empty]').waitFor()
    text = await save()
    assert.equal(catalog(text).trim(), '')
    assert.deepEqual(errors, [])
    console.log('PASS: templates when empty, preview picks slices, slice sheet and name, shape and counts, opened-by in player words, rename and delete in place, catalogue always in Default')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
