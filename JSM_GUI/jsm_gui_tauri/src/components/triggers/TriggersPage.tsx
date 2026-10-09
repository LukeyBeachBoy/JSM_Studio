import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ButtonDefinition } from '../../keymap/schema'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import type { ModeshiftTarget } from '../../utils/modeshift'
import { ModeCards, OpenRow } from '../ui/console'
import { isSet, readNumber, useFocusCurrentCard, useInheritedKeys, MoreMenu, usePadButton, WhileHoldingPage, InputSideProxies, type SetText } from '../sticks/shared'
import { useInputSide, takeFineTuneRequest, useFineTuneRequestVersion } from '../sticks/inputSide'
import { TriggerBlade } from './TriggerBlade'
import { SettingOrigin } from '../SettingOrigin'
import { TriggerFineTune } from './TriggerFineTune'
import { TriggerCalibrate } from './TriggerCalibrate'
import { TRIGGER_CARD_VALUES, TRIGGER_MODE_NAMES, TriggerCardArt, gamepadModeValue, gamepadTarget, hasFullPress, isGamepadTriggerMode, triggerCardValue, type TriggerSide } from './triggerModes'
import p4 from '../sticks/P4.module.css'
import styles from './Triggers.module.css'

// Triggers (console v2, Triggers.dc.html): one trigger at a time, chosen on the
// rail (LT / RT). "Left trigger works as…" picture cards for ZL_MODE, the half
// and full press rows, the live blade, and Fine-tune. Y is More: Calibrate
// (D22), While holding… (D11), Try it in Test.

export type RenderBindingRow = (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; emptyLabel?: string; modeshifts?: boolean; xAction?: { label: string; run: () => void } }) => ReactNode

export type TriggersPageProps = {
  readText: string
  setText?: SetText
  disabled?: boolean
  zlMode: string
  zrMode: string
  onModeChange: (side: TriggerSide, value: string) => void
  threshold: number
  onThresholdChange: (value: string) => void
  adaptiveValue: string
  onAdaptiveChange?: (value: string) => void
  liveDevice?: TelemetryDevice
  /** [half press, full press] for each side: ZL, ZLF / ZR, ZRF. */
  buttons: Record<TriggerSide, ButtonDefinition[]>
  renderButton: RenderBindingRow
  renderModeshifts: (target: ModeshiftTarget) => ReactNode
  /** What a binding sends, short ("Right mouse"), and its own name ("Aim"). */
  describe: (command: string) => { binding: string; label?: string }
  virtualControllerType: string
  onVirtualControllerTypeChange?: (value: 'XBOX' | 'DS4') => void
}

export function TriggersPage(props: TriggersPageProps) {
  useInheritedKeys()
  const { readText, zlMode, zrMode, onModeChange, liveDevice, buttons, renderButton, describe, virtualControllerType } = props
  const side = useInputSide('triggers')
  const root = useRef<HTMLDivElement>(null)
  const [fineTune, setFineTune] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [holding, setHolding] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const mode = (side === 'left' ? zlMode : zrMode) || 'NO_FULL'
  const card = triggerCardValue(mode)
  const gamepad = isGamepadTriggerMode(mode)
  const name = side === 'left' ? 'Left trigger' : 'Right trigger'
  const [half, full] = buttons[side]
  const halfInfo = half ? describe(half.command) : { binding: '' }
  const fullInfo = full ? describe(full.command) : { binding: '' }
  const pull = liveDevice?.status ? liveDevice.status.triggers[side] : null
  const startTest = () => window.dispatchEvent(new Event('jsm:start-test'))
  const passthroughLabel = gamepad ? `Not used · sends as ${virtualControllerType === 'DS4' ? (gamepadTarget(mode) === 'left' ? 'L2' : 'R2') : (gamepadTarget(mode) === 'left' ? 'LT' : 'RT')}` : undefined

  // The header's Calibrate button and Home's shortcuts ask for these by event.
  useEffect(() => {
    const calibrate = () => setCalibrating(true)
    window.addEventListener('jsm:calibrate-triggers', calibrate)
    return () => window.removeEventListener('jsm:calibrate-triggers', calibrate)
  }, [])
  const request = useFineTuneRequestVersion()
  useEffect(() => {
    const taken = takeFineTuneRequest('triggers')
    if (taken) setFineTune(taken.group ?? 'press')
  }, [request])

  usePadButton(root, 'Y', () => setMore(true))
  usePadButton(root, 'X', startTest)
  useFocusCurrentCard(root, side)

  const choose = (value: string) => {
    if (value === 'GAMEPAD') onModeChange(side, gamepad ? mode : gamepadModeValue(side, virtualControllerType))
    else onModeChange(side, value)
  }
  const options = TRIGGER_CARD_VALUES.map(value => ({
    value,
    label: TRIGGER_MODE_NAMES[value].label,
    caption: value === 'GAMEPAD' ? `Analog · sends as ${gamepad ? gamepadTarget(mode) : side} pad trigger` : TRIGGER_MODE_NAMES[value].caption,
    art: <TriggerCardArt mode={value === 'GAMEPAD' ? 'X_LT' : value} side={side} />,
  }))
  const changed = isSet(readText, 'TRIGGER_THRESHOLD', 'TRIGGER_HYSTERESIS', 'TRIGGER_SKIP_DELAY', 'ADAPTIVE_TRIGGER', 'LEFT_TRIGGER_EFFECT', 'RIGHT_TRIGGER_EFFECT', 'LEFT_TRIGGER_OFFSET', 'LEFT_TRIGGER_RANGE', 'RIGHT_TRIGGER_OFFSET', 'RIGHT_TRIGGER_RANGE')
  const shift: ModeshiftTarget = {
    id: `trigger-${side}`, title: name,
    buttons: buttons[side].map(button => ({ command: button.command, label: button.command.endsWith('F') ? 'Full press' : 'Half press', definition: button })),
    mode: { key: side === 'left' ? 'ZL_MODE' : 'ZR_MODE', defaultValue: 'NO_FULL', options: [
      ...TRIGGER_CARD_VALUES.filter(value => value !== 'GAMEPAD').map(value => ({ value, label: TRIGGER_MODE_NAMES[value].label })),
      { value: 'X_LT', label: 'Gamepad trigger · left' }, { value: 'X_RT', label: 'Gamepad trigger · right' },
    ] },
  }
  // B on a top-level tab goes to Layout (App), so the footer says so.
  const stepHints = 'X:Try it in Test;Y:More;LT/RT:Other trigger;B:Layout'

  return (
    <div ref={root} className={p4.front} id={`trigger-${side}`} data-trigger-page={side} data-hints-scope="">
      <InputSideProxies page="triggers" side={side} commands={{ left: ['ZL', 'ZLF'], right: ['ZR', 'ZRF'] }} />
      <header className={p4.frontHeading}>
        <h1>{name} works as…</h1>
        <SettingOrigin setting={side === 'left' ? 'ZL_MODE' : 'ZR_MODE'} />
        <span>Changes apply live.</span>
      </header>
      <ModeCards options={options} value={card} onChange={choose} columns={4} className={styles.cards} hints={stepHints}
        label={undefined} useLabel={option => `Use ${option.label}`} />
      <div className={p4.frontLower} data-wide-visual="true">
        <div className={p4.frontRows}>
          {gamepad && virtualControllerType === 'NONE' && (
            <div className={p4.notice} data-tone="warn" role="status">
              <span>Gamepad trigger needs Xbox or PlayStation output. Until it is on, this trigger sends nothing.</span>
              {props.onVirtualControllerTypeChange && <OpenRow label="Turn on Xbox output" hint="Controller output for this configuration" onOpen={() => props.onVirtualControllerTypeChange?.('XBOX')} hints={`A:Turn on;${stepHints}`} />}
            </div>
          )}
          {half && <div className={styles.bindRow}>{renderButton(half, { label: 'Half press', subtitle: halfInfo.label, emptyLabel: passthroughLabel, modeshifts: true })}</div>}
          {full && (hasFullPress(mode) || fullInfo.binding)
            ? <div className={styles.bindRow}>{renderButton(full, { label: 'Full press', subtitle: hasFullPress(mode) ? fullInfo.label : 'Kept, but not used by this card', emptyLabel: passthroughLabel, modeshifts: true })}</div>
            : full && <OpenRow label="Full press" hint={gamepad ? 'A gamepad trigger has no full press' : 'One press has no full press'} value="Pick a two-step card"
                disabled={gamepad ? 'A gamepad trigger sends the whole pull; pick a two-step card to bind a full press.' : 'One press has no full press. Pick a two-step card above to bind one.'}
                data={{ 'data-input-command': full.command }} hints={stepHints} onOpen={() => {}} />}
          {gamepad && <p className={p4.note}>Half and full press bindings and press points aren’t used while Gamepad trigger is chosen.</p>}
          <OpenRow label="Fine-tune" hint="Press points, resistance, calibration" value={changed ? 'Changed' : 'Default'}
            hints={`A:Open;${stepHints}`} data={{ 'data-trigger-fine-tune': '' }} onOpen={() => setFineTune('press')} />
        </div>
        <TriggerBlade title={`${name}, live`} pull={pull} threshold={props.threshold} margin={readNumber(readText, 'TRIGGER_HYSTERESIS', 0.02)}
          halfName={halfInfo.label || (halfInfo.binding ? halfInfo.binding : undefined)} fullName={fullInfo.label || fullInfo.binding || undefined}
          twoStep={hasFullPress(mode)} gamepad={gamepad} />
      </div>

      <MoreMenu open={more} onClose={() => setMore(false)} eyebrow={`Triggers · ${name}`} title="More"
        items={[
          { id: 'calibrate', label: 'Calibrate triggers', hint: 'Find where a DualSense trigger starts to push back', onSelect: () => setCalibrating(true),
            unavailable: liveDevice?.type === 5 ? undefined : liveDevice ? 'Needs a DualSense: only its triggers push back.' : 'Needs a DualSense connected.' },
          { id: 'holding', label: 'Mode shift', hint: 'Hold another button to change this trigger', onSelect: () => setHolding(true) },
          { id: 'fine-tune', label: 'Fine-tune', hint: 'Press points, resistance, calibration', onSelect: () => setFineTune('press') },
          { id: 'test', label: 'Try it in Test', hint: 'Run this configuration on the controller', onSelect: startTest },
        ]} />
      <WhileHoldingPage open={holding} onClose={() => setHolding(false)} trail={['Triggers', name]}>
        {props.renderModeshifts(shift)}
      </WhileHoldingPage>
      {fineTune && <TriggerFineTune {...props} side={side} group={fineTune} onGroup={setFineTune} onClose={() => setFineTune(null)} onCalibrate={() => setCalibrating(true)} />}
      {calibrating && <TriggerCalibrate readText={readText} setText={props.setText} liveDevice={liveDevice} from={side} onClose={() => setCalibrating(false)} />}
    </div>
  )
}

