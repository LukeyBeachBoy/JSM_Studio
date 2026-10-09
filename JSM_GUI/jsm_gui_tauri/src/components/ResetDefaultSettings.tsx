import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { desktopBridge } from '../platform/desktopBridge'
import { keyboard, defaultPreferences } from '../keyboard/bridge'
import { persistAppearance } from '../appearanceStorage'
import { setFeedbackStrength } from '../nav/feedback'
import { DEFAULT_ACCENT } from '../brand/brand'
import { shellBridge } from '../platform/shellBridge'
import { SubPage } from './ui/console'
import settingsStyles from './settings/Settings.module.css'

/** Everything Settings holds back to how it came: startup, controller
 *  settings, shortcuts, look and language (screen distance and config names
 *  too), and Quick tools on the Steam and ··· buttons. Configurations stay. */
export async function resetEverything() {
  if ('__TAURI_INTERNALS__' in window) await invoke('reset_default_settings')
  else await keyboard.savePreferences(defaultPreferences)
  const startupReset = await desktopBridge.setAutostartEnabled(false)
  if ('__TAURI_INTERNALS__' in window && !startupReset) throw new Error('Could not reset the startup preference.')
  await shellBridge.setStartupPreferences({ startInTray: true, startupProfile: 'last' }).catch(() => {})
  await persistAppearance('jsm-theme', 'dark')
  await persistAppearance('jsm-accent', DEFAULT_ACCENT)
  await persistAppearance('jsm-language', 'en')
  await persistAppearance('jsm-density', 'desk')
  await persistAppearance('jsm-config-names', 'off')
  setFeedbackStrength('medium')
  window.location.reload()
}

/** "Reset everything to defaults?" (Settings ▸ Startup): Cancel comes first,
 *  so a stray press changes nothing. */
export function ResetEverythingPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true); setError('')
    try { await resetEverything() } catch (e) { setError(String(e)); setBusy(false) }
  }
  return (
    <SubPage open={open} onClose={() => { if (!busy) onClose() }} crumbRoot="Settings" trail={['Startup']} title="Reset everything" backLabel="Cancel">
      <div className={settingsStyles.mainColumn} style={{ maxWidth: 720 }} role="alertdialog" aria-labelledby="reset-settings-title">
        <h2 id="reset-settings-title" className={settingsStyles.sectionTitle}>Reset everything to defaults?</h2>
        <p className={settingsStyles.panelNote}>Startup, controller settings, shortcuts, look and language go back to how they came. Quick tools returns to the Steam and ··· buttons. Your configurations stay in your library.</p>
        <button type="button" className={settingsStyles.switchRow} data-autofocus="" data-hints="A:Cancel;B:Cancel" disabled={busy} onClick={onClose}>
          <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>Cancel</span><span className={settingsStyles.rowHint}>Nothing changes</span></span>
        </button>
        <button type="button" className={settingsStyles.switchRow} data-hints="A:Reset everything;B:Cancel" disabled={busy} onClick={() => void run()}>
          <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>Reset everything</span><span className={settingsStyles.rowHint}>The app restarts its window when it is done</span></span>
        </button>
        <p className={settingsStyles.note}>Cancel comes first, so a stray press changes nothing.</p>
        {error && <p role="alert">{error}</p>}
      </div>
    </SubPage>
  )
}

/** The old entry point: a row that opens the reset page. */
export function ResetDefaultSettings() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className={settingsStyles.switchRow} data-hints="A:Open;B:Back" onClick={() => setOpen(true)}
      data-caption="Reset everything to defaults · startup, controller settings, shortcuts, look and language; your configurations stay">
      <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>Reset everything to defaults…</span><span className={settingsStyles.rowHint}>Your configurations stay in your library</span></span>
      <span aria-hidden="true">▸</span>
    </button>
    <ResetEverythingPage open={open} onClose={() => setOpen(false)} />
  </>
}
