// The assistant (console v2: SettingsAssistant, Assistant; D18), in the dev
// mock with nothing connected (?mock&noai):
//
// - Settings ▸ Assistant offers four ways to connect. ChatGPT without a client
//   id from OpenAI stays reachable and says why it can't be used; Claude takes a
//   pasted key, which the page then only ever shows as its last four
//   characters, and is tested at once; models on this PC are found with no key.
// - Y is "Sign out · forget keys", through a confirmation.
// - The conversation is its own page: not connected, it points to the setup;
//   connected, a suggestion is asked with A, and Keep it saves the change.
//
// Run with the dev server up: node tests/assistant_settings_browser_regression.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const shots = path.resolve(__dirname, '../tmp/assistant'); fs.mkdirSync(shots, { recursive: true });
    const shot = name => page.screenshot({ path: path.join(shots, `${name}.png`) });
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'}/?mock&noai`);
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
    const keep = page.getByRole('button', { name: 'Keep them', exact: true });
    if (await keep.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) { await keep.click(); await keep.waitFor({ state: 'detached' }).catch(() => {}) }

    // The conversation first: not connected, it says where to set it up.
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:open-assistant')));
    const assistant = page.locator('[data-assistant-page]');
    await assistant.waitFor();
    await assistant.getByText('Set up the assistant first').waitFor();
    await assistant.getByRole('button', { name: /Set up the assistant/ }).click();
    await assistant.waitFor({ state: 'detached' });

    // Settings ▸ Assistant: four ways to connect.
    const settings = page.locator('main');
    for (const name of ['Continue with ChatGPT', 'Claude, with an API key', 'OpenAI or another provider, with a key', 'On this PC']) await page.getByRole('radio', { name: new RegExp(`^${name}`) }).waitFor();
    assert.match(await page.locator('[role="status"]').filter({ hasText: 'Currently' }).innerText(), /not connected/);

    // ChatGPT: reachable, and says why it can't be used yet.
    await page.getByRole('radio', { name: /^Continue with ChatGPT/ }).click();
    const signIn = page.getByRole('button', { name: 'Continue with ChatGPT', exact: true });
    assert.equal(await signIn.getAttribute('aria-disabled'), 'true');
    assert.match(await signIn.getAttribute('data-reason'), /OpenAI’s approval/);
    await settings.getByText(/count against your ChatGPT plan/).first().waitFor();

    // Claude: paste a key; only its last four characters come back, and it's tested.
    await page.getByRole('radio', { name: /^Claude, with an API key/ }).click();
    await page.getByRole('button', { name: 'Open key page' }).waitFor();
    const keyField = page.getByLabel('Claude API key');
    await keyField.fill('sk-ant-api03-secret-abcd1234');
    await keyField.press('Enter');
    await page.getByText('Key …1234 saved').waitFor();
    await page.getByText(/Works · 3 models available/).waitFor();
    assert.doesNotMatch(await page.content(), /secret-abcd/, 'the key never reaches the page');
    assert.match(await page.locator('[role="status"]').filter({ hasText: 'Currently' }).innerText(), /Claude · claude-opus-5-5/);
    await shot('claude');

    // On this PC: found without a key.
    await page.getByRole('radio', { name: /^On this PC/ }).click();
    await page.getByText('Found Ollama').waitFor();
    await page.getByRole('button', { name: 'Ollama · qwen2.5:7b' }).click();
    await page.waitForFunction(() => /On this PC · qwen2\.5:7b/.test(document.body.innerText));

    // Y: Sign out · forget keys, after a confirmation.
    await page.getByRole('radio', { name: /^On this PC/ }).focus();
    await page.keyboard.press('y');
    const forget = page.getByRole('dialog', { name: 'Sign out and forget keys?' });
    await forget.waitFor();
    await forget.getByRole('button', { name: /^Sign out · forget keys/ }).click();
    await page.waitForFunction(() => /Currently: not connected/.test(document.body.innerText));
    assert.equal(await page.getByText('Key …1234 saved').count(), 0);

    // Connected again (on this PC), the conversation answers and Keep it saves.
    await page.getByRole('radio', { name: /^On this PC/ }).click();
    await page.getByRole('button', { name: 'Ollama · llama3.1:8b' }).click();
    await page.waitForFunction(() => /Currently: On this PC/.test(document.body.innerText));
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:open-assistant')));
    await assistant.waitFor();
    await page.waitForFunction(() => document.activeElement?.closest('[data-assistant-page]'));
    await assistant.getByRole('listitem').filter({ hasText: 'Put reload on a back button' }).click();
    await assistant.getByText(/L5 is free, so reload goes there/).waitFor();
    assert.match(await assistant.getByLabel('What changes').innerText(), /unchanged/, 'what the change leaves alone is shown too');
    await shot('proposal');
    await assistant.getByRole('button', { name: /Keep it/ }).click();
    await page.waitForFunction(async () => /^LSR = R$/m.test((await window.electronAPI.loadLibraryProfile('Wardogs'))?.content ?? ''));

    assert.deepEqual(errors, []);
    console.log('PASS: the assistant connects four ways (ChatGPT explains why not yet), keeps keys out of the page, forgets them on Y, and keeps a proposed change');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
