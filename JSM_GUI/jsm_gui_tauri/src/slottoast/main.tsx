import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { restoreAppearance } from '../appearanceStorage'
import { initTheme } from '../hooks/useTheme'
import { initAccent } from '../hooks/useAccent'
import '../styles/design-tokens.css'
import '../styles/accents.css'
import './toast.css'

type Confirmation = { revision: number; id: number; name: string; profileName: string }
function SlotToast() {
  const [current, setCurrent] = useState<Confirmation | null>(null)
  useEffect(() => {
    let alive = true
    let unlisten: (() => void) | undefined
    const update = (value: Confirmation | null) => {
      if (alive && value) setCurrent(previous => previous && previous.revision >= value.revision ? previous : value)
    }
    if (!('__TAURI_INTERNALS__' in window)) {
      const params = new URLSearchParams(location.search)
      if (params.has('demo')) update({ revision: 1, id: 1, name: params.get('name') || 'Gaming', profileName: params.get('profile') || 'Cyberpunk' })
      const demo = (event: Event) => update((event as CustomEvent<Confirmation>).detail)
      window.addEventListener('slot-confirmation', demo)
      return () => { alive = false; window.removeEventListener('slot-confirmation', demo) }
    }
    void listen<Confirmation>('slot-confirmation', event => update(event.payload)).then(stop => {
      if (!alive) { stop(); return }
      unlisten = stop
      return invoke<Confirmation | null>('slot_toast_ready').then(update)
    }).catch(console.error)
    return () => { alive = false; unlisten?.() }
  }, [])
  if (!current) return null
  return <aside key={current.revision} className="slot-confirmation" role="status" aria-live="polite" aria-atomic="true">
    <span className="slot-number" aria-hidden="true">{current.id}</span>
    <div className="slot-copy"><span className="slot-caption">Slot active</span><strong title={current.name}>{current.name}</strong><span className="slot-profile" title={current.profileName}>{current.profileName}</span></div>
    <svg className="slot-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
  </aside>
}
void restoreAppearance().then(() => { initTheme(); initAccent(); createRoot(document.getElementById('root')!).render(<SlotToast />) })
