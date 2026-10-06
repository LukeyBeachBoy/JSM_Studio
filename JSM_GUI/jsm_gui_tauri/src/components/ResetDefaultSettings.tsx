import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { desktopBridge } from '../platform/desktopBridge'
import { keyboard, defaultPreferences } from '../keyboard/bridge'
import { persistAppearance } from '../appearanceStorage'
import { setFeedbackStrength } from '../nav/feedback'
import { DEFAULT_ACCENT } from '../brand/brand'
export function ResetDefaultSettings() {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reset = async () => {
    setBusy(true); setError('')
    try {
      if ('__TAURI_INTERNALS__' in window) await invoke('reset_default_settings')
      else await keyboard.savePreferences(defaultPreferences)
      const startupReset = await desktopBridge.setAutostartEnabled(false)
      if ('__TAURI_INTERNALS__' in window && !startupReset) throw new Error('Could not reset the startup preference.')
      await persistAppearance('jsm-theme', 'dark')
      await persistAppearance('jsm-accent', DEFAULT_ACCENT)
      await persistAppearance('jsm-language', 'en')
      setFeedbackStrength('medium')
      window.location.reload()
    } catch (e) { setError(String(e)); setBusy(false) }
  }
  return <>
    <button type="button" className="button button--secondary" onClick={() => setConfirm(true)}>Reset default settings</button>
    {confirm && <div className="modal-overlay modal-overlay--over" onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.preventDefault(); setConfirm(false) } }}>
      <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-settings-title">
        <h3 id="reset-settings-title">Reset default settings?</h3>
        <p>Restore startup, controller preferences, keyboard shortcuts and appearance, and re-add the default Global Chords activation with Guide or Quick Access. Your personal configurations and other global chords stay in your library.</p>
        {error && <p role="alert">{error}</p>}
        <div className="confirm-dialog__actions"><button className="button button--secondary" data-modal-close disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button className="button" disabled={busy} onClick={() => void reset()}>Reset defaults</button></div>
      </div>
    </div>}
  </>
}
