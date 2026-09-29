// Renders the JSM Evolved mark (src/assets/brand) to PNG at the sizes Windows
// asks for and packs them into src-tauri/icons/icon.ico, the icon the bundle
// and the exe carry. The 16 and 24 px cuts come from the -16 file, which drops
// the detail that turns to mud at that size (Brand JSM Evolved.dc.html).
//
//   node scripts/build-brand-icons.cjs [accent]   (default: cyan)
//
// Rendering goes through headless Edge via Playwright, the same path the
// browser regression tests use, so no rasteriser needs installing.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const accent = process.argv[2] || 'cyan'
const root = path.resolve(__dirname, '..')
const brand = path.join(root, 'src/assets/brand')
const full = fs.readFileSync(path.join(brand, `jsm-evolved-${accent}.svg`), 'utf8')
const small = fs.readFileSync(path.join(brand, `jsm-evolved-${accent}-16.svg`), 'utf8')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

function ico(pngs) {
  // ICONDIR + ICONDIRENTRY per image, PNG payloads (Vista+ reads PNG frames).
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2); entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.png)])
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const pngs = []
  for (const size of SIZES) {
    const svg = size <= 24 ? small : full
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`)
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
    pngs.push({ size, png })
  }
  await browser.close()
  const out = path.join(root, 'src-tauri/icons')
  fs.mkdirSync(out, { recursive: true })
  const target = accent === 'cyan' ? 'icon.ico' : `icon-${accent}.ico`
  fs.writeFileSync(path.join(out, target), ico(pngs))
  for (const { size, png } of pngs) if ([32, 128, 256].includes(size)) fs.writeFileSync(path.join(out, `${size}x${size}${accent === 'cyan' ? '' : `-${accent}`}.png`), png)
  console.log(`wrote ${target} (${SIZES.join('/')}) and 32/128/256 PNGs`)
})().catch(error => { console.error(error); process.exit(1) })
