// Render the same reference the app shows, using its pure TypeScript generator.
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'JSM_GUI/jsm_gui_tauri/node_modules/typescript'))
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const source = fs.readFileSync(path.join(root, 'JSM_GUI/jsm_gui_tauri/src/utils/windowsSignInGuide.ts'), 'utf8')
const api = {}
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(api)
const profile = fs.readFileSync(path.join(root, 'JoyShockMapper/dist/WindowsSignIn.txt'), 'utf8')
const art = fs.readFileSync(path.join(root, 'JSM_GUI/jsm_gui_tauri/src/assets/steam-controller-front.svg'), 'utf8')
const directory = path.join(root, 'docs/assets')
fs.mkdirSync(directory, { recursive: true })
const images = [
  ['windows-sign-in-reference', api.windowsSignInGuide(profile, art), 1600, 960],
  ['windows-sign-in-background', api.windowsSignInBackground(profile), 1920, 1080],
]
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const [name, svg, width, height] of images) {
      const base = path.join(directory, name)
      fs.writeFileSync(base + '.svg', svg)
      fs.writeFileSync(base + '.html', '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Windows sign-in button reference</title><style>body{margin:0;background:#101a22}svg{display:block;width:100%;height:auto;max-width:' + width + 'px;margin:auto}</style>' + svg)
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
      await page.setContent('<html><body style="margin:0">' + svg + '</body></html>')
      await page.locator('svg').screenshot({ path: base + '.png' })
      console.log(base + '.png')
      await page.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
