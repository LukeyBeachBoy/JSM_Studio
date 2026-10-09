// Settings ▸ Controller ▸ On-screen keyboard (console v2, SettingsControllerMore):
// the feedback type in Advanced, Haptics as a value row that ◂ ▸ change
// directly (write-through, D1), serialized saves that never let an older
// answer land last, Off making the row unavailable-with-reason, and the
// layout as picture cards.
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
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })))
  const section = page.locator('.keyboard-settings')
  await section.waitFor()
  const prefs = () => page.evaluate(async () => (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences())
  assert.ok(await section.evaluate(el => Boolean(el.querySelector('.keyboard-settings-preview')?.compareDocumentPosition(el.querySelector('.keyboard-settings-legend')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the shortcut legend follows the preview')
  // Advanced holds the feedback type: every shared effect, one at a time.
  await section.getByRole('button', { name: /^Advanced/ }).click()
  const types = page.getByRole('radiogroup', { name: 'Keyboard haptic feedback type' })
  await types.waitFor()
  for (const name of ['Tick', 'Click', 'Tone', 'Rumble (back motor)', 'Sweep', 'Pulse (Steam, fixed strength)', 'Tap (Steam click + pulse)']) {
   await types.getByRole('radio', { name: new RegExp(`^${name.replace(/[()+]/g, '\\$&')}`) }).click()
   await types.getByRole('radio', { name: new RegExp(`^${name.replace(/[()+]/g, '\\$&')}`) }).and(page.locator('[aria-checked="true"]')).waitFor()
  }
  await types.getByRole('radio', { name: /^Off/ }).click()
  await page.waitForFunction(async () => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).hapticType === 'off')
  await page.keyboard.press('Escape')
  await page.locator('[data-subpage]').waitFor({ state: 'detached' })
  const haptics = section.locator('[data-keyboard-row="haptics"]')
  assert.equal(await haptics.getAttribute('aria-disabled'), 'true', 'Off makes Haptics unavailable')
  assert.match(await haptics.getAttribute('data-reason'), /Feedback is off/)
  await section.getByRole('button', { name: /^Advanced/ }).click()
  await types.getByRole('radio', { name: /^Rumble/ }).click()
  await page.keyboard.press('Escape')
  await page.locator('[data-subpage]').waitFor({ state: 'detached' })
  assert.equal(await haptics.getAttribute('aria-disabled'), null)
  // Slow native writes: each ◂ ▸ step shows at once, writes run one at a
  // time, and an older answer never restores an earlier value.
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
  const original = Number(await haptics.getAttribute('aria-valuenow'))
  await haptics.focus()
  for (let i = 1; i <= 4; i++) {
   await page.keyboard.press('ArrowRight')
   assert.equal(await haptics.getAttribute('aria-valuenow'), String(original + 5 * i))
   assert.ok(await haptics.evaluate(el => document.activeElement === el), 'the row keeps focus during each save')
  }
  await page.waitForFunction(() => window.keyboardWrites.completed === 4)
  assert.equal(await haptics.getAttribute('aria-valuenow'), String(original + 20), 'older responses do not restore an earlier value')
  assert.equal((await prefs()).hapticIntensity, original + 20)
  assert.equal(await page.evaluate(() => window.keyboardWrites.maxActive), 1, 'preference writes run in order')
  // Shift+arrow is the fine step; Y puts it back.
  await page.keyboard.press('Shift+ArrowLeft')
  await page.waitForFunction(o => document.querySelector('[data-keyboard-row="haptics"]').getAttribute('aria-valuenow') === String(o + 19), original)
  await page.keyboard.press('y')
  await page.waitForFunction(async () => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).hapticIntensity === 35)
  // Layout: picture cards; Daisywheel keeps the feedback choice.
  await section.getByRole('radio', { name: /^Daisywheel/ }).click()
  await page.waitForFunction(async () => (await (await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).layout === 'daisywheel')
  assert.equal((await prefs()).hapticType, 'rumble')
  await page.screenshot({path:'tmp/keyboard-haptics.png'})
  assert.deepEqual(errors,[])
  assert.equal(await page.locator('vite-error-overlay').count(),0)
  console.log('PASS: shared effects in Advanced, write-through Haptics with serialized saves, fine step and reset, Off unavailable-with-reason, layout cards, no browser errors')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
