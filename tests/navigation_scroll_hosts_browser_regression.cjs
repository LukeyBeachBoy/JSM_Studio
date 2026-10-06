// Shared scroll behavior across overlay layouts. Real DOM geometry; no native output.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    const results = await page.evaluate(async () => {
      const { activeScrollHost, ensureVisible } = await import('/src/nav/scroller.ts')
      const results = []
      for (const layout of ['sheet__body', 'dialog__body', 'modal-card', 'drawer', 'nested']) {
        const overlay = document.createElement('div')
        overlay.dataset.focusTrap = 'true'
        overlay.style.cssText = 'position:fixed;inset:80px;z-index:99999;background:black'
        const header = document.createElement('button')
        header.textContent = 'Header'
        overlay.append(header)
        const outer = document.createElement('div')
        outer.className = layout === 'nested' ? 'sheet__body' : layout
        outer.style.cssText = 'height:160px;width:400px;overflow-y:auto;display:block;margin:0;padding:0;border:0'
        overlay.append(outer)
        let host = outer
        if (layout === 'nested') {
          outer.style.overflowY = 'hidden'
          host = document.createElement('div')
          host.style.cssText = 'height:160px;overflow-y:auto'
          outer.append(host)
        }
        const content = document.createElement('div')
        content.style.cssText = 'display:block;height:564px;padding-top:500px;box-sizing:border-box'
        host.append(content)
        const last = document.createElement('button')
        last.textContent = 'Bottom setting'
        last.style.cssText = 'display:block;height:48px;margin-bottom:16px'
        content.append(last)
        document.body.append(overlay)
        last.focus({ preventScroll: true })
        const focusedHost = activeScrollHost() === host
        ensureVisible(last, { smooth: false })
        const box = last.getBoundingClientRect(), frame = host.getBoundingClientRect()
        header.focus({ preventScroll: true })
        results.push({ layout, focusedHost, headerHost: activeScrollHost() === host,
          visible: box.top >= frame.top + 7 && box.bottom <= frame.bottom - 7,
          scrolled: host.scrollTop > 0, outerStayed: layout !== 'nested' || outer.scrollTop === 0,
          bounds: { top: box.top - frame.top, bottom: frame.bottom - box.bottom, height: box.height, scrollTop: host.scrollTop, clientHeight: host.clientHeight, frameHeight: frame.height } })
        overlay.remove()
      }
      return results
    })
    for (const result of results) assert.ok(result.focusedHost && result.headerHost && result.visible && result.scrolled && result.outerStayed, JSON.stringify(result))
    console.log('PASS: sheet, dialog, legacy modal, drawer and nested-column focus/scroll ownership')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
