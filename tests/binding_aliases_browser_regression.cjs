// Isolated renderer: legacy shared assignments remain editable on physical cards.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const PROFILE = 'RESET_MAPPINGS\nprofiles-library/Template.txt\nL,SL = C # shared alternate\nUNKNOWN_ALIAS = preserve exactly\n'
const TEMPLATE = 'SL = A # shared base\n# @label SL = Shared rear\nSR = B\n'
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(([profile, template]) => {
      const profiles = { Aliases: profile, Template: template }
      window.__lastSaved = ''
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Aliases', path: 'profiles-library/Aliases.txt', content: profiles.Aliases }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        readConfigFile: async path => profiles[String(path).replace(/^profiles-library\//, '').replace(/\.txt$/, '')] ?? null,
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Aliases.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] })
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer)
      } }
    }, [PROFILE, TEMPLATE])
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 3000 }).catch(() => {})
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = command => page.locator(`details[data-input-command="${command}"]`).first()
    const sheetOf = command => page.locator(`details[data-input-command="${command}"][open] [data-binding-sheet]`)
    const chip = scope => scope.locator('[data-chip-command]').first()
    const chipLabel = async scope => (await chip(scope).getAttribute('aria-label')).replace(/^Choose action: /, '')
    const eff = (text, key) => {
      const lines = text.split('\n')
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop()
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop()
      const line = own ? own.slice('# @controller type-24 '.length) : shared
      return line ? line.slice(key.length + 3).trim() : undefined
    }
    const pickLetter = async letter => {
      const picker = page.getByRole('dialog', { name: /Pick a key/ })
      await picker.waitFor()
      await picker.getByRole('button', { name: 'Letters', exact: true }).click()
      await picker.getByRole('button', { name: new RegExp(`^${letter}( ·|$)`) }).first().click()
      await picker.waitFor({ state: 'detached' })
    }
    const closeAll = async () => {
      for (let i = 0; i < 5 && await page.locator('[data-subpage], .sheet-layer').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150) }
    }
    const openShift = async command => {
      await sheetOf(command).locator('[data-fold="while-holding"]').click()
      await page.locator('[data-modeshift-row="L"]').click()
      await page.getByRole('button', { name: /Every way of pressing/ }).click()
      const shifted = page.locator(`[data-input-command="L,${command}"]`).first()
      await shifted.locator('[data-binding-sheet]').waitFor()
      return shifted
    }

    await card('LSL').locator(':scope > summary').click()
    assert.equal(await chipLabel(sheetOf('LSL')), 'A', 'imported alias appears on physical L4')
    assert.equal(await page.locator('details[data-input-command="LSL"][open] .sheet__title').innerText(), 'Shared rear', 'shared action name appears on physical card')
    await chip(sheetOf('LSL')).click()
    await pickLetter('Z')
    await page.waitForFunction(() => /Choose action: Z/.test(document.querySelector('details[data-input-command="LSL"][open] [data-chip-command]')?.getAttribute('aria-label') ?? ''))
    let shifted = await openShift('LSL')
    assert.equal(await chipLabel(shifted), 'C', 'shared alternate appears in the physical input sheet')
    await chip(shifted).click()
    await pickLetter('J')
    await page.waitForFunction(() => /Choose action: J/.test(document.querySelector('[data-input-command="L,LSL"] [data-chip-command]')?.getAttribute('aria-label') ?? ''))
    await closeAll()
    await card('RSL').locator(':scope > summary').click()
    assert.equal(await chipLabel(sheetOf('RSL')), 'A', 'shared sibling still reads template')
    assert.equal(await page.locator('details[data-input-command="RSL"][open] .sheet__title').innerText(), 'Shared rear', 'sibling inherits the shared action name')
    shifted = await openShift('RSL')
    assert.equal(await chipLabel(shifted), 'C', 'shared sibling alternate remains unchanged')
    await closeAll()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /LSL = Z/.test(window.__lastSaved))
    const saved = await page.evaluate(() => window.__lastSaved)
    assert.equal(eff(saved, 'LSL'), 'Z')
    assert.equal(eff(saved, 'L,LSL'), 'J')
    assert.match(saved, /^L,SL = C # shared alternate$/m)
    assert.match(saved, /^profiles-library\/Template.txt$/m)
    assert.match(saved, /^UNKNOWN_ALIAS = preserve exactly$/m)
    assert.ok(!/^SL = A/m.test(saved), 'template is not inlined')
    // X Clear on Press: the inherited input saves an explicit unbound override.
    await card('LSL').locator(':scope > summary').click()
    await sheetOf('LSL').locator('[data-when="regular"]').focus()
    await page.keyboard.press('x')
    await sheetOf('LSL').locator('[data-chip-command]').first().waitFor({ state: 'detached' })
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(300)
    const cleared = await page.evaluate(() => window.__lastSaved)
    assert.match(eff(cleared, 'LSL') ?? '', /^NONE(?:\s*#.*)?$/, 'clearing inherited input must save an explicit unbound override:\n' + cleared)
    await closeAll()
    await card('RSL').locator(':scope > summary').click()
    assert.equal(await chipLabel(sheetOf('RSL')), 'A', 'clearing one inherited alias input preserves sibling')
    assert.deepEqual(errors, [])
    console.log('PASS: imported shared base and alternate bindings edit on physical rear cards without changing either sibling or source import')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
