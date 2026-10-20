// Verify the guide from the actual Library entry and saved configuration,
// including controller Back, custom digits, and native parser restrictions.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const profile = fs.readFileSync(path.join(__dirname, '../JoyShockMapper/dist/WindowsSignIn.txt'), 'utf8')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => page.getByRole('button', { name: 'Keep them', exact: true }).click())
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock')
    await page.waitForFunction(() => window.__pad && window.electronAPI?.saveLibraryProfile && document.querySelector('.titlebar'))
    const save = async text => {
      await page.evaluate(async text => {
        await window.electronAPI.saveLibraryProfile('Windows Sign-in', text)
        window.dispatchEvent(new Event('jsm:library-changed'))
      }, text)
    }
    await save(profile)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })))
    const card = page.locator('[data-profile="Windows Sign-in"] button').first()
    await card.waitFor()
    await card.focus()
    const open = page.locator('[data-sign-in-reference]')
    await open.waitFor()
    await open.click()
    const guide = page.locator('[data-sign-in-guide]')
    await guide.waitFor()
    await page.waitForTimeout(350) // let the shared SubPage opening animation finish
    assert.ok(await page.locator('[data-sign-in-guide-back]').evaluate(element => element === document.activeElement), 'controller focus stays on the reference page')
    assert.equal(await guide.locator('[data-input="N"]').getAttribute('aria-label'), 'Y: 1')
    assert.equal(await guide.locator('[data-input="E"]').getAttribute('aria-label'), 'B: 2')
    assert.equal(await guide.locator('[data-input="S"]').getAttribute('aria-label'), 'A: 3')
    assert.equal(await guide.locator('[data-input="W"]').getAttribute('aria-label'), 'X: 4')
    assert.equal(await guide.locator('[data-input="RIGHT"]').getAttribute('aria-label'), '→: 6')
    assert.match(await guide.textContent(), /Hold Quick Access \+ tap Y.*release both/)
    await page.screenshot({ path: path.join(__dirname, '../tmp/windows-sign-in-guide-ui.png') })
    await page.evaluate(() => window.__pad.press(['E']))
    await guide.waitFor({ state: 'hidden' })
    await save(profile + '\nS = 8\nE = "<script>alert(1)</script>"\n')
    await page.waitForTimeout(500)
    await open.click()
    await page.waitForFunction(() => document.querySelector('[data-sign-in-guide] [data-input="S"]')?.getAttribute('aria-label') === 'A: 8')
    assert.equal(await guide.locator('[data-input="E"]').getAttribute('aria-label'), 'B: —')
    assert.equal(await guide.locator('script').count(), 0)
    const values = await page.evaluate(async () => {
      const { windowsSignInBindings } = await import('/src/utils/windowsSignInGuide.ts')
      return [...windowsSignInBindings('S = 1\nS = 1 = 2\nE = 3 # comment\nHOME = LWINDOWS\nN = 1234\nW = ENTER\n')]
    })
    assert.deepEqual(values, [['E', '3'], ['W', 'ENTER']])
    assert.deepEqual(errors, [])
    console.log('PASS: Library reference opens; digit positions and power shortcut; controller Back; saved edits update the guide; macros and invalid values rejected')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
