import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../ui/Sheet'
import { ValueRow, SegmentedRow, OpenRow } from '../ui/console'
import { SettingOrigins } from '../SettingOrigin'
import { Icon } from '../icons/Icon'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { gripGuardPercent, gripGuardStepRaw, gripRangePercent, gripRangeStepRaw } from '../../utils/gripCalibration'
import { previewHaptic, type HapticPreviewSide } from '../../utils/hapticPreview'
import steamBack from '../../assets/controllers/steam-back.svg?raw'
import styles from './GripSensors.module.css'

// Grip sensors (console v2, GripSensors.dc.html): Buttons ▸ Grips ▸ Fine-tune,
// a 700px sheet. The back of the controller with each grip's live contact, the
// touch point on a range scale, flicker guard, how long a grip keeps holding
// after you let go, the squeeze and let-go rumbles, and which grips rumble.
// Telemetry carries one contact bit per grip, so the meters show touching or
// not; the range scale is the setting, drawn, not a live distance.

// The Steam Controller 2026's left grip strip sits lower in the shell and
// misses a normal hold (TODO-17): said on X, where the grips are tuned.
const LEFT_GRIP_NOTE = 'On the Steam Controller the left grip reads less reliably: its sensor strip sits lower in the shell, so a normal hold can miss it. Avoid putting a held mode on it; a lost contact drops the mode. Keep holding after you let go rides out short drops.'

const EFFECT_NAMES: Record<string, string> = { TICK: 'Tick', CLICK: 'Click', TONE: 'Tone', RUMBLE: 'Rumble', SWEEP: 'Sweep', PULSE: 'Pulse', TAP: 'Tap' }

type Props = {
  open: boolean
  onClose: () => void
  /** Live contact from telemetry; null when no controller is connected. */
  liveGrips: { left: boolean; right: boolean } | null
  steamController: boolean
  sensorRange?: number
  flickerGuard?: number
  leftReleaseDelay: string
  rightReleaseDelay: string
  hapticIntensity?: number
  hapticEffect?: string
  releaseHapticIntensity?: number
  releaseHapticEffect?: string
  leftGripHaptics?: boolean
  rightGripHaptics?: boolean
  onSensorRangeChange: (raw: string) => void
  onFlickerGuardChange: (raw: string) => void
  onReleaseDelayChange: (side: 'LEFT' | 'RIGHT', value: string) => void
  onHapticIntensityChange: (value: string) => void
  onHapticEffectChange: (value: string) => void
  onReleaseHapticIntensityChange: (value: string) => void
  onReleaseHapticEffectChange: (value: string) => void
  onLeftGripHapticsChange: (on: boolean) => void
  onRightGripHapticsChange: (on: boolean) => void
}

export function GripSensorsSheet(props: Props) {
  const { t } = useTranslation()
  const config = useContext(SettingOrigins).config
  const [open, setOpen] = useState<null | 'delay' | 'squeeze' | 'letgo'>(null)
  const [explain, setExplain] = useState(false)
  const range = gripRangePercent(props.sensorRange ?? GRIP_FIRMWARE_DEFAULT)
  const guard = gripGuardPercent(props.flickerGuard ?? GRIP_FIRMWARE_DEFAULT)
  const left = Number.parseFloat(props.leftReleaseDelay) || 0
  const right = Number.parseFloat(props.rightReleaseDelay) || 0
  const touchHaptic = props.hapticIntensity ?? 0
  const releaseHaptic = props.releaseHapticIntensity ?? 0
  const effects = HAPTIC_EFFECT_CHOICES.filter(effect => effect !== 'OFF').map(effect => ({ value: effect, label: EFFECT_NAMES[effect] ?? effect }))
  const live = props.liveGrips
  const leftOn = props.leftGripHaptics ?? true
  const rightOn = props.rightGripHaptics ?? true
  const rumbleOn = leftOn && rightOn ? 'both' : leftOn ? 'left' : rightOn ? 'right' : 'neither'
  const previewSide: HapticPreviewSide = leftOn === rightOn ? 'both' : leftOn ? 'left' : 'right'
  const touchEffect = props.hapticEffect ?? 'CLICK'
  const releaseEffect = props.releaseHapticEffect ?? 'CLICK'
  const preview = (effect: string, strength: number) => previewHaptic(effect, strength, previewSide, true)
  const help = { label: 'What’s this?', run: () => setExplain(value => !value) }
  const rumbleValue = (strength: number, effect: string) => strength > 0 ? `${strength}% · ${EFFECT_NAMES[effect] ?? effect}` : `Off · ${EFFECT_NAMES[effect] ?? effect}`

  return (
    <Sheet open={props.open} onClose={props.onClose} eyebrow={`Buttons · Grips · Fine-tune · ${config ?? 'Configuration'}`} title="Grip sensors" width={700}
      actions={<span className={styles.sheetIcon} aria-hidden="true"><Icon name="grips" size={22} /></span>}
      hints={[{ button: 'A', label: 'Adjust' }, { button: 'X', label: 'What’s this?' }, { button: 'Y', label: 'Use default' }, { button: 'B', label: 'Done' }]}>
      <div className={styles.live} data-grip-live="">
        <div className={styles.back} aria-hidden="true">
          <div className={styles.backArt} dangerouslySetInnerHTML={{ __html: steamBack }} />
          <svg viewBox="0 0 1117 750" className={styles.backMarks}>
            <ellipse cx="78" cy="536" rx="42" ry="122" fill={live?.left ? 'rgba(166,214,90,.16)' : 'none'} stroke={live?.left ? '#a6d65a' : 'rgba(255,255,255,.18)'} strokeWidth="6" />
            <ellipse cx="1039" cy="536" rx="42" ry="122" fill={live?.right ? 'rgba(166,214,90,.16)' : 'none'} stroke={live?.right ? '#a6d65a' : 'rgba(255,255,255,.18)'} strokeWidth="6" />
          </svg>
        </div>
        <div className={styles.meters} role="list" aria-label="Live contact">
          {(['right', 'left'] as const).map(side => {
            const on = Boolean(live?.[side])
            return (
              <div key={side} role="listitem" className={styles.meter} data-state={on ? 'touching' : 'not'}>
                <span className={styles.meterHead}><b>{side === 'left' ? 'Left grip' : 'Right grip'}</b><span>{live ? (on ? '● Touching' : 'Not touching') : 'Controller not connected'}</span></span>
                <span className={styles.meterTrack}><span style={{ width: on ? '92%' : '12%' }} /></span>
              </div>
            )
          })}
        </div>
      </div>
      {explain && <p className={styles.explain} role="note">The grips on the back sense your hand without being pressed. How close counts as touching is one range for both grips (the controller stores one).{props.steamController ? ` ${LEFT_GRIP_NOTE}` : ''}</p>}

      <div className={styles.rows}>
        <ValueRow hero label="How close counts as touching" setting="GRIP_SENSOR_RANGE" value={range ?? 80} min={0} max={100} step={5} fineStep={1}
          format={value => range === undefined ? 'Default' : `${value}%`} onX={help}
          caption="Both grips share one range."
          onChange={value => props.onSensorRangeChange(gripRangeStepRaw(props.sensorRange, value))} onReset={() => props.onSensorRangeChange('')} />
        <GripScale range={range ?? 80} guard={guard ?? 27} />
        <ValueRow label="Flicker guard" hint="The hatched gap a hand must clear before a touch ends" setting="GRIP_FLICKER_GUARD" value={guard ?? 27} min={0} max={100} step={5} fineStep={1}
          format={value => guard === undefined ? 'Default' : `${value}%`} onX={help}
          onChange={value => props.onFlickerGuardChange(gripGuardStepRaw(props.flickerGuard, value))} onReset={() => props.onFlickerGuardChange('')} />
        <OpenRow label="Keep holding after you let go" hint={`Rides out short drops · left ${left} ms · right ${right} ms`} value={left === 0 && right === 0 ? 'Default' : left === right ? `${left} ms` : 'Per side'}
          hints="A:Open;X:What’s this?;B:Done" data={{ 'data-setting': 'LEFT_GRIP_RELEASE_DELAY' }} onOpen={() => setOpen(open === 'delay' ? null : 'delay')} />
        {open === 'delay' && <div className={styles.nested}>
          <ValueRow label="Left grip" setting="LEFT_GRIP_RELEASE_DELAY" value={left} min={0} max={2000} step={10} format={value => `${value} ms`}
            onChange={value => props.onReleaseDelayChange('LEFT', String(value))} onReset={() => props.onReleaseDelayChange('LEFT', '')} />
          <ValueRow label="Right grip" setting="RIGHT_GRIP_RELEASE_DELAY" value={right} min={0} max={2000} step={10} format={value => `${value} ms`}
            onChange={value => props.onReleaseDelayChange('RIGHT', String(value))} onReset={() => props.onReleaseDelayChange('RIGHT', '')} />
        </div>}
        <OpenRow label="Squeeze rumble" hint={`When a hand arrives · ${t('keymap.gripHapticHint', '')}`.replace(/ · $/, '')} value={rumbleValue(touchHaptic, touchEffect)}
          hints="A:Open;X:What’s this?;B:Done" data={{ 'data-setting': 'GRIP_HAPTIC_INTENSITY' }} onOpen={() => setOpen(open === 'squeeze' ? null : 'squeeze')} />
        {open === 'squeeze' && <div className={styles.nested}>
          <ValueRow label="Strength" hint={live ? undefined : 'Connect the controller to feel a preview'} setting="GRIP_HAPTIC_INTENSITY" value={touchHaptic} min={0} max={100} step={5} format={value => value === 0 ? 'Off' : `${value}%`}
            onX={{ label: 'Feel it', run: () => preview(touchEffect, touchHaptic) }}
            onChange={value => { props.onHapticIntensityChange(String(value)); preview(touchEffect, value) }} onReset={() => props.onHapticIntensityChange('')} />
          <SegmentedRow label="Effect" hint={touchEffect === 'PULSE' ? 'Steam’s grip pulse has one fixed strength' : undefined} setting="GRIP_HAPTIC_EFFECT" value={touchEffect} options={effects}
            onX={{ label: 'Feel it', run: () => preview(touchEffect, touchHaptic) }} onChange={value => { props.onHapticEffectChange(value); preview(value, touchHaptic) }} />
        </div>}
        <OpenRow label="Let-go rumble" hint="When a hand leaves" value={rumbleValue(releaseHaptic, releaseEffect)}
          hints="A:Open;X:What’s this?;B:Done" data={{ 'data-setting': 'GRIP_RELEASE_HAPTIC_INTENSITY' }} onOpen={() => setOpen(open === 'letgo' ? null : 'letgo')} />
        {open === 'letgo' && <div className={styles.nested}>
          <ValueRow label="Strength" hint={live ? undefined : 'Connect the controller to feel a preview'} setting="GRIP_RELEASE_HAPTIC_INTENSITY" value={releaseHaptic} min={0} max={100} step={5} format={value => value === 0 ? 'Off' : `${value}%`}
            onX={{ label: 'Feel it', run: () => preview(releaseEffect, releaseHaptic) }}
            onChange={value => { props.onReleaseHapticIntensityChange(String(value)); preview(releaseEffect, value) }} onReset={() => props.onReleaseHapticIntensityChange('')} />
          <SegmentedRow label="Effect" setting="GRIP_RELEASE_HAPTIC_EFFECT" value={releaseEffect} options={effects}
            onX={{ label: 'Feel it', run: () => preview(releaseEffect, releaseHaptic) }} onChange={value => { props.onReleaseHapticEffectChange(value); preview(value, releaseHaptic) }} />
        </div>}
        <SegmentedRow label="Rumble on" hint="Which grips pulse" setting="LEFT_GRIP_HAPTICS" value={rumbleOn} onX={help}
          options={[{ value: 'both', label: 'Both grips' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'neither', label: 'Neither' }]}
          onChange={value => { props.onLeftGripHapticsChange(value === 'both' || value === 'left'); props.onRightGripHapticsChange(value === 'both' || value === 'right') }} />
      </div>
    </Sheet>
  )
}

/** The range scale: far … let go … touch, with the hatched flicker-guard gap. */
function GripScale({ range, guard }: { range: number; guard: number }) {
  const touch = 20 + (range / 100) * 520
  const letGo = Math.max(20, touch - (guard / 100) * 260)
  return (
    <svg viewBox="0 0 560 60" className={styles.scale} role="img" aria-label={`Touch at ${range}%, lets go ${guard}% further out`}>
      <defs><pattern id="grip-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V6" stroke="rgba(166,214,90,.5)" strokeWidth="2" /></pattern></defs>
      <rect x="20" y="16" width="520" height="10" rx="5" fill="#0e1419" />
      <rect x="20" y="16" width={Math.max(0, letGo - 20)} height="10" rx="5" fill="rgba(166,214,90,.35)" />
      <rect x={letGo} y="16" width={Math.max(0, touch - letGo)} height="10" fill="url(#grip-hatch)" />
      <circle cx={letGo} cy="21" r="7" fill="#aebbc8" />
      <circle cx={touch} cy="21" r="9" fill="#e3eaf1" stroke="var(--accent)" strokeWidth="3" />
      <text x="20" y="48" fill="#808c99" fontSize="12">Far</text>
      <text x={letGo} y="48" fill="#808c99" fontSize="12" textAnchor="middle">Let go</text>
      <text x={touch} y="48" fill="#e3eaf1" fontSize="12" fontWeight="600" textAnchor="middle">Touch</text>
    </svg>
  )
}
