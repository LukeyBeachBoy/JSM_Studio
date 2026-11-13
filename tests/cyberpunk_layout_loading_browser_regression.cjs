const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const source = fs.readFileSync('tests/fixtures/cyberpunk-layout-loading.txt', 'utf8')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: await response.text() + `
        const cyberpunk = ${JSON.stringify(source)};
        const oldCyberpunk = cyberpunk.split(/\\r?\\n/).filter(line => !/^# @controller(?:-layout)? type-25(?: |$)/.test(line)).join('\\n');
        desktopBridge.listLibraryProfiles = async () => ['Cyberpunk','Desktop'];
        desktopBridge.getActiveProfile = async () => ({name:'Cyberpunk',path:'profiles-library/Cyberpunk.txt',content:oldCyberpunk});
        desktopBridge.loadLibraryProfile = async name => ({name,content:name === 'Cyberpunk' ? (window.__updatedCyberpunk ? cyberpunk : oldCyberpunk) : 'RESET_MAPPINGS\\nJOY1 = ENTER\\n'});
        const subscribeForCyberpunk = desktopBridge.onTelemetrySample;
        desktopBridge.onTelemetrySample = callback => subscribeForCyberpunk(sample => callback({...sample, devices:[{...sample.devices?.[0],type:25,handle:25,controllerId:'type-25-device-00000000000076cd'}]}));
      ` })
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1424/?mock')
    await page.locator('.app-shell').waitFor()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', {detail:'overview'})))
    await page.getByRole('button', {name:'JOY1: Not set', exact:true}).waitFor()
    await page.getByRole('button', {name:'Currently editing: Cyberpunk', exact:true}).click()
    await page.getByRole('menuitem', {name:'Desktop', exact:true}).click()
    await page.getByRole('button', {name:'Currently editing: Desktop', exact:true}).waitFor()
    await page.evaluate(() => { window.__updatedCyberpunk = true })
    await page.getByRole('button', {name:'Currently editing: Desktop', exact:true}).click()
    await page.getByRole('menuitem', {name:'Cyberpunk Live', exact:true}).click()
    await page.getByRole('button', { name: /JOY1: Dodge/ }).waitFor()
    await page.getByRole('button', { name: 'Driving', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Weapons · mouse Back', exact: true }).waitFor()
    assert.equal(await page.getByText('No layers yet · make one on the Layers tab').count(), 0)
    // Exercise the same hook's real-draft path as well: refreshing clean files
    // must not sacrifice intentional unsaved edits or revive discarded edits.
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const {useProfileLibrary} = await import('/src/hooks/useProfileLibrary.ts')
      const noop = () => {}
      function Harness() {
        const [text, setText] = React.useState('')
        const library = useProfileLibrary({configText:text,resetConfigHistory:setText,setConfigText:setText,setAppliedConfig:noop,setStatusMessage:noop,resetPendingSensitivityChanges:noop})
        window.__libraryHarness = {text,setText,library}
        return null
      }
      const host = document.createElement('div'); document.body.append(host)
      createRoot(host).render(React.createElement(Harness))
    })
    await page.waitForFunction(() => window.__libraryHarness?.library.currentLibraryProfile === 'Cyberpunk')
    await page.evaluate(() => window.__libraryHarness.setText(text => text + '\nJOY1 = Z\n'))
    await page.waitForFunction(() => window.__libraryHarness.text.endsWith('JOY1 = Z\n'))
    await page.evaluate(() => window.__libraryHarness.library.handleLoadProfileFromLibrary('Desktop'))
    await page.waitForFunction(() => window.__libraryHarness.library.currentLibraryProfile === 'Desktop')
    await page.evaluate(() => window.__libraryHarness.library.handleLoadProfileFromLibrary('Cyberpunk'))
    await page.waitForFunction(() => window.__libraryHarness.library.currentLibraryProfile === 'Cyberpunk')
    assert(await page.evaluate(() => window.__libraryHarness.text.endsWith('JOY1 = Z\n')), 'Unsaved edits survive switching')
    await page.evaluate(() => window.__libraryHarness.library.handleLoadProfileFromLibrary('Desktop', true))
    await page.waitForFunction(() => window.__libraryHarness.library.currentLibraryProfile === 'Desktop')
    await page.evaluate(() => window.__libraryHarness.library.handleLoadProfileFromLibrary('Cyberpunk'))
    await page.waitForFunction(() => window.__libraryHarness.library.currentLibraryProfile === 'Cyberpunk')
    assert(!await page.evaluate(() => window.__libraryHarness.text.endsWith('JOY1 = Z\n')), 'Discarded edits stay discarded')
    console.log('PASS: updated Cyberpunk bindings and both layers reload; unsaved drafts survive; discarded drafts stay discarded')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
