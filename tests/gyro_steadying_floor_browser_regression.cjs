// Renderer-only interaction and focus tests. No controller or runtime is started.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nMOTION_STICK_MODE = ROTATE_ONLY\nGYRO_ON = MISC6\nGYRO_OUTPUT = MOUSE\nRIGHT_STICK_UNDEADZONE_INNER = 0.2\nRIGHT_STICK_UNPOWER = 2\nLEFT_STICK_UNDEADZONE_INNER = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_PARITY_SETTING = preserve_me\n'
      content += 'ONE_EURO_FILTER\nONE_EURO_MIN_CUTOFF = 6 # base smoothing\nONE_EURO_SPEED_COEFF = 0.3\nL,ONE_EURO_MIN_CUTOFF = 0.5 # ADS smoothing\nL,ONE_EURO_SPEED_COEFF = 0.1 # ADS response\n'
      content += 'MIN_GYRO_SENS = 5 3\nMAX_GYRO_SENS = 21 6\nMIN_GYRO_THRESHOLD = 0\nMAX_GYRO_THRESHOLD = 80\nACCEL_CURVE = QUADRATIC\nGYRO_CUTOFF_RECOVERY = 5\nGYRO_STEADYING_FLOOR = 2 1.5\n'
      content += 'GYRO_HAPTIC_INTENSITY = 0\nL,GYRO_HAPTIC_INTENSITY = 20 # ADS feedback\nL,GYRO_HAPTIC_INTERVAL = 10\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Parity', path: 'profiles-library/Parity.txt', content }),
        listLibraryProfiles: async () => ['Parity'], loadLibraryProfile: async () => ({ name: 'Parity', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__paritySaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ omega: 12, activeProfile: 'profiles-library/Parity.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            virtualSticks: { left: { x: 0.1, y: 0 }, right: { x: 0.3, y: -0.2 } } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()

    await page.locator('button.summary-row').filter({ hasText: 'Noise & Steadying' }).first().click()
    await page.getByRole('dialog').waitFor()
    const dialog = page.getByRole('dialog')
    assert.equal(await dialog.getByRole('textbox',{name:'Steadying Floor X',exact:true}).inputValue(),'2')
    assert.equal(await dialog.getByRole('textbox',{name:'Steadying Floor Y',exact:true}).inputValue(),'1.5')
    await dialog.screenshot({path:'tmp/gyro-steadying-floor.png'})
    const floorX = dialog.getByRole('textbox', {name:'Steadying Floor X',exact:true})
    await floorX.fill('2.1')
    await floorX.press('Tab')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(()=>/GYRO_STEADYING_FLOOR = 2.1 1.5/.test(window.__paritySaved||''))
    await page.locator('button.summary-row').filter({hasText:'Noise & Steadying'}).first().click()
    const recovery = page.getByRole('dialog').getByRole('textbox',{name:'Steadying',exact:true})
    await recovery.fill('0'); await recovery.press('Tab')
    assert.equal(await page.getByRole('dialog').getByRole('textbox',{name:'Steadying Floor X',exact:true}).isDisabled(),true)
    assert.equal(await page.getByRole('dialog').getByRole('textbox',{name:'Steadying Floor X',exact:true}).inputValue(),'2.1')
    await recovery.fill('5'); await recovery.press('Tab');await page.keyboard.press('Escape')
    const shifted = page.getByLabel('Gyro: while LB is held', {exact:true})
    await shifted.locator('summary').click()
    await shifted.locator('button.summary-row').filter({hasText:'Noise & Steadying'}).click()
    const heldX=page.getByRole('dialog').getByRole('textbox',{name:'Steadying Floor X',exact:true})
    await heldX.fill('1');await heldX.press('Tab');await page.keyboard.press('Escape');await page.keyboard.press('Control+s')
    await page.waitForFunction(()=>/L,GYRO_STEADYING_FLOOR = 1 1.5/.test(window.__paritySaved||''))
    await page.locator('button.summary-row').filter({hasText:'Dampening'}).first().click()
    assert.equal(await page.getByRole('dialog').getByRole('textbox',{name:'Steadying Floor X',exact:true}).count(),0)
    assert.equal(await page.getByRole('dialog').getByRole('textbox').count(),3)
    await page.getByRole('dialog').screenshot({path:'tmp/gyro-dampening-section.png'})
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Open curve editor',exact:true}).first().click()
    await page.locator('.curve-view').screenshot({path:'tmp/gyro-steadying-curve.png'})
    assert.deepEqual(errors,[])
    console.log('PASS: Noise & Steadying owns stabilization; Dampening owns brake/press suppression; floor editing, inherited axes and saving pass')
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})

