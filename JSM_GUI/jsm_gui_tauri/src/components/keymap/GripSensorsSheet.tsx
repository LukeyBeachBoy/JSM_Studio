import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../ui/Sheet'
import { ExpandRow, RowGroup, SummaryRow } from '../ui/SummaryRow'
import { SettingOrigins } from '../SettingOrigin'
import { GRIP_FIRMWARE_DEFAULT } from '../../hooks/useGripConfig'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { gripGuardPercent, gripGuardRaw, gripRangePercent, gripRangeRaw } from '../../utils/gripCalibration'

// Grip sensors (console refinement 2e, D7): how the capacitive grips on the
// back detect your hand. The grips' binding rows stay on Buttons; this sheet
// opens from the Grip sensors row at the foot of Buttons › Grips, or Home.
// The effect pickers unfold under their row on A instead of a row of tiles.

// The Steam Controller 2026's left grip strip sits lower in the shell and
// misses a normal hold (TODO-17): said on X, where the grips are tuned.
const LEFT_GRIP_NOTE = 'On the Steam Controller the left grip reads less reliably: its sensor strip sits lower in the shell, so a normal hold can miss it. Avoid putting a held layer on it; a lost contact drops the layer. A left release delay rides out short drops.'

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
  const range = gripRangePercent(props.sensorRange ?? GRIP_FIRMWARE_DEFAULT)
  const guard = gripGuardPercent(props.flickerGuard ?? GRIP_FIRMWARE_DEFAULT)
  const left = Number.parseFloat(props.leftReleaseDelay) || 0
  const right = Number.parseFloat(props.rightReleaseDelay) || 0
  const touchHaptic = props.hapticIntensity ?? 0
  const releaseHaptic = props.releaseHapticIntensity ?? 0
  const effects = HAPTIC_EFFECT_CHOICES.filter(effect => effect !== 'OFF').map(effect => ({ value: effect, label: EFFECT_NAMES[effect] ?? effect }))
  const live = props.liveGrips
  const contact = (side: 'left' | 'right') => {
    const on = Boolean(live?.[side])
    return (
      <div key={side} role="listitem" className="scope-tile" data-state={on ? 'touching' : 'not'}>
        <span className="scope-tile__dot" aria-hidden="true" />
        <span><b>{side === 'left' ? 'Left grip' : 'Right grip'}</b> · {live ? (on ? 'Touching' : 'Not touching') : 'Controller not connected'}</span>
      </div>
    )
  }

  return (
    <Sheet open={props.open} onClose={props.onClose} eyebrow={`Buttons · Grips · ${config ?? 'Configuration'}`} title="Grip sensors"
      description="How the capacitive grips on the back detect your hand."
      hints={[{ button: 'A', label: 'Adjust' }, { button: 'Y', label: 'Use Default' }, { button: 'X', label: 'What’s this?' }, { button: 'B', label: 'Close' }]}>
      <div className="scope-strip" role="list" aria-label="Live contact">{contact('left')}{contact('right')}</div>

      <RowGroup title="Sensor">
        <SummaryRow size="sheet" label="Touch sensitivity" hint="Shared by both grips (firmware limit)" setting="GRIP_SENSOR_RANGE" mono={range !== undefined}
          value={range === undefined ? 'Controller’s own' : `${range}%`}
          help={`How near your hand must come before a grip counts as contact. One value for both grips: the controller stores a single range.${props.steamController ? ` ${LEFT_GRIP_NOTE}` : ''}`}
          adjust={{ kind: 'number', value: range ?? 80, min: 0, max: 100, step: 1, onChange: value => props.onSensorRangeChange(gripRangeRaw(String(value))) }} />
        <SummaryRow size="sheet" label="Flicker guard" hint="Ignore brief contact changes" setting="GRIP_FLICKER_GUARD" mono={guard !== undefined}
          value={guard === undefined ? 'Controller’s own' : `${guard}%`}
          help="Extra distance a hand must move away before contact ends, so a hand at the edge of range cannot chatter. Applies to both grips."
          adjust={{ kind: 'number', value: guard ?? 27, min: 0, max: 100, step: 1, onChange: value => props.onFlickerGuardChange(gripGuardRaw(String(value))) }} />
        <ExpandRow size="sheet" label="Release delay" hint={`Left ${left} ms · right ${right} ms`} setting="LEFT_GRIP_RELEASE_DELAY" mono
          value={left === right ? `${left} ms` : 'Per side'}
          help={props.steamController ? LEFT_GRIP_NOTE : 'How long a grip keeps reading held after your hand leaves it, per side.'}>
          <SummaryRow size="sheet" label="Left grip" setting="LEFT_GRIP_RELEASE_DELAY" mono value={`${left} ms`}
            adjust={{ kind: 'number', value: left, min: 0, max: 2000, step: 10, onChange: value => props.onReleaseDelayChange('LEFT', String(value)) }} />
          <SummaryRow size="sheet" label="Right grip" setting="RIGHT_GRIP_RELEASE_DELAY" mono value={`${right} ms`}
            adjust={{ kind: 'number', value: right, min: 0, max: 2000, step: 10, onChange: value => props.onReleaseDelayChange('RIGHT', String(value)) }} />
        </ExpandRow>
      </RowGroup>

      <RowGroup title="Haptics">
        <ExpandRow size="sheet" label="On touch" hint="Feedback when a hand arrives" setting="GRIP_HAPTIC_INTENSITY"
          value={touchHaptic > 0 ? `${EFFECT_NAMES[props.hapticEffect ?? 'CLICK'] ?? props.hapticEffect} · ${touchHaptic}%` : 'Off'}
          help={t('keymap.gripHapticHint')}>
          <SummaryRow size="sheet" label="Strength" setting="GRIP_HAPTIC_INTENSITY" mono value={touchHaptic > 0 ? `${touchHaptic}%` : 'Off'}
            adjust={{ kind: 'number', value: touchHaptic, min: 0, max: 100, step: 5, onChange: value => props.onHapticIntensityChange(String(value)) }} />
          <SummaryRow size="sheet" label="Effect" hint={props.hapticEffect === 'PULSE' ? 'Steam’s grip pulse has one fixed strength' : undefined} setting="GRIP_HAPTIC_EFFECT"
            adjust={{ kind: 'choice', value: props.hapticEffect ?? 'CLICK', options: effects, onChange: props.onHapticEffectChange }} />
          <SummaryRow size="sheet" label="Left grip" hint="Pulse when the left grip detects a hand" setting="LEFT_GRIP_HAPTICS"
            toggle={{ on: props.leftGripHaptics ?? true, onChange: props.onLeftGripHapticsChange }} />
          <SummaryRow size="sheet" label="Right grip" hint="Pulse when the right grip detects a hand" setting="RIGHT_GRIP_HAPTICS"
            toggle={{ on: props.rightGripHaptics ?? true, onChange: props.onRightGripHapticsChange }} />
        </ExpandRow>
        <ExpandRow size="sheet" label="On release" hint="Feedback when a hand leaves" setting="GRIP_RELEASE_HAPTIC_INTENSITY"
          value={releaseHaptic > 0 ? `${EFFECT_NAMES[props.releaseHapticEffect ?? 'CLICK'] ?? props.releaseHapticEffect} · ${releaseHaptic}%` : 'Off'}
          help={t('keymap.gripReleaseHapticHint')}>
          <SummaryRow size="sheet" label="Strength" setting="GRIP_RELEASE_HAPTIC_INTENSITY" mono value={releaseHaptic > 0 ? `${releaseHaptic}%` : 'Off'}
            adjust={{ kind: 'number', value: releaseHaptic, min: 0, max: 100, step: 5, onChange: value => props.onReleaseHapticIntensityChange(String(value)) }} />
          <SummaryRow size="sheet" label="Effect" setting="GRIP_RELEASE_HAPTIC_EFFECT"
            adjust={{ kind: 'choice', value: props.releaseHapticEffect ?? 'CLICK', options: effects, onChange: props.onReleaseHapticEffectChange }} />
        </ExpandRow>
      </RowGroup>
    </Sheet>
  )
}
