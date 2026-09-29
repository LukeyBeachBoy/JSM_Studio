// Draws the chosen mark into the window and tray icons, live.
//
// The exe carries the cyan icon (src-tauri/icons/icon.ico). Everything the
// running app shows -- the taskbar, Alt-Tab, the tray -- is set from here:
// the SVG is rasterised in the WebView (a canvas, so no image crate in the
// backend) and the pixels go to `set_brand_icon`, which also keeps a copy so
// the next launch starts with the right icon before this page has loaded.
import { ACCENT_META, type Accent } from './brand'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function rasterise(url: string, size: number): Promise<Uint8Array> {
  const image = new Image()
  image.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No 2D canvas')
  context.clearRect(0, 0, size, size)
  context.drawImage(image, 0, 0, size, size)
  return new Uint8Array(context.getImageData(0, 0, size, size).data.buffer)
}

async function send(target: 'tray' | 'window', url: string, size: number) {
  const { invoke } = await import('@tauri-apps/api/core')
  const rgba = await rasterise(url, size)
  await invoke('set_brand_icon', rgba, {
    headers: { 'x-width': String(size), 'x-height': String(size), 'x-target': target },
  })
}

let pending: Accent | null = null
let running = false

/**
 * Re-draw both icons for an accent. Coalesces: a run of quick picks on the
 * Appearance page sends only the last one once the current draw finishes.
 */
export function syncBrandIcons(accent: Accent) {
  if (!isTauri()) return
  pending = accent
  if (running) return
  running = true
  void (async () => {
    try {
      while (pending) {
        const next = pending
        pending = null
        // The tray at 100% is 16px; Windows scales a larger bitmap down, so
        // give it the 16 cut at 2x rather than the full mark reduced to mud.
        const trayPx = Math.max(32, Math.round(16 * (window.devicePixelRatio || 1)))
        await Promise.all([send('tray', ACCENT_META[next].mark16, trayPx), send('window', ACCENT_META[next].mark, 256)])
      }
    } catch (error) {
      console.warn('Could not update the app icon', error)
    } finally {
      running = false
    }
  })()
}
