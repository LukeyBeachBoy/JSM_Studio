const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

// A short WAV payload exercises browser decoding, trimming and conversion.
// The test uses an .mp3 filename because the mock stores the uploaded bytes;
// it does not claim MP3 codec verification.
const sineWav = () => {
  const rate = 16000, frames = rate, bytes = Buffer.alloc(44 + frames * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 14000), 44 + i * 2)
  return bytes
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    const errors = []
    const shot = async name => {
      if (!process.env.JSM_DIALOG_SHOTS) return
      fs.mkdirSync(process.env.JSM_DIALOG_SHOTS, { recursive: true })
      await page.waitForTimeout(400)
      await page.screenshot({ path: require('node:path').join(process.env.JSM_DIALOG_SHOTS, `${name}.png`) })
    }
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => { errors.push(`Browser dialog opened: ${dialog.type()}`); void dialog.dismiss() })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await shot('first-connection')
      await firstConnect.getByRole('button', { name: 'Keep them' }).click()
      await firstConnect.waitFor({ state: 'hidden' })
    }
    await page.getByRole('button', { name: /^Preferences/ }).first().click()
    await page.getByText('Controller sounds', { exact: true }).first().waitFor()
    const toggle = page.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText("Silence the controller's own sounds", { exact: true }) })
    await toggle.click()
    assert.match(await toggle.innerText(), /Off/, 'enter adjustment without changing the firmware volume')
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    assert.match(await toggle.innerText(), /On/)
    await toggle.click()
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')
    assert.match(await toggle.innerText(), /Off/)
    await toggle.click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape')
    assert.match(await toggle.innerText(), /Off/, 'cancel restores the runtime preference')
    assert.equal(await page.evaluate(async () => (await import('/src/platform/preferenceStore.ts')).getPreferenceSnapshot().runtime.bootSoundLevel), 2)
    await page.evaluate(async () => (await import('/src/platform/preferenceStore.ts')).patchRuntimePreferences({ bootSoundLevel: 1 }))
    await toggle.click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(async () => (await import('/src/platform/preferenceStore.ts')).getPreferenceSnapshot().runtime.bootSoundLevel), 1, 'cancel preserves the exact firmware volume')
    await page.evaluate(async () => (await import('/src/platform/preferenceStore.ts')).patchRuntimePreferences({ bootSoundLevel: 2 }))
    // Where custom sounds play: the grip motors by default (the firmware's own
    // tunes play there), switchable to the trackpads or both.
    const actuators = page.getByRole('radiogroup', { name: 'Play sounds on' })
    assert.equal(await actuators.getByRole('radio', { name: 'Grip motors' }).getAttribute('aria-checked'), 'true')
    await actuators.getByRole('radio', { name: 'Trackpads' }).click()
    assert.equal(await actuators.getByRole('radio', { name: 'Trackpads' }).getAttribute('aria-checked'), 'true')
    await actuators.getByRole('radio', { name: 'Grip motors' }).click()
    assert.equal(await actuators.getByRole('radio', { name: 'Grip motors' }).getAttribute('aria-checked'), 'true')
    const connect = page.getByRole('combobox', { name: 'Connect Sound' })
    await connect.click()
    await page.getByRole('option', { name: 'Victory riff' }).click()
    assert.match(await connect.textContent(), /Victory riff/)
    await page.getByRole('button', { name: 'Manage sounds…' }).click()
    const library = page.getByRole('dialog', { name: 'Your controller sounds' })
    await library.waitFor()
    await shot('sound-library')
    await library.getByText('Victory riff').waitFor()
    await library.getByRole('button', { name: 'Add MP3' }).waitFor()
    await library.locator('input[type="file"]').setInputFiles({ name: 'Test tone.mp3', mimeType: 'audio/mpeg', buffer: sineWav() })
    const editor = page.getByRole('dialog', { name: 'Trim Test tone' })
    await editor.waitFor()
    await shot('trim-editor')
    const editorPreview = editor.getByRole('button', { name: 'Preview on controller' })
    await editorPreview.waitFor({ state: 'visible' })
    assert.equal(await editorPreview.isEnabled(), true)
    await editorPreview.click()
    await page.getByText('No controller is connected to play the sound on.').last().waitFor({ state: 'visible' })
    await editor.getByRole('slider', { name: 'Preview volume' }).fill('-6')
    assert.match(await editor.getByText('-6 dB').textContent(), /-6 dB/)
    assert.equal(await editor.locator('.dialog__body').evaluate(node => getComputedStyle(node).paddingLeft), '24px')
    assert.equal(await editor.locator('.dialog__footer').evaluate(node => getComputedStyle(node).backgroundColor), await editor.evaluate(node => getComputedStyle(node).backgroundColor))
    await editor.getByRole('button', { name: 'Convert and save' }).click()
    await editor.waitFor({ state: 'hidden' })
    await library.getByText('Test tone').waitFor()
    const imported = library.locator('.sound-library-entry').filter({ hasText: 'Test tone' })
    await imported.getByRole('button', { name: 'Rename' }).click()
    const renameDialog = page.getByRole('dialog', { name: 'Rename sound' })
    await renameDialog.getByRole('textbox', { name: 'Sound name' }).fill('Saved tone')
    await renameDialog.getByRole('button', { name: 'Save name' }).click()
    await renameDialog.waitFor({ state: 'hidden' })
    const renamed = library.locator('.sound-library-entry').filter({ hasText: 'Saved tone' })
    await renamed.getByRole('button', { name: 'Delete' }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete Saved tone?' })
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click()
    await deleteDialog.waitFor({ state: 'hidden' })
    await renamed.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog', { name: 'Delete Saved tone?' }).getByRole('button', { name: 'Delete sound' }).click()
    await renamed.waitFor({ state: 'hidden' })
    if (process.env.JSM_AUDIO_DIAGNOSTIC_PATH) {
      const base64 = fs.readFileSync(process.env.JSM_AUDIO_DIAGNOSTIC_PATH).toString('base64')
      const diagnostic = await page.evaluate(async ({ base64, start, end }) => {
        const raw = atob(base64)
        const bytes = Uint8Array.from(raw, char => char.charCodeAt(0))
        const context = new OfflineAudioContext(1, 1, 44100)
        const decoded = await context.decodeAudioData(bytes.buffer)
        const mono = new Float32Array(decoded.length)
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const source = decoded.getChannelData(channel)
          for (let i = 0; i < mono.length; i++) mono[i] += source[i] / decoded.numberOfChannels
        }
        const { extractToneSequence } = await import('/src/utils/toneExtraction.ts')
        const tones = extractToneSequence(mono, decoded.sampleRate, start, end)
        return { lengthMs: Math.round(decoded.duration * 1000), tones }
      }, { base64, start: Number(process.env.JSM_AUDIO_START_MS || 0), end: Number(process.env.JSM_AUDIO_END_MS || 8000) })
      console.log('real audio diagnostic:', JSON.stringify(diagnostic))
    }
    assert.deepEqual(errors, [])
    console.log('controller sounds browser: prompt, preferences, library and trim conversion passed')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
