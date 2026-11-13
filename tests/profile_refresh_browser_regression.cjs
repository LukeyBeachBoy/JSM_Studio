const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/__profile-refresh', route => route.fulfill({ contentType: 'text/html', body: '<div id="test"></div>' }));
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1461'}/__profile-refresh`);
    await page.evaluate(async () => {
      const { default: RefreshRuntime } = await import('/@react-refresh');
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const hookSource = await (await fetch('/src/hooks/useProfileLibrary.ts')).text();
      const reactPath = hookSource.match(/from "([^"]*\/react\.js[^"]*)"/)[1];
      const { default: React } = await import(reactPath);
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts');
      const { useProfileLibrary } = await import('/src/hooks/useProfileLibrary.ts');
      window.files = { Desktop: 'RESET_MAPPINGS\n', Cyberpunk: 'RESET_MAPPINGS\nS = X_A\n' };
      desktopBridge.listLibraryProfiles = async () => Object.keys(window.files);
      desktopBridge.getActiveProfile = async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: window.files.Desktop });
      desktopBridge.onLibraryProfilesChanged = () => () => {};
      desktopBridge.onAppliedProfileChanged = cb => { window.applied = cb; return () => {} };
      desktopBridge.loadLibraryProfile = async name => {
        const profile = { name, path: `profiles-library/${name}.txt`, content: window.files[name] };
        if (window.defer) { window.defer = false; return new Promise(resolve => { window.finishRead = () => resolve(profile) }) }
        return profile;
      };
      const noop = () => {};
      function Harness() {
        const [text, setText] = React.useState('');
        const [saved, setSaved] = React.useState('');
        const library = useProfileLibrary({ configText: text, resetConfigHistory: setText, setConfigText: setText, setAppliedConfig: setSaved, setStatusMessage: noop, resetPendingSensitivityChanges: noop });
        window.edit = setText;
        window.select = library.handleLoadProfileFromLibrary;
        window.result = { text, saved, name: library.currentLibraryProfile, ready: library.libraryReady };
        return React.createElement('pre', null, text);
      }
      ReactDOM.createRoot(document.getElementById('test')).render(React.createElement(Harness));
    });
    await page.waitForFunction(() => window.result?.ready);
    const restored = 'RESET_MAPPINGS\n# @controller-layout type-25\n# @controller type-25 JOY3 = TAB\n';
    await page.evaluate(text => { window.files.Desktop = text; window.applied({ name: 'Desktop', content: 'older runtime snapshot' }) }, restored);
    await page.waitForFunction(text => window.result.text === text, restored);
    assert.equal(await page.evaluate(() => window.result.saved), restored, 'slot application refreshes the clean editor from saved source, not runtime content');
    await page.evaluate(() => { window.files.Desktop += '# external edit\n'; window.dispatchEvent(new Event('focus')) });
    await page.waitForFunction(() => window.result.text === window.files.Desktop);
    await page.evaluate(() => window.edit('unsaved draft'));
    await page.waitForFunction(() => window.result.text === 'unsaved draft');
    await page.evaluate(() => { window.files.Desktop = 'new disk version'; window.dispatchEvent(new Event('focus')); window.applied({ name: 'Desktop', content: 'runtime' }) });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.result.text), 'unsaved draft', 'existing unsaved edits survive refresh');
    // Return to the saved baseline, start a disk read, then edit while it waits.
    await page.evaluate(() => window.edit(window.result.saved));
    await page.waitForFunction(() => window.result.text === window.result.saved);
    await page.evaluate(() => { window.defer = true; window.dispatchEvent(new Event('focus')) });
    await page.waitForFunction(() => typeof window.finishRead === 'function');
    await page.evaluate(() => window.edit('edit made during read'));
    await page.waitForFunction(() => window.result.text === 'edit made during read');
    await page.evaluate(() => window.finishRead());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.result.text), 'edit made during read');
    // A late refresh must not take the editor back to the previous configuration.
    await page.evaluate(() => window.edit(window.result.saved));
    await page.waitForFunction(() => window.result.text === window.result.saved);
    await page.evaluate(() => { window.finishRead = null; window.defer = true; window.dispatchEvent(new Event('focus')) });
    await page.waitForFunction(() => typeof window.finishRead === 'function');
    await page.evaluate(() => window.select('Cyberpunk'));
    await page.waitForFunction(() => window.result.name === 'Cyberpunk');
    await page.evaluate(() => window.finishRead());
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.result.name), 'Cyberpunk');
    console.log('PASS: clean editor refreshes on slot/focus; runtime snapshots, drafts and in-flight edits/selections stay isolated');
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) });
