// TODO-50..53 (2026-09-30): the Layers page create field reads as the primary
// entry point, "Move N assignments" wraps instead of clipping, the Manage
// layers dialog carries one accent ring at a time, and the shared touch-stick
// section says what it is under its title.
// Runs against the mock preview: JSM_TEST_URL defaults to the ?mock dev server.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 // This check needs an actual legacy modeshift to migrate; the current mock
 // profile already uses named layers and correctly hides migration for it.
 await page.addInitScript(() => {
   const content = 'RESET_MAPPINGS\nRSR,N = J\nN = SPACE\n';
   window.electronAPI = {
     getActiveProfile: async () => ({ name: 'Migration', path: 'profiles-library/Migration.txt', content }),
     listLibraryProfiles: async () => ['Migration'],
     loadLibraryProfile: async () => ({ name: 'Migration', content }),
   };
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421/?mock');
 // The mock's first-connect dialog and the Home landing (console refinement 2a).
 await page.getByRole('button', { name: 'Keep them' }).click({ timeout: 8000 }).catch(() => {});
 await page.locator('[data-home-continue]').click({ timeout: 8000 }).catch(() => {});
 const artifacts = path.resolve(__dirname, '../tmp/layers-ui-polish'); fs.mkdirSync(artifacts, { recursive: true });
 const rect = async locator => { const b = await locator.boundingBox(); assert.ok(b, 'element has a box'); return b; };
 // The accent as the page resolves it, for comparing computed box-shadows.
 const accentRgb = await page.evaluate(() => { const el = document.createElement('i'); el.style.color = 'var(--accent)'; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; });
 const focusRgb = await page.evaluate(() => { const el = document.createElement('i'); el.style.color = 'var(--focus-keyboard)'; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; });

 // ---- TODO-50: the create field is a labelled well with the primary button.
 await page.getByRole('button', { name: 'Layers', exact: true }).first().click();
 const layersPage = page.locator('.layers-page');
 const create = layersPage.locator('.layer-new');
 await create.waitFor();
 assert.equal((await create.locator('label.layer-new__label').innerText()).trim(), 'New layer', 'the create field is labelled');
 const newField = create.getByRole('textbox', { name: 'New layer name', exact: true });
 assert.ok(await newField.evaluate(el => el.classList.contains('text-field')), 'the create field uses the app text-field look');
 assert.ok((await rect(newField)).height >= 44, 'the create field is the tall, primary field');
 const createButton = create.getByRole('button', { name: 'Create layer', exact: true });
 assert.ok(await createButton.evaluate(el => el.classList.contains('button--primary')), 'Create layer is the primary button');
 assert.notEqual(await create.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'the create block is a card, not a bare row');
 await newField.fill('Test');
 await createButton.click();
 const rename = layersPage.getByRole('textbox', { name: 'Layer name', exact: true });
 await rename.waitFor();
 assert.ok(await rename.evaluate(el => el.classList.contains('text-field') && getComputedStyle(el).boxShadow !== 'none'), 'the layer name field is a text-field well with a hairline');
 await layersPage.locator('#layers-list').screenshot({ path: path.join(artifacts, 'layers-create.png') });
 await layersPage.locator('#layers-overrides').screenshot({ path: path.join(artifacts, 'layers-overrides.png') });

 // ---- TODO-51: the Move button sits on the select's line and wraps when squeezed.
 await layersPage.getByText('Convert existing modeshifts to a layer', { exact: true }).click();
 const move = layersPage.getByRole('button', { name: /^Move \d+ assignment/ });
 const select = layersPage.getByRole('combobox', { name: 'Move modeshifts from', exact: true });
 assert.equal(await move.evaluate(el => getComputedStyle(el).whiteSpace), 'normal', 'the label may wrap');
 assert.ok(Math.abs((await rect(move)).y - (await rect(select)).y) <= 2, 'the Move button lines up with the select');
 const oneLine = (await rect(move)).height;
 await move.evaluate(el => { el.style.maxWidth = '110px'; });
 const squeezed = await move.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }));
 assert.ok(squeezed.sw <= squeezed.cw, `squeezed, the label does not clip: ${JSON.stringify(squeezed)}`);
 assert.ok(squeezed.h > oneLine, `squeezed, the label takes a second line: ${JSON.stringify(squeezed)} vs ${oneLine}`);
 await move.screenshot({ path: path.join(artifacts, 'move-button-wrapped.png') });
 await move.evaluate(el => { el.style.maxWidth = ''; });

 // ---- TODO-52: only the focused field carries the accent ring in the dialog.
 await page.getByRole('button', { name: /^Editing layer:/ }).click();
 await page.getByRole('menuitem', { name: 'Manage layers…' }).click();
 const modal = page.locator('#layer-management.layer-modal');
 await modal.waitFor();
 const dialogField = modal.getByRole('textbox', { name: 'New layer name', exact: true });
 await dialogField.focus();
 const editingRow = modal.locator('.layer-list li[aria-current="true"]');
 await editingRow.locator('.layer-row__tag', { hasText: 'Editing' }).waitFor();
 const rowShadow = await editingRow.evaluate(el => getComputedStyle(el).boxShadow);
 assert.doesNotMatch(rowShadow, /0px 0px 0px 1px/, `the editing row no longer wears a full ring: ${rowShadow}`);
 assert.match(rowShadow, /3px 0px 0px 0px inset/, `the editing row is marked by a quiet left bar: ${rowShadow}`);
 const ring = async locator => { const s = await locator.evaluate(el => getComputedStyle(el).boxShadow); return s.includes(focusRgb) || s.includes(accentRgb); };
 assert.ok(await ring(dialogField), 'the focused field glows');
 const rowField = editingRow.getByRole('textbox', { name: 'Layer name', exact: true });
 assert.ok(!(await ring(rowField)), 'an unfocused name field does not glow');
 await modal.getByRole('button', { name: 'Close' }).focus();
 assert.ok(!(await ring(dialogField)), 'the field only glows while focused');
 const dialogMove = modal.getByRole('button', { name: /^Move \d+ assignment/ });
 await modal.getByText('Convert existing modeshifts to a layer', { exact: true }).click();
 assert.equal(await dialogMove.evaluate(el => getComputedStyle(el).whiteSpace), 'normal', 'the dialog Move button may wrap too');
 await page.screenshot({ path: path.join(artifacts, 'manage-dialog.png') });
 await page.keyboard.press('Escape');
 await modal.waitFor({ state: 'detached' });

 // ---- TODO-53: the shared touch-stick section explains itself under its title.
 await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
 const section = page.locator('#trackpad-buttons > section');
 const title = section.locator('h3', { hasText: 'Shared Touch-Stick Directions' });
 await title.scrollIntoViewIfNeeded();
 const intro = section.locator('.touch-stick-shared__intro');
 assert.match(await intro.innerText(), /touch stick .* joystick/i, 'the intro says what a touch stick is');
 assert.match(await intro.innerText(), /one set .* whichever pad/i, 'the intro says why the directions are shared');
 const firstRow = section.locator('details[data-input-command="TUP"]').first();
 const [t, i, r] = [await rect(title), await rect(intro), await rect(firstRow)];
 assert.ok(i.y >= t.y + t.height - 1, `the intro sits under the title: ${JSON.stringify({ t, i })}`);
 assert.ok(i.y + i.height <= r.y + 1, `the intro sits above the first direction: ${JSON.stringify({ i, r })}`);
 // The "?" keeps the longer explanation.
 await section.getByRole('button', { name: 'Help: Shared Touch-Stick Directions' }).click();
 const help = page.getByRole('dialog', { name: 'Shared Touch-Stick Directions' });
 assert.match(await help.innerText(), /TUP, TDOWN, TLEFT, TRIGHT and TRING/, 'the help names the mapper bindings');
 await page.keyboard.press('Escape');
 await help.waitFor({ state: 'detached' });
 await section.screenshot({ path: path.join(artifacts, 'shared-touch-stick.png') });

 assert.deepEqual(errors, []);
 console.log('PASS: labelled primary create field, wrapping Move button, one accent ring in Manage layers, shared touch-stick intro');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
