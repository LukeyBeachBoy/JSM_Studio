import { useState } from 'react'
import { scopedConfig, replaceScope } from '../utils/configScopes'
import { HelpButton } from './HelpButton'
import { showToast } from '../utils/toast'

const TUNING_KEYS = {
  trackpad: /^(?:(?:LEFT_|RIGHT_)?TOUCHPAD_(?:SENS|MIN_CUTOFF|SPEED_COEFF|D_CUTOFF|TRACKBALL_|MOVEMENT_|CLICK_DAMPEN|LIFT_|RELEASE_|HAPTIC_|CLICK_HAPTIC_|ACCEL)|ACCEL_CURVE_LINK)/,
  grip: /^(?:(?:LEFT_|RIGHT_)?GRIP_)/,
  gyro: /^(?:(?:MIN_|MAX_)?GYRO_|ACCEL_|ROLL_CONTRIBUTION|IN_GAME_SENS|REAL_WORLD_CALIBRATION|CUTOFF_|SMOOTH_|ONE_EURO_|ANGLE_SNAP|DECEL_BRAKE)/,
}
type Kind = keyof typeof TUNING_KEYS
export function TuningClipboard({ kind, text, onChange, disabled }: { kind: Kind; text: string; onChange: (text: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ format: 'jsm-tuning-v1', kind, text: scopedConfig(text, TUNING_KEYS[kind]) }))
      showToast(`Copied ${kind} tuning`)
    } catch { showToast('Clipboard access failed.', 'error') }
  }
  const paste = async () => {
    setBusy(true)
    try {
      const data = JSON.parse(await navigator.clipboard.readText())
      if (data.format !== 'jsm-tuning-v1' || data.kind !== kind || typeof data.text !== 'string' || data.text.length > 100000) throw new Error()
      const filtered = scopedConfig(data.text, TUNING_KEYS[kind])
      if (filtered !== data.text) throw new Error()
      onChange(replaceScope(text, filtered, TUNING_KEYS[kind]))
      showToast(`Pasted ${kind} tuning. Save and apply when ready.`)
    } catch { showToast(`Copy ${kind} tuning from another configuration first.`, 'error') }
    finally { setBusy(false) }
  }
  return <div className="editor-tools">
    <button className="ghost-btn" onClick={() => void copy()} disabled={disabled || busy}>Copy tuning</button>
    <button className="ghost-btn" onClick={() => void paste()} disabled={disabled || busy}>Paste tuning</button>
    <HelpButton title="Copy tuning">Copy these settings, open another configuration, and paste them here. Pasting replaces this tuning section, including defaults. You can undo it before saving. Button bindings stay as they are.</HelpButton>
  </div>
}
