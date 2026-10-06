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
      const created = await desktopBridge.createLibraryProfile('Personal Default Global Chords')
      if (!created || !await desktopBridge.saveLibraryProfile(created.name, source.content)) throw new Error('Could not clone the built-in configuration.')
      onCloned(created.name)
    } catch (e) { setError(String(e)); setBusy(false) }
  }
  return <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose() } }}><div className="modal-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="builtin-config-title"><h3 id="builtin-config-title">Built-in configuration</h3><p>Built-in configurations cannot be edited, renamed or deleted. Clone this layout to create a Personal configuration with your own bindings.</p>{error && <p role="alert">{error}</p>}<div className="confirm-dialog__actions"><button className="button button--secondary" data-modal-close disabled={busy} onClick={onClose}>Cancel</button><button className="button" disabled={busy} onClick={() => void clone()}>Clone as Personal</button></div></div></div>
}
