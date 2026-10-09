import { useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { getPreferenceSnapshot, patchRuntimePreferences } from '../platform/preferenceStore'
import { controllerPreferencesFromRuntime } from '../utils/controllerPreferences'
import { showToast } from '../utils/toast'
import { Dialog } from './ui/Dialog'

export function FirmwareSoundPrompt({ onOpenPreferences }: { onOpenPreferences: () => void }) {
  const [busy, setBusy] = useState(false)
  const choose = async (silence: boolean) => {
    setBusy(true)
    try {
      const next = controllerPreferencesFromRuntime(getPreferenceSnapshot().runtime)
      next.firmwareSoundPromptDone = true
      if (silence) next.bootSoundLevel = 0
      const saved = await desktopBridge.setControllerPreferences(next)
      patchRuntimePreferences(saved)
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false) }
  }
  return <Dialog title="Controller power-on sound" eyebrow="First connection" width={560} className="sound-dialog" onClose={() => void choose(false)}
    actions={<><button type="button" className="button button--secondary" disabled={busy} onClick={() => void choose(false)}>Keep them</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void choose(true)}>Silence the controller's sounds</button></>}>
    <p>The Steam Controller plays its own start-up jingle first, then JSM Evolved plays its connect sound. Silence the controller's own jingles so the JSM Evolved sounds play alone?</p>
    <p className="prefs-note">This also silences the controller's lost-connection and low-battery cues. You can change it later.</p>
    <button type="button" className="button button--secondary" onClick={() => { void choose(false).then(onOpenPreferences) }}>Open Settings ▸ Controller sounds</button>
  </Dialog>
}
