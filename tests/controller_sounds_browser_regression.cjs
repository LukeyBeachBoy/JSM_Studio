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
    // Console v2: Layout ▸ Y ▸ Controller light & sounds ▸ Your sounds opens the
    // sound library page (SoundLibrary.dc.html). Settings ▸ Controller keeps the
    // firmware switches and where sounds play; the library says where they play.
    await page.locator('.app-shell').waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:open-light-sounds')))
    const light = page.getByRole('dialog', { name: /Controller light & sounds$/ })
    await light.waitFor()
    await light.getByRole('button', { name: /Your sounds/ }).click()
    const library = page.getByRole('dialog', { name: /Sound library$/ })
    await library.waitFor()
    await shot('sound-library')
    await library.getByText('Victory riff').first().waitFor()
    assert.match(await library.innerText(), /Plays on\s+Grip motors/)
    // The controller plays: When it connects, chosen from the library's sounds.
    await library.getByRole('button', { name: /When it connects/ }).click()
    const connect = page.getByRole('radiogroup', { name: 'Connect Sound' })
    await connect.getByRole('radio', { name: /Victory riff/ }).click()
    await connect.waitFor({ state: 'detached' })
    assert.match(await library.getByRole('button', { name: /When it connects/ }).innerText(), /Victory riff/)
    await library.getByRole('button', { name: 'Add MP3 or MIDI' }).waitFor()
    await library.locator('input[type="file"]').setInputFiles({ name: 'Test tone.mp3', mimeType: 'audio/mpeg', buffer: sineWav() })
    const editor = library.getByRole('region', { name: 'Test tone' })
    await editor.getByRole('heading', { name: 'Test tone' }).waitFor()
    assert.match(await library.locator('[data-sound-id]').filter({ hasText: 'Test tone' }).innerText(), /MP3 · needs trimming/)
    await shot('trim-editor')
    const editorPreview = editor.getByRole('button', { name: /Preview on controller/ })
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /Preview on controller/.test(b.textContent) && !b.disabled))
    await editorPreview.click()
    await page.getByText('No controller is connected to play the sound on.').last().waitFor({ state: 'visible' })
    await editor.getByRole('slider', { name: 'Preview volume' }).fill('-6')
    assert.match(await editor.getByText('-6 dB').first().textContent(), /-6 dB/)
    // Trim on the pad: ◂ ▸ move the start, A switches to the end.
    const trim = editor.getByRole('group', { name: 'Trim' })
    await trim.focus()
    await page.keyboard.press('ArrowRight')
    assert.match(await trim.innerText(), /Start\s*0\.10 s/)
    await page.keyboard.press('Enter'); await page.keyboard.press('ArrowLeft')
    assert.match(await trim.innerText(), /End\s*0\.90 s/)
    assert.match(await trim.innerText(), /Keeps 0\.8 s/)
    // Volume on a button: where a new binding of this sound starts (D15).
    const volume = editor.locator('[data-sound-volume]')
    await volume.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => /-2 dB/.test(document.querySelector('[data-sound-volume]')?.getAttribute('aria-valuetext') ?? ''))
    await editor.getByRole('button', { name: 'Convert and save' }).click()
    await library.locator('[data-sound-id]').filter({ hasText: 'Test tone' }).filter({ hasText: /ready/ }).waitFor()
    // Y More: rename on the keyboard, delete confirmed in place.
    await library.locator('[data-sound-id]').filter({ hasText: 'Test tone' }).focus()
    await page.keyboard.press('y')
    const more = page.getByRole('dialog', { name: 'Test tone' })
    await more.getByRole('button', { name: /^Rename/ }).click()
    const keyboard = page.locator('[data-text-entry] [role="dialog"]'); await keyboard.waitFor()
    for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type('Saved tone'); await page.keyboard.press('Enter'); await keyboard.waitFor({ state: 'detached' })
    await library.locator('[data-sound-id]').filter({ hasText: 'Saved tone' }).waitFor()
    await page.keyboard.press('Escape')
    await library.locator('[data-sound-id]').filter({ hasText: 'Saved tone' }).focus()
    await page.keyboard.press('y')
    const more2 = page.getByRole('dialog', { name: 'Saved tone' })
    await more2.getByRole('button', { name: /^Delete Saved tone/ }).click()
    await more2.getByRole('button', { name: /Keep it/ }).click()
    await more2.getByRole('button', { name: /^Delete Saved tone/ }).click()
    await more2.getByRole('button', { name: 'Delete sound' }).click()
    await library.locator('[data-sound-id]').filter({ hasText: 'Saved tone' }).waitFor({ state: 'detached' })
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
    console.log('controller sounds browser: prompt, light & sounds, sound library page, connect sound, pad trim, volume on a button, conversion, rename and delete passed')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
