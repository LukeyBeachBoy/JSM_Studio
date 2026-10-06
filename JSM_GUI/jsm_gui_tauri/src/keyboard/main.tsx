import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { defaultPreferences, previewFrame, type KeyboardFrame, type KeyboardLayout } from './bridge'
import { KeyboardView } from './KeyboardView'
import { restoreAppearance, readAppearance } from '../appearanceStorage'
import '../styles/tokens.css'
import '../styles/accents.css'

const params = new URLSearchParams(location.search)
const preview = params.has('preview')
function paintAppearance() {
  const theme = readAppearance('jsm-theme') ?? 'dark'
  document.documentElement.dataset.theme = params.get('theme') ?? (theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme)
  document.documentElement.dataset.accent = readAppearance('jsm-accent') ?? 'cyan'
}
window.addEventListener('storage', paintAppearance)
matchMedia('(prefers-color-scheme: light)').addEventListener('change', paintAppearance)
const initial = previewFrame({ ...defaultPreferences, layout: (params.get('layout') ?? 'split') as KeyboardLayout, appearance: (params.get('appearance') ?? 'theme') as 'theme' | 'dark' | 'light' })
initial.open = preview
function Keyboard() {
  const [frame, setFrame] = useState(initial)
  const [error, setError] = useState('')
  useEffect(() => {
    if (preview) return
    let alive = true, raf = 0, latest: KeyboardFrame | null = null
    const unlisteners: Array<() => void> = []
    const subscribe = async () => {
      const stop = await listen<KeyboardFrame>('keyboard-frame', event => {
        latest = event.payload
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (alive && latest) setFrame(latest) })
      })
      if (alive) unlisteners.push(stop); else stop()
      const stopError = await listen<string>('keyboard-error', event => setError(event.payload))
      if (alive) unlisteners.push(stopError); else stopError()
      const stopAppearance = await listen('appearance-preference', () => { void restoreAppearance().then(paintAppearance) })
      if (alive) unlisteners.push(stopAppearance); else stopAppearance()
      const current = await invoke<KeyboardFrame>('keyboard_state')
      if (alive) setFrame(current)
    }
    void subscribe().catch(e => setError(String(e)))
    return () => { alive = false; cancelAnimationFrame(raf); unlisteners.forEach(stop => stop()) }
  }, [])
  return frame.open ? <><KeyboardView frame={frame} />{error && <div className="vk-error" role="alert">{error}</div>}</> : null
}
void restoreAppearance().then(() => {
  paintAppearance()
  if (params.has('theme')) document.documentElement.dataset.theme = params.get('theme')!
  document.body.classList.add('vk-document')
  createRoot(document.getElementById('root')!).render(<Keyboard />)
})
