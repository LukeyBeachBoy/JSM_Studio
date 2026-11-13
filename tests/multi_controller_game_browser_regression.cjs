const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + `
        const {addAzeronCyberpunkLayout: addCyborg} = await import('/src/utils/azeronCyberpunk.ts');
        let gameSource = addCyborg('RESET_MAPPINGS\\nS = X_A\\nLEFT_STICK_MODE = LEFT_STICK\\n');
        window.__gameSource=gameSource;
        desktopBridge.listGlobalChords = async () => [];
        desktopBridge.listLibraryProfiles = async () => ['Cyberpunk'];
        desktopBridge.getActiveProfile = async () => ({name:'Cyberpunk',path:'profiles-library/Cyberpunk.txt',content:gameSource});
        desktopBridge.loadLibraryProfile = async () => ({name:'Cyberpunk',content:gameSource});
        desktopBridge.saveLibraryProfile = async (name,content) => {gameSource=content;window.__gameSource=content;return {name};};
        const subscribe = desktopBridge.onTelemetrySample;
        window.__cyborgOnline = true;
        desktopBridge.onTelemetrySample = callback => subscribe(sample => callback({...sample,activeProfile:'profiles-library/Cyberpunk.txt', devices:[
          ...(window.__cyborgOnline ? [{...sample.devices?.[0],handle:25,type:25,supportedButtons:2**36-1,status:{...sample.devices?.[0]?.status,buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0}}}] : []),
          {...sample.devices?.[0],handle:24,type:24,supportedButtons:2**33-1,status:{...sample.devices?.[0]?.status,buttons:0}}
        ]}));
      ` })
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    const onboarding = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await onboarding.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) await onboarding.getByRole('button', { name: 'Keep them', exact: true }).click()
    await page.locator('.app-shell').waitFor()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' })))
    await page.waitForSelector('[data-controller-model="azeron-cyborg"]')
    await page.getByRole('button', { name: 'Controller layouts', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /Layout for this controller$/ })
    await dialog.waitFor()
    assert(await dialog.getByRole('radio', { name: /Only for Azeron Cyborg/ }).isVisible())
    await dialog.getByRole('radio', { name: /^Use shared layout/ }).click()
    await dialog.getByRole('radio', { name: /Only for Azeron Cyborg/ }).click()
    assert.equal(await page.getByRole('button', { name: /Currently editing: Cyberpunk, unsaved changes/ }).count(), 0, 'Changing edit scope alone must not change the config')
    const add = dialog.locator('details').filter({has:page.locator('summary', {hasText:'Add another controller to this game config'})})
    assert.equal(await add.getAttribute('open'),null,'Adding a controller stays out of the main workflow')
    await add.locator('summary').click()
    await dialog.locator('#add-controller-model').selectOption('type-24')
    await dialog.getByRole('button', { name: 'Add layout', exact: true }).click()
    assert.equal(await dialog.getByRole('radio', { name: /Only for Steam Controller/ }).getAttribute('aria-checked'), 'true')
    const controllerGroup = dialog.getByRole('radiogroup', { name: 'Controller', exact: true })
    await controllerGroup.locator('button').filter({ hasText: /^Azeron Cyborg$/ }).click()
    assert.equal(await dialog.getByRole('radio', { name: /Only for Azeron Cyborg/ }).getAttribute('aria-checked'), 'true')
    await page.evaluate(() => { window.__cyborgOnline = false })
    await dialog.getByText('Azeron Cyborg (model default)', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('radio', { name: /Only for Azeron Cyborg/ }).getAttribute('aria-checked'), 'true')
    fs.mkdirSync('build-jsm-sdl/azeron-acceptance', { recursive: true })
    await page.screenshot({ path: 'build-jsm-sdl/azeron-acceptance/controller-layouts.png' })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await page.waitForSelector('[data-controller-model="azeron-cyborg"]')
    await page.screenshot({ path: 'build-jsm-sdl/azeron-acceptance/cyberpunk-layout.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: Cyberpunk Steam/Cyborg layout selection, adding a layout and offline edit destination preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
