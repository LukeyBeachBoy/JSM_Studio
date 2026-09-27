import { LayerUsageContext, LayerIcon, LayerValueBadge } from './LayerBar'
import { inputUses, inputUsage, configuredInputs, readableSetting, layerEntries } from '../utils/layers'
import { describeBinding } from '../utils/bindingDescription'
import type { TFunction } from 'i18next'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { BatteryIndicator } from './BatteryIndicator'
import { InputGlyph } from './glyphs/InputGlyph'
import { controllerVisualFamily, controllerButtonLabel, controllerDisplayName, getPressedControllerCommandSet } from '../utils/controllerStatus'
import { Icon } from './icons/Icon'
import { AppSelect } from './ui/AppSelect'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { NoController } from './NoController'
import { SettingOrigins } from './SettingOrigin'
import { desktopBridge } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, MISC_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, TOUCH_BUTTONS, TOUCH_STICK_BUTTONS } from '../keymap/schema'
import { controllerSupportsInput } from '../utils/controllerStatus'
import { getButtonBindingRows, getKeymapValue, isTrackballBindingPresent } from '../utils/keymap'
import { parseBindingLabels } from '../utils/bindingLabels'
import styles from './OverviewPage.module.css'

export type OverviewNavTarget = 'buttons' | 'dpad' | 'triggers' | 'joysticks' | 'touchpad' | 'gyro'

type OverviewPageProps = {
  devices?: TelemetryDevice[]
  onNavigate: (target: OverviewNavTarget) => void
  /** The active configuration, for the bound-input marks and action names. */
  configText?: string
  onSelectCommand?: (command: string) => void
  onSelectLayer?: (id: string) => void
  disabled?: boolean
  /** The Calibration quick-settings tile. */
  onRecalibrate?: () => void
  /** The configuration being edited, named by the no-controller state. */
  configName?: string | null
  recalibrating?: boolean
  /** The virtual output the configuration starts, named by the connecting state (17b). */
  virtualOutput?: string
}

const definitions = [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS]
/** A layer action is not a binding and should not read like one. */
type OverviewLine = { text: string; kind?: 'layer' | 'relation' | 'setting' }

// Inputs whose glyph carries no letter (grips, View, Menu, Steam, Quick
// Access): an unbound one is named, since the glyph alone would not say
// which it is. A lettered paddle just reads "Available".
const UNLETTERED = new Set(['MISC5', 'MISC6', '-', '+', 'HOME', 'MISC1', 'MISC4', 'MIC', 'CAPTURE'])
const GRIPS: Record<string, 'leftGrip' | 'rightGrip'> = { MISC6: 'leftGrip', MISC5: 'rightGrip' }
const SPARK_SAMPLES = 60

const inputName = (command: string, family: ReturnType<typeof controllerVisualFamily>) => {
  const definition = definitions.find(button => button.command === command)
  return definition ? controllerButtonLabel(definition, family) : command
}

// One reader for every binding in the app: see utils/bindingDescription.ts,
// which handles the quoted load-a-configuration path too. Module level, so it
// is not a fresh function identity on every render for the memo that builds
// these labels to depend on.
const describeLine = (binding: string, t: TFunction) => describeBinding(binding, t)

const titleCase = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

// The mode line on a band card (Overview.dc.html): what the stick or pad is
// doing, in words, with the count that matters for that mode.
const STICK_MODES: Record<string, string> = { NO_MOUSE: 'Directions', AIM: 'Aim', HYBRID_AIM: 'Hybrid aim', FLICK: 'Flick stick', FLICK_ONLY: 'Flick only', ROTATE_ONLY: 'Rotate only', MOUSE_RING: 'Mouse ring', MOUSE_AREA: 'Mouse area', SCROLL_WHEEL: 'Scroll wheel', RADIAL_MENU: 'Radial menu', LEFT_STICK: 'Left stick', RIGHT_STICK: 'Right stick' }
const PAD_MODES: Record<string, string> = { MOUSE: 'Mouse', GRID_AND_STICK: 'Button pad', MOUSE_RING: 'Mouse ring', MOUSE_JOYSTICK: 'Mouse joystick', NO_MOUSE: 'Directions', SCROLL_WHEEL: 'Scroll wheel', RADIAL_MENU: 'Radial menu' }

export function OverviewPage({ devices, onNavigate, configText, onSelectCommand, onSelectLayer, disabled, onRecalibrate, recalibrating, configName, virtualOutput }: OverviewPageProps) {
  const { t } = useTranslation()
  const device = devices?.[0]
  // A controller that appears while the page is open gets about a second of
  // "Connecting to …" (System States 17b), then its art cross-fades in.
  const present = Boolean(device)
  const [connecting, setConnecting] = useState(false)
  const [arrived, setArrived] = useState(false)
  const hadDevice = useRef(present)
  useEffect(() => {
    const was = hadDevice.current
    hadDevice.current = present
    if (!present) { setConnecting(false); return }
    if (was) return
    setConnecting(true)
    const done = window.setTimeout(() => { setConnecting(false); setArrived(true) }, 1000)
    const settled = window.setTimeout(() => setArrived(false), 1400)
    return () => { window.clearTimeout(done); window.clearTimeout(settled) }
  }, [present])
  const { layers, selected } = useContext(LayerUsageContext)
  const origins = useContext(SettingOrigins)
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const pageRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Y is search from anywhere on the page; X on an input that has uses opens
  // them ("Inspect uses"). The keyboard's X and Y arrive here too.
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'Y') { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return }
      if (button !== 'X') return
      const command = (event.target as Element | null)?.closest<HTMLElement>('[data-overview-input][data-has-uses]')?.dataset.overviewInput
      if (!command) return
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: command }))
    }
    page.addEventListener(PAD_EVENT, onPad)
    return () => page.removeEventListener(PAD_EVENT, onPad)
  }, [])
  const [filter, setFilter] = useState('all')
  const [modifier, setModifier] = useState('')
  const [showDiagram, setShowDiagram] = useState(true)
  // Inputs a global chord holds: they read "Reserved by global chord".
  const [reserved, setReserved] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let live = true
    desktopBridge.listGlobalChords().then(chords => { if (live) setReserved(new Set(chords.flatMap(chord => chord.buttons.map(button => button.toUpperCase())))) }).catch(() => {})
    return () => { live = false }
  }, [])

  const family = controllerVisualFamily(device?.type)
  const pressed = useMemo(() => getPressedControllerCommandSet(device), [device])

  const bindings = useMemo(() => {
    const text = configText ?? ''
    const names = parseBindingLabels(text)
    const commands = new Set(configuredInputs(text))
    // Include numbered pad regions and stick-menu segments, even when offline.
    for (const match of text.matchAll(/(?:^\s*|[, +])([LR]?T\d+|[LR]M\d+)\s*=/gm)) commands.add(match[1])
    const result: Record<string, { name?: string; lines: OverviewLine[]; used: boolean; hasUses: boolean }> = {}
    for (const command of commands) {
      const uses = inputUses(text, command, layers)
      const lines: OverviewLine[] = getButtonBindingRows(text, command).filter(row => row.binding && row.binding !== 'NONE').map(row => {
        const binding = row.binding!
        const output = describeLine(binding, t)
        const condition = row.modifierCommand ? inputName(row.modifierCommand, family) : ''
        const prefix = row.slot === 'chord' ? 'Hold ' + condition : row.slot === 'simultaneous' ? 'With ' + condition : row.slot === 'tap' ? '' : row.label
        const shiftedName = row.modifierCommand ? names[row.modifierCommand + (row.slot === 'simultaneous' ? '+' : ',') + command] : ''
        const summary = shiftedName ? shiftedName + ' (' + output + ')' : output
        return { text: prefix ? prefix + ': ' + summary : summary }
      })
      // Modifier relationships are separate lines; don't dump entire setting lists into a binding.
      const relationships = inputUsage(text, command, layers)
      relationships.filter(use => !['shift', 'chord'].includes(use.kind))
        .forEach(use => lines.push({ text: use.label, kind: use.kind === 'layer' ? 'layer' : use.kind === 'setting' ? 'setting' : undefined }))
      const shifts = relationships.filter(use => use.kind === 'shift')
      const chords = relationships.filter(use => use.kind === 'chord')
      // A count answers nothing: "1 changed inputs / settings" tells you there
      // is something to find without saying what or where. Name what changes,
      // and fall back to a count only when the list would be unreadable.
      const say = (target: string) =>
        definitions.some(button => button.command === target) ? inputName(target, family)
          // A pad cell or menu segment is already its own name; title-casing it
          // to "Rt1" just makes it look like a typo.
          : /^[LR]?[TM]\d+$/.test(target) ? target
          : readableSetting(target)
      const summarise = (uses: typeof shifts, lead: string) => {
        const named = [...new Set(uses.map(use => say(use.target)))]
        return named.length <= 3
          ? `${lead} ${named.join(', ')}`
          : `${lead} ${named.slice(0, 3).join(', ')} and ${named.length - 3} more`
      }
      const shiftValue = (target: string) =>
        (layerEntries(text)[`${command},${target}`] ?? '').split('#')[0].trim()
      if (shifts.length === 1) {
        const target = shifts[0].target
        const value = shiftValue(target)
        const becomes = definitions.some(button => button.command === target)
          ? describeLine(value, t)
          : value.replace(/_/g, ' ')
        lines.push({ text: value ? `While held: ${say(target)} → ${becomes}` : summarise(shifts, 'While held, changes'), kind: 'relation' })
      } else if (shifts.length) {
        lines.push({ text: summarise(shifts, 'While held, changes'), kind: 'relation' })
      }
      if (chords.length) lines.push({ text: summarise(chords, 'Pressed together with'), kind: 'relation' })
      if (uses.some(use => use.startsWith('Modeshift:')) && !lines.length) lines.push({ text: 'Changes other inputs while held', kind: 'relation' })
      const used = !!lines.length || !!names[command]
      if (used || controllerSupportsInput(device, command)) result[command] = { name: names[command], lines, used, hasUses: relationships.length > 0 }
    }
    return result
  }, [configText, device, layers, family, t])
  const labels = useMemo<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.entries(bindings).map(([command, entry]) => [command, [entry.name, ...entry.lines.map(line => line.text)].filter(Boolean).join(' · ') || 'Unbound'])),
    LEFT_PAD: (getKeymapValue(configText ?? '', 'LEFT_TOUCHPAD_MODE') || getKeymapValue(configText ?? '', 'TOUCHPAD_MODE') || 'Left pad').replace(/_/g, ' '),
    RIGHT_PAD: (getKeymapValue(configText ?? '', 'RIGHT_TOUCHPAD_MODE') || getKeymapValue(configText ?? '', 'TOUCHPAD_MODE') || 'Right pad').replace(/_/g, ' '),
  }), [bindings, configText])
  const boundCommands = useMemo(() => {
    const bound = new Set<string>()
    ;(configText ?? '').split(/\r?\n/).forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const match = /^([A-Z0-9_+*,]+)\s*=\s*(.*)/i.exec(trimmed)
      if (!match) return
      const parts = match[1].includes(',') ? match[1].split(',') : match[1].length > 1 ? match[1].split(/[+*]/) : [match[1]]
      if (parts.length === 1 && /^(NONE)?\s*(#.*)?$/i.test(match[2])) return
      // A chorded or simultaneous line names more than one input; all of them
      // count as bound so the diagram marks each.
      parts.forEach(part => {
        const key = part.trim().toUpperCase()
        if (key) bound.add(key)
      })
    })
    Object.entries(bindings).filter(([,entry]) => entry.used).forEach(([command]) => bound.add(command))
    return bound
  }, [configText, bindings])

  const [showUnbound, setShowUnbound] = useState(false)
  // The diagram reads as a picture of the controller by default; the sensor
  // numbers behind it are for when you are dialling something in.
  const [showDetails, setShowDetails] = useState(false)

  // Which inputs act as a modifier is a property of the configuration, not of
  // the controller state -- so it must not be recomputed every telemetry frame.
  // It scans the whole configuration once per input, which is the single most
  // expensive thing on this page.
  const modifierOptions = useMemo(
    () => Object.keys(bindings).filter(command => inputUsage(configText ?? '', command, layers).some(u => u.kind === 'shift' || u.kind === 'chord')),
    [bindings, configText, layers],
  )

  const value = (key: string) => getKeymapValue(configText ?? '', key) ?? ''
  const mode = (key: string) => value(key).toUpperCase()
  const triggerThreshold = Number.parseFloat(value('TRIGGER_THRESHOLD')) || 0

  // Where a value comes from (Components 13.8), as a dot: solid for an
  // override of an inherited value, hollow for one taken from an import.
  const ownEntries = useMemo(() => layerEntries(origins.own), [origins.own])
  const baseEntries = useMemo(() => layerEntries(origins.base), [origins.base])
  const originOf = (key: string): { kind: 'override' | 'inherited'; title: string } | null => {
    const own = Object.prototype.hasOwnProperty.call(ownEntries, key)
    const source = origins.origins[key]
    const imported = source && source !== '<editor>' ? source.split('/').pop()?.replace(/\.txt$/i, '') : null
    if (origins.layer) return own ? { kind: 'override', title: `Override · ${origins.layer}` } : imported || Object.prototype.hasOwnProperty.call(baseEntries, key) ? { kind: 'inherited', title: 'Inherited from Default' } : null
    if (own) return imported || Object.prototype.hasOwnProperty.call(baseEntries, key) ? { kind: 'override', title: 'Override' } : null
    return imported ? { kind: 'inherited', title: `Inherited from ${imported}` } : null
  }
  const originDot = (key: string) => {
    const origin = originOf(key)
    return origin ? <span className={styles.originDot} data-origin={origin.kind} title={origin.title} /> : null
  }
  // The dot with its source named, for a tile (a marker's reset button
  // cannot sit inside the tile's own button).
  const originMark = (key: string) => {
    const origin = originOf(key)
    if (!origin) return null
    return <span className={styles.originMark} data-origin={origin.kind}><span className={styles.originDot} data-origin={origin.kind} />{origin.kind === 'override' ? 'Override' : origin.title.replace(/^Inherited from /, '')}</span>
  }

  // How many inputs each filter would show, for the chip counts.
  const overrideCount = Object.keys(selected?.overrides ?? {}).filter(key => !key.startsWith('#')).length
  const availableCount = Object.values(bindings).filter(entry => !entry.used).length

  // One callout (48 high): glyph, the action and a detail line, the origin
  // dot and output keycap on the right. A trigger folds its full pull into
  // the line ("Soft pull · full pull Left Shift") with the live pull under it.
  const callout = (command: string, compact = false) => {
    const entry = bindings[command]
    const plain = entry.lines.filter(line => !line.kind)
    const settingLines = entry.lines.filter(line => line.kind === 'setting')
    const activation = !entry.name && !plain.length && settingLines.find(line => /^(Enable|Disable) gyro/.test(line.text))
    const keycap = activation ? activation.text.replace(/^(Enable|Disable)/, '$1s') : entry.name && plain[0] && plain[0].text.length <= 16 && !plain[0].text.includes(':') ? plain[0].text : null
    const trigger = command === 'ZL' || command === 'ZR'
    const fullPull = trigger ? bindings[command + 'F'] : undefined
    const title = activation ? inputName(command, family) : entry.name ?? plain[0]?.text ?? null
    const rest = entry.lines.filter(line => line.text !== title && line.text !== keycap && line !== activation)
    const grip = GRIPS[command]
    const gripHeld = grip ? Boolean(device?.status?.[grip]?.pressed) || pressed.has(command) : false
    const detail = activation
      ? (gripHeld ? `Held · gyro ${/Enable/.test(activation.text) ? 'on' : 'off'}` : `Hold to ${/Enable/.test(activation.text) ? 'enable' : 'disable'} gyro`)
      : trigger && (fullPull?.used || command.endsWith('F'))
        ? `Soft pull · full pull ${fullPull?.name ?? fullPull?.lines.find(line => !line.kind)?.text ?? 'unbound'}`
        : command.endsWith('F') ? 'Full pull'
        : rest.filter(line => !line.kind).map(line => line.text).join(' · ')
    const pull = trigger ? (command === 'ZL' ? device?.status?.triggers.left : device?.status?.triggers.right) ?? 0 : 0
    const unbound = !title
    const named = UNLETTERED.has(command)
    return <div key={command} className={styles.inputRow}><button type="button" className={`${styles.callout} ${compact ? styles.calloutCompact : ''} ${unbound ? styles.calloutAvailable : ''}`} data-overview-input={command}
      data-has-uses={entry.hasUses ? '' : undefined}
      data-hints={entry.hasUses ? 'A:Edit;X:Inspect uses;Y:Search;B:Back' : 'A:Edit;Y:Search;B:Back'}
      aria-label={command + ': ' + labels[command]} title={inputName(command, family) + '\n' + inputUses(configText ?? '', command, layers).join('\n')}
      onClick={() => onSelectCommand?.(command)}
      onFocus={() => setHoveredCommand(command)} onBlur={() => setHoveredCommand(null)}
      onMouseEnter={() => setHoveredCommand(command)} onMouseLeave={() => setHoveredCommand(null)}>
      <InputGlyph command={command} family={family} size={compact ? 20 : 28} className={styles.glyph} />
      <span className={styles.bindingText}>
        {title
          ? <strong className={styles.calloutTitle}>{title}</strong>
          : <span className={`${styles.calloutTitle} ${styles.unbound}`}>{named ? inputName(command, family) : 'Available'}</span>}
        {unbound && named && <span className={styles.detailLine}>{reserved.has(command) ? 'Reserved by global chord' : 'Unbound'}</span>}
        {detail && <span className={styles.detailLine}>{detail}</span>}
        {rest.filter(line => line.kind && line.kind !== 'setting').map((line, index) => (
          <span key={index} className={line.kind === 'layer' ? styles.layerLine : styles.relationLine}>
            {line.kind === 'layer' && <LayerIcon />}{line.text}
          </span>
        ))}
        {!activation && rest.filter(line => line.kind === 'setting').map((line, index) => <span key={'s' + index} className={styles.detailLine}>{line.text}</span>)}
        {trigger && device && (
          <span className={styles.triggerMeter} aria-hidden="true">
            <span className={styles.triggerMeterFill} style={{ transform: `scaleX(${Math.max(0, Math.min(1, pull))})` }} />
            {triggerThreshold > 0 && <span className={styles.triggerMeterTick} style={{ left: `${Math.min(100, triggerThreshold * 100)}%` }} />}
          </span>
        )}
        <LayerValueBadge command={command} />
      </span>
      {(keycap || originOf(command)) && (
        <span className={styles.valueSide}>
          {originDot(command)}
          {keycap && <kbd className={`${styles.valuePill} ${activation ? styles.valuePillJsm : ''}`}>{keycap}</kbd>}
          {keycap && !activation && plain.length > 1 && <span className={styles.more}>+{plain.length - 1}</span>}
        </span>
      )}
    </button>{entry.hasUses && <button type="button" className={styles.inspect} aria-label={`Show uses of ${inputName(command, family)}`} onClick={() => window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: command }))}>Inspect uses</button>}</div>
  }

  const modeLine = (modeKey: string | undefined, items: string[]) => {
    const overrides = items.filter(command => Object.keys(selected?.overrides ?? {}).some(key => key === command || key.endsWith(',' + command))).length
    const bound = items.filter(command => bindings[command]?.used).length
    if (!modeKey) return `${bound} bound${overrides ? ` · ${overrides} override${overrides === 1 ? '' : 's'}` : ''}`
    const raw = mode(modeKey)
    if (!raw) return ''
    const regions = items.filter(command => /^[LR]?[TM]\d+$/.test(command)).length
    if (modeKey.includes('STICK')) {
      const segments = Number.parseInt(value(modeKey.replace('_MODE', '_MENU_SIZE')), 10) || regions
      return raw === 'RADIAL_MENU' ? `Radial menu · ${segments} segments` : STICK_MODES[raw] ?? titleCase(raw)
    }
    if (raw === 'GRID_AND_STICK') return `${regions}-way button pad`
    const name = PAD_MODES[raw] ?? titleCase(raw)
    return regions ? `${name} · ${regions} click region${regions === 1 ? '' : 's'}` : name
  }

  const group = (id: string, title: string, commands: string[], modeKey?: string, modeCommand?: string, variant: 'column' | 'card' = 'column') => {
    const items = commands.filter(command => {
      const entry = bindings[command]
      if (!entry || (!showUnbound && filter !== 'available' && !entry.used)) return false
      if (id !== 'other-hardware' && !controllerSupportsInput(device, command)) return false
      // A trigger's full pull is told on the trigger's own row.
      if ((command === 'ZLF' || command === 'ZRF') && bindings[command.slice(0, 2)]?.used && filter === 'all' && !query) return false
      if (filter === 'available' && entry.used) return false
      if (filter === 'overrides' && !Object.keys(selected?.overrides ?? {}).some(key => key === command || key.endsWith(',' + command))) return false
      if (modifier && !inputUsage(configText ?? '', modifier, layers).some(use => use.target === command || use.target.endsWith(',' + command))) return false
      return !query || [inputName(command, family), command, entry.name, ...entry.lines.map(line => line.text)].join(' ').toLowerCase().includes(query.toLowerCase())
    })
    const line = variant === 'card' ? modeLine(modeKey, commands.filter(command => bindings[command])) : ''
    if (!items.length && (!line || query || filter !== 'all' || modifier)) return null
    return <section className={variant === 'card' ? styles.overviewCard : styles.bindingGroup} aria-label={title} data-overview-group={id} key={id}>
      {variant === 'card'
        ? <header className={styles.cardHead}>
            <h3>{title}</h3>
            {line && (modeCommand
              ? <button type="button" className={styles.mode} onClick={() => onSelectCommand?.(modeCommand)}>{line}</button>
              : <span className={styles.mode}>{line}</span>)}
          </header>
        : <h3>{title}</h3>}
      <div className={styles.callouts}>
        {items.map(command => callout(command, variant === 'card'))}
      </div>
    </section>
  }
  const numbered = (pattern: RegExp) => Object.keys(bindings).filter(command => pattern.test(command)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  // Live gyro speed for the quick-settings tile: the magnitude of the rotation,
  // kept for a short sparkline. Telemetry is its own stream, so this draws in
  // every mode, Studio navigation and Test alike.
  const gyro = device?.status?.gyro
  const speed = gyro ? Math.hypot(gyro.x, gyro.y, gyro.z) : 0
  const speedHistory = useRef<number[]>([])
  useEffect(() => {
    if (!gyro) return
    speedHistory.current = [...speedHistory.current.slice(-(SPARK_SAMPLES - 1)), speed]
  })
  const sparkline = (() => {
    const values = speedHistory.current
    if (values.length < 2) return ''
    const top = Math.max(60, ...values)
    return values.map((sample, index) => `${(index / (SPARK_SAMPLES - 1)) * 240},${40 - (sample / top) * 34}`).join(' ')
  })()
  const gyroOn = value('GYRO_ON'), gyroOff = value('GYRO_OFF')
  const activation = gyroOn ? `Hold ${inputName(gyroOn, family).toLowerCase()} to enable` : gyroOff ? `Hold ${inputName(gyroOff, family).toLowerCase()} to disable` : 'Always on'
  const outputName = { LEFT_STICK: 'Left stick', RIGHT_STICK: 'Right stick' }[mode('GYRO_OUTPUT')] ?? 'Mouse'
  const pair = (raw: string) => raw.trim().split(/\s+/).filter(Boolean)
  const staticSens = pair(value('GYRO_SENS')), minSens = pair(value('MIN_GYRO_SENS')), maxSens = pair(value('MAX_GYRO_SENS'))
  const sens = staticSens.length ? `${staticSens[0]} / ${staticSens[1] ?? staticSens[0]}` : minSens.length || maxSens.length ? `${minSens[0] ?? '—'} – ${maxSens[0] ?? '—'}` : '—'
  const sensKey = staticSens.length ? 'GYRO_SENS' : minSens.length ? 'MIN_GYRO_SENS' : 'MAX_GYRO_SENS'
  const invert = (key: string) => /INVERT/i.test(value(key)) ? 'On' : 'Off'
  const rightPadModeKey = value('RIGHT_TOUCHPAD_MODE') ? 'RIGHT_TOUCHPAD_MODE' : 'TOUCHPAD_MODE'
  const rightPadMode = PAD_MODES[mode(rightPadModeKey)] ?? (mode(rightPadModeKey) ? titleCase(mode(rightPadModeKey)) : 'Mouse')
  const trackball = isTrackballBindingPresent(configText ?? '')

  return (
    <div className={styles.page} ref={pageRef}>
      {/* The search sits on the page header's right (Overview.dc.html); the
          header is the shell's, so the field is placed over it from here. */}
      {/* Y reaches search from anywhere; entering the page lands on the
          first callout, not in a text field the pad cannot type into. */}
      <label className={styles.search} data-nav-entry-skip="">
        <Icon name="search" size={16} />
        <input ref={searchRef} type="search" aria-label="Search bindings" placeholder="Find an input, action or key" value={query} onChange={e => setQuery(e.target.value)} />
        <span className={styles.searchKey} aria-hidden="true"><ButtonGlyph button="Y" size={18} /></span>
      </label>
      <div className={styles.filterBar} role="toolbar" aria-label="Filter bindings">
        {([['all', 'All bindings', null], ['overrides', 'Overrides', overrideCount], ['available', 'Available', availableCount]] as const).map(([id, label, count]) => (
          <button key={id} type="button" className={styles.filterChip} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}{count !== null && <span className={styles.chipCount}>{count}</span>}
          </button>
        ))}
        <label className={`${styles.filterChip} ${styles.selectChip}`} data-selected={modifier ? 'true' : undefined}>
          <AppSelect aria-label="Uses modifier" value={modifier} onChange={e => { setModifier(e.target.value); setShowUnbound(true) }}>
            <option value="">Uses a modifier</option>
            {modifierOptions.map(command => <option key={command} value={command}>Changed by {inputName(command, family)}</option>)}
          </AppSelect>
        </label>
        <span className={styles.filterSpacer} />
        <button type="button" className={styles.toggleChip} aria-pressed={showUnbound} onClick={() => setShowUnbound(value => !value)}><span className={styles.toggleMark} aria-hidden="true" />Show unbound</button>
        <button type="button" className={styles.toggleChip} aria-pressed={showDetails} onClick={() => setShowDetails(value => !value)}><span className={styles.toggleMark} aria-hidden="true" />Details</button>
        <button type="button" className={styles.toggleChip} aria-pressed={showDiagram} onClick={() => setShowDiagram(v => !v)}><span className={styles.toggleMark} aria-hidden="true" />Controller</button>
      </div>
      {layers.length > 0 && (
        <div className={styles.layerTabs} role="group" aria-label="Preview layer" data-nav-entry-skip="">
          <button type="button" aria-pressed={!selected} disabled={disabled} onClick={() => onSelectLayer?.('')}>Default</button>
          {layers.map((layer, index) => <button key={layer.id} type="button" disabled={disabled} aria-pressed={selected?.id === layer.id} onClick={() => onSelectLayer?.(layer.id)}>
            <span className={styles.layerSwatch} style={{ background: `var(--layer-${(index % 3) + 1})` }} aria-hidden="true" /><LayerIcon />{layer.name}
          </button>)}
        </div>
      )}

      <section className={`${styles.hero} ${!showDiagram ? styles.noDiagram : ''}`} aria-label="Controller">
        <div className={styles.calloutColumn}>
          {group('left-shoulder', 'Left shoulder & grip', ['ZL', 'ZLF', 'L', 'LSL', 'LSR', 'LMINI', 'MISC6'])}
          {group('left-middle', 'Left middle', ['-', 'HOME'])}
        </div>
        {showDiagram && <div className={styles.diagram} data-arrived={arrived || undefined}>
          {device && connecting
            ? <NoController configName={configName} connecting={{ name: controllerDisplayName(device.type), detail: `SDL · ${controllerDisplayName(device.type)}`, output: virtualOutput }} />
            : device
            ? <ControllerStatusSvg device={device} boundCommands={boundCommands} bindingLabels={labels} selectedCommand={hoveredCommand} onSelectCommand={onSelectCommand} showRawTelemetry={showDetails} />
            : <NoController configName={configName} onKeepEditing={() => document.querySelector<HTMLElement>('[aria-label="Controller"] button, [aria-label="Controller"] summary')?.focus()} />}
          {device && !connecting && <div className={styles.diagramStatus}><BatteryIndicator percent={device.batteryPercent} state={device.batteryState} /></div>}
        </div>}
        <div className={styles.calloutColumn}>
          {group('right-shoulder', 'Right shoulder & grip', ['ZR', 'ZRF', 'R', 'RSR', 'RSL', 'RMINI', 'MISC5'])}
          {group('right-middle', 'Right middle', ['+', 'MISC1', 'MIC', 'MISC4'])}
        </div>
      </section>

      <section className={styles.band} aria-label="Sticks, pads and buttons">
        {group('left-pad', 'Left trackpad', ['MISC3', ...numbered(/^LT\d+$/)], 'LEFT_TOUCHPAD_MODE', 'LEFT_PAD', 'card')}
        {group('left-stick', 'Left stick', [...LEFT_STICK_BUTTONS.map(b => b.command), ...numbered(/^LM\d+$/)], 'LEFT_STICK_MODE', 'L3', 'card')}
        {group('dpad', 'D-Pad', ['UP', 'DOWN', 'LEFT', 'RIGHT'], undefined, undefined, 'card')}
        {group('face', 'Face buttons', ['S', 'E', 'W', 'N'], undefined, undefined, 'card')}
        {group('right-stick', 'Right stick', [...RIGHT_STICK_BUTTONS.map(b => b.command), ...numbered(/^RM\d+$/)], 'RIGHT_STICK_MODE', 'R3', 'card')}
        {group('right-pad', 'Right trackpad', ['MISC2', ...numbered(/^RT\d+$/)], 'RIGHT_TOUCHPAD_MODE', 'RIGHT_PAD', 'card')}
        {group('shared-pad', 'Trackpad', [...TOUCH_BUTTONS.map(b => b.command), ...TOUCH_STICK_BUTTONS.map(b => b.command), ...numbered(/^T\d+$/)], 'TOUCHPAD_MODE', 'LEFT_PAD', 'card')}
      </section>

      <section className={styles.quickSettings} aria-label="Quick settings">
        <button type="button" className={`${styles.quickTile} ${styles.quickTileGyro}`} aria-label="Gyro summary" onClick={() => onNavigate('gyro')}>
          <span className={styles.quickMain}>
            <span className={styles.quickEyebrow}>Gyro</span>
            <span className={styles.quickValue}>{activation} · {outputName}</span>
            <span className={styles.quickStats}>
              <span><small>Sensitivity</small><b>{sens} {originDot(sensKey)}</b></span>
              <span><small>Real world cal.</small><b>{value('REAL_WORLD_CALIBRATION') || '—'}</b></span>
              <span><small>Space</small><b>{mode('GYRO_SPACE') ? titleCase(mode('GYRO_SPACE')) : 'Local'}</b></span>
            </span>
          </span>
          <span className={styles.quickLive} aria-hidden={!device}>
            <span className={styles.quickLiveHead}><small>Speed</small><b>{device ? `${Math.round(speed)} °/s` : '—'}</b></span>
            <svg className={styles.sparkline} viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" y1="40" x2="240" y2="40" className={styles.sparklineBase} />
              {sparkline && <polyline points={sparkline} />}
            </svg>
            <span className={styles.quickLiveFoot}><span>{device ? `${SPARK_SAMPLES} samples` : ''}</span><span>{device ? 'live' : 'No controller'}</span></span>
          </span>
        </button>
        <button type="button" className={styles.quickTile} onClick={() => onNavigate('gyro')}>
          <span className={styles.quickEyebrow}>Gyro invert</span>
          <span className={styles.quickValue}>{invert('GYRO_AXIS_X')} · {invert('GYRO_AXIS_Y')}</span>
          <small>X axis · Y axis</small>
        </button>
        <button type="button" className={styles.quickTile} onClick={() => onNavigate('touchpad')}>
          <span className={styles.quickEyebrow}>Right pad</span>
          <span className={styles.quickValue}>{rightPadMode}{trackball ? ' · Trackball' : ''}</span>
          <small>{originMark(rightPadModeKey) ?? 'Select to change'}</small>
        </button>
        <button type="button" className={`${styles.quickTile} ${styles.quickTileAction}`} disabled={!onRecalibrate || recalibrating} onClick={onRecalibrate}>
          <span className={styles.quickEyebrow}>Calibration</span>
          <span className={styles.quickAction}>{recalibrating ? 'Recalibrating…' : 'Recalibrate gyro'}</span>
        </button>
      </section>

      {Object.keys(bindings).some(command => bindings[command].used && !controllerSupportsInput(device, command)) && <details className={styles.otherHardware}><summary>Bindings for other controller inputs</summary>{group('other-hardware', 'Not available on this controller', Object.keys(bindings).filter(command => !controllerSupportsInput(device, command)))}</details>}
    </div>
  )
}
