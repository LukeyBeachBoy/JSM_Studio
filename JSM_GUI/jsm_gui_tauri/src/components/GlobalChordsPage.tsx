import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { desktopBridge } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { KeymapSection } from './KeymapSection'
import { SectionActions } from './SectionActions'
import { BindingCommandEditor } from './keymap/BindingCommandEditor'
import { useBindingCapture } from '../keymap/useBindingCapture'
import { ChordIcon, JoystickIcon, TrackpadIcon } from './NavIcons'
import { showToast } from '../utils/toast'
import { controllerButtonLabel, controllerHasTwoTrackpads } from '../utils/controllerStatus'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../constants/sticks'
import {
  createBindingToken,
  parseBindingExpression,
  serializeBindingToken,
  type BindingActionModifier,
  type BindingEventModifier,
} from '../utils/keymap'
import {
  bindingCommandToToken,
  inferOutputKindFromBindingValue,
  type BindingCommand,
  type BindingCommandPatch,
  type BindingOutputBehavior,
  type BindingTriggerKind,
} from '../utils/bindingCommands'
import {
  BUMPER_BUTTONS,
  CENTER_BUTTONS,
  DPAD_BUTTONS,
  FACE_BUTTONS,
  LEFT_STICK_BUTTONS,
  MISC_BUTTONS,
  PADDLE_BUTTONS,
  RIGHT_STICK_BUTTONS,
  TOUCH_BUTTONS,
  TRIGGER_BUTTONS,
  type ButtonDefinition,
} from '../keymap/schema'
import styles from './GlobalChordsPage.module.css'

// ---------------------------------------------------------------------------
// Document model. GlobalChords.txt is a plain JoyShockMapper config restricted
// to chord lines (`MOD,BUTTON = OUTPUT`) and mode shifts (`MOD,SETTING = VALUE`).
// Anything else -- comments, the `HOME = NONE` base lines -- is carried through
// untouched so a hand-edited file survives a round trip through this page.
// ---------------------------------------------------------------------------

type ChordModifier = 'HOME' | 'MISC1'
const MODIFIERS: ChordModifier[] = ['HOME', 'MISC1']

type DocLine =
  | { kind: 'chord'; id: string; modifier: string; button: string; value: string; label: string }
  | { kind: 'shift'; id: string; modifier: string; setting: string; value: string; label: string }
  | { kind: 'raw'; id: string; text: string }

const BUTTON_GROUPS: Array<{ titleKey: string; buttons: ButtonDefinition[] }> = [
  { titleKey: 'keymap.faceButtonsTitle', buttons: FACE_BUTTONS },
  { titleKey: 'keymap.dpadTitle', buttons: DPAD_BUTTONS },
  { titleKey: 'keymap.bumpersTitle', buttons: BUMPER_BUTTONS },
  { titleKey: 'keymap.triggersTitle', buttons: TRIGGER_BUTTONS },
  { titleKey: 'keymap.centerButtonsTitle', buttons: CENTER_BUTTONS },
  { titleKey: 'keymap.paddlesTitle', buttons: PADDLE_BUTTONS },
  { titleKey: 'keymap.touchButtonsTitle', buttons: TOUCH_BUTTONS },
  { titleKey: 'keymap.leftStickTitle', buttons: LEFT_STICK_BUTTONS },
  { titleKey: 'keymap.rightStickTitle', buttons: RIGHT_STICK_BUTTONS },
  { titleKey: 'keymap.extraButtonsTitle', buttons: MISC_BUTTONS },
]

const ALL_BUTTONS = BUTTON_GROUPS.flatMap(group => group.buttons)
const BUTTON_COMMANDS = new Set(ALL_BUTTONS.map(button => button.command.toUpperCase()))
const BUILT_IN_COMMANDS = new Set([
  'TURN_OFF_CONTROLLER',
  'RESTART_GYRO_CALIBRATION',
  'FINISH_GYRO_CALIBRATION',
  'CALIBRATE_TRIGGERS',
  'CALIBRATE',
])

const EVENT_TO_TRIGGER: Record<BindingEventModifier, BindingTriggerKind> = {
  '': 'regular',
  '\\': 'regular',
  '/': 'release',
  "'": 'tap',
  _: 'hold',
  '+': 'turbo',
}

const ACTION_TO_BEHAVIOR: Record<BindingActionModifier, BindingOutputBehavior> = {
  '': 'normal',
  '!': 'tapOnce',
  '^': 'toggle',
  '-': 'releaseOnly',
}

const QUICK_PRESETS: Array<{ key: string; value: string }> = [
  { key: 'powerOff', value: 'TURN_OFF_CONTROLLER' },
  { key: 'altTab', value: 'LALT\\ !TAB\\' },
  { key: 'windowsKey', value: 'LWINDOWS' },
  { key: 'volumeUp', value: 'VOLUME_UP' },
  { key: 'volumeDown', value: 'VOLUME_DOWN' },
  { key: 'mute', value: 'MUTE' },
  { key: 'screenshot', value: 'SCREENSHOT' },
  { key: 'playPause', value: 'PLAY_PAUSE' },
  { key: 'nextTrack', value: 'NEXT_TRACK' },
  { key: 'enter', value: 'ENTER' },
  { key: 'escape', value: 'ESC' },
  { key: 'leftClick', value: 'LMOUSE' },
  { key: 'rightClick', value: 'RMOUSE' },
  { key: 'recalibrateGyro', value: 'RESTART_GYRO_CALIBRATION' },
]

const PAD_MODE_OPTIONS = [
  { value: 'MOUSE', labelKey: 'globalChords.padMouse' },
  { value: 'GRID_AND_STICK', labelKey: 'globalChords.padGrid' },
  { value: 'PS_TOUCHPAD', labelKey: 'globalChords.padPsTouchpad' },
]

let idCounter = 0
const nextId = () => `chord-${Date.now().toString(36)}-${(idCounter += 1)}`

const LINE_RE = /^([^#=,\s]+)\s*,\s*([^#=,\s]+)\s*=\s*([^#]*?)\s*(?:#\s*(.*))?$/

function parseDocument(text: string): DocLine[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line): DocLine => {
      const match = LINE_RE.exec(line.trim())
      if (!match) return { kind: 'raw', id: nextId(), text: line }
      const [, modifier, target, value, label = ''] = match
      const upperTarget = target.toUpperCase()
      if (BUTTON_COMMANDS.has(upperTarget)) {
        return { kind: 'chord', id: nextId(), modifier: modifier.toUpperCase(), button: upperTarget, value: value.trim(), label: label.trim() }
      }
      return { kind: 'shift', id: nextId(), modifier: modifier.toUpperCase(), setting: upperTarget, value: value.trim(), label: label.trim() }
    })
}

function serializeDocument(lines: DocLine[]) {
  const text = lines
    .map(line => {
      if (line.kind === 'raw') return line.text
      const target = line.kind === 'chord' ? line.button : line.setting
      const suffix = line.label ? `  # ${line.label}` : ''
      return `${line.modifier},${target} = ${line.value}${suffix}`
    })
    .join('\n')
  return text.endsWith('\n') ? text : `${text}\n`
}

// The binding editor thinks in BindingCommands; a chord line is one of those
// with the modifier as its condition. Multi-token outputs (Alt+Tab is two
// keys) are shown as a raw expression rather than forced into one token.
function chordToCommand(line: Extract<DocLine, { kind: 'chord' }>): BindingCommand {
  const expression = parseBindingExpression(line.value)
  const tokens = expression?.tokens ?? []
  const multi = tokens.length > 1
  const token = tokens[0] ?? createBindingToken('input')
  const upper = token.value.toUpperCase()
  const outputKind = multi
    ? 'raw'
    : BUILT_IN_COMMANDS.has(upper)
      ? 'command'
      : inferOutputKindFromBindingValue(token.value)
  return {
    id: line.id,
    physicalInput: line.button,
    triggerKind: multi ? 'regular' : EVENT_TO_TRIGGER[token.eventModifier],
    outputKind,
    outputValue: multi ? line.value : token.value,
    outputBehavior: multi ? 'normal' : ACTION_TO_BEHAVIOR[token.actionModifier],
    conditionInput: line.modifier,
    tokens,
    sourceLine: `${line.modifier},${line.button}`,
    isRoundTripSafe: !multi,
    source: {
      kind: 'row',
      slot: 'chord',
      rowId: line.id,
      writeMode: 'line',
      modifierCommand: line.modifier,
      expression,
      tokenIndex: 0,
      lineValue: line.value,
      isManual: false,
    },
  }
}

function patchedValue(command: BindingCommand, patch: BindingCommandPatch) {
  const next = { ...command, ...patch }
  if (next.outputKind === 'raw') return next.outputValue
  return serializeBindingToken(bindingCommandToToken(next, command.tokens[0]))
}

const buttonLabel = (command: string) => {
  const definition = ALL_BUTTONS.find(button => button.command.toUpperCase() === command)
  return definition ? controllerButtonLabel(definition) : command
}

const modifierLabel = (modifier: ChordModifier, t: TFunction) =>
  modifier === 'HOME' ? t('globalChords.modifierSteam') : t('globalChords.modifierQuickAccess')

type GlobalChordsPageProps = {
  devices?: TelemetryDevice[]
}

export function GlobalChordsPage({ devices }: GlobalChordsPageProps) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<DocLine[]>([])
  const [savedText, setSavedText] = useState('')
  const [defaultText, setDefaultText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [activeModifier, setActiveModifier] = useState<ChordModifier>('HOME')
  const { captureLabel, beginValueCapture, isCapturingValue } = useBindingCapture(() => {})

  const twoPads = Boolean(devices?.some(device => controllerHasTwoTrackpads(device.type)))

  useEffect(() => {
    let disposed = false
    void desktopBridge
      .readGlobalChords()
      .then(document => {
        if (disposed) return
        setLines(parseDocument(document.text))
        setSavedText(document.text)
        setDefaultText(document.defaultText)
        setLoaded(true)
      })
      .catch(error => {
        console.error('Failed to read global chords', error)
        showToast(t('messages.globalChordsSaveFailed', { error: String(error) }), 'error')
      })
    return () => {
      disposed = true
    }
  }, [t])

  const text = useMemo(() => serializeDocument(lines), [lines])
  const hasPendingChanges = loaded && text.replace(/\r\n/g, '\n') !== savedText.replace(/\r\n/g, '\n')

  const flash = (message: string) => {
    setStatusMessage(message)
    setTimeout(() => setStatusMessage(null), 3000)
  }

  const handleApply = async () => {
    try {
      const result = await desktopBridge.writeGlobalChords(text)
      setSavedText(text)
      const message = result.success ? t('messages.globalChordsSaved') : t('messages.globalChordsSavedNotRunning')
      flash(message)
      showToast(message)
    } catch (error) {
      console.error('Failed to save global chords', error)
      const message = t('messages.globalChordsSaveFailed', { error: String(error) })
      flash(message)
      showToast(message, 'error')
    }
  }

  const handleCancel = () => setLines(parseDocument(savedText))

  const handleReset = () => {
    setLines(parseDocument(defaultText))
    showToast(t('messages.globalChordsReset'))
  }

  // --- mode shifts --------------------------------------------------------

  const shiftValue = (setting: string) => {
    const line = lines.find(candidate => candidate.kind === 'shift' && candidate.modifier === activeModifier && candidate.setting === setting)
    return line && line.kind === 'shift' ? line.value : ''
  }

  const setShift = (setting: string, value: string) => {
    setLines(prev => {
      const index = prev.findIndex(line => line.kind === 'shift' && line.modifier === activeModifier && line.setting === setting)
      if (!value) return index < 0 ? prev : prev.filter((_, i) => i !== index)
      if (index >= 0) return prev.map((line, i) => (i === index && line.kind === 'shift' ? { ...line, value } : line))
      return [...prev, { kind: 'shift', id: nextId(), modifier: activeModifier, setting, value, label: '' }]
    })
  }

  // --- chords -------------------------------------------------------------

  const chords = useMemo(
    () => lines.filter((line): line is Extract<DocLine, { kind: 'chord' }> => line.kind === 'chord' && line.modifier === activeModifier),
    [lines, activeModifier]
  )
  const usedButtons = useMemo(() => new Set(chords.map(chord => chord.button)), [chords])
  const selectableButtons = useMemo(
    () => ALL_BUTTONS.filter(button => !MODIFIERS.includes(button.command.toUpperCase() as ChordModifier)),
    []
  )

  const updateChord = useCallback((id: string, patch: Partial<Extract<DocLine, { kind: 'chord' }>>) => {
    setLines(prev => prev.map(line => (line.kind === 'chord' && line.id === id ? { ...line, ...patch } : line)))
  }, [])

  const removeChord = (id: string) => setLines(prev => prev.filter(line => line.id !== id))

  const addChord = (value = '', preferredButton?: string) => {
    const button =
      preferredButton ??
      selectableButtons.find(candidate => !usedButtons.has(candidate.command.toUpperCase()))?.command ??
      selectableButtons[0]?.command ??
      'S'
    setLines(prev => [...prev, { kind: 'chord', id: nextId(), modifier: activeModifier, button: button.toUpperCase(), value, label: '' }])
  }

  const renderShiftCard = (setting: string, title: string, icon: JSX.Element, options: Array<{ value: string; label: string }>) => (
    <label className={styles.shiftCard} key={setting}>
      <span>
        {icon}
        {title}
      </span>
      <select className="app-select" value={shiftValue(setting)} onChange={event => setShift(setting, event.target.value)}>
        <option value="">{t('globalChords.unchanged')}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  const padOptions = PAD_MODE_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))
  const stickOptions = STICK_MODE_VALUES.map(mode => ({ value: mode, label: formatStickModeLabel(mode, t) }))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}>
            <ChordIcon />
          </span>
          <div>
            <h2>{t('globalChords.title')}</h2>
            <p>{t('globalChords.description')}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className="ghost-btn" onClick={handleReset} disabled={!loaded || !defaultText}>
            {t('globalChords.resetDefaults')}
          </button>
        </div>
      </div>

      <div className={styles.modifierTabs} role="tablist">
        {MODIFIERS.map(modifier => (
          <button
            key={modifier}
            type="button"
            role="tab"
            aria-selected={activeModifier === modifier}
            className={`${styles.modifierTab} ${activeModifier === modifier ? styles.modifierTabActive : ''}`}
            onClick={() => setActiveModifier(modifier)}
          >
            {modifierLabel(modifier, t)}
          </button>
        ))}
      </div>

      <KeymapSection title={t('globalChords.whileHeldTitle')} description={t('globalChords.whileHeldDescription')}>
        <div className={styles.shiftGrid}>
          {twoPads && renderShiftCard('LEFT_TOUCHPAD_MODE', t('globalChords.leftTrackpad'), <TrackpadIcon />, padOptions)}
          {renderShiftCard('LEFT_STICK_MODE', t('globalChords.leftStick'), <JoystickIcon />, stickOptions)}
          {renderShiftCard(twoPads ? 'RIGHT_TOUCHPAD_MODE' : 'TOUCHPAD_MODE', t('globalChords.rightTrackpad'), <TrackpadIcon />, padOptions)}
          {renderShiftCard('RIGHT_STICK_MODE', t('globalChords.rightStick'), <JoystickIcon />, stickOptions)}
        </div>
      </KeymapSection>

      <KeymapSection
        title={t('globalChords.chordsTitle')}
        description={t('globalChords.chordsDescription')}
        action={
          <div className={styles.addBar}>
            <select
              className="app-select"
              value=""
              aria-label={t('globalChords.quickAdd')}
              onChange={event => {
                const preset = QUICK_PRESETS.find(candidate => candidate.key === event.target.value)
                if (preset) addChord(preset.value)
              }}
            >
              <option value="">{t('globalChords.quickAddPlaceholder')}</option>
              {QUICK_PRESETS.map(preset => (
                <option key={preset.key} value={preset.key}>
                  {t(`globalChords.presets.${preset.key}`)}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-btn" onClick={() => addChord()}>
              {t('globalChords.addChord')}
            </button>
          </div>
        }
      >
        {chords.length === 0 ? (
          <div className={styles.empty}>{t('globalChords.noChords')}</div>
        ) : (
          <div className={styles.chordList}>
            {chords.map(chord => {
              const command = chordToCommand(chord)
              return (
                <div className={styles.chordRow} key={chord.id}>
                  <div className={styles.chordRowHead}>
                    <div className={styles.chordSummary}>
                      <code>{modifierLabel(activeModifier, t)}</code>
                      <span>+</span>
                      <code>{buttonLabel(chord.button)}</code>
                    </div>
                    <label>
                      {t('globalChords.button')}
                      <select value={chord.button} onChange={event => updateChord(chord.id, { button: event.target.value })}>
                        {BUTTON_GROUPS.map(group => (
                          <optgroup key={group.titleKey} label={t(group.titleKey)}>
                            {group.buttons
                              .filter(button => !MODIFIERS.includes(button.command.toUpperCase() as ChordModifier))
                              .map(button => (
                                <option key={button.command} value={button.command.toUpperCase()}>
                                  {controllerButtonLabel(button)}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('globalChords.label')}
                      <input
                        type="text"
                        value={chord.label}
                        placeholder={t('globalChords.labelPlaceholder')}
                        onChange={event => updateChord(chord.id, { label: event.target.value.replace(/[\r\n#]/g, '') })}
                      />
                    </label>
                  </div>
                  <div className={styles.chordRowBody}>
                    <BindingCommandEditor
                      command={command}
                      modifierOptions={[]}
                      specialOptions={[]}
                      virtualControllerType="NONE"
                      isCapturing={isCapturingValue(chord.id)}
                      captureLabel={captureLabel}
                      onChange={patch => updateChord(chord.id, { value: patchedValue(command, patch) })}
                      onCapture={() =>
                        beginValueCapture(chord.id, buttonLabel(chord.button), value =>
                          updateChord(chord.id, { value: patchedValue(command, { outputValue: value, outputKind: inferOutputKindFromBindingValue(value) }) })
                        )
                      }
                    />
                    <div className={styles.chordRowFooter}>
                      <button type="button" className="ghost-btn" onClick={() => removeChord(chord.id)}>
                        {t('globalChords.remove')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </KeymapSection>

      <SectionActions
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={() => void handleApply()}
        onCancel={handleCancel}
        applyDisabled={!loaded}
      />
    </div>
  )
}
