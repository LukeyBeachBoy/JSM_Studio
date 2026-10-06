const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true })
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:1420/?mock')
  const onboarding = page.getByRole('dialog', { name: 'Controller power-on sound' })
  if (await onboarding.waitFor({state:'visible',timeout:2500}).then(()=>true).catch(()=>false)) await onboarding.getByRole('button',{name:'Keep them',exact:true}).click()
  await page.getByRole('button', { name: /^Preferences/ }).first().click()
  const section = page.locator('.keyboard-settings')
  await section.waitFor()
  assert.ok(await section.evaluate(el => Boolean(el.querySelector('.keyboard-settings-preview').compareDocumentPosition(el.querySelector('.keyboard-settings-haptics')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Haptics follows the preview')
  await section.locator('.keyboard-settings-haptics summary').click()
  const type = section.getByRole('combobox', { name: 'Keyboard haptic feedback type' })
  await type.click()
  for (const name of ['Tick', 'Click', 'Tone', 'Rumble (back motor)', 'Sweep', 'Pulse (Steam, fixed strength)', 'Tap (Steam click + pulse)']) {
   await page.getByRole('option', {name,exact:true}).click()
   await type.getByText(name,{exact:true}).waitFor()
   await type.click()
  }
  await page.getByRole('option', {name:'Tick',exact:true}).click()
  const intensity = section.getByRole('textbox', {name:'Haptic intensity',exact:true})
  await intensity.fill('70'); await intensity.press('Enter')
  await page.waitForFunction(async () => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).hapticIntensity === 70)
  await type.click(); await page.getByRole('option',{name:'Off (stop)',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Haptic intensity"]').disabled)
  await type.click(); await page.getByRole('option',{name:'Rumble (back motor)',exact:true}).click()
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Haptic intensity"]').disabled)
  await section.getByRole('combobox',{name:'Keyboard layout',exact:true}).click()
  await page.getByRole('option',{name:'Daisywheel',exact:true}).click()
  await type.getByText('Rumble (back motor)',{exact:true}).waitFor()
  await intensity.focus(); await intensity.press('ArrowUp'); await intensity.press('Enter')
  // Slow native preference writes must not disable a focused controller slider,
  // leave adjust mode, or let a stale response restore an earlier value.
  await page.evaluate(async () => {
   const { keyboard } = await import('/src/keyboard/bridge.ts')
   const save = keyboard.savePreferences
   window.keyboardWrites = { active: 0, maxActive: 0, completed: 0 }
   keyboard.savePreferences = async preferences => {
    const state = window.keyboardWrites
    state.active++; state.maxActive = Math.max(state.maxActive, state.active)
    try { await new Promise(resolve => setTimeout(resolve, 180)); return await save(preferences) }
    finally { state.active--; state.completed++ }
   }
  })
  const slider = section.getByRole('slider', {name:'Haptic intensity',exact:true})
  const original = Number(await slider.getAttribute('aria-valuenow'))
  await slider.focus(); await slider.press('Enter')
  for (let i = 1; i <= 4; i++) {
   await slider.press('ArrowRight')
   assert.equal(await slider.getAttribute('aria-valuenow'), String(original + i))
   assert.ok(await slider.evaluate(el => document.activeElement === el && el.closest('[data-adjusting="true"]') && !el.hasAttribute('data-disabled')), 'slider retains focus and adjust mode during each save')
  }
  await page.waitForFunction(() => window.keyboardWrites.completed === 4)
  assert.equal(await slider.getAttribute('aria-valuenow'), String(original + 4), 'older responses do not restore an earlier value')
  await slider.press('Escape')
  await page.waitForFunction(async original => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).hapticIntensity === original, original)
  assert.equal(await slider.getAttribute('aria-valuenow'), String(original), 'B/Escape reverts all nudges')
  await slider.press('Enter'); await slider.press('ArrowRight'); await slider.press('Enter')
  await page.waitForFunction(async original => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).hapticIntensity === original + 1, original)
  assert.equal(await page.evaluate(() => window.keyboardWrites.maxActive), 1, 'preference writes run in order')
  await slider.press('ArrowDown')
  assert.ok(await slider.evaluate(el => document.activeElement !== el), 'D-pad resumes focus navigation after commit')
  await section.locator('.keyboard-settings-haptics').scrollIntoViewIfNeeded()
  await page.screenshot({path:'tmp/keyboard-haptics.png'})
  assert.deepEqual(errors,[])
  assert.equal(await page.locator('vite-error-overlay').count(),0)
  console.log('PASS: shared effects, accordion placement, delayed-save repeated D-pad adjustment, focus retention, serialized writes, commit/revert and no browser errors')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
