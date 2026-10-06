const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:1420/keyboard.html?preview=1')
    await page.locator('.vk-grid > .vk-thumb').first().waitFor()
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    await page.screenshot({ path: 'tmp/keyboard-straight-swipe-preview.png' })
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js')
      const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
      const { KeyboardView } = await import('/src/keyboard/KeyboardView.tsx')
      const { defaultPreferences, previewFrame } = await import('/src/keyboard/bridge.ts')
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;inset:0'
      document.body.replaceChildren(host)
      const root = createRoot(host)
      window.drawSwipe = async (layout, point, tick) => {
        const frame = previewFrame({ ...defaultPreferences, layout })
        frame.leftTouch = point
        frame.rightTouch = point
        // Changing highlights, symbols, and shift must not change the dot path.
        frame.left = tick * 7 % 60
        frame.right = tick * 11 % 60
        frame.shift = tick % 2 === 0
        frame.symbols = tick % 3 === 0
        root.render(React.createElement(KeyboardView, { frame }))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return [...document.querySelectorAll('.vk-grid > .vk-thumb')].map(dot => {
          const rect = dot.getBoundingClientRect()
          return [rect.x + rect.width / 2, rect.y + rect.height / 2]
        })
      }
    })
    let segments = 0
    for (const viewport of [{ width: 1000, height: 350 }, { width: 550, height: 193 }]) {
      await page.setViewportSize(viewport)
      for (const layout of ['standard', 'split']) {
        for (const swipe of ['vertical', 'horizontal', 'diagonal']) {
          const paths = [[], []]
          for (let tick = 0; tick <= 20; tick++) {
            const t = tick / 20
            const point = swipe === 'vertical' ? [0.17, -0.95 + 1.9 * t]
              : swipe === 'horizontal' ? [-0.95 + 1.9 * t, -0.27]
                : [-0.7 + 1.4 * t, -0.8 + 1.6 * t]
            const positions = await page.evaluate(([layout, point, tick]) => window.drawSwipe(layout, point, tick), [layout, point, tick])
            positions.forEach((position, side) => paths[side].push(position))
          }
          for (const points of paths) {
            const start = points[0], end = points.at(-1)
            const dx = end[0] - start[0], dy = end[1] - start[1]
            const length = Math.hypot(dx, dy)
            assert.ok(length > 100, 'cursor travels across the keyboard')
            for (const [x, y] of points) {
              const deviation = Math.abs((x - start[0]) * dy - (y - start[1]) * dx) / length
              assert.ok(deviation < 0.05, `${layout}/${swipe}: cursor bends ${deviation}px`)
            }
            segments++
          }
        }
      }
    }
    assert.deepEqual(errors, [])
    console.log(`PASS: ${segments} rendered swipe paths stay straight within 0.05px across highlights, rows, shift/symbol changes and keyboard sizes.`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
