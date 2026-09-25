import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import keymapStyles from '../Keymap.module.css'
import styles from './Grips.module.css'
import { SectionActions } from '../SectionActions'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { NumberField } from '../NumberField'
import { Icon } from '../icons/Icon'
import { gripRangePercent, gripGuardPercent, gripRangeRaw, gripGuardRaw } from '../../utils/gripCalibration'

type Props = {
  leftGripHaptics?: boolean
  rightGripHaptics?: boolean
  onLeftGripHapticsChange?: (enabled: boolean) => void
  onRightGripHapticsChange?: (enabled: boolean) => void
  gripSensorRange?: number
  gripFlickerGuard?: number
  gripHapticIntensity?: number
  gripHapticEffect?: string
  gripReleaseHapticIntensity?: number
  gripReleaseHapticEffect?: string
  onGripSensorRangeChange?: (v: string) => void
  onGripFlickerGuardChange?: (v: string) => void
  onGripHapticIntensityChange?: (v: string) => void
  onGripHapticEffectChange?: (v: string) => void
  onGripReleaseHapticIntensityChange?: (v: string) => void
  onGripReleaseHapticEffectChange?: (v: string) => void
  /** Live contact from telemetry; null when no controller is connected. */
  liveGrips?: { left: boolean; right: boolean } | null
  /** The two grips' binding rows, right then left as on the controller's back. */
  bindings?: ReactNode
  leftReleaseDelay?: string
  rightReleaseDelay?: string
  onReleaseDelayChange?: (side: 'LEFT' | 'RIGHT', value: string) => void
  /** Steam Controller 2026, whose left grip reads less reliably (TODO-17). */
  steamController?: boolean
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

const EFFECT_NAMES: Record<string, string> = { TICK: 'Tick', CLICK: 'Click', TONE: 'Tone', RUMBLE: 'Rumble', SWEEP: 'Sweep', PULSE: 'Pulse', TAP: 'Tap' }

// Haptic effects as tiles (Tuning and Studio Pages 16a). Pulse is Steam's own
// grip pulse and has one strength, so it says so.
function HapticTiles({ value, onChange, disabled, label }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string }) {
  const { t } = useTranslation()
  return (
    <div className={styles.hapticTiles} role="radiogroup" aria-label={label}>
      {HAPTIC_EFFECT_CHOICES.filter(effect => effect !== 'OFF').map(effect => (
        <button key={effect} type="button" role="radio" aria-checked={value === effect} className={styles.hapticTile}
          disabled={disabled} onClick={() => onChange(effect)} data-hints="A:Choose;B:Back">
          <Icon name="haptic" size={22} />
          <span title={t(`keymap.hapticEffect_${effect}`)}>{EFFECT_NAMES[effect] ?? effect}</span>
          {effect === 'PULSE' && <small>fixed</small>}
        </button>
      ))}
    </div>
  )
}

// Grip sensors (Tuning and Studio Pages 16a): live contact beside the grips'
// bindings, the one sensor range and flicker guard both grips share (a
// firmware limit, said so), each side's release delay, then the haptics.
export function GripSettingsSection(props: Props) {
  const { t } = useTranslation()
  const range = props.gripSensorRange ?? GRIP_FIRMWARE_DEFAULT
  const guard = props.gripFlickerGuard ?? GRIP_FIRMWARE_DEFAULT
  const haptic = props.gripHapticIntensity ?? 0
  const hapticEffect = props.gripHapticEffect ?? 'CLICK'
  const releaseHaptic = props.gripReleaseHapticIntensity ?? 0
  const releaseHapticEffect = props.gripReleaseHapticEffect ?? 'CLICK'
  // Unset means "leave the controller's own value"; the pill is too narrow to say so.
  const inherited = 'auto'
  const live = props.liveGrips

  const bar = (side: 'left' | 'right') => {
    const on = !!live?.[side]
    return (
      <div className={styles.contact}>
        <div className={styles.contactBar} data-on={on || undefined}><span className={styles.contactFill} /></div>
        <b className={on ? styles.contactOn : undefined}>{side === 'left' ? 'Left' : 'Right'}</b>
        <small>{live ? (on ? 'contact' : 'open') : '—'}</small>
      </div>
    )
  }

  return (
    <>
      <div className={styles.gripPage}>
        <aside className={styles.liveCard} aria-label="Live contact">
          <span className={styles.eyebrow}>Live contact</span>
          <div className={styles.contacts}>{bar('left')}{bar('right')}</div>
          <p className={styles.note}>{live
            ? 'Each grip is one contact bit from the controller; range and flicker guard decide when it trips.'
            : 'Connect the controller to see each grip’s contact live.'}</p>
        </aside>

        <div className={styles.gripMain}>
          {props.bindings && <>
            <span className={styles.eyebrow}>Bindings</span>
            <div className={styles.bindings}>{props.bindings}</div>
          </>}

          <span className={styles.eyebrow}>Sensor · both grips <em>One shared range and flicker guard is a firmware limit</em></span>
          <NumberField setting="GRIP_SENSOR_RANGE"
            label="Range"
            value={gripRangePercent(range)}
            onChange={v => props.onGripSensorRangeChange?.(gripRangeRaw(v))}
            min={0} max={100} step={1} coarseStep={10} defaultValue={80} unit="%"
            placeholder={inherited}
            hint="How near your hand must come before a grip counts as contact. Applies to both grips; it is stored on the controller."
          />
          <NumberField setting="GRIP_FLICKER_GUARD"
            label="Flicker guard"
            value={gripGuardPercent(guard)}
            onChange={v => props.onGripFlickerGuardChange?.(gripGuardRaw(v))}
            min={0} max={100} step={1} coarseStep={10} defaultValue={27} unit="%"
            placeholder={inherited}
            hint="Extra distance a hand must move away before contact ends, so a hand at the edge of range cannot chatter. Applies to both grips."
          />
          {props.onReleaseDelayChange && (
            <div className={styles.pair}>
              <NumberField setting="LEFT_GRIP_RELEASE_DELAY"
                label="Left release delay" value={props.leftReleaseDelay ?? ''} placeholder="0"
                onChange={v => props.onReleaseDelayChange?.('LEFT', v)} min={0} max={2000} step={10} coarseStep={100} unit="ms"
                hint="Per side. How long the left grip keeps reading held after your hand leaves it."
              />
              <NumberField setting="RIGHT_GRIP_RELEASE_DELAY"
                label="Right release delay" value={props.rightReleaseDelay ?? ''} placeholder="0"
                onChange={v => props.onReleaseDelayChange?.('RIGHT', v)} min={0} max={2000} step={10} coarseStep={100} unit="ms"
                hint="Per side. How long the right grip keeps reading held after your hand leaves it."
              />
            </div>
          )}
          {props.steamController && (
            <p className={styles.warning}>The left grip reads less reliably on this controller. Avoid binding a held layer to it; a lost contact would drop the layer. A left release delay rides out short drops.</p>
          )}

          <span className={styles.eyebrow}>Grip haptic</span>
          <div className={styles.switches}>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={props.leftGripHaptics ?? true} onChange={e => props.onLeftGripHapticsChange?.(e.target.checked)} />
              <span>{t('keymap.leftGripHaptics', 'Left grip')}</span>
            </label>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={props.rightGripHaptics ?? true} onChange={e => props.onRightGripHapticsChange?.(e.target.checked)} />
              <span>{t('keymap.rightGripHaptics', 'Right grip')}</span>
            </label>
          </div>
          <HapticTiles label="Contact haptic" value={hapticEffect} onChange={v => props.onGripHapticEffectChange?.(v)} />
          <NumberField setting="GRIP_HAPTIC_INTENSITY"
            label="Intensity" value={haptic} onChange={v => props.onGripHapticIntensityChange?.(v)}
            min={0} max={100} step={1} unit="%"
            hint={t('keymap.gripHapticHint')}
          />

          <span className={styles.eyebrow}>Release haptic</span>
          <HapticTiles label="Release haptic" value={releaseHapticEffect} onChange={v => props.onGripReleaseHapticEffectChange?.(v)} />
          <NumberField setting="GRIP_RELEASE_HAPTIC_INTENSITY"
            label="Intensity" value={releaseHaptic} onChange={v => props.onGripReleaseHapticIntensityChange?.(v)}
            min={0} max={100} step={1} unit="%"
            hint={t('keymap.gripReleaseHapticHint')}
          />
        </div>
      </div>
      <SectionActions
        className={keymapStyles.keymapSectionActions}
        hasPendingChanges={props.hasPendingChanges}
        statusMessage={props.statusMessage}
        onApply={props.onApply}
        onCancel={props.onCancel}
        applyDisabled={props.applyDisabled}
      />
    </>
  )
}
