import { useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
export const BUILTIN_CHORD_NAME = 'Default Global Chords'
export function BuiltinConfigurationDialog({ onClose, onCloned }: { onClose: () => void; onCloned: (name: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clone = async () => {
    setBusy(true)
    try {
      const source = await desktopBridge.loadLibraryProfile(BUILTIN_CHORD_NAME)
      if (!source) throw new Error('Could not load the built-in configuration.')
      const created = await desktopBridge.createLibraryProfile('My Quick tools')
      if (!created || !await desktopBridge.saveLibraryProfile(created.name, source.content)) throw new Error('Could not clone the built-in configuration.')
      onCloned(created.name)
    } catch (e) { setError(String(e)); setBusy(false) }
  }
  return <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose() } }}><div className="modal-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="builtin-config-title"><h3 id="builtin-config-title">Make your own copy</h3><p>Quick tools is built in and can’t be changed, renamed or deleted. Copy it, and Hold to swap swaps in your copy instead. It goes in your library as “My Quick tools”.</p>{error && <p role="alert">{error}</p>}<div className="confirm-dialog__actions"><button className="button button--secondary" data-modal-close disabled={busy} onClick={onClose}>Not now</button><button className="button" disabled={busy} onClick={() => void clone()}>Make my own copy</button></div></div></div>
}
