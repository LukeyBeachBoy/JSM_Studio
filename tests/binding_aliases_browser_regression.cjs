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
    await card('LSL').locator(':scope > summary').click()
    const base = card('LSL').locator('[data-command-row]').first().getByRole('button', { name: /^Choose action/ })
    assert.equal(await base.innerText(), 'A', 'imported alias appears on physical L4')
    assert.equal(await card('LSL').getByText('Shared rear', { exact: true }).count(), 1, 'shared action name appears on physical card')
    await base.click()
    await page.getByRole('dialog', { name: 'Choose an action' }).locator('button.key-cap').filter({ hasText: /^Z$/ }).click()
    assert.equal(await base.innerText(), 'Z')
    await card('LSL').locator('[data-modeshift-row="L"]').getByRole('button', { name: 'Modeshift settings' }).click()
    const shifted = page.locator('[data-input-command="L,LSL"]').first().locator('[data-command-row]').first().getByRole('button', { name: /^Choose action/ })
    assert.equal(await shifted.innerText(), 'C', 'shared alternate appears in the physical input sheet')
    await shifted.click()
    await page.getByRole('dialog', { name: 'Choose an action' }).locator('button.key-cap').filter({ hasText: /^J$/ }).click()
    assert.equal(await shifted.innerText(), 'J')
    await page.keyboard.press('Escape')
    await card('RSL').locator(':scope > summary').click()
    assert.equal(await card('RSL').locator('[data-command-row]').first().getByRole('button', { name: /^Choose action/ }).innerText(), 'A', 'shared sibling still reads template')
    assert.equal(await card('RSL').getByText('Shared rear', { exact: true }).count(), 1, 'sibling inherits the shared action name')
    await card('RSL').locator('[data-modeshift-row="L"]').getByRole('button', { name: 'Modeshift settings' }).click()
    assert.equal(await page.locator('[data-input-command="L,RSL"]').first().locator('[data-command-row]').first().getByRole('button', { name: /^Choose action/ }).innerText(), 'C', 'shared sibling alternate remains unchanged')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /LSL = Z/.test(window.__lastSaved))
    const saved = await page.evaluate(() => window.__lastSaved)
    assert.match(saved, /^LSL = Z$/m)
    assert.match(saved, /^L,LSL = J$/m)
    assert.match(saved, /^L,SL = C # shared alternate$/m)
    assert.match(saved, /^profiles-library\/Template.txt$/m)
    assert.match(saved, /^UNKNOWN_ALIAS = preserve exactly$/m)
    assert.ok(!/^SL = A/m.test(saved), 'template is not inlined')
    await card('LSL').locator('[data-command-row]').first().getByRole('button', { name: 'Command settings', exact: true }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await card('LSL').locator('[data-command-row]').first().waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(300)
    const cleared = await page.evaluate(() => window.__lastSaved)
    assert.match(cleared, /^LSL = NONE(?:\s*#.*)?$/m, 'clearing inherited input must save an explicit unbound override:\n' + cleared)
    assert.equal(await card('RSL').locator('[data-command-row]').first().getByRole('button', { name: /^Choose action/ }).innerText(), 'A', 'clearing one inherited alias input preserves sibling')
    assert.deepEqual(errors, [])
    console.log('PASS: imported shared base and alternate bindings edit on physical rear cards without changing either sibling or source import')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
