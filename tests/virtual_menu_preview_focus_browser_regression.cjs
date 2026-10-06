// Isolated renderer with simulated native menu telemetry. No physical output.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const expectControllerInputRing = require('./controller_input_focus_helper.cjs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
      await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    })
    await page.addInitScript(() => {
      document.hasFocus = () => true
      for (const [key, value] of Object.entries({ width: 2560, availWidth: 2560, height: 1440, availHeight: 1440 })) Object.defineProperty(window.screen, key, { value, configurable: true })
      let content = localStorage.getItem('__menuTestProfile') || 'RESET_MAPPINGS\nLEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_MENU_FUTURE = untouched\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Menu test', path: 'profiles-library/Menu test.txt', content }),
        listLibraryProfiles: async () => ['Menu test'], loadLibraryProfile: async () => ({ name: 'Menu test', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; localStorage.setItem('__menuTestProfile', next); window.__menuSaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.__menuButtons = 0
      window.__menuStick = { x: 0, y: 0 }
      window.__menuLeftStick = { x: 0, y: 0 }
      window.__menuCursor = undefined
      window.__menuSelected = 2
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ activeProfile: 'AppNavigation.txt', devices: [{ handle: 1, type: 24, status: { buttons: window.__menuButtons, leftStick: window.__menuLeftStick, rightStick: window.__menuStick, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, virtualMenus: [{ id: 'menu1', source: 1, open: true, selected: window.__menuSelected, cursor: window.__menuCursor }] } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()

    await page.getByRole('button', { name: 'Virtual menus', exact: true }).click()
    const row = (label, scope = page) => scope.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) })
    const choose = async (label, value) => { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: value, exact: true }).click() }
    assert.equal(await page.getByText('No menus yet.', { exact: true }).count(), 1)
    assert.equal(await page.locator('.virtual-menus__editor').innerText(), '', 'empty library does not repeat page instructions')
    await page.getByRole('button', { name: 'Create virtual menu', exact: true }).click()
    await page.getByPlaceholder('Name this menu', { exact: true }).fill('Equipment # wheel')
    await page.getByPlaceholder('Name this menu', { exact: true }).press('Enter')
    const editor = page.locator('[data-virtual-menus-page]')
    await editor.getByRole('heading', { name: 'Equipment # wheel', exact: true }).waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0, 'the menu editor is a full page')

    assert.equal(await editor.getByRole('region', { name: 'Appearance', exact: true }).count(), 1)
    assert.equal(await editor.getByRole('region', { name: 'Behaviour and controls', exact: true }).count(), 1)
    const preview = page.locator('.virtual-menu-preview')
    for (const layout of ['Radial wheel', 'Touch grid', 'Hotbar']) {
      await choose('Menu layout', layout)
      await preview.getByRole('button', { name: 'Edit actions', exact: true }).click()
      const actions = preview.locator('[data-nav-skip][role="button"]')
      if (layout === 'Radial wheel') {
        // Continuous angles, including diagonals, select directly without key repeats.
        for (const stick of ['__menuLeftStick', '__menuStick']) {
          for (let index = 0; index < await actions.count(); index++) {
            await page.evaluate(({ stick, index, count }) => {
              const angle = index * 2 * Math.PI / count
              window[stick] = { x: Math.sin(angle), y: Math.cos(angle) }
            }, { stick, index, count: await actions.count() })
            await page.waitForTimeout(220)
            assert.equal(await actions.evaluateAll(nodes => nodes.indexOf(document.activeElement)), index, `${stick} selects segment ${index + 1}`)
          }
          await page.evaluate(stick => { window[stick] = { x: 0, y: 0 } }, stick)
          await page.waitForTimeout(150)
        }
        await actions.first().focus()
        for (let step = 1; step <= (await actions.count()) * 2; step++) {
          await page.keyboard.press('ArrowDown')
          assert.equal(await actions.evaluateAll(nodes => nodes.indexOf(document.activeElement)), step % await actions.count(), 'Down cycles beyond the bottom and wraps')
        }
        for (let step = 1; step <= await actions.count(); step++) {
          await page.evaluate(() => { window.__menuButtons = 1 << 1 }) // native D-pad Down
          await page.waitForTimeout(160)
          await page.evaluate(() => { window.__menuButtons = 0 })
          await page.waitForTimeout(160)
          assert.equal(await actions.evaluateAll(nodes => nodes.indexOf(document.activeElement)), step % await actions.count(), 'native D-pad cycles every action')
        }
      }
      const reached = new Set([0])
      const queue = [0]
      while (queue.length) {
        const index = queue.shift()
        for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
          await actions.nth(index).focus()
          await page.keyboard.press(key)
          const next = await actions.evaluateAll(nodes => nodes.indexOf(document.activeElement))
          assert.ok(next >= 0)
          if (!reached.has(next)) { reached.add(next); queue.push(next) }
        }
      }
      assert.equal(reached.size, await actions.count(), layout + ' every action reachable with directions')
      await actions.first().focus()
      await page.evaluate(() => { window.__menuStick = { x: 1, y: 0 } })
      await page.waitForTimeout(650)
      assert.equal(await actions.evaluateAll(nodes => nodes.includes(document.activeElement)), true, 'simulated stick stays inside preview')
      await page.evaluate(() => { window.__menuStick = { x: 0, y: 0 } })
      await page.waitForTimeout(150)
      const visited = new Set()
      // Tab reaches every action, including optional centre actions; arrows stay contained at all edges.
      for (let i = 0; i < await actions.count(); i++) {
        visited.add(await page.evaluate(() => document.activeElement.getAttribute('aria-label')))
        await page.keyboard.press('Tab')
      }
      assert.equal(visited.size, await actions.count())
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        for (let i = 0; i < 15; i++) {
          await page.keyboard.press(key)
          assert.equal(await preview.evaluate(node => node.contains(document.activeElement)), true, layout + ' retains directional focus')
        }
      }
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-direction', { detail: 'ArrowRight' })))
      assert.equal(await preview.evaluate(node => node.contains(document.activeElement)), true)
      await page.keyboard.press('Enter')
      await page.getByRole('dialog').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      assert.equal(await actions.evaluateAll(nodes => nodes.includes(document.activeElement)), true, 'action editor restores preview focus')
      await page.keyboard.press('Escape')
      assert.equal(await preview.getByRole('button', { name: 'Edit actions' }).evaluate(node => node === document.activeElement), true)
      await page.keyboard.press('ArrowRight')
      assert.equal(await actions.evaluateAll(nodes => nodes.includes(document.activeElement)), false, 'page navigation skips unentered actions')
    }
    await choose('Menu layout', 'Radial wheel')
    const headings = await editor.locator('.virtual-menus__workspace h3').evaluateAll(nodes => nodes.filter(node => ['Menu preview', 'Appearance', 'Behaviour & controls'].includes(node.textContent)).map(node => node.getBoundingClientRect().top))
    assert.equal(headings.length, 3)
    assert.ok(Math.max(...headings) - Math.min(...headings) <= 1, 'column headings align')
    const cardTops = await editor.locator('.virtual-menus__workspace h3').evaluateAll(nodes => nodes.filter(node => ['Menu preview', 'Appearance', 'Behaviour & controls'].includes(node.textContent)).map(node => node.nextElementSibling.getBoundingClientRect().top))
    assert.ok(Math.max(...cardTops) - Math.min(...cardTops) <= 1, 'first cards align')
    await row('Centre action').click()
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    await preview.getByRole('button', { name: 'Edit actions' }).click()
    await page.evaluate(() => { window.__menuLeftStick = { x: 1, y: 0 } })
    await page.waitForTimeout(220)
    await page.evaluate(() => { window.__menuLeftStick = { x: 0, y: 0 } })
    await page.waitForTimeout(220)
    assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /Holster/, 'returning the stick selects the centre action')
    await preview.locator('[data-nav-skip][role="button"]').first().focus()
    await page.keyboard.press('Shift+Tab')
    assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /Holster/)
    await page.keyboard.press('Escape')
    for (const [width, height] of [[1517, 1000], [1024, 720], [800, 600], [480, 740]]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(200)
      await preview.scrollIntoViewIfNeeded()
      assert.equal(await editor.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, `editor fits ${width}`)
      await page.screenshot({ path: path.resolve(__dirname, `../tmp/parity-verification/menu-layout-${width}.png`) })
    }
    assert.deepEqual(errors, [])
    console.log('Menu layout and preview focus regression passed')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
