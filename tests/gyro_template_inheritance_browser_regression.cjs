// Gyro and a template (console v2, P5): a configuration that extends FPS Template
// shows what it inherits as inherited (origin "From FPS Template"), the edits
// are the only lines saved, and setting a value back BY HAND stops it being an
// override. The gyro half of template_override_roundtrip_regression, on the new
// Speed ▸ Advanced, Steadiness ▸ Advanced and When is gyro on? screens.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const h = require('./gyro_v2_helpers.cjs')
const { assert } = h

const TEMPLATE = ['# Shared FPS baseline', 'MIN_GYRO_SENS = 2.0 1.50', 'MAX_GYRO_SENS = 4 3', 'MIN_GYRO_THRESHOLD = 5', 'MAX_GYRO_THRESHOLD = 75.0',
  'GYRO_SMOOTH_THRESHOLD = 3', 'GYRO_SMOOTH_TIME = 0.125', 'GYRO_CUTOFF_SPEED = 1', 'GYRO_SPACE = PLAYER_TURN', 'GYRO_OFF = RS', ''].join('\n')
const CHILD = ['RESET_MAPPINGS', 'profiles-library/FPS Template.txt', ''].join('\n')
const HEADER = new Set(['RESET_MAPPINGS', 'TELEMETRY_ENABLED = ON', 'TELEMETRY_PORT = 8974', 'AUTOCONNECT = ON', 'profiles-library/FPS Template.txt'])
const ownLines = text => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !HEADER.has(l) && !l.startsWith('#')).sort()

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await h.prepare(page)
    await page.addInitScript(([child, template]) => {
      const profiles = { Child: child, 'FPS Template': template }
      window.__saved = []
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Child', path: 'profiles-library/Child.txt', content: profiles.Child }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__saved.push({ name, content }); profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
        readConfigFile: async path => {
          const name = String(path).replace(/^profiles-library\//, '').replace(/\.txt$/, '')
          return Object.prototype.hasOwnProperty.call(profiles, name) ? profiles[name] : null
        },
      }
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Child.txt', omega: 10, devices: [] })
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer)
      } }
    }, [CHILD, TEMPLATE])
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('[data-home-continue]').click()
    await page.waitForFunction(() => document.body.innerText.includes('Child'))
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await page.locator('[data-gyro-front]').waitFor()
    const save = async () => {
      const count = await page.evaluate(() => window.__saved.length)
      await page.keyboard.press('Control+s')
      await page.waitForFunction(count => window.__saved.length > count, count)
      await page.waitForTimeout(200)
      return page.evaluate(() => window.__saved.at(-1).content)
    }
    // Opening rewrites nothing.
    assert.equal(await page.evaluate(() => window.__saved.length), 0)
    // 1. Everything the template sets is shown, and shown as inherited.
    await h.gyroInheritedChecks(page)
    assert.equal(await page.evaluate(() => window.__saved.length), 0, 'looking changes nothing')
    // 2. Overrides, each through its own control.
    await h.gyroOverrideEdits(page)
    const overridden = await save()
    assert.deepEqual(ownLines(overridden), ['GYRO_ON = RS', 'MAX_GYRO_THRESHOLD = 60', 'MIN_GYRO_SENS = 3 1.5'], `exactly the overrides are saved, nothing inherited is copied in:\n${overridden}`)
    assert.match(overridden, /^profiles-library\/FPS Template\.txt$/m, 'the import line stays')
    // 3. Set each one back by hand: the lines go.
    await h.gyroRestoreEdits(page)
    const restored = await save()
    assert.deepEqual(ownLines(restored), [], `setting values back removes their lines:\n${restored}`)
    // 4. Typed and set back without saving in between: nothing to save.
    await h.gyroSetSlowY(page, 2.5)
    await h.gyroSetSlowY(page, 1.5)
    assert.equal(await h.gyroSlowYOrigin(page), 'From FPS Template')
    assert.deepEqual(ownLines(await save()), [])
    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`)
    console.log('PASS: a template\'s gyro values are inherited on the new screens, overrides save as themselves, and setting one back by hand makes it inherited again')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
