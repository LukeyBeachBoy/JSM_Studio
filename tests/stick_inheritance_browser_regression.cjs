const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('jsm-accent', 'amber'))
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { SticksPage } = await import('/src/components/sticks/SticksPage.tsx')
      const { SettingOrigins } = await import('/src/components/SettingOrigin.tsx')
      const { controllerSettingOrigins } = await import('/src/utils/controllerSettingOrigins.ts')
      const { projectController, foldController, sharedController, resetControllerAssignment } = await import('/src/utils/controllerLayouts.ts')
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts')
      const { patchRuntimePreferences } = await import('/src/platform/preferenceStore.ts')
      const { addAzeronCyberpunkLayout } = await import('/src/utils/azeronCyberpunk.ts')
      const { layerEntries, defaultLayer } = await import('/src/utils/layers.ts')
      const importedScope = controllerSettingOrigins('# @controller type-25 LEFT_STICK_ROTATION = 12', 'type-25-device-1111111111111111', '# @controller type-25-device-1111111111111111 LEFT_STICK_ROTATION = 25', {})
      if (importedScope.origins.LEFT_STICK_ROTATION !== 'Imported controller layout' || importedScope.sourceTargets.LEFT_STICK_ROTATION !== undefined) throw Error('Imported instance precedence must remain inherited')
      const sharedScope = controllerSettingOrigins('LEFT_STICK_ROTATION = 5', 'type-25', '', {})
      if (sharedScope.origins.LEFT_STICK_ROTATION !== 'Shared game layout' || sharedScope.sourceTargets.LEFT_STICK_ROTATION !== '') throw Error('Shared game settings must link to shared scope')
      const preset = projectController(addAzeronCyberpunkLayout(''), 'type-25')
      for (const key of Object.keys(layerEntries(defaultLayer(preset)))) {
        if (/^LEFT_STICK_(DEADZONE|DIRECTION|CARDINAL|ROTATION|CALIBRATION|RESTRICTOR)/.test(key)) throw Error('Preset shadows global preference: ' + key)
      }
      const globals = { LEFT_STICK_DEADZONE_INNER: '.35', LEFT_STICK_DEADZONE_OUTER: '0', LEFT_STICK_CARDINAL_WIDTH: '65', LEFT_STICK_ROTATION: '15', LEFT_STICK_CALIBRATION: 'ON', LEFT_STICK_RESTRICTOR_RING: 'ON' }
      window.updateStickGlobals = async values => patchRuntimePreferences(await desktopBridge.setCyborgStickDefaults({ ...globals, ...values }))
      await window.updateStickGlobals({})
      const host = document.createElement('div'); host.id = 'inheritance-test'
      host.style.cssText = 'position:fixed;inset:0;background:var(--bg-app,#10151b);color:var(--text-1);z-index:39;overflow:auto;padding:32px;box-sizing:border-box'
      document.body.append(host)
      const first = 'type-25-device-1111111111111111', second = 'type-25-device-2222222222222222'
      function Test() {
        const [target, setTarget] = React.useState(first)
        const [source, setSource] = React.useState([
          'LEFT_STICK_MODE = LEFT_STICK',
          '# @controller type-25 LEFT_STICK_MODE = NO_MOUSE',
          '# @controller type-25 LEFT_STICK_DEADZONE_INNER = .12',
          '# @controller type-25 LEFT_STICK_DEADZONE_OUTER = .02',
          '# @controller type-25 JOY3 = TAB',
          `# @controller ${second} LEFT_STICK_DEADZONE_INNER = .25`,
          `# @controller ${second} JOY3 = ESC`,
        ].join('\n'))
        window.stickSource = source; window.stickTarget = target; window.setStickTarget = setTarget
        window.otherStick = projectController(source, second); window.steamStick = projectController(source, 'type-24')
        const text = projectController(source, target)
        const sources = controllerSettingOrigins(source, target, '', {})
        const setText = update => setSource(old => {
          const before = projectController(old, target)
          return foldController(old, target, before, typeof update === 'function' ? update(before) : update, sharedController(old, target))
        })
        return React.createElement(SettingOrigins.Provider, { value: { ...sources, text,
          editSource: key => setTarget(sources.sourceTargets[key]),
          reset: key => setSource(old => resetControllerAssignment(old, target, key)),
        } }, React.createElement(SticksPage, {
          readText: text, setText,
          liveDevice: { type: 25, handle: 1, controllerId: first, status: { buttons: 0, leftStick: { x: 0, y: .03 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 } } },
          inputs: { left: { directions: [], rotation: [] }, right: { directions: [], rotation: [] } },
          onModeChange: () => {}, renderButton: () => null, renderModeshifts: () => null,
          modeshiftTarget: () => ({ kind: 'leftStick' }), describe: () => ({ binding: '' }), wheelMenus: {}, wheelSegments: { left: [], right: [] }, virtualControllerType: 'XBOX',
        }))
      }
      createRoot(host).render(React.createElement(Test))
    })
    const host = page.locator('#inheritance-test')
    const inner = host.getByRole('slider').filter({ hasText: 'Ignore small movement' })
    const outer = host.getByRole('slider').filter({ hasText: 'Outer deadzone' })
    await inner.waitFor()
    assert.equal(await inner.getAttribute('aria-valuenow'), '12')
    assert.match(await inner.innerText(), /From Controller model layout/)
    assert.equal(await inner.getByRole('button', { name: 'Use Default' }).count(), 0, 'Inherited model value cannot be reset in an empty instance scope')
    assert.equal(await inner.getAttribute('aria-valuenow'), '12')
    await inner.getByRole('button', { name: 'Edit source layout' }).click()
    await page.waitForFunction(() => window.stickTarget === 'type-25')
    await inner.getByRole('button', { name: 'Use Default' }).click()
    await page.waitForFunction(() => !window.stickSource.includes('type-25 LEFT_STICK_DEADZONE_INNER'))
    assert.equal(await inner.getAttribute('aria-valuenow'), '35')
    assert.match(await inner.innerText(), /Global preferences/)
    await outer.getByRole('button', { name: 'Use Default' }).click()
    assert.equal(await outer.getAttribute('aria-valuenow'), '0')
    await page.evaluate(() => window.setStickTarget('type-25-device-1111111111111111'))
    await inner.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await inner.getAttribute('aria-valuenow'), '36')
    assert((await page.evaluate(() => window.stickSource)).includes('type-25-device-1111111111111111 LEFT_STICK_DEADZONE_INNER = 0.36'))
    await inner.getByRole('button', { name: 'Use Default' }).click()
    assert.equal(await inner.getAttribute('aria-valuenow'), '35')
    await page.evaluate(() => window.updateStickGlobals({ LEFT_STICK_DEADZONE_INNER: '.4' }))
    await page.waitForFunction(() => [...document.querySelectorAll('#inheritance-test [role=slider]')].find(el => el.textContent.includes('Ignore small movement'))?.getAttribute('aria-valuenow') === '40')
    assert((await page.evaluate(() => window.otherStick)).includes('LEFT_STICK_DEADZONE_INNER = .25'), 'Other identical controller keeps its own setting')
    assert((await page.evaluate(() => window.otherStick)).includes('JOY3 = ESC'))
    assert(!(await page.evaluate(() => window.steamStick)).includes('DEADZONE_INNER'))
    for (const label of ['Cardinal direction width', 'Direction stability', 'Start keyboard movement', 'Release margin']) {
      assert.equal(await host.getByRole('slider').filter({ hasText: label }).count(), 1, label + ' is on the main page')
    }
    fs.mkdirSync('build-jsm-sdl/stick-inheritance', { recursive: true })
    for (const [name, width, height] of [['desktop', 1500, 1050], ['minimum', 900, 600]]) {
      await page.setViewportSize({ width, height }); await host.evaluate(el => { el.scrollTop = 0 })
      assert(await host.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'No horizontal overflow: ' + name)
      await page.screenshot({ path: `build-jsm-sdl/stick-inheritance/${name}.png` })
      await inner.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `build-jsm-sdl/stick-inheritance/${name}-deadzones.png` })
      await host.getByRole('slider').filter({ hasText: 'Release margin' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `build-jsm-sdl/stick-inheritance/${name}-directions.png` })
    }
    await host.getByRole('button', { name: /Fine-tune/ }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Fine-tune' }).last()
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    console.log('PASS: model/instance/global inheritance, actionable reset, identical-device isolation, preset fallback, visible deadzones/directions and responsive layout')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
