import { useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SubPage, ModeCards, ValueRow, SegmentedRow, OpenRow, type ModeCard } from '../../ui/console'
import { Menu, type MenuItem } from '../../ui/Menu'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../icons/Icon'
import { LightBarPicker } from '../LightBarPicker'
import { CycleStepsEditor } from './CycleStepsEditor'
import { LayerUsageContext } from '../../LayerBar'
import { useShell } from '../../../shell/ShellContext'
import { useSoundLibrary } from '../../../hooks/useSoundLibrary'
import { desktopBridge } from '../../../platform/desktopBridge'
import { requestValueEntry } from '../../../nav/textEntry'
import { inputPage } from '../../../utils/inputNavigation'
import { inputDisplayName } from '../../../keymap/inputNames'
import { BUILT_IN_SOUNDS, SOUND_GAIN_MIN_DB, playSoundTarget, playSoundToken } from '../../../utils/controllerSounds'
import { CYCLE_MAX_STEPS, cycleBinding } from '../../../utils/cycleBinding'
import { HAPTIC_EFFECT_CHOICES, HAPTIC_GAIN_MAX, HAPTIC_GAIN_MIN, formatHapticBinding, type HapticSide } from '../../../utils/hapticBindings'
import { rumbleBinding } from '../../../utils/bindingParameters'
import { loadConfigBindingName, loadConfigBindingValue } from '../../../utils/loadConfigBinding'
import { layerVerbKeys, layerVerbOrder } from '../../../utils/layers'
import { isReleasedInput, withRelease } from '../../../utils/released'
import { STICK_MODE_VALUES, formatStickModeLabel } from '../../../constants/sticks'
import { describeCommandOutput } from '../../../utils/bindingDescription'
import type { BindingCommand, BindingOutputBehavior } from '../../../utils/bindingCommands'
import { COMMON_ACTIVATIONS, nameSuggestions, activationLabel, behaviourLimits, commandParameters, commandsFor, type ActivationRef, type BindingApi } from './model'
import { BehaviourArt } from './art'
import { requestTest, usePadButtons, useTurboDefault } from './hooks'
import styles from './binding.module.css'

// Binding ▸ Fine-tune (console v2, BindingFineTune): a full-screen page for the
// selected "When you…" activation. "How Space is sent" is four compare cards
// (Normal / Send once / Toggle on/off / Only when let go); "Only for some actions" shows the cards that apply to
// what it sends (Cycle, Rumble, Sound, and the others listed in notes/BIND.md).
// Footer: ◂ ▸ Compare · A Choose · X Try it · Y Rename, copy, remove · B Back.

const PAGE_NAMES: Record<ReturnType<typeof inputPage>, string> = { buttons: 'Buttons', triggers: 'Triggers', joysticks: 'Sticks', touchpad: 'Trackpads' }
const BEHAVIOURS: BindingOutputBehavior[] = ['normal', 'tapOnce', 'toggle', 'releaseOnly']
const BEHAVIOUR_LABELS: Record<BindingOutputBehavior, [string, string]> = {
  normal: ['keymap.commandBehaviorNormal', 'Normal'],
  tapOnce: ['keymap.commandBehaviorTapOnce', 'Send once'],
  toggle: ['keymap.commandBehaviorToggle', 'Toggle on/off'],
  releaseOnly: ['keymap.commandBehaviorReleaseOnly', 'Only when let go'],
}
const behaviourText = (behaviour: BindingOutputBehavior, out: string, input: string) => ({
  normal: `${out} stays down for as long as you hold ${input}.`,
  tapOnce: `A quick tap of ${out}, however long you hold ${input}.`,
  toggle: `First press holds ${out} down. The next press lets it go.`,
  releaseOnly: `Sends just the let-go of ${out}. Ends a hold or a toggle.`,
})[behaviour]

/** The Fine-tune fold row's value: "Default", or what has been changed. */
export function fineTuneSummary(_api: BindingApi, command: BindingCommand | undefined, t: TFunction) {
  const parts: string[] = []
  if (command && command.outputBehavior !== 'normal') parts.push(t(BEHAVIOUR_LABELS[command.outputBehavior][0], BEHAVIOUR_LABELS[command.outputBehavior][1]))
  if (command?.turboIntervalMs) parts.push(`Turbo ${command.turboIntervalMs} ms`)
  return parts.length ? parts.join(' · ') : t('bind.default', 'Default')
}

type Props = {
  /** One of several commands on the activation (Y on its chip); else the first. */
  commandId?: string
  api: BindingApi
  activation: ActivationRef
  /** The command moved to another way of pressing: the page follows it. */
  onMoveTo: (activation: ActivationRef) => void
  activationName: string
  onClose: () => void
  /** Change a pair's other input (Press together with…, Stick diagonal). */
  onChangePair: (command: BindingCommand) => void
}

export function FineTunePage({ api, activation, activationName, commandId, onMoveTo, onClose, onChangePair }: Props) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  const shell = useShell()
  const root = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  const own = commandsFor(api.commands, activation)
  // A real row first (not an empty draft, not NONE), then a layer switch, a
  // gyro setting or the light while held: never "Unbound" as a thing that is sent.
  const isSet = (item: BindingCommand) => { const value = item.outputValue.trim(); return value !== '' && value.toUpperCase() !== 'NONE' }
  const command = (commandId ? own.find(item => item.id === commandId) : undefined)
    ?? own.find(item => item.source.kind === 'row' && isSet(item))
    ?? own.find(item => item.source.kind !== 'row')
    ?? own.find(isSet)
    ?? own[0]
  const out = command ? describeCommandOutput(command, layers, t) || 'it' : 'it'
  const input = api.shortName
  const limits = behaviourLimits(command)
  // The compare cards are a choice only when more than one way is open (a key,
  // a click, a command); a layer switch, a gyro setting, the light or a menu is
  // sent the one way it can be, and says so in a line instead (L6).
  const choosable = limits.allowed.size > 1
  const page = PAGE_NAMES[inputPage(api.button.command.toUpperCase())]
  const heldWord = activation.kind === 'turbo' ? `while ${input} repeats` : `while you ${activation.kind === 'regular' ? 'hold' : activationLabel(activation.kind, t).toLowerCase()} ${input}`
  const oneWay = (() => {
    if (!command) return t('bind.noCommand', 'Choose what this sends first; then how it is sent can change.')
    if (command.source.kind === 'layerAction') {
      const { action } = command.source
      const layer = layers.find(item => item.id === action.layerId)?.name ?? action.layerId
      const on = isReleasedInput(action.input) ? `when you let go of ${input}` : action.verb === 'hold' ? `while ${input} is held` : `when you press ${input}`
      return `${out}: ${action.verb === 'hold' ? `${layer} is on ${on}` : `${layer} ${action.verb === 'toggle' ? 'switches' : action.verb === 'apply' ? 'turns on' : 'turns off'} ${on}`}. The Switch layer card below changes how.`
    }
    if (command.source.kind === 'special') return `Turns gyro ${/OFF/i.test(command.outputValue) ? 'off' : 'on'} while ${input} is held. Change it on the Gyro tab.`
    if (command.source.kind === 'heldLed') return `The light changes while ${input} is held and goes back when you let go.`
    if (command.source.kind === 'stickShift') return `The stick works another way while ${input} is held. The Stick mode shift card below changes which.`
    return limits.reason ?? `${out} is sent the one way it can be.`
  })()

  const cards: ModeCard[] = BEHAVIOURS.map(behaviour => ({
    value: behaviour,
    label: t(BEHAVIOUR_LABELS[behaviour][0], BEHAVIOUR_LABELS[behaviour][1]),
    caption: behaviourText(behaviour, out === 'it' ? 'the key' : out, input),
    art: <BehaviourArt behaviour={behaviour} input={input} output={out === 'it' ? 'Key' : out} />,
    unavailable: limits.allowed.has(behaviour) ? undefined : limits.reason,
  }))

  const rename = () => {
    if (!command || !api.setName) return
    requestValueEntry({
      title: t('bind.renameAction', 'Name this action'), input: api.button.command, where: `${shell.configName ?? ''} · ${api.longName} · Fine-tune · Name`, eyebrow: `${api.longName} · ${activationName} sends ${out}`,
      hint: t('bind.renameActionHint', 'Shown beside it on the binding sheet and the overlay'),
      value: api.nameOf(command) ?? '', suggestions: nameSuggestions([out]),
      onDone: value => api.setName?.(command, value.trim()),
    })
  }
  const menuItems: MenuItem[] = [
    { label: t('bind.renameAction', 'Name this action'), icon: <Icon name="details" size={16} />, disabled: !command || !api.setName, onSelect: rename },
    { label: t('keymap.copy', 'Copy'), icon: <Icon name="copy" size={16} />, disabled: !command || !api.copy || command.source.kind !== 'row', onSelect: () => command && api.copy?.([command]) },
    { label: t('keymap.commandDuplicate', 'Duplicate'), icon: <Icon name="add" size={16} />, disabled: !command || command.source.kind !== 'row', onSelect: () => command && api.duplicate(command) },
    ...(command && command.source.kind === 'row' && COMMON_ACTIVATIONS.includes(command.triggerKind as never) ? [{
      kind: 'submenu' as const, label: t('bind.moveTo', 'Move to…'), icon: <Icon name="reorder" size={16} />,
      items: (['regular', 'tap', 'hold', 'double', 'release', 'turbo'] as const).filter(kind => kind !== command.triggerKind)
        .map(kind => ({ label: activationLabel(kind, t), onSelect: () => { api.update(command, { triggerKind: kind }); onMoveTo({ kind }) } })),
    }] : []),
    { kind: 'separator' },
    { label: t('keymap.removeBinding', 'Remove'), icon: <Icon name="remove" size={16} />, disabled: !command, onSelect: () => { if (command) { api.remove(command); onClose() } } },
  ]

  usePadButtons(root, (button, target) => {
    if (menuOpen) return false
    if (button === 'X') { if (target.closest('[data-own-x]')) return false; requestTest(api.button.command); return true }
    lastFocus.current = document.activeElement as HTMLElement | null
    setMenuOpen(true)
    return true
  })

  return (
    <SubPage open onClose={onClose} trail={[page, api.longName]} title={t('bind.fineTune', 'Fine-tune')}
      hints={[...(choosable ? [{ button: 'MOVE' as const, label: 'Compare' }, { button: 'A' as const, label: 'Choose' }] : []), { button: 'X', label: 'Try it' }, { button: 'Y', label: 'Rename, copy, remove' }]}>
      <div ref={root} className={styles.ft} data-fine-tune={api.command}>
        <Menu open={menuOpen} onOpenChange={setMenuOpen} ariaLabel={t('bind.actionMenu', 'This action')} items={menuItems} align="end"
          returnFocusTo={() => lastFocus.current}
          trigger={<button type="button" tabIndex={-1} aria-hidden="true" data-nav-skip style={{ position: 'absolute', right: 32, top: 72, width: 1, height: 1, opacity: 0, border: 0, padding: 0 }} />} />
        <div className={styles.ftTop}>
          <section aria-label={choosable ? `How ${out} is sent` : out}>
            <div className={styles.ftHeading}>
              <h2>{choosable ? t('bind.howSent', 'How {{output}} is sent', { output: out }) : out}</h2>
              <span>{`${heldWord}${api.label ? ` · ${api.label}` : ''}`}</span>
            </div>
            {choosable ? (
              <div className={styles.compare}>
                <ModeCards variant="compare" columns={2} options={cards} value={command?.outputBehavior ?? 'normal'}
                  onChange={value => command && api.update(command, { outputBehavior: value as BindingOutputBehavior })}
                  useLabel={() => t('bind.choose', 'Choose')} />
              </div>
            ) : (
              <p className={styles.cardText} data-one-way="">{oneWay}</p>
            )}
            <Notes command={command} />
          </section>
        </div>
        <OnlyForSome api={api} command={command} onChangePair={onChangePair} />
      </div>
    </SubPage>
  )
}

function Notes({ command }: { command?: BindingCommand }) {
  const { t } = useTranslation()
  if (!command) return null
  return (
    <>
      {command.outputKind === 'gyroAction' && <p className={styles.compareNote}>Only this controller's gyro changes; others stay as they are. The Gyro tab sets what gyro does the rest of the time.</p>}
      {command.outputValue === 'TURN_OFF_CONTROLLER' && <p className={styles.compareNote}>{t('keymap.turnOffControllerHint')}</p>}
    </>
  )
}

function Card({ title, icon, value, children, label }: { title: string; icon?: ReactNode; value?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className={styles.card} aria-label={label ?? title}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{icon}{title}</h3>
        {value !== undefined && <span className={styles.cardValue}>{value}</span>}
      </div>
      {children}
    </section>
  )
}

/** "Only for some actions · Shows up when A sends one of these". */
function OnlyForSome({ api, command, onChangePair }: { api: BindingApi; command?: BindingCommand; onChangePair: (command: BindingCommand) => void }) {
  const { t } = useTranslation()
  const { layers } = useContext(LayerUsageContext)
  const { sounds } = useSoundLibrary()
  const turboDefault = useTurboDefault()
  const [motors, setMotors] = useState(false)
  const params = commandParameters(command)
  const cards: ReactNode[] = []
  const input = api.shortName

  if (command && params.cycle) {
    const steps = params.cycle
    const write = (next: string[]) => { const value = cycleBinding(next); if (value) api.update(command, { outputValue: value, outputBehavior: 'tapOnce' }) }
    cards.push(
      <Card key="cycle" title="Cycle through keys" icon={<Icon name="redo" size={20} />} value={`${steps.length} of ${CYCLE_MAX_STEPS}`}>
        <p className={styles.cardText}>Each press sends the next one, then starts over.</p>
        <CycleStepsEditor input={api.button.command} steps={steps} onChange={write} family={api.family}
          virtualControllerType={api.pickerProps.virtualControllerType} onEnableVirtualController={api.pickerProps.onEnableVirtualController} />
        <p className={styles.cardNote}>Starts over at step 1 after a reconnect.</p>
      </Card>,
    )
  }

  if (command && (params.haptic || params.rumble)) {
    const haptic = params.haptic
    const rumble = params.rumble
    const toMotors = () => api.update(command, { outputKind: 'special', outputValue: rumbleBinding({ small: 128, big: 128 }) })
    const toPulse = () => api.update(command, { outputKind: 'haptic', outputValue: formatHapticBinding({ side: 'BOTH', effect: 'CLICK', gain: 0 }) })
    cards.push(
      <Card key="rumble" title="Rumble" icon={<Icon name="haptic" size={20} />} value={haptic ? (haptic.side === 'BOTH' ? 'Both grips' : haptic.side === 'L' ? 'Left grip' : 'Right grip') : 'Motors'}>
        {haptic && <>
          <SegmentedRow label="Grip" value={haptic.side} options={[{ value: 'L', label: 'Left' }, { value: 'R', label: 'Right' }, { value: 'BOTH', label: 'Both' }]}
            onChange={side => api.update(command, { outputKind: 'haptic', outputValue: formatHapticBinding({ ...haptic, side: side as HapticSide }) })} />
          <SegmentedRow label="Pattern" value={haptic.effect}
            options={[...HAPTIC_EFFECT_CHOICES.map(effect => ({ value: effect, label: effect.charAt(0) + effect.slice(1).toLowerCase() })),
              // An effect a configuration brought with it that is not offered (Script, Noise) stays visible.
              ...((HAPTIC_EFFECT_CHOICES as readonly string[]).includes(haptic.effect) ? [] : [{ value: haptic.effect, label: `${haptic.effect.charAt(0)}${haptic.effect.slice(1).toLowerCase()} · imported` }])]}
            onChange={effect => api.update(command, { outputKind: 'haptic', outputValue: formatHapticBinding({ ...haptic, effect: effect as typeof haptic.effect }) })} />
          <ValueRow label="Strength" value={haptic.gain} min={HAPTIC_GAIN_MIN} max={HAPTIC_GAIN_MAX} step={8} fineStep={1} format={value => value === 0 ? 'Default' : value > 0 ? `+${value}` : String(value)}
            onChange={gain => api.update(command, { outputKind: 'haptic', outputValue: formatHapticBinding({ ...haptic, gain }) })}
            onReset={haptic.gain !== 0 ? () => api.update(command, { outputKind: 'haptic', outputValue: formatHapticBinding({ ...haptic, gain: 0 }) }) : undefined} />
          <OpenRow label="Small and big motor strength" hint="Use the controller's rumble motors instead of a grip pulse" value="▸" onOpen={() => setMotors(true)} hints="A:Open;B:Back" />
        </>}
        {rumble && <>
          {(['small', 'big'] as const).map(motor => (
            <ValueRow key={motor} label={motor === 'small' ? 'Small motor strength' : 'Big motor strength'} value={Math.round(rumble[motor] * 100 / 255)} min={0} max={100} step={5} format={value => `${value}%`}
              caption="Runs while this action is active. Controller support and shared rumble settings still apply."
              onChange={value => api.update(command, { outputKind: 'special', outputValue: rumbleBinding({ ...rumble, [motor]: value * 255 / 100 }) })} />
          ))}
          <OpenRow label="Grip pulse instead" hint="Left, right or both grips, with a pattern" value="▸" onOpen={toPulse} hints="A:Use a grip pulse;B:Back" />
        </>}
        {motors && haptic && (
          <Dialog onClose={() => setMotors(false)} width={560} eyebrow="Rumble" title="Small and big motor strength"
            hints={[{ button: 'A', label: 'Use the motors' }, { button: 'B', label: 'Cancel' }]}>
            <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className={styles.cardText}>The rumble motors run while this action is active, instead of a pulse on the grips. Both start at half strength.</p>
              <button type="button" className="console-btn console-btn--primary" data-hints="A:Use the motors;B:Cancel" onClick={() => { setMotors(false); toMotors() }}>Use the motors</button>
            </div>
          </Dialog>
        )}
      </Card>,
    )
  }

  if (command && params.sound) {
    const sound = params.sound
    const gain = sound.gain ?? 0
    const target = playSoundTarget(sound)
    const value = 'builtIn' in sound ? `builtin:${sound.builtIn}` : 'id' in sound ? `library:${sound.id}` : `path:${sound.path}`
    const options = [
      ...BUILT_IN_SOUNDS.map((name, index) => ({ value: `builtin:${index}`, label: name, caption: `◂ ${name} ▸` })),
      ...sounds.filter(entry => entry.ready).map(entry => ({ value: `library:${entry.id}`, label: entry.name, caption: `◂ ${entry.name} ▸` })),
      ...('path' in sound ? [{ value, label: sound.path, caption: sound.path }] : []),
    ]
    const preview = { label: 'Preview on controller', run: () => { void desktopBridge.playControllerSound('builtIn' in sound ? sound.builtIn : 0, gain, 'id' in sound ? sound.id : undefined).catch(() => {}) } }
    cards.push(
      <Card key="sound" title="Sound" icon={<Icon name="haptic" size={20} />} value="Plays on the grips">
        <div className={styles.soundRow} data-own-x="">
          <SegmentedRow label="Tune" value={value} options={options} onX={preview}
            onChange={next => {
              const [kind, id] = [next.slice(0, next.indexOf(':')), next.slice(next.indexOf(':') + 1)]
              if (kind === 'builtin' || kind === 'library') api.update(command, { outputValue: playSoundToken(kind === 'builtin' ? Number(id) : id, gain) })
            }} />
        </div>
        <ValueRow label="Volume" value={gain} min={SOUND_GAIN_MIN_DB} max={0} step={3} fineStep={1} format={level => level === 0 ? 'As recorded' : `${level} dB`} onX={preview}
          onChange={level => { if (target !== null) api.update(command, { outputValue: playSoundToken(target, level) }) }}
          onReset={gain !== 0 && target !== null ? () => api.update(command, { outputValue: playSoundToken(target, 0) }) : undefined} />
        <p className={styles.cardNote}>{BUILT_IN_SOUNDS.length} built-in tunes, then your own sounds. Previews play on the controller.</p>
      </Card>,
    )
  }

  if (command?.source.kind === 'layerAction') {
    const action = command.source.action
    cards.push(
      <Card key="mode" title="Switch layer" icon={<Icon name="layers" size={20} />} value={layers.find(layer => layer.id === action.layerId)?.name}>
        <SegmentedRow label="Layer" value={action.layerId} options={layers.map(layer => ({ value: layer.id, label: layer.name }))} onChange={layerId => api.update(command, { layerAction: { layerId } })} />
        <SegmentedRow label={`When ${input} is pressed`} value={action.verb} options={layerVerbOrder.map(verb => ({ value: verb, label: t(layerVerbKeys[verb]) }))} onChange={verb => api.update(command, { layerAction: { verb: verb as typeof action.verb } })} />
        <SegmentedRow label="Happens on" value={isReleasedInput(action.input) ? 'release' : 'press'} options={[{ value: 'press', label: 'Press' }, { value: 'release', label: 'Let go' }]}
          onChange={next => api.update(command, { layerAction: { input: withRelease(action.input, next === 'release') } })} />
      </Card>,
    )
  }

  if (command?.source.kind === 'stickShift' && api.setStickShift) {
    const { target, mode } = command.source
    cards.push(
      <Card key="stick" title="Stick mode shift" icon={<Icon name="joysticks" size={20} />} value={formatStickModeLabel(mode, t)}>
        <SegmentedRow label="Stick" value={target} options={[{ value: 'LEFT', label: 'Left stick' }, { value: 'RIGHT', label: 'Right stick' }]}
          onChange={next => { api.setStickShift?.(target); api.setStickShift?.(next as 'LEFT' | 'RIGHT', mode) }} />
        <div className={styles.soundRow}>
          <SegmentedRow label="Becomes" value={mode} options={STICK_MODE_VALUES.map(value => ({ value, label: formatStickModeLabel(value, t), caption: `◂ ${formatStickModeLabel(value, t)} ▸` }))}
            onChange={next => api.setStickShift?.(target, next)} />
        </div>
      </Card>,
    )
  }

  const level = command ? /^"?\s*LED_BRIGHTNESS\s*=\s*(-?\d+)/i.exec(command.outputValue) : null
  if (command && level) {
    cards.push(
      <Card key="brightness" title="Light brightness" icon={<Icon name="appearance" size={20} />}>
        <ValueRow label="Brightness" value={Math.max(0, Math.min(100, Number(level[1])))} min={0} max={100} step={5} format={value => `${value}%`}
          onChange={value => api.update(command, { outputValue: `LED_BRIGHTNESS = ${value}` })} />
      </Card>,
    )
  }

  // Change light colour: the colour it sets, here as the picker promised (L6),
  // and the brightness that rides with it when one was added.
  const lightColour = command ? /^"?\s*LIGHT_BAR\s*=\s*x([0-9a-f]{6})/i.exec(command.outputValue)?.[1] : null
  if (command && lightColour) {
    cards.push(
      <Card key="light" title="Light colour" icon={<Icon name="appearance" size={20} />} value={`#${lightColour.toLowerCase()}`}>
        <LightBarPicker value={`#${lightColour.toLowerCase()}`} defaultColor={api.heldLed?.defaultColor ?? '#ffffff'} allowClear={false}
          onChange={next => { if (next) api.update(command, { outputValue: `LIGHT_BAR = x${next.replace(/^#/, '').toLowerCase()}` }) }} />
        {command.ledBrightness !== null && command.ledBrightness !== undefined && (
          <ValueRow label="Brightness" value={command.ledBrightness} min={0} max={100} step={5} format={value => `${value}%`}
            onChange={value => api.update(command, { ledBrightness: value })} />
        )}
        <p className={styles.cardNote}>Stays that colour until something changes it again.</p>
      </Card>,
    )
  }

  const configuration = command ? loadConfigBindingName(command.outputValue) : null
  if (command && configuration) {
    const profiles = api.pickerProps.libraryProfiles ?? []
    cards.push(
      <Card key="config" title="Load a configuration" icon={<Icon name="catConfig" size={20} />} value={configuration}>
        <div className={styles.soundRow}>
          <SegmentedRow label="Configuration" value={configuration}
            options={[...profiles.map(name => ({ value: name, label: name, caption: `◂ ${name} ▸` })), ...(!profiles.includes(configuration) ? [{ value: configuration, label: configuration, caption: `${configuration} (not in library)` }] : [])]}
            onChange={name => api.update(command, { outputKind: 'loadConfig', outputValue: loadConfigBindingValue(name) })} />
        </div>
      </Card>,
    )
  }

  if (command && (command.triggerKind === 'simultaneous' || command.triggerKind === 'diagonal')) {
    cards.push(
      <Card key="pair" title={command.triggerKind === 'simultaneous' ? 'Press together with…' : 'Stick diagonal'} icon={<Icon name="chords" size={20} />}>
        <OpenRow label={command.triggerKind === 'simultaneous' ? 'Pressed with' : 'With the direction'} value={inputDisplayName(command.conditionInput ?? '', api.family)}
          onOpen={() => onChangePair(command)} hints="A:Change;B:Back" data={{ 'data-pair-row': '' }} />
      </Card>,
    )
  }

  if (command && command.triggerKind === 'turbo') {
    cards.push(
      <Card key="turbo" title="Turbo" icon={<Icon name="timing" size={20} />}>
        <ValueRow label="Repeat speed" value={command.turboIntervalMs ?? turboDefault} min={10} max={1000} step={10} fineStep={1}
          format={value => command.turboIntervalMs == null ? `Default (${value} ms)` : `${value} ms`}
          caption="Time between repeats for this action only. Turbo starts after the configured hold time."
          onChange={value => api.update(command, { turboIntervalMs: value })} onReset={command.turboIntervalMs != null ? () => api.update(command, { turboIntervalMs: null }) : undefined} />
      </Card>,
    )
  }

  if (api.trackball) {
    const trackball = api.trackball
    cards.push(
      <Card key="trackball" title="Trackball" icon={<Icon name="trackpads" size={20} />}>
        <ValueRow label={t('keymap.trackballDecay', 'Trackball decay')} setting="TRACKBALL_DECAY" value={Number.parseFloat(trackball.value) || 1} min={0} max={10} step={0.5} fineStep={0.1}
          onChange={value => trackball.onChange(String(value))} onReset={trackball.value ? () => trackball.onChange('') : undefined} />
      </Card>,
    )
  }

  // Nothing to show: no empty section (L6).
  if (!cards.length) return null
  return (
    <section aria-label="Only for some actions">
      <div className={styles.onlySomeHead}>
        <p className={styles.eyebrowLabel}>{t('bind.onlyForSome', 'Only for some actions')}</p>
        <span className={styles.quiet} style={{ fontSize: 'var(--fs-hint)' }}>{t('bind.showsUp', 'Settings this action has', { input })}</span>
      </div>
      <div className={styles.onlySome}>{cards}</div>
    </section>
  )
}
