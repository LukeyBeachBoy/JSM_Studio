// Console v2 pickers (design/console-v2: KeyPicker, PickerFamily, ControllerActions*,
// IconPicker, TextEntry), driven through the dev picker playground on ?mock
// (src/dev/PickerPlayground.tsx) with the mock pad. Each kind's picker is
// opened the way the binding sheet opens it (KindPicker) and what it hands
// back is read from window.__pickerResult.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForFunction(() => window.__pad && document.querySelector('.app-shell'))
    const keep = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keep.count()) await keep.click()

    const press = async (...buttons) => { for (const button of buttons) { await page.evaluate(b => window.__pad.press(b.split(',')), button); await page.waitForTimeout(200) } }
    const until = async (name, value) => { await page.waitForFunction(([n, v]) => document.activeElement?.getAttribute(n) === v, [name, value], { timeout: 3000 }).catch(() => {}); return page.evaluate(n => document.activeElement?.getAttribute(n), name) }
    const pull = async side => { await page.evaluate(s => window.__pad.trigger(s, 1), side); await page.waitForTimeout(150); await page.evaluate(s => window.__pad.trigger(s, 0), side); await page.waitForTimeout(300) }
    const results = () => page.evaluate(() => window.__pickerResult ?? [])
    const last = async () => (await results()).slice(-1)[0]
    const clear = () => page.evaluate(() => { window.__pickerResult = [] })
    const open = async detail => {
      const catalogue = page.locator('[data-picker="actions"]')
      if (await catalogue.count()) await catalogue.getByRole('button', { name: 'Cancel', exact: true }).click()
      await clear()
      await page.evaluate(d => window.dispatchEvent(new CustomEvent('jsm:picker', { detail: d })), detail)
      await page.locator('[data-picker="actions"]').waitFor()
      if (['gamepad', 'mode', 'controller', 'command'].includes(detail.kind)) await page.locator('[data-picker="actions"] [data-customize]').click()
      await page.waitForTimeout(300)
    }
    const picker = kind => page.locator(`[data-picker="${['key', 'mouse', 'menu', 'config'].includes(kind) ? 'actions' : kind}"]`)
    const active = () => page.evaluate(() => document.activeElement?.outerHTML.slice(0, 300) ?? '')
    const activeAttr = name => page.evaluate(n => document.activeElement?.getAttribute(n), name)
    const footer = async () => {
      await page.waitForFunction(() => ([...document.querySelectorAll('[data-subpage] footer, .action-picker__footer')].pop()?.innerText ?? '').trim().length > 0).catch(() => {})
      return page.locator('[data-subpage] footer, .action-picker__footer').last().innerText()
    }
    const group = kind => picker(kind).locator('[data-category][aria-pressed="true"]').innerText()
    const closed = kind => picker(kind).waitFor({ state: 'detached' })

    // Wake the pad up so hints draw its buttons.
    await press('DOWN')

    // ---- One searchable catalogue for keyboard and mouse; key combos are an explicit editor.
    await open({ kind: 'key', input: 'S', value: 'SPACE' })
    assert.equal(await picker('key').locator('h2').innerText(), 'Choose an action')
    assert.equal(await picker('key').getByRole('searchbox').count(), 1)
    assert.equal(await activeAttr('data-token'), 'SPACE', 'current key gets focus')
    await picker('key').getByRole('searchbox').fill('F15')
    await picker('key').locator('[data-token="F15"]').click()
    await closed('key')
    assert.equal((await last()).patch.outputValue, 'F15')
    await open({ kind: 'key', input: 'S', value: 'C' })
    await picker('key').locator('[data-customize]').click()
    await picker('combo').waitFor()
    await picker('combo').locator('[data-mod="shift"]').click()
    await press('N')
    assert.match(await picker('combo').innerText(), /R Ctrl/)
    await picker('combo').locator('[data-combo-use]').click()
    await closed('combo')
    assert.deepEqual((await last()).combo, ['RCONTROL', 'RSHIFT', 'C'])
    await open({ kind: 'mouse', input: 'S' })
    assert.ok(await picker('mouse').locator('[data-token="LMOUSE"]').count())
    assert.ok(await picker('mouse').locator('[data-token="SCROLLUP"]').count())
    await picker('mouse').locator('[data-token="SCROLLUP"]').click()
    await closed('mouse')
    assert.equal((await last()).patch.outputValue, 'SCROLLUP')

    // ---- Gamepad button: LT/RT switch Xbox / DualShock 4; choosing turns the scheme on.
    await open({ kind: 'gamepad', input: 'S' })
    assert.deepEqual(await picker('gamepad').locator('[data-category]').allInnerTexts(), ['Xbox', 'DualShock 4'])
    assert.match(await picker('gamepad').innerText(), /Turns on the virtual gamepad/)
    assert.match(await picker('gamepad').innerText(), /Whole sticks are on the Sticks tab/)
    assert.match(await footer(), /the game sees A/i)
    assert.match(await footer(), /Xbox or DS4/)
    assert.equal(await picker('gamepad').locator('[data-logical="padClick"]').getAttribute('aria-disabled'), 'true', 'DS4 pad is unavailable on Xbox, and says why')
    await pull('right')
    assert.equal(await group('gamepad'), 'DualShock 4')
    await press('S')
    await closed('gamepad')
    const pad = await results()
    assert.deepEqual(pad[0], { enable: 'DS4' })
    assert.equal(pad[1].patch.outputValue, 'PS_CROSS')

    // ---- Named virtual menus share the catalogue and keep all four verbs.
    await open({ kind: 'menu', input: 'S' })
    for (const verb of ['HOLD', 'OPEN', 'CLOSE', 'TOGGLE']) assert.ok(await picker('menu').locator(`[data-token="MENU_${verb} wheel"]`).count())
    await picker('menu').locator('[data-token="MENU_OPEN wheel"]').click()
    await closed('menu')
    assert.equal((await last()).patch.outputValue, 'MENU_OPEN wheel')

    // ---- Switch mode: the mode, then how; new and existing.
    await open({ kind: 'mode', input: 'N' })
    assert.deepEqual(await picker('mode').locator('[data-layer]').evaluateAll(els => els.map(el => el.dataset.layer)), ['veh', 'map', 'comms'])
    assert.equal(await activeAttr('data-layer'), 'veh')
    // Down past "+ Make a mode" to the verb row.
    for (let step = 0; step < 3 && !(await activeAttr('data-mode-verb')); step++) await press('DOWN')
    assert.equal(await until('data-mode-verb', 'hold'), 'hold')
    await press('RIGHT')
    assert.equal(await until('data-mode-verb', 'toggle'), 'toggle')
    await press('DOWN', 'RIGHT')
    assert.equal(await until('data-mode-on', 'release'), 'release')
    await picker('mode').locator('[data-layer="comms"]').click()
    await closed('mode')
    assert.deepEqual((await last()).setActions, { input: 'N', next: [{ input: '!N', verb: 'toggle', layerId: 'comms' }] })
    // An existing action: Y removes it.
    await open({ kind: 'mode', input: 'LSL', source: { kind: 'layerAction', action: { input: 'LSL', verb: 'hold', layerId: 'veh' } } })
    assert.equal(await activeAttr('data-layer'), 'veh', 'opens on the mode it switches')
    assert.match(await footer(), /Remove/)
    await press('N')
    await closed('mode')
    assert.deepEqual((await last()).setActions, { input: 'LSL', next: [] })

    // ---- Controller action: five groups with counts, renamed tiles, aside.
    await open({ kind: 'controller', input: 'S' })
    assert.equal(await picker('controller').locator('h2').innerText(), 'Controller action')
    const tabs = (await picker('controller').locator('[data-category]').allInnerTexts()).map(text => text.replace(/\s+/g, ' '))
    assert.deepEqual([tabs[0], tabs[1], tabs[3], tabs[4]], ['Gyro 10', 'Calibrate 7', 'Light 3', 'Other 6'])
    // 2 to feel + 14 tunes, and the library's ready sounds ("16+" with none).
    assert.match(tabs[2], /^Rumble & sound (16\+|1[7-9]|[2-9]\d)$/)
    const titles = () => picker('controller').locator('[data-action] [class*="tileTitle"]').allInnerTexts()
    assert.deepEqual(await titles(), ['Gyro on', 'Gyro off', 'Enable gyro on all controllers', 'Disable gyro on all controllers', 'Invert both ways', 'Invert left-right', 'Invert up-down', 'Momentum', 'Horizontal momentum', 'Vertical momentum'])
    assert.match(await picker('controller').locator('aside').innerText(), /This controller only[\s\S]*How it can work · set in Fine-tune[\s\S]*Normal[\s\S]*Toggle/)
    assert.match(await picker('controller').locator('aside').innerText(), /already turns gyro on in this configuration/, 'the conflict note reads GYRO_ON = MISC5')
    assert.match(await footer(), /Use Gyro on/)
    assert.match(await footer(), /Group/)
    await pull('right')
    assert.deepEqual(await titles(), ['Calibrate gyro', 'Calibrate while held', 'Start continuous calibration', 'Finish continuous calibration', 'Set tilt neutral', 'Recentre gyro stick', 'Calibrate adaptive triggers'])
    assert.equal(await activeAttr('data-action'), 'CALIBRATE_GYRO', 'Calibrate gyro leads Calibrate')
    assert.match(await picker('controller').locator('aside').innerText(), /Steps you’ll see[\s\S]*Put down[\s\S]*Done/)
    await pull('right')
    assert.match(await picker('controller').innerText(), /Haptic pulse[\s\S]*Rumble motors[\s\S]*Built-in tunes · 14[\s\S]*Victory![\s\S]*Your sounds[\s\S]*\+ Make one from a MIDI file/i)
    await picker('controller').locator('[data-action="tune-3"]').focus()
    await page.waitForTimeout(100)
    assert.match(await footer(), /Hear it/)
    assert.match(await picker('controller').locator('aside').innerText(), /Victory![\s\S]*Built-in tune, from Steam[\s\S]*Hear it on the controller/)
    await pull('right')
    assert.deepEqual(await titles(), ['Change light colour', 'Light while held', 'Light brightness'])
    assert.match(await picker('controller').innerText(), /The light the rest of the time/)
    await pull('right')
    assert.deepEqual(await titles(), ['Open keyboard', 'Pause / resume mapping', 'Cycle through keys', 'Turn off controller', 'Left stick mode shift', 'Right stick mode shift'])
    // A stick that changes while this is held is that stick's Mode shift: the tile points there.
    const opened = page.evaluate(() => new Promise(resolve => window.addEventListener('jsm:open-page', event => resolve(event.detail), { once: true })))
    await picker('controller').locator('[data-action="stickShiftRIGHT"]').click()
    assert.equal(await opened, 'joysticks', 'Right stick mode shift opens the Sticks page')
    await page.locator('[data-modeshift-editor]').waitFor()
    await page.locator('[data-modeshift-editor]').locator('xpath=ancestor::*[@data-subpage][1]').locator('[data-modal-close]').first().click()
    await page.locator('[data-modeshift-editor]').waitFor({ state: 'detached' })
    await closed('controller')
    // The light: Change light colour starts from the configuration's colour.
    await open({ kind: 'controller', input: 'S' })
    await picker('controller').locator('[data-category="light"]').click()
    await picker('controller').locator('[data-action="LIGHT_BAR"]').click()
    await picker('light').locator('[data-light-use]').click()
    await closed('light')
    await closed('controller')
    assert.equal((await last()).patch.outputValue, 'LIGHT_BAR = xff8800')
    await open({ kind: 'controller', input: 'S' })
    await picker('controller').locator('[data-category="light"]').click()
    await picker('controller').locator('[data-action="LED_BRIGHTNESS"]').click()
    await picker('brightness').locator('[data-param-use]').click()
    await closed('controller')
    assert.equal((await last()).patch.outputValue, 'LED_BRIGHTNESS = 100')
    await open({ kind: 'controller', input: 'S' })
    await picker('controller').locator('[data-category="light"]').click()
    await picker('controller').locator('[data-action="heldLed"]').click()
    await picker('light').locator('[data-light-use]').click()
    await closed('light')
    await closed('controller')
    assert.deepEqual(await last(), { heldLed: true })

    // ---- Configuration choices explain the unavailable current configuration.
    await open({ kind: 'config', input: 'S' })
    assert.equal(await picker('config').locator('[aria-disabled="true"]').count(), 1)
    await picker('config').locator('.action-picker__content button:not([aria-disabled="true"])').first().click()
    await closed('config')
    assert.equal((await last()).patch.outputKind, 'loadConfig')
    await open({ kind: 'config', input: 'S', empty: true })
    assert.match(await picker('config').innerText(), /Nothing else in your library/)
    await press('E')

    // ---- Command: Command | Raw binding, config-key chips, a real keyboard, Menu is Done.
    await open({ kind: 'command', input: 'S' })
    assert.equal(await activeAttr('data-vk'), '.', 'focus starts on the keys')
    await page.keyboard.type('GYRO_SE')
    assert.ok(await picker('command').locator('[data-suggest="GYRO_SENS"]').count(), 'chips follow what is typed')
    await picker('command').locator('[data-suggest="GYRO_SENS"]').click()
    await picker('command').locator('[data-vk="3"]').focus()
    await press('S') // A types 3
    assert.equal(await picker('command').locator('[data-command-field]').innerText(), 'GYRO_SENS = 3')
    await press('W') // X backspace
    await press('+') // Menu: Done
    await closed('command')
    assert.deepEqual((await last()).patch, { outputKind: 'command', outputValue: 'GYRO_SENS =' })

    // ---- Y from any picker: Search every action, families in the kinds' order.
    await open({ kind: 'mouse', input: 'S' })
    await press('N')
    const search = page.getByRole('dialog', { name: 'Choose an action' })
    await search.waitFor()
    assert.deepEqual(await search.locator('.action-picker__tabs .action-tab[data-family]').allInnerTexts(), ['Keyboard key', 'Mouse', 'Gamepad button', 'Open a menu', 'Switch layer', 'Controller action', 'Load a config', 'Command'])
    assert.ok(await search.getByRole('searchbox').evaluate(el => el === document.activeElement), 'Search every action opens with search focused')
    await search.getByRole('searchbox').fill('victory')
    await search.locator('.action-picker__content button', { hasText: 'Victory!' }).click()
    assert.equal((await last()).patch.outputValue, 'PLAY_SOUND 3')
    await search.waitFor({ state: 'detached' })

    // ---- Nested editors (a cycle's steps, a menu's actions) keep the ActionPicker,
    // restricted to keys, mouse and pad buttons, in the kinds' names and order.
    await clear()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:picker', { detail: { kind: 'nested', input: 'S', value: '1' } })))
    const nestedPicker = page.getByRole('dialog', { name: 'Choose an action' })
    await nestedPicker.waitFor()
    assert.deepEqual(await nestedPicker.locator('.action-picker__tabs .action-tab[data-family]').allInnerTexts(), ['Keyboard key', 'Mouse', 'Gamepad button'])
    assert.ok(await nestedPicker.locator('button.key-cap[data-token="2"]').count(), 'keys keep button.key-cap and data-token')
    await nestedPicker.locator('button.key-cap[data-token="2"]').click()
    await nestedPicker.waitFor({ state: 'detached' })
    assert.equal((await last()).patch.outputValue, '2')

    // ---- Nothing overflows its aside (a long mode name, a long description).
    await open({ kind: 'controller', input: 'S' })
    await picker('controller').locator('[data-action="GYRO_OFF_ALL"]').focus()
    assert.ok(await picker('controller').locator('aside').evaluate(el => el.scrollWidth <= el.clientWidth), 'the controller action aside does not overflow')
    await press('E')
    await closed('controller')

    // ---- Pick an icon: categories on LT/RT, labelled tiles, the live preview, X No icon.
    const remainingCatalogue = page.locator('[data-picker="actions"]')
    if (await remainingCatalogue.count()) await remainingCatalogue.getByRole('button', { name: 'Cancel', exact: true }).click()
    await clear()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:icon-picker', { detail: { menu: 'Build menu', item: 'Weapon 1', value: 'lucide:house' } })))
    await picker('icon').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('[data-icon]').length > 20)
    await page.waitForTimeout(300)
    assert.equal(await picker('icon').locator('h2').innerText(), 'Pick an icon')
    assert.match(await picker('icon').innerText(), /Build menu · Weapon 1/)
    assert.match(await picker('icon').innerText(), /showing the first 160/)
    assert.match(await picker('icon').innerText(), /On the menu[\s\S]*Now[\s\S]*House/i)
    assert.ok((await picker('icon').locator('[data-icon] [class*="tileLabel"]').first().innerText()).length > 0, 'tiles carry their names')
    assert.match(await footer(), /Category/)
    await pull('right')
    assert.equal(await group('icon'), 'Game')
    await press('W')
    await picker('icon').waitFor({ state: 'detached' })
    assert.deepEqual(await last(), { icon: '' })

    // ---- The on-screen keyboard: context header, layout, buttons.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:text-entry', { cancelable: true, detail: {
      value: '', title: 'Name this action', eyebrow: 'A button · Press sends Space', hint: 'Shown on the Layout tab and the overlay', suggestions: ['Jump', 'Mantle'], input: 'S',
      onDone: value => { window.__typed = value },
    } })))
    const keyboard = page.locator('[data-text-entry]')
    await keyboard.waitFor()
    await page.waitForTimeout(200)
    assert.match(await keyboard.innerText(), /Name this action[\s\S]*A button · Press sends Space[\s\S]*A real keyboard types here too/)
    assert.match(await keyboard.innerText(), /Suggestions[\s\S]*Move up to choose one/i)
    const allKeys = await keyboard.locator('[data-key]').evaluateAll(els => els.map(el => el.dataset.key).join(''))
    const row = index => allKeys.slice(index * 11, index * 11 + 11)
    assert.equal(await row(0), '1234567890-')
    assert.equal(await row(1), "qwertyuiop'")
    assert.equal(await row(2), 'asdfghjkl,.')
    assert.equal(await activeAttr('data-key'), 'q')
    await press('S') // q
    await press('L3') // caps lock
    await press('S') // Q
    await press('L3')
    await press('N') // space
    await press('W') // backspace
    await page.keyboard.type('ump')
    await press('+') // Menu: Done
    await keyboard.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => window.__typed), 'qQump')

    assert.deepEqual(errors, [])
    console.log('pickers browser regression passed')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
