import { stickMenuLinks } from '../utils/stickMenus'
import { LayerUsageContext } from './LayerBar'
import { inputUsage, configuredInputs, readableSetting, layerEntries, layerHue, layerSlotOf, describeLayerActivation, type ConfigLayer, type LayerAction, type LayerVerb } from '../utils/layers'
import { describeBinding, explainBinding } from '../utils/bindingDescription'
import type { TFunction } from 'i18next'
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { BatteryIndicator } from './BatteryIndicator'
import { InputGlyph } from './glyphs/InputGlyph'
import { controllerVisualFamily, controllerButtonLabel, controllerDisplayName, getPressedControllerCommandSet, type ControllerVisualFamily } from '../utils/controllerStatus'
import { Sheet } from './ui/Sheet'
import { inputDisplayName, inputLongName } from '../keymap/inputNames'
import { presetsForInput, requestPaste, setBindingClipboard, useBindingClipboard } from '../utils/bindingClipboard'
import { commandTokenPreview } from '../utils/bindingCommands'
import { showToast } from '../utils/toast'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { NoController } from './NoController'
import { SettingOrigins } from './SettingOrigin'
import { desktopBridge } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, MISC_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, TOUCH_BUTTONS, TOUCH_STICK_BUTTONS } from '../keymap/schema'
import { controllerSupportsInput } from '../utils/controllerStatus'
import { getButtonBindingRows, getKeymapValue } from '../utils/keymap'
import { parseBindingLabels } from '../utils/bindingLabels'
import { shiftedInputName, shiftedInputs } from '../utils/shiftedInputs'
import { readVirtualMenus } from '../utils/virtualMenus'
import { normalizePreviewInput } from '../utils/inputNavigation'
import { useShell } from '../shell/ShellContext'
import { KEY_GROUPS } from './keymap/pickers/keyCatalog'
import { ControllerLightSettings } from './ControllerLightSettings'
import styles from './OverviewPage.module.css'
import type { Dispatch, SetStateAction } from 'react'

// Layout (console v2, Layout.dc.html): "the controller is the menu". A mode
// strip (LT / RT), then the controller between two columns of one-line
// callouts -- glyph, what it does, a short output -- with the focused input's
// card under the art. Everything else the old Overview drew has a home in the
// quick menu (Y, QuickMenu.dc.html) or on its own tab; see
// design/console-v2/notes/LAYOUT.md.

export type OverviewNavTarget = 'buttons' | 'dpad' | 'triggers' | 'joysticks' | 'touchpad' | 'gyro'

/** "Only for this controller" in the quick menu: which layout edits go to. */
export type LayoutControllerScope = {
  /** The connected (or chosen) controller, named: "DualSense". */
  name: string | null
  /** Edits go to a layout only this controller uses. */
  variant: boolean
  /** How many lines that layout changes. */
  changes: number
}

type OverviewPageProps = {
  devices?: TelemetryDevice[]
  onNavigate: (target: OverviewNavTarget) => void
  /** The active configuration, for the bound-input marks and action names. */
  onConfigTextChange?: Dispatch<SetStateAction<string>>
  configText?: string
  onSelectCommand?: (command: string) => void
  onSelectLayer?: (id: string) => void
  disabled?: boolean
  /** Quick menu ▸ Calibrate gyro (was the Calibration tile). */
  onRecalibrate?: () => void
  /** The configuration being edited, named by the no-controller state. */
  configName?: string | null
  recalibrating?: boolean
  /** The virtual output the configuration starts, named by the connecting state (17b). */
  virtualOutput?: string
  /** X Try it: Test mode, for the focused input. */
  onTryIt?: (command: string) => void
  /** Why Try it cannot run now ("Connect a controller to test"). */
  tryItReason?: string | null
  /** Quick menu ▸ Only for this controller. */
  controllerScope?: LayoutControllerScope
}

const definitions = [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS]
/** A layer action is not a binding and should not read like one. */
type OverviewLine = { text: string; kind?: 'layer' | 'relation' | 'setting' }
type OverviewEntry = {
  name?: string
  lines: OverviewLine[]
  used: boolean
  hasUses: boolean
  /** Inputs this one changes while it is held: a pad for its settings and
      region cells (utils/shiftedInputs), not one per config key. */
  shiftCount: number
  /** Those inputs, named ("Right trackpad"), and in short ("Right pad"). */
  shiftNames: string[]
  /** Inputs this one fires together with ("RB + A"), by their name. */
  chordWith: string[]
  /** Layers this input turns on or off. */
  layerIds: string[]
  /** What this input becomes while each of those triggers is held. */
  shiftedBy: Record<string, { value: string; name?: string }>
}

// ---- The callout slots (Layout.dc.html): one row per input, and one per
// group -- D (D-pad), ABXY, LS / RS (a stick and its mode), LP / RP (a pad and
// its mode). The primary slots always show, "Not set" when free; the extras
// only when something is on them or Show unused inputs is on.
type SlotKind = 'single' | 'dpad' | 'face' | 'stick' | 'pad'
type Slot = {
  id: string
  kind: SlotKind
  /** Every input the slot stands for, the first being its representative. */
  inputs: string[]
  /** The glyph's command. */
  glyph: string
  /** Where A goes, and what the art highlights. */
  target: string
  /** The setting keys that belong to it (a stick's mode, a pad's grid). */
  settingPrefix?: string[]
  /** Always shown; an extra shows only when used or with Show unused. */
  primary: boolean
  /** Its virtual-menu source (MENU_SOURCES). */
  menuSource?: string
}

const single = (command: string, primary = true, inputs = [command]): Slot => ({ id: command, kind: 'single', inputs, glyph: command, target: command, primary })
const numberedPattern = (prefix: string) => new RegExp(`^${prefix}\\d+$`)

/** The pad's navigation buttons: pressing them in Find moves the sheet, not the search. */
const NAVIGATION = new Set(['S', 'E', 'W', 'N', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R', 'ZL', 'ZR', 'ZLF', 'ZRF', '+', '-', 'HOME'])
/** A thumb resting on a pad or stick is contact, not a press. */
const CONTACT = new Set(['MISC4', 'TOUCH', 'LTOUCH', 'RTOUCH'])

// What a stick or pad mode is called on its callout ("Move · WASD", "Radial menu · 8 slices").
const STICK_MODES: Record<string, string> = { NO_MOUSE: 'Directions', AIM: 'Aim', HYBRID_AIM: 'Aim + flick', FLICK: 'Flick to turn', FLICK_ONLY: 'Flick only', ROTATE_ONLY: 'Turn only', MOUSE_RING: 'Mouse ring', MOUSE_AREA: 'Mouse area', SCROLL_WHEEL: 'Scroll wheel', RADIAL_MENU: 'Radial menu', LEFT_STICK: 'Gamepad left stick', RIGHT_STICK: 'Gamepad right stick', INNER_RING: 'Inner ring', OUTER_RING: 'Outer ring' }
const PAD_MODES: Record<string, string> = { MOUSE: 'Look', GRID_AND_STICK: 'Button pad', MOUSE_RING: 'Mouse ring', MOUSE_JOYSTICK: 'Mouse joystick', MOUSE_AREA: 'Mouse area', NO_MOUSE: 'Directions', SCROLL_WHEEL: 'Scroll wheel', RADIAL_MENU: 'Radial menu', PORTED: 'Touch stick' }
const STICK_EXPLAIN: Record<string, string> = {
  AIM: 'Aims like a mouse: push further to turn faster.',
  HYBRID_AIM: 'Aims like a mouse, and a flick to the edge turns you.',
  FLICK: 'Flick to turn to where you point, then turn the stick to keep turning.',
  FLICK_ONLY: 'Flick to turn to where you point.',
  ROTATE_ONLY: 'Turn the stick around its edge to turn.',
  MOUSE_RING: 'Puts the mouse where the stick points, on a ring around the screen centre.',
  MOUSE_AREA: 'Moves the mouse within a small area around where it started.',
  SCROLL_WHEEL: 'Turn the stick around its edge to scroll.',
  RADIAL_MENU: 'Point the stick at a slice to pick it; each slice sends its own key.',
  LEFT_STICK: 'Acts as the left stick of a virtual gamepad.',
  RIGHT_STICK: 'Acts as the right stick of a virtual gamepad.',
}
const PAD_EXPLAIN: Record<string, string> = {
  MOUSE: 'Moves the mouse like a laptop trackpad.',
  GRID_AND_STICK: 'Split into zones; each zone is its own button.',
  MOUSE_RING: 'Puts the mouse where your thumb points, on a ring around the screen centre.',
  MOUSE_JOYSTICK: 'Moves the mouse like a stick: further from the centre is faster.',
  MOUSE_AREA: 'Maps the pad onto an area of the screen.',
  SCROLL_WHEEL: 'Circle your thumb to scroll.',
  PORTED: 'Acts as a stick.',
}
const VERB_WORD: Record<LayerVerb, string> = { hold: 'hold', toggle: 'tap', apply: 'turns on', remove: 'turns off' }

/** What games use a key for, by the key's cap ("r" → "Reload"), from the key picker's catalogue. */
const KEY_USES = new Map<string, string[]>()
for (const group of KEY_GROUPS) for (const section of group.sections) for (const key of section.keys) {
  if (!key.use) continue
  for (const name of new Set([key.cap.toLowerCase(), key.token.toLowerCase()])) KEY_USES.set(name, [...(KEY_USES.get(name) ?? []), key.use])
}

const titleCase = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
const sentence = (text: string) => { const trimmed = text.trim(); return trimmed ? trimmed.replace(/^./, c => c.toUpperCase()).replace(/([^.!?])$/, '$1.') : '' }
/** explainBinding's clauses without its "Config syntax" line, as one sentence. */
const explainLine = (value: string, t: TFunction) => {
  const lines = explainBinding(value, t).split('\n').filter(Boolean)
  return sentence((lines.length > 1 ? lines.slice(0, -1) : lines).join(', then '))
}

// One reader for every binding in the app: see utils/bindingDescription.ts.
const describeLine = (binding: string, t: TFunction) => describeBinding(binding, t)

/** The quick menu's row (QuickMenu.dc.html .qm): icon, label and its hint,
 *  then a value, a ◂ value ▸ the D-pad changes in place, or a switch. */
function QuickRow({ icon, label, hint, value, toggle, cycle, onActivate, reason, caption }: {
  icon: ReactNode; label: string; hint?: string; value?: ReactNode
  toggle?: { on: boolean; onChange: (on: boolean) => void }
  cycle?: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }
  onActivate?: () => void
  /** Unavailable, and why (it stays focusable). */
  reason?: string
  caption?: string
}) {
  const index = cycle ? Math.max(0, cycle.options.findIndex(option => option.value === cycle.value)) : 0
  const move = (direction: 1 | -1) => {
    if (!cycle || reason) return
    const next = cycle.options[Math.min(cycle.options.length - 1, Math.max(0, index + direction))]
    if (next && next.value !== cycle.value) cycle.onChange(next.value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!cycle || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault(); event.stopPropagation()
    move(event.key === 'ArrowRight' ? 1 : -1)
  }
  return (
    <button type="button" className={styles.qm} role={toggle ? 'switch' : undefined} aria-checked={toggle ? toggle.on : undefined}
      aria-disabled={reason ? 'true' : undefined} data-reason={reason}
      data-arrows={cycle ? 'horizontal' : undefined}
      data-hints={reason ? 'B:Close' : cycle ? 'MOVE:Change;A:Choose;B:Close' : 'A:Choose;B:Close'}
      data-caption={caption ?? (hint ? `${label} · ${hint}` : undefined)}
      onClick={() => {
        if (reason) return
        if (toggle) toggle.onChange(!toggle.on)
        else if (cycle) cycle.onChange(cycle.options[(index + 1) % cycle.options.length].value)
        else onActivate?.()
      }}
      onKeyDown={onKeyDown}>
      <span className={styles.qmIcon} aria-hidden="true">{icon}</span>
      <span className={styles.qmText}>
        <span className={styles.qmLabel}>{label}</span>
        {hint && <span className={styles.qmHint}>{hint}</span>}
      </span>
      {value !== undefined && <span className={styles.qmValue}>{value}</span>}
      {cycle && <span className={styles.qmValue}><span aria-hidden="true">◂</span>{cycle.options[index]?.label}<span aria-hidden="true">▸</span></span>}
      {toggle && <span className={styles.qmSwitch} data-on={toggle.on ? 'true' : undefined} aria-hidden="true"><span /></span>}
    </button>
  )
}

// The quick menu's icon art (QuickMenu.dc.html), 22px strokes.
const QM_ICON = {
  unused: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8" strokeDasharray="3 3" /></svg>,
  changes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
  holding: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v8M16 13v8M4 7h8M12 17h8" /></svg>,
  picture: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 15l3-4 3 3 4-5" /></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>,
  paste: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h4" /></svg>,
  uses: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>,
  controller: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10a5 5 0 0 1 4.6 7l-1.1 2.6a2.5 2.5 0 0 1-4.3.5L14.5 15h-5l-1.7 2.1a2.5 2.5 0 0 1-4.3-.5L2.4 14A5 5 0 0 1 7 7z" /><path d="M7 11v3M5.5 12.5h3" /></svg>,
  missing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="6" width="16" height="12" rx="4" strokeDasharray="3 2.5" /><path d="M9 12h6" /></svg>,
  gyro: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9" /><path d="M19 9l2 3 2-3M5 15l-2-3-2 3" /></svg>,
}

export function OverviewPage({ onConfigTextChange, devices, configText, onSelectCommand, onSelectLayer, disabled, onRecalibrate, recalibrating, configName, virtualOutput, onTryIt, tryItReason, controllerScope }: OverviewPageProps) {
  const { t } = useTranslation()
  const shell = useShell()
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
  const { layers, selected, actions } = useContext(LayerUsageContext)
  const origins = useContext(SettingOrigins)
  const text = configText ?? ''
  // Glyphs and names follow the controller in front of you (Kit): the live
  // one, or the shell's family while none is connected.
  const family: ControllerVisualFamily = device ? controllerVisualFamily(device.type) : shell.family
  const pressed = useMemo(() => getPressedControllerCommandSet(device), [device])

  // ---- The quick menu (Y) and what it filters.
  const [quickOpen, setQuickOpen] = useState(false)
  const [missingOpen, setMissingOpen] = useState(false)
  const [lightOpen, setLightOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyChanges, setOnlyChanges] = useState(false)
  const [modifier, setModifier] = useState('')
  const [showUnbound, setShowUnbound] = useState(false)
  // Picture shows: what each input does, the live readings, or no picture.
  const [picture, setPicture] = useState<'actions' | 'readings' | 'none'>('actions')
  const pageRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const findFocused = useRef(false)
  const clipboard = useBindingClipboard()

  // Inputs Hold to swap holds: they read "Hold to swap".
  const [reserved, setReserved] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let live = true
    desktopBridge.listGlobalChords().then(chords => { if (live) setReserved(new Set(chords.flatMap(chord => (chord.triggerGroups?.flat() ?? chord.buttons).map(button => button.toUpperCase())))) }).catch(() => {})
    return () => { live = false }
  }, [])

  const inputName = (command: string) => {
    const definition = definitions.find(button => button.command === command)
    return definition ? controllerButtonLabel(definition, family) : command
  }
  const longName = (command: string) => {
    if (command === 'ZL') return 'Left trigger'
    if (command === 'ZR') return 'Right trigger'
    const definition = definitions.find(button => button.command === command)
    return definition ? inputLongName(definition, family, t) : inputName(command)
  }

  const bindings = useMemo(() => {
    const names = parseBindingLabels(text)
    const commands = new Set(configuredInputs(text))
    // Include numbered pad regions and stick-menu segments, even when offline.
    for (const match of text.matchAll(/(?:^\s*|[, +])([LR]?T\d+|[LR]M\d+)\s*=/gm)) commands.add(match[1])
    const result: Record<string, OverviewEntry> = {}
    // Which held inputs change which inputs, and to what: "L4,A = V".
    const shiftedBy: Record<string, Record<string, { value: string; name?: string }>> = {}
    for (const [key, raw] of Object.entries(layerEntries(text))) {
      const comma = key.indexOf(',')
      if (comma <= 0 || key.startsWith('#') || key.startsWith('!')) continue
      const trigger = key.slice(0, comma), target = key.slice(comma + 1)
      const value = String(raw).split('#')[0].trim()
      if (!value || value.toUpperCase() === 'NONE') continue
      ;(shiftedBy[target] ??= {})[trigger] = { value, name: names[key] }
    }
    const name = (command: string) => { const definition = definitions.find(button => button.command === command); return definition ? controllerButtonLabel(definition, family) : command }
    for (const command of commands) {
      const lines: OverviewLine[] = getButtonBindingRows(text, command).filter(row => row.binding && row.binding !== 'NONE').map(row => {
        const binding = row.binding!
        const output = describeLine(binding, t)
        const condition = row.modifierCommand ? name(row.modifierCommand) : ''
        const prefix = row.slot === 'chord' ? 'Hold ' + condition : row.slot === 'simultaneous' ? 'With ' + condition : row.slot === 'tap' ? '' : row.label
        const shiftedName = row.modifierCommand ? names[row.modifierCommand + (row.slot === 'simultaneous' ? '+' : ',') + command] : ''
        const summary = shiftedName ? shiftedName + ' (' + output + ')' : output
        return { text: prefix ? prefix + ': ' + summary : summary }
      })
      // Modifier relationships are separate lines; don't dump entire setting lists into a binding.
      // `B,B = G` is B's double-tap, not B changing itself while held (UX review, L5).
      const relationships = inputUsage(text, command, layers).filter(use => !(use.kind === 'shift' && use.target.toUpperCase() === command))
      relationships.filter(use => !['shift', 'chord'].includes(use.kind))
        .forEach(use => lines.push({ text: use.label, kind: use.kind === 'layer' ? 'layer' : use.kind === 'setting' ? 'setting' : undefined }))
      // What this input shifts and chords with: named, then counted past three.
      // These are the full account, for the callout's accessible name and the
      // focus card; the callout itself says one line.
      const shifts = relationships.filter(use => use.kind === 'shift')
      const chords = relationships.filter(use => use.kind === 'chord')
      const chordWith = [...new Set(chords.flatMap(use => use.target.split('+').filter(part => part !== command)))].map(name)
      const say = (target: string) =>
        definitions.some(button => button.command === target) ? name(target)
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
      const shiftedGroups = shiftedInputs(shifts.map(use => use.target))
      const shiftNames = shiftedGroups.map(input => shiftedInputName(input, family))
      if (shifts.length === 1) {
        const target = shifts[0].target
        const value = shiftValue(target)
        const becomes = definitions.some(button => button.command === target)
          ? describeLine(value, t)
          : value.replace(/_/g, ' ')
        lines.push({ text: value ? `While held: ${say(target)} → ${becomes}` : summarise(shifts, 'While held, changes'), kind: 'relation' })
      } else if (shifts.length) {
        lines.push({ text: shiftNames.length <= 3 ? `While held, changes ${shiftNames.join(', ')}` : `While held, changes ${shiftNames.slice(0, 3).join(', ')} and ${shiftNames.length - 3} more`, kind: 'relation' })
      }
      if (chords.length) lines.push({ text: summarise(chords, 'Pressed together with'), kind: 'relation' })
      // Bound only under a shift ("LEFT,RT1 = F3"): say which. A shift that sets
      // an input to NONE binds nothing, so it does not make the input used.
      const onlyShifted = Object.keys(shiftedBy[command] ?? {})
      if (!lines.length && onlyShifted.length) lines.push({ text: t('overview.whileHeld', 'While {{name}} is held', { name: onlyShifted.map(name).join(' / ') }), kind: 'relation' })
      const used = !!lines.length || !!names[command]
      if (used || controllerSupportsInput(device, command)) result[command] = {
        name: names[command], lines, used, hasUses: relationships.length > 0,
        shiftCount: shiftNames.length,
        shiftNames,
        chordWith,
        layerIds: [...new Set(relationships.filter(use => use.kind === 'layer' && use.layerId).map(use => use.layerId!))],
        shiftedBy: shiftedBy[command] ?? {},
      }
    }
    return result
  }, [text, device, layers, family, t])
  const labels = useMemo<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.entries(bindings).map(([command, entry]) => [command, [entry.name, ...entry.lines.map(line => line.text)].filter(Boolean).join(' · ') || 'Not set'])),
    LEFT_PAD: (getKeymapValue(text, 'LEFT_TOUCHPAD_MODE') || getKeymapValue(text, 'TOUCHPAD_MODE') || 'Left pad').replace(/_/g, ' '),
    RIGHT_PAD: (getKeymapValue(text, 'RIGHT_TOUCHPAD_MODE') || getKeymapValue(text, 'TOUCHPAD_MODE') || 'Right pad').replace(/_/g, ' '),
  }), [bindings, text])
  const boundCommands = useMemo(() => {
    const bound = new Set<string>()
    text.split(/\r?\n/).forEach(line => {
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
  }, [text, bindings])

  // Which inputs act as a modifier is a property of the configuration, not of
  // the controller state -- so it must not be recomputed every telemetry frame.
  const modifierOptions = useMemo(
    () => Object.keys(bindings).filter(command => inputUsage(text, command, layers).some(u => u.kind === 'shift' || u.kind === 'chord')),
    [bindings, text, layers],
  )
  const modifierTargets = useMemo(() => modifier ? new Set(inputUsage(text, modifier, layers).flatMap(use => [use.target, ...use.target.split(/[,+]/)])) : null, [modifier, text, layers])

  const value = (key: string) => getKeymapValue(text, key) ?? ''
  const mode = (key: string) => value(key).toUpperCase()
  const triggerThreshold = Number.parseFloat(value('TRIGGER_THRESHOLD')) || 0
  const menus = useMemo(() => readVirtualMenus(text).menus, [text])

  // Where a value comes from: this configuration's own lines, or an import.
  const ownEntries = useMemo(() => layerEntries(origins.own), [origins.own])
  const baseEntries = useMemo(() => layerEntries(origins.base), [origins.base])
  const importedFrom = (key: string) => {
    const source = origins.origins[key]
    return source && source !== '<editor>' ? source.split('/').pop()?.replace(/\.txt$/i, '') ?? null : null
  }

  // ---- Slots for the controller in front of you.
  const steamPads = family === 'steam'
  const sharedPad = !steamPads && (device ? controllerSupportsInput(device, 'CAPTURE') : family === 'playstation')
  const numbered = (pattern: RegExp) => Object.keys(bindings).filter(command => pattern.test(command)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const slots = useMemo(() => {
    // A group's click goes to its first bound member, so "ABXY · Space" opens the button that sends Space (or the default when none is set).
    const groupTarget = (kind: SlotKind, inputs: string[], fallback: string) => kind === 'face' || kind === 'dpad' ? inputs.find(input => { const v = value(input).toUpperCase(); return v !== '' && v !== 'NONE' }) ?? fallback : fallback
    const group = (id: string, kind: SlotKind, inputs: string[], glyph: string, target: string, settingPrefix: string[] = [], menuSource?: string): Slot => ({ id, kind, inputs, glyph, target: groupTarget(kind, inputs, target), settingPrefix, primary: true, menuSource })
    const left: Slot[] = [
      single('ZL', true, ['ZL', 'ZLF']), single('L'), single('LSL'), single('-'),
      group('left-stick', 'stick', [...LEFT_STICK_BUTTONS.map(b => b.command), ...numbered(numberedPattern('LM'))], 'LS', 'L3', ['LEFT_STICK_', 'LEFT_RING_', 'STICK_'], 'LSTICK'),
      group('dpad', 'dpad', ['UP', 'DOWN', 'LEFT', 'RIGHT'], 'DPAD', 'UP', [], 'DPAD'),
      ...(steamPads ? [group('left-pad', 'pad', ['MISC3', 'MISC4', ...numbered(numberedPattern('LT'))], 'LEFT_PAD', 'LEFT_PAD', ['LEFT_TOUCHPAD_', 'LEFT_GRID_'], 'LEFT')] : []),
      single('LSR'), single('MISC6'), single('LMINI', false),
    ]
    const right: Slot[] = [
      single('ZR', true, ['ZR', 'ZRF']), single('R'), single('RSR'), single('RSL'), single('MISC5'), single('+'),
      group('face', 'face', ['S', 'E', 'W', 'N'], 'S', 'S', [], 'ABXY'),
      group('right-stick', 'stick', [...RIGHT_STICK_BUTTONS.map(b => b.command), ...numbered(numberedPattern('RM'))], 'RS', 'R3', ['RIGHT_STICK_', 'RIGHT_RING_'], 'RSTICK'),
      ...(steamPads ? [group('right-pad', 'pad', ['MISC2', 'TOUCH', ...numbered(numberedPattern('RT'))], 'RIGHT_PAD', 'RIGHT_PAD', ['RIGHT_TOUCHPAD_', 'RIGHT_GRID_'], 'RIGHT')] : []),
      ...(sharedPad ? [group('shared-pad', 'pad', ['CAPTURE', 'TOUCH', ...TOUCH_STICK_BUTTONS.map(b => b.command), ...numbered(/^T\d+$/)], 'CAPTURE', 'CAPTURE', ['TOUCHPAD_', 'GRID_'], 'RIGHT')] : []),
      single('HOME', false), single('MISC1', false), single('MIC', false), single('RMINI', false),
    ]
    return { left, right }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- numbered reads bindings
  }, [bindings, steamPads, sharedPad])
  const allSlots = useMemo(() => [...slots.left, ...slots.right], [slots])
  const slotOf = (command: string) => allSlots.find(slot => slot.inputs.includes(command) || slot.target === command)

  // ---- What a slot says.
  const supported = (command: string) => controllerSupportsInput(device, command)
  const used = (command: string) => Boolean(bindings[command]?.used)
  const layerActionsOn = (command: string) => actions.filter(action => action.input === command || action.input === `!${command}`)
  const layerName = (id: string) => layers.find(layer => layer.id === id)?.name ?? id
  const layerIndex = (id: string) => layers.findIndex(layer => layer.id === id)
  const settingChanged = (slot: Slot, key: string) => (slot.settingPrefix ?? []).some(prefix => key.startsWith(prefix) && (prefix !== 'STICK_' || slot.id === 'left-stick'))
  const keyTouches = (slot: Slot, key: string) => !key.startsWith('#') && (slot.inputs.some(input => key === input || key.split(/[,+]/).includes(input)) || settingChanged(slot, key))
  /** The modes that change this slot. */
  const modesChanging = (slot: Slot): ConfigLayer[] => layers.filter(layer => Object.keys(layer.overrides).some(key => keyTouches(slot, key)))
  /** Set by this configuration itself (Default view), or by the mode shown. */
  const changedHere = (slot: Slot) => selected
    ? Object.keys(selected.overrides).some(key => keyTouches(slot, key))
    : Object.keys(ownEntries).some(key => keyTouches(slot, key) && (!Object.prototype.hasOwnProperty.call(baseEntries, key) || baseEntries[key] !== ownEntries[key]))
  const gyroActivation = (command: string): 'on' | 'off' | null => {
    const on = value('GYRO_ON').split(/\s+/), off = value('GYRO_OFF').split(/\s+/)
    return on.includes(command) ? 'on' : off.includes(command) ? 'off' : null
  }

  type Said = { title: string; output: string; unset: boolean; tint?: number; shifted?: boolean; holding?: boolean }
  const saySingle = (command: string): Said => {
    const entry = bindings[command]
    if (!entry) return { title: 'Not set', output: '', unset: true }
    const plain = entry.lines.filter(line => !line.kind)
    const primary = plain.find(line => !line.text.includes(': ')) ?? plain[0]
    const primaryValue = primary ? primary.text.replace(/^[^:]+:\s*/, '') : ''
    const qualifier = primary && primary.text.includes(': ') ? primary.text.split(':')[0].toLowerCase() : ''
    // A modeshift held right now (2a, 2g): the input it changes says what it
    // does meanwhile, in place, and what it was; the held input says Held.
    const heldTrigger = Object.keys(entry.shiftedBy).find(held => pressed.has(held))
    const shifted = heldTrigger ? entry.shiftedBy[heldTrigger] : undefined
    const holding = pressed.has(command) && (entry.shiftCount > 0 || entry.chordWith.length > 0)
    const mine = layerActionsOn(command)
    const gyro = gyroActivation(command)
    let said: Said
    if (mine.length) {
      const action = mine.find(item => item.verb !== 'remove') ?? mine[0]
      const name = layerName(action.layerId)
      const title = entry.name ?? (action.verb === 'remove' ? `Leave ${name}` : `${name} layer`)
      const key = primaryValue.replace(/^(Tap|Press|Hold|Release|Toggle)\s+/i, '')
      const extra = key && primaryValue !== entry.name ? ` · ${key}` : ''
      said = { title, output: `${action.input.startsWith('!') ? 'let go' : VERB_WORD[action.verb]}${extra}`, unset: false, tint: layerSlotOf(layerIndex(action.layerId)) }
    } else if (gyro && !primary) {
      said = { title: entry.name ?? (gyro === 'on' ? 'Gyro aim on' : 'Gyro aim off'), output: 'while held', unset: false }
    } else if (command === 'ZL' || command === 'ZR') {
      const full = bindings[command + 'F']
      const fullValue = full?.name ?? full?.lines.find(line => !line.kind)?.text
      const analog = entry.lines.find(line => line.kind !== 'relation' && /^Analog/.test(line.text))
      if (!primary && analog) said = { title: analog.text.replace(/\s*→.*$/, ''), output: 'gamepad', unset: false }
      else if (!primary && !fullValue) said = { title: 'Not set', output: '', unset: true }
      else said = { title: entry.name ?? primaryValue ?? fullValue ?? '', output: fullValue ? `full · ${fullValue}` : entry.name ? primaryValue : qualifier, unset: false }
      if (!primary && fullValue && !analog) said = { title: 'Full press only', output: fullValue, unset: false }
    } else if (primary) {
      const more = plain.length > 1 ? `+${plain.length - 1}` : ''
      said = entry.name
        ? { title: entry.name, output: [qualifier, primaryValue].filter(Boolean).join(' · '), unset: false }
        : { title: primaryValue, output: [qualifier, more].filter(Boolean).join(' · '), unset: false }
      // It also changes other inputs while held: say so where there is room.
      if (!said.output && entry.shiftCount) said = { ...said, output: entry.shiftCount === 1 ? `changes ${entry.shiftNames[0]} while held` : `changes ${entry.shiftCount} while held` }
    } else if (entry.shiftCount) {
      said = { title: entry.name ?? (entry.shiftCount === 1 ? `Changes ${entry.shiftNames[0]}` : `Changes ${entry.shiftCount} inputs`), output: 'while held', unset: false }
    } else if (entry.chordWith.length) {
      said = { title: entry.name ?? `With ${entry.chordWith[0]}`, output: 'together', unset: false }
    } else if (entry.lines.length) {
      const line = entry.lines[0]
      said = { title: entry.name ?? line.text.replace(/\s*→.*$/, ''), output: '', unset: false }
    } else if (entry.name) {
      said = { title: entry.name, output: '', unset: false }
    } else if (reserved.has(command)) {
      said = { title: 'Hold to swap', output: 'reserved', unset: false }
    } else {
      said = { title: 'Not set', output: '', unset: true }
    }
    if (shifted) said = { ...said, title: shifted.name ?? describeLine(shifted.value, t), output: `${describeLine(shifted.value, t)} · was ${said.title}`, shifted: true, unset: false }
    else if (holding) said = { ...said, output: t('overview.held', 'Held'), holding: true }
    return said
  }
  const shortOf = (command: string) => saySingle(command).unset ? '' : saySingle(command).title
  const stickSays = (slot: Slot): Said => {
    const side = slot.id === 'left-stick' ? 'LEFT' : 'RIGHT'
    const prefix = side === 'LEFT' ? 'L' : 'R'
    const menu = stickMenuLinks(text, side === 'LEFT' ? 'left' : 'right').find(link => link.attachment.activation === 'ALWAYS')
    if (menu) return { title: menu.menu.name, output: 'menu', unset: false }
    const raw = mode(`${side}_STICK_MODE`)
    if (raw === 'RADIAL_MENU') {
      const slices = Number.parseInt(value(`${side}_STICK_MENU_SIZE`), 10) || slot.inputs.filter(input => /M\d+$/.test(input)).length
      return { title: 'Radial menu', output: `${slices} slices`, unset: false }
    }
    if (!raw || raw === 'NO_MOUSE') {
      const directions = ['UP', 'LEFT', 'DOWN', 'RIGHT'].map(direction => bindings[prefix + direction]?.lines.find(line => !line.kind)?.text.replace(/^[^:]+:\s*/, '') ?? '')
      const keys = directions.map(key => key.toUpperCase())
      if (keys.join('') === 'WASD') return { title: 'Move', output: 'WASD', unset: false }
      if (directions.every(key => /arrow|^(UP|DOWN|LEFT|RIGHT)$/i.test(key))) return { title: 'Move', output: 'arrows', unset: false }
      const set = directions.filter(Boolean)
      if (set.length) return { title: set.length === 4 ? 'Directions' : `Directions · ${set.length} of 4`, output: set.join(' '), unset: false }
      const click = shortOf(`${prefix}3`)
      return click ? { title: 'Click only', output: click, unset: false } : { title: 'Not set', output: '', unset: true }
    }
    const word = STICK_MODES[raw] ?? titleCase(raw)
    const output = raw === 'LEFT_STICK' || raw === 'RIGHT_STICK' ? 'gamepad' : raw === 'SCROLL_WHEEL' ? 'wheel' : 'mouse'
    return { title: word, output, unset: false }
  }
  const padSays = (slot: Slot): Said => {
    const side = slot.id === 'left-pad' ? 'LEFT_' : slot.id === 'right-pad' ? 'RIGHT_' : ''
    const menu = slot.menuSource ? menus.flatMap(item => item.attachments.filter(attachment => attachment.source === slot.menuSource && attachment.activation === 'ALWAYS').map(() => item))[0] : undefined
    const raw = mode(`${side}TOUCHPAD_MODE`) || (side ? mode('TOUCHPAD_MODE') : '')
    const zones = slot.inputs.filter(input => /T\d+$/.test(input) && used(input)).length
    if (menu) return { title: menu.name, output: zones ? `${zones} zones` : 'menu', unset: false }
    if (raw === 'GRID_AND_STICK') {
      const names = slot.inputs.filter(input => /T\d+$/.test(input) && bindings[input]?.name).map(input => bindings[input].name!)
      return { title: names.length && names.length <= 2 ? names.join(' · ') : 'Button pad', output: `${zones} zone${zones === 1 ? '' : 's'}`, unset: false }
    }
    // A click that shifts the pad into zones (Wardogs' right pad): "Look · 4 click zones".
    if (raw) return { title: `${PAD_MODES[raw] ?? titleCase(raw)}${zones ? ` · ${zones} click zone${zones === 1 ? '' : 's'}` : ''}`, output: raw === 'MOUSE' || raw.startsWith('MOUSE') ? 'mouse' : '', unset: false }
    const click = slot.inputs.map(shortOf).find(Boolean)
    return click ? { title: 'Click', output: click, unset: false } : { title: 'Not set', output: '', unset: true }
  }
  const groupMembersSay = (slot: Slot) => slot.inputs.map(input => ({ input, said: saySingle(input) }))
  const DIRECTION_WORD: Record<string, string> = { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' }
  const says = (slot: Slot): Said => {
    if (slot.kind === 'single') return saySingle(slot.inputs[0])
    if (slot.kind === 'stick') return stickSays(slot)
    if (slot.kind === 'pad') return padSays(slot)
    const members = groupMembersSay(slot).filter(member => !member.said.unset)
    if (!members.length) return { title: 'Not set', output: '', unset: true }
    if (slot.kind === 'dpad') {
      const titles = members.map(member => member.said.title)
      return { title: titles.length > 3 ? `${titles.slice(0, 3).join(' · ')} +${titles.length - 3}` : titles.join(' · '), output: members.length === 4 ? 'all four' : members.map(member => DIRECTION_WORD[member.input]).join(' · '), unset: false }
    }
    return { title: groupMembersSay(slot).map(member => member.said.unset ? '—' : member.said.title).join(' · '), output: '', unset: false }
  }

  const slotUsed = (slot: Slot) => !says(slot).unset
  const slotSupported = (slot: Slot) => slot.kind !== 'single' || slot.inputs.some(supported)
  // Find matches what the key picker calls a key too ("reload" finds R, "jump"
  // finds Space; UX review 2026-10-09, L8), not only the key's own name.
  const slotText = (slot: Slot) => {
    const said = says(slot)
    const lines = slot.inputs.flatMap(input => bindings[input]?.lines.map(line => line.text) ?? [])
    const uses = lines.flatMap(line => line.split(/[^A-Za-z0-9+]+/).flatMap(word => KEY_USES.get(word.toLowerCase()) ?? []))
    return [said.title, said.output, slotName(slot), ...slot.inputs.flatMap(input => [input, inputName(input), bindings[input]?.name ?? '']), ...lines, ...uses].join(' ').toLowerCase()
  }
  const slotVisible = (slot: Slot) => {
    if (!slotSupported(slot) && !slotUsed(slot)) return false
    if (!slot.primary && !slotUsed(slot) && !showUnbound && !query) return false
    if (onlyChanges && !changedHere(slot)) return false
    if (modifierTargets && !slot.inputs.some(input => modifierTargets.has(input)) && !(slot.settingPrefix ?? []).some(prefix => [...modifierTargets].some(target => target.startsWith(prefix)))) return false
    if (query && !slotText(slot).includes(query.trim().toLowerCase())) return false
    return true
  }
  function slotName(slot: Slot) {
    switch (slot.id) {
      case 'dpad': return 'D-pad'
      case 'face': return 'Face buttons'
      case 'left-stick': return 'Left stick'
      case 'right-stick': return 'Right stick'
      case 'left-pad': return 'Left trackpad'
      case 'right-pad': return 'Right trackpad'
      case 'shared-pad': return 'Touchpad'
      default: return longName(slot.inputs[0])
    }
  }

  // Bindings for inputs this controller doesn't have (they are kept for the
  // controller they were made on): Quick menu ▸ Not on this controller.
  const missing = useMemo(() => device ? Object.keys(bindings).filter(command => bindings[command].used && !controllerSupportsInput(device, command)) : [], [bindings, device])

  // ---- Focus: the card under the art follows the focused callout.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const visibleLeft = slots.left.filter(slotVisible)
  const visibleRight = slots.right.filter(slotVisible)
  const visible = [...visibleLeft, ...visibleRight]
  const focusSlot = visible.find(slot => slot.id === (hoverId ?? focusId)) ?? visible.find(slot => slot.id === focusId) ?? visible[0] ?? null
  const singleInput = focusSlot?.kind === 'single' ? focusSlot.inputs[0] : null

  // ---- The focus card's words.
  const modeStatus = (slot: Slot): { text: string; tone: 'same' | 'changed' | 'none'; hue?: number } => {
    const changing = modesChanging(slot)
    const source = slot.kind === 'single' ? importedFrom(slot.inputs[0]) : null
    if (!layers.length) return source ? { text: `From ${source}`, tone: 'none' } : { text: '', tone: 'none' }
    if (!changing.length) return { text: 'Same in every layer', tone: 'same' }
    if (selected && changing.some(layer => layer.id === selected.id)) return { text: `Changed in ${selected.name}`, tone: 'changed', hue: layerSlotOf(layerIndex(selected.id)) }
    return { text: `Changed in ${changing.map(layer => layer.name).join(', ')}`, tone: 'changed', hue: layerSlotOf(layerIndex(changing[0].id)) }
  }
  const describeAction = (action: LayerAction, input: string) => {
    const name = layerName(action.layerId)
    const released = action.input.startsWith('!')
    const verb = /grip/i.test(longName(input)) ? 'squeeze' : 'hold'
    switch (action.verb) {
      case 'hold': return released ? `Turns on ${name} while you're not holding it.` : `Turns on ${name} while you ${verb} it. Let go to go back.`
      case 'toggle': return `Turns ${name} on, and off again the next time.`
      case 'apply': return `Turns ${name} on${released ? ' when you let go' : ''}.`
      case 'remove': return `Turns ${name} off${released ? ' when you let go' : ''}.`
    }
  }
  const singleDescription = (command: string): string[] => {
    const entry = bindings[command]
    const name = longName(command)
    const out: string[] = []
    for (const action of layerActionsOn(command)) out.push(describeAction(action, command))
    const gyro = gyroActivation(command)
    if (gyro) {
      const verb = /grip/i.test(name) ? 'squeeze' : 'hold'
      out.push(gyro === 'on' ? `Turns gyro aiming on while you ${verb} it. Let go to stop aiming.` : `Turns gyro aiming off while you ${verb} it. Let go to aim again.`)
    }
    const rows = getButtonBindingRows(text, command).filter(row => row.binding && row.binding !== 'NONE')
    rows.slice(0, 2).forEach(row => {
      const lead = row.slot === 'chord' && row.modifierCommand ? `With ${inputName(row.modifierCommand)} held: `
        : row.slot === 'simultaneous' && row.modifierCommand ? `Pressed together with ${inputName(row.modifierCommand)}: `
        : row.slot === 'hold' ? 'When held: ' : row.slot === 'double' ? 'On a double-tap: ' : ''
      const explained = explainLine(row.binding!, t)
      out.push(lead ? lead + explained.replace(/^./, c => c.toLowerCase()) : explained)
    })
    if (rows.length > 2) out.push(`And ${rows.length - 2} more.`)
    if (command === 'ZL' || command === 'ZR') {
      const full = bindings[command + 'F']?.lines.find(line => !line.kind)
      if (full) out.push(`A full press: ${full.text}.`)
    }
    entry?.lines.filter(line => line.kind === 'relation' || line.kind === 'setting').forEach(line => { if (!/^(Enable|Disable) gyro/.test(line.text) || !gyro) out.push(sentence(line.text)) })
    if (!out.length) out.push(reserved.has(command) ? 'Reserved by Hold to swap, so it is kept free. Change that in Settings ▸ Hold to swap.' : 'Nothing on it yet.')
    return out
  }
  const groupDescription = (slot: Slot): string[] => {
    if (slot.kind === 'dpad' || slot.kind === 'face') {
      const members = groupMembersSay(slot)
      // What a member changes while held is said with it: "Left: X_LEFT (while held, changes Right trackpad)".
      const set = members.filter(member => !member.said.unset).map(member => {
        const entry = bindings[member.input]
        const relations = [entry?.shiftCount ? `while held, changes ${entry.shiftNames.join(', ')}` : '', entry?.chordWith.length ? `together with ${entry.chordWith.join(', ')}` : ''].filter(Boolean).join('; ')
        return `${inputName(member.input)}: ${member.said.title}${relations ? ` (${relations})` : ''}`
      })
      const free = members.filter(member => member.said.unset).map(member => inputName(member.input))
      return [set.length ? set.join(' · ') : 'Nothing on them yet.', ...(free.length && set.length ? [`Not set: ${free.join(', ')}.`] : [])]
    }
    const out: string[] = []
    if (slot.kind === 'stick') {
      const side = slot.id === 'left-stick' ? 'LEFT' : 'RIGHT'
      const raw = mode(`${side}_STICK_MODE`)
      const links = stickMenuLinks(text, side === 'LEFT' ? 'left' : 'right')
      if (links.some(link => link.attachment.activation === 'ALWAYS')) out.push(`Reserved for ${links[0].menu.name}: moving the stick picks in the menu.`)
      else if (!raw || raw === 'NO_MOUSE') {
        const said = says(slot)
        out.push(said.unset ? 'Nothing on its directions yet.' : `Each direction is a button: ${['UP', 'LEFT', 'DOWN', 'RIGHT'].map(direction => saySingle(side[0] + direction)).map(item => item.unset ? '—' : item.title).join(', ')}.`)
      } else out.push(STICK_EXPLAIN[raw] ?? `${STICK_MODES[raw] ?? titleCase(raw)}.`)
      if (links.length && !links.some(link => link.attachment.activation === 'ALWAYS')) out.push(`${[...new Set(links.map(link => link.menu.name))].join(', ')} takes it over while open.`)
      const click = saySingle(`${side[0]}3`)
      if (!click.unset) out.push(`Click: ${click.title}.`)
    } else {
      const side = slot.id === 'left-pad' ? 'LEFT_' : slot.id === 'right-pad' ? 'RIGHT_' : ''
      const raw = mode(`${side}TOUCHPAD_MODE`) || (side ? mode('TOUCHPAD_MODE') : '')
      out.push(raw ? PAD_EXPLAIN[raw] ?? `${PAD_MODES[raw] ?? titleCase(raw)}.` : 'Nothing on it yet.')
      const zones = slot.inputs.filter(input => /T\d+$/.test(input) && used(input))
      if (zones.length) out.push(zones.slice(0, 4).map(input => `${bindings[input].name ?? saySingle(input).title}`).join(' · ') + (zones.length > 4 ? ` +${zones.length - 4}` : ''))
      const click = slot.inputs.find(input => /^MISC[23]$|^CAPTURE$/.test(input))
      const clickEntry = click ? bindings[click] : undefined
      if (click && clickEntry) {
        const relation = clickEntry.lines.find(line => line.kind === 'relation')
        const said = saySingle(click)
        if (relation) out.push(`Click: ${relation.text}.`)
        else if (!said.unset) out.push(`Click: ${said.title}.`)
      }
    }
    return out
  }
  const description = focusSlot ? (focusSlot.kind === 'single' ? singleDescription(focusSlot.inputs[0]) : groupDescription(focusSlot)) : []

  // ---- Pad: X tries the input, Y opens the quick menu. The keyboard's X and Y arrive here too.
  const tryIt = (slot: Slot | null) => {
    if (!slot) return
    if (tryItReason) { showToast(tryItReason, 'warn'); return }
    if (!onTryIt) return
    onTryIt(slot.target)
    showToast(`Testing · press ${slotName(slot)} to try it. View + Menu comes back.`, 'success')
  }
  const latest = useRef({ tryIt, focusSlot })
  latest.current = { tryIt, focusSlot }
  const openQuick = () => {
    setQuickOpen(true)
    requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select() })
  }
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'Y') { event.preventDefault(); openQuick(); return }
      if (button !== 'X') return
      const id = (event.target as Element | null)?.closest<HTMLElement>('[data-overview-slot]')?.dataset.overviewSlot
      const slot = id ? allSlotsRef.current.find(item => item.id === id) ?? null : latest.current.focusSlot
      event.preventDefault()
      latest.current.tryIt(slot)
    }
    page.addEventListener(PAD_EVENT, onPad)
    return () => page.removeEventListener(PAD_EVENT, onPad)
  }, [])
  const allSlotsRef = useRef(allSlots)
  allSlotsRef.current = allSlots

  // Find: "Or just press the real button". While the field has focus, pressing
  // an input the pad does not navigate with (a back button, a grip, a stick or
  // pad click, a trigger) closes the menu and lands on that input.
  const previousPressed = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set([...pressed].map(normalizePreviewInput).filter(command => !CONTACT.has(command)))
    const fresh = [...now].filter(command => !previousPressed.current.has(command))
    previousPressed.current = now
    if (!quickOpen || !findFocused.current || !fresh.length) return
    const command = fresh.find(item => !NAVIGATION.has(item)) ?? fresh.find(item => /^Z[LR]F?$/.test(item))
    const slot = command ? slotOf(command === 'LEFT_PAD' ? 'MISC3' : command === 'RIGHT_PAD' ? 'MISC2' : command) : undefined
    if (!slot) return
    setQuickOpen(false)
    setQuery('')
    setFocusId(slot.id)
    const focus = (tries: number) => {
      const node = document.querySelector<HTMLElement>(`[data-overview-slot="${CSS.escape(slot.id)}"]`)
      if (node) { node.focus(); node.scrollIntoView({ block: 'nearest' }) } else if (tries > 0) setTimeout(() => focus(tries - 1), 60)
    }
    setTimeout(() => focus(8), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per telemetry frame
  }, [pressed])

  // Live readings (Picture shows ◂ Live readings ▸): the gyro's speed as a
  // sparkline under the art (the old Gyro tile's live half).
  const SPARK_SAMPLES = 60
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

  // ---- The mode strip (P6): Default, then each mode with its swatch and how
  // it turns on, in quiet text ("hold L4", "tap R5"). LT / RT step it (App).
  const activationWords = (layerId: string) => {
    const mine = actions.filter(action => action.layerId === layerId)
    const on = mine.filter(action => action.verb !== 'remove')
    if (!on.length) return mine.length ? 'off only' : 'no button'
    const verb = on[0].verb
    const inputs = [...new Set(on.filter(action => action.verb === verb).map(action => inputDisplayName(action.input, family)))]
    return `${VERB_WORD[verb]} ${inputs.slice(0, 2).join(' or ')}${inputs.length > 2 ? ` +${inputs.length - 2}` : ''}`
  }
  const filtersOn = Boolean(query || onlyChanges || modifier || showUnbound)
  const clearFilters = () => { setQuery(''); setOnlyChanges(false); setModifier(''); setShowUnbound(false) }
  // "2 free": callouts with nothing on them, as the picture counts them.
  const availableCount = allSlots.filter(slot => slotSupported(slot) && says(slot).unset).length
  const changesCount = allSlots.filter(changedHere).length

  const hints = (slot?: Slot) => [slot && isReservedSlot(slot) ? 'A:Open Hold to swap' : 'A:Change', 'X:Try it', 'Y:More', layers.length ? 'LT/RT:Layer' : '', 'LB/RB:Tabs', 'B:Home'].filter(Boolean).join(';')
  // An input Hold to swap holds (Settings) has nothing of its own to change
  // here: its callout says so and opens Hold to swap instead of a sheet.
  const isReservedSlot = (slot: Slot) => slot.kind === 'single' && reserved.has(slot.inputs[0]) && says(slot).title === 'Hold to swap'
  const openReserved = () => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'globalChords' }))

  const callout = (slot: Slot) => {
    const said = says(slot)
    const first = slot.inputs[0]
    const reservedHere = isReservedSlot(slot)
    const trigger = slot.kind === 'single' && (first === 'ZL' || first === 'ZR')
    const pull = trigger ? (first === 'ZL' ? device?.status?.triggers.left : device?.status?.triggers.right) ?? 0 : 0
    // The accessible name is the full account: a group names every member's.
    const members = slot.kind === 'dpad' || slot.kind === 'face' ? ` — ${slot.inputs.map(input => `${inputName(input)}: ${labels[input] ?? 'Not set'}`).join('; ')}` : ''
    const label = slot.kind === 'single' ? labels[first] ?? said.title : `${said.title}${said.output ? ` · ${said.output}` : ''}${members}`
    // No focus caption: the focus card under the art is this callout's
    // caption, and the footer keeps saying where you are (and in which mode).
    const tintStyle = said.tint ? { '--callout-tint': layerHue(said.tint) } as CSSProperties : undefined
    return (
      <button key={slot.id} type="button" className={styles.callout}
        data-overview-input={slot.kind === 'single' ? first : slot.target}
        data-overview-slot={slot.id}
        data-overview-inputs={slot.inputs.join(' ')}
        data-has-uses={slot.kind === 'single' && bindings[first]?.hasUses ? '' : undefined}
        data-unset={said.unset ? 'true' : undefined}
        data-current={focusSlot?.id === slot.id ? 'true' : undefined}
        data-shifted={said.shifted ? 'true' : undefined}
        data-holding={said.holding ? 'true' : undefined}
        data-tinted={said.tint ? 'true' : undefined}
        style={tintStyle}
        data-hints={hints(slot)}
        data-reserved={reservedHere ? 'true' : undefined}
        aria-label={`${slot.kind === 'single' ? first : slotName(slot)}: ${label}`}
        onClick={() => { if (reservedHere) openReserved(); else onSelectCommand?.(slot.target) }}
        onFocus={() => { setFocusId(slot.id); setHoverId(null) }}
        onMouseEnter={() => setHoverId(slot.id)}>
        <span className={styles.pill} aria-hidden="true">
          {slot.kind === 'face'
            ? <span className={styles.faceCluster}>{['N', 'W', 'E', 'S'].map(command => <InputGlyph key={command} command={command} family={family} size={13} className={styles.faceGlyph} />)}</span>
            : <InputGlyph command={slot.glyph} family={family} size={28} className={styles.glyph} />}
        </span>
        <span key={said.shifted ? 'shifted' : 'base'} className={`${styles.title} ${styles.swap}`}>{said.title}</span>
        {said.output && <span key={`o:${said.output}`} className={`${styles.output} ${styles.swap}`}>{said.output}</span>}
        {trigger && device && (
          <span className={styles.triggerMeter} aria-hidden="true">
            <span className={styles.triggerMeterFill} style={{ transform: `scaleX(${Math.max(0, Math.min(1, pull))})` }} />
            {triggerThreshold > 0 && <span className={styles.triggerMeterTick} style={{ left: `${Math.min(100, triggerThreshold * 100)}%` }} />}
          </span>
        )}
      </button>
    )
  }

  // A click on the picture lands on the input's callout rather than leaving the page.
  const focusCalloutFor = (command: string) => {
    const slot = slotOf(command === 'LEFT_PAD' ? 'MISC3' : command === 'RIGHT_PAD' ? 'MISC2' : command) ?? slotOf(command)
    if (!slot) { onSelectCommand?.(command); return }
    setFocusId(slot.id)
    setHoverId(null)
    const node = document.querySelector<HTMLElement>(`[data-overview-slot="${CSS.escape(slot.id)}"]`)
    if (node) { node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'nearest' }) }
  }
  const status = focusSlot ? modeStatus(focusSlot) : null
  const focusSaid = focusSlot ? says(focusSlot) : null
  const highlight = focusSlot?.target ?? null
  const backCaption = focusSlot ? `Back · ${slotName(focusSlot)}` : undefined
  const showDiagram = picture !== 'none'

  const quickSlot = focusSlot
  const quickPresets = singleInput ? presetsForInput(text, singleInput) : []
  const scope = controllerScope

  return (
    <div className={styles.page} ref={pageRef} data-layout-page="">
      {/* The mode strip (Layout.dc.html): LT / RT flip which mode the picture shows. */}
      <div className={styles.modeStrip} role="group" aria-label="Showing layer" data-nav-entry-skip="">
        <ButtonGlyph button="LT" family={family} size={22} />
        <span className={styles.modeStripLabel}>Showing layer</span>
        <button type="button" className={styles.modePill} aria-pressed={!selected}
          aria-disabled={disabled ? 'true' : undefined} data-reason={disabled ? 'Wait for calibration to finish' : undefined}
          aria-description="What every input does when no layer is on"
          onClick={() => { if (!disabled) onSelectLayer?.('') }}>Default</button>
        {layers.map((layer, index) => (
          <button key={layer.id} type="button" className={styles.modePill} aria-label={layer.name} aria-pressed={selected?.id === layer.id}
            aria-disabled={disabled ? 'true' : undefined} data-reason={disabled ? 'Wait for calibration to finish' : undefined}
            // No focus caption, so the footer keeps saying where you are and
            // in which mode; the full activation is the pill's description.
            aria-description={`${describeLayerActivation(actions, layer.id, input => inputDisplayName(input, family), 'Not on a button yet')}`}
            onClick={() => { if (!disabled) onSelectLayer?.(layer.id) }}>
            <span className={styles.modeSwatch} style={{ background: layerHue(layerSlotOf(index)) }} aria-hidden="true" />
            {layer.name}
            <span className={styles.modeActivation} aria-hidden="true">{activationWords(layer.id)}</span>
          </button>
        ))}
        {!layers.length && <span className={styles.modeNone}>No layers yet · make one on the Layers tab</span>}
        <ButtonGlyph button="RT" family={family} size={22} />
        {filtersOn && (
          <span className={styles.filterNote} role="status">
            Showing {[onlyChanges ? (selected ? `${selected.name}'s changes` : 'this configuration\'s changes') : '', modifier ? `changed by ${inputName(modifier)}` : '', query ? `matching “${query}”` : '', showUnbound ? 'unused inputs too' : ''].filter(Boolean).join(' · ')}
            <button type="button" className={styles.filterClear} data-hints="A:Clear;B:Home" onClick={clearFilters}>Clear</button>
          </span>
        )}
      </div>

      {/* The hover sticks until the pointer leaves the whole stage: clearing it on each
          row's edge flashed the other face of the controller in the gaps between rows. */}
      <section className={`${styles.hero} ${!showDiagram ? styles.noDiagram : ''}`} aria-label="Controller" onMouseLeave={() => setHoverId(null)}>
        <div className={styles.column} data-overview-group="left">{visibleLeft.map(callout)}</div>
        <div className={styles.centre}>
          {showDiagram && <div className={styles.diagram} data-arrived={arrived || undefined}>
            {device && connecting
              ? <NoController configName={configName} connecting={{ name: controllerDisplayName(device.type), detail: `SDL · ${controllerDisplayName(device.type)}`, output: virtualOutput }} />
              : device
              // The picture is a hotspot map: an input on it focuses its callout
              // (A then changes it); both views stay mounted so nothing jumps
              // when the focus moves to a back input (UX review 2026-10-09).
              ? <ControllerStatusSvg device={device} boundCommands={boundCommands} bindingLabels={labels} selectedCommand={highlight} onSelectCommand={focusCalloutFor}
                  showRawTelemetry={picture === 'readings'} backView="always" backCaption={backCaption} />
              : <NoController configName={configName} onKeepEditing={() => document.querySelector<HTMLElement>('[data-overview-slot]')?.focus()} />}
            {device && !connecting && <div className={styles.diagramStatus}><BatteryIndicator percent={device.batteryPercent} state={device.batteryState} /></div>}
          </div>}
          {picture === 'readings' && device && (
            <div className={styles.live} aria-label="Gyro speed">
              <span className={styles.liveHead}><small>Gyro speed</small><b>{Math.round(speed)} °/s</b></span>
              <svg className={styles.sparkline} viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="40" x2="240" y2="40" className={styles.sparklineBase} />
                {sparkline && <polyline points={sparkline} />}
              </svg>
            </div>
          )}
          {focusSlot && focusSaid && (
            <div className={styles.focusCard} aria-live="polite" data-focus-card={focusSlot.id}>
              <div className={styles.focusHead}>
                <span className={styles.focusPill} aria-hidden="true">
                  {focusSlot.kind === 'face'
                    ? <span className={styles.faceCluster}>{['N', 'W', 'E', 'S'].map(command => <InputGlyph key={command} command={command} family={family} size={13} className={styles.faceGlyph} />)}</span>
                    : <InputGlyph command={focusSlot.glyph} family={family} size={30} />}
                </span>
                <span className={styles.focusName}>{slotName(focusSlot)}</span>
                {status?.text && <span className={styles.focusStatus} data-tone={status.tone} style={status.hue ? { '--status-hue': layerHue(status.hue) } as CSSProperties : undefined}>{status.text}</span>}
              </div>
              <p className={styles.focusText}>{description.slice(0, 3).join(' ')}</p>
              <div className={styles.focusHints}>
                <button type="button" tabIndex={-1} data-nav-skip="" onClick={() => { if (isReservedSlot(focusSlot)) openReserved(); else onSelectCommand?.(focusSlot.target) }}><ButtonGlyph button="A" family={family} size={26} />{isReservedSlot(focusSlot) ? 'Open Hold to swap' : 'Change'}</button>
                <button type="button" tabIndex={-1} data-nav-skip="" aria-disabled={tryItReason ? 'true' : undefined} data-caption={tryItReason ?? undefined} onClick={() => tryIt(focusSlot)}><ButtonGlyph button="X" family={family} size={26} />Try it</button>
                <button type="button" tabIndex={-1} data-nav-skip="" onClick={openQuick}><ButtonGlyph button="Y" family={family} size={26} />More</button>
              </div>
            </div>
          )}
        </div>
        <div className={styles.column} data-overview-group="right">{visibleRight.map(callout)}</div>
      </section>
      {!visible.length && (
        <p className={styles.empty}>Nothing matches. <button type="button" className={styles.filterClear} onClick={clearFilters}>Clear</button></p>
      )}

      {/* The quick menu (QuickMenu.dc.html): Y from anywhere on the page. Find,
          then what the picture shows, then this input, then the controller. */}
      <Sheet open={quickOpen} onClose={() => setQuickOpen(false)} eyebrow={`${configName ?? 'Configuration'} · Layout`} title="Quick menu" width={560}
        hints={[{ button: 'A', label: 'Choose' }, { button: 'DPAD', label: 'Change' }, { button: 'B', label: 'Close' }]}
        actions={quickSlot ? <span className={styles.quickFor}><InputGlyph command={quickSlot.kind === 'face' ? 'S' : quickSlot.glyph} family={family} size={24} />{slotName(quickSlot)}</span> : undefined}>
        <h3 className={styles.quickGroup}>Find</h3>
        <label className={styles.find}>
          <span className={styles.findRow}>
            <svg className={styles.findIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input ref={searchRef} type="search" aria-label="Find an input or action" placeholder="Find an input or action" value={query} onChange={e => setQuery(e.target.value)}
              onFocus={() => { findFocused.current = true }} onBlur={() => { findFocused.current = false }}
              data-caption="Type a button, an action or a key. A opens the on-screen keyboard." />
            <span className={styles.findKeyboard} aria-hidden="true"><svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="1" y="1" width="24" height="16" rx="3" /><path d="M5 6h.01M9 6h.01M13 6h.01M17 6h.01M21 6h.01M7 12h12" /></svg>Keyboard</span>
          </span>
          <span className={styles.findHelp}>Type a button, an action or a key, like “reload” or “R”. Or just press the real button.</span>
        </label>
        <QuickRow icon={QM_ICON.unused} label="Show unused inputs" value={`${availableCount} free`} toggle={{ on: showUnbound, onChange: setShowUnbound }}
          caption="Show unused inputs · inputs with nothing on them, dimmed. Find “not set” to see only those." />
        <QuickRow icon={QM_ICON.changes} label="Show only this layer’s changes" value={changesCount ? `${changesCount}` : undefined} toggle={{ on: onlyChanges, onChange: setOnlyChanges }}
          caption={selected ? `Only what ${selected.name} changes` : 'Only what this configuration sets itself, not what it takes from its base'} />
        <QuickRow icon={QM_ICON.holding} label="Show what one button changes" hint={modifier ? `Only the inputs ${inputName(modifier)} changes while held` : 'Every input · pick a held button to see only its chords and mode shifts'}
          cycle={{ value: modifier, onChange: next => { setModifier(next); if (next) setShowUnbound(true) }, options: [{ value: '', label: 'Any button' }, ...modifierOptions.map(command => ({ value: command, label: inputName(command) }))] }}
          caption="Show what one button changes · ◂ ▸ picks a button that is held; the picture then shows only the inputs its chords and mode shifts change" />
        <QuickRow icon={QM_ICON.picture} label="Picture shows" hint="What each input does, the live readings, or no picture"
          cycle={{ value: picture, onChange: next => setPicture(next as typeof picture), options: [{ value: 'actions', label: 'Actions' }, { value: 'readings', label: 'Live readings' }, { value: 'none', label: 'No picture' }] }}
          caption="Picture shows · ◂ ▸ changes what the controller picture shows: what each input does, the controller's live readings, or no picture at all" />

        {quickSlot && <>
          <h3 className={styles.quickGroup}>{slotName(quickSlot)}</h3>
          <QuickRow icon={QM_ICON.copy} label="Copy this input"
            value={quickPresets.length ? quickPresets.map(commandTokenPreview).join(' · ') : undefined}
            reason={!singleInput ? 'Copy works on one input: open its tab and pick one' : !quickPresets.length ? 'Nothing on it to copy' : undefined}
            onActivate={() => { if (!singleInput) return; setBindingClipboard(quickPresets, singleInput); showToast(`Copied ${slotName(quickSlot)}`, 'success') }} />
          <QuickRow icon={QM_ICON.paste} label="Paste onto this input"
            value={!clipboard.presets.length ? 'Nothing copied yet' : `${clipboard.presets.map(commandTokenPreview).join(' · ')}${clipboard.from ? ` · from ${longName(clipboard.from)}` : ''}`}
            reason={!singleInput ? 'Paste works on one input: open its tab and pick one' : !clipboard.presets.length ? 'Nothing copied yet' : clipboard.from === singleInput ? 'This is where it was copied from' : undefined}
            onActivate={() => { if (!singleInput) return; setQuickOpen(false); requestPaste(singleInput); onSelectCommand?.(singleInput) }} />
          <QuickRow icon={QM_ICON.uses} label="Every use" hint="Where else it turns up: layers, chords, mode shifts, pressed together"
            reason={!singleInput || !bindings[singleInput]?.hasUses ? 'Nothing else depends on it' : undefined}
            onActivate={() => { if (!singleInput) return; setQuickOpen(false); window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: singleInput })) }} />
        </>}

        <h3 className={styles.quickGroup}>Controller</h3>
        <QuickRow icon={QM_ICON.controller} label="Only for this controller"
          hint={scope?.variant
            ? `On · changes go to ${scope.name ?? 'this controller'}’s own layout${scope.changes ? ` · ${scope.changes} so far` : ' · none yet'}`
            : 'Off · changes go to the shared layout'}
          value={scope?.variant ? `${scope.name ?? 'This controller'} ▸` : 'Shared layout ▸'}
          caption={scope?.variant
            ? `Only for this controller · On. What you change here is kept for ${scope.name ?? 'this controller'} only; other controllers keep the shared layout. Open it to switch or reset.`
            : 'Only for this controller · Off. What you change here goes to the shared layout every controller follows. Open it to give one controller a layout of its own.'}
          onActivate={() => { setQuickOpen(false); window.dispatchEvent(new Event('jsm:open-controller-layout')) }} />
        <QuickRow icon={<span className={styles.lightDot} style={{ background: /^x[0-9a-f]{6}$/i.test(value('LIGHT_BAR')) ? `#${value('LIGHT_BAR').slice(1)}` : undefined }} />} label="Controller light & sounds"
          hint="Light, jingle, your sounds, trackpad rotation" value="▸"
          onActivate={() => {
            setQuickOpen(false)
            // MODES builds the Controller light & sounds surface and takes this
            // event (calling preventDefault). Until it does, the light sheet opens here.
            const event = new CustomEvent('jsm:open-light-sounds', { cancelable: true })
            if (window.dispatchEvent(event)) setLightOpen(true)
          }} />
        <QuickRow icon={QM_ICON.gyro} label="Calibrate gyro" hint="Set the controller down and keep it still"
          reason={!onRecalibrate ? 'Connect a controller to calibrate' : recalibrating ? 'Calibrating now…' : undefined}
          onActivate={() => onRecalibrate?.()} />
        {missing.length > 0 && <QuickRow icon={QM_ICON.missing} label="Not on this controller" hint="Kept for the controller they were made on"
          value={`${missing.length} ▸`} onActivate={() => { setQuickOpen(false); setMissingOpen(true) }} />}
      </Sheet>

      {/* Bindings this controller has no input for (were "Bindings for other controller inputs"). */}
      <Sheet open={missingOpen} onClose={() => setMissingOpen(false)} eyebrow={`${configName ?? 'Configuration'} · Layout`} title="Not on this controller" width={560}
        description="These inputs are kept for the controller they were made on. Select one to change it."
        hints={[{ button: 'A', label: 'Change' }, { button: 'B', label: 'Close' }]}>
        <div className={styles.missingList} data-overview-group="other-hardware">
          {missing.map(command => (
            <button key={command} type="button" className={styles.callout} data-overview-input={command} data-overview-slot={`missing:${command}`} data-hints="A:Change;B:Close"
              aria-label={`${command}: ${labels[command]}`} onClick={() => { setMissingOpen(false); onSelectCommand?.(command) }}>
              <span className={styles.pill} aria-hidden="true"><InputGlyph command={command} family={family} size={28} className={styles.glyph} /></span>
              <span className={styles.title}>{saySingle(command).title}</span>
              <span className={styles.output}>{longName(command)}</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Until MODES' Controller light & sounds surface takes jsm:open-light-sounds:
          this configuration's light, as the inline row used to offer. */}
      {onConfigTextChange && <Sheet open={lightOpen} onClose={() => setLightOpen(false)} eyebrow={`${configName ?? 'Configuration'} · Layout`} title="Controller light & sounds" width={560}
        description="For this configuration. Anything on Default follows Settings ▸ Controller."
        hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Close' }]}>
        <ControllerLightSettings text={text} onChange={onConfigTextChange} />
        <QuickRow icon={QM_ICON.controller} label="Power-on jingle and trackpad rotation" hint="Settings ▸ Controller" value="▸"
          onActivate={() => { setLightOpen(false); window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })) }} />
      </Sheet>}
    </div>
  )
}
