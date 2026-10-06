import { useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { isQueuedGyroAction, type BindingCommand, type BindingCommandPatch, type BindingOutputKind } from '../../utils/bindingCommands'
import { getVirtualControllerOptions, toVirtualControllerToken, type VirtualControllerType } from '../../utils/virtualController'
import { keyDisplayName } from '../../utils/keyNames'
import { loadConfigBindingValue } from '../../utils/loadConfigBinding'
import { LayerUsageContext } from '../LayerBar'
import { layerHue, layerSlot, visibleOverrideKeys } from '../../utils/layers'
import { MAIN_ROWS, NAV_ROWS, NUMPAD_ROWS, EXTENDED_FUNCTION_ROWS } from './KeyboardBindingModal'
import { mouseOptions, wheelOptions, builtInCommandOptions, systemKeyChoices } from './actionCatalog'
import { BindingIconArt } from './IconPicker'
import { COMMAND_LABELS, specialActionDescription } from '../../utils/commandLabels'
import './ActionPicker.css'
import { HapticOutputPicker } from './HapticOutputPicker'
import { DEFAULT_HAPTIC_BINDING, formatHapticBinding } from '../../utils/hapticBindings'
import { TRIGGER_LABEL_KEYS } from './triggerKinds'
import { InputGlyph } from '../glyphs/InputGlyph'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { Icon } from '../icons/Icon'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { useSoundLibrary } from '../../hooks/useSoundLibrary'
import { BUILT_IN_SOUNDS, parsePlaySound, playSoundToken } from '../../utils/controllerSounds'

import { readVirtualMenus } from '../../utils/virtualMenus'
import { MENU_COMMANDS, parseMenuCommand } from '../../utils/menuCommands'
import { jsmActionGroups, jsmActionGroupFor, jsmActionIcon } from './jsmActionGroups'

type Category = 'Gamepad' | 'Mouse' | 'Keyboard' | 'Numpad' | 'Layers' | 'System' | 'JSM' | 'Sounds' | 'Configurations' | 'Virtual menus' | 'Custom'
type Props = {
  inputLabel: string
  command: BindingCommand
  virtualControllerType: VirtualControllerType
  specialOptions: { value: string; label: string; disabled?: boolean }[]
  libraryProfiles?: string[]
  /** The configuration being edited, marked in the Configurations list. */
  currentProfileName?: string | null
  onSelect: (patch: BindingCommandPatch) => void
  onClose: () => void
  onEnableVirtualController?: () => void
  /** Capture a key or mouse button instead of choosing one. */
  onCapture?: () => void
  /** Adding a command: a stick mode shift is one of the JSM choices. */
  onAddStickShift?: () => void
  /** Adding a command: "LED while held" is one of the JSM choices (TODO-54);
   *  it is a setting on the input rather than a token, so the card adds it. */
  onAddHeldLed?: () => void
  /** Adding a command: the Layers category lists each layer; choosing one
   *  adds a Hold action on the input (TODO-55). */
  onAddLayerAction?: (layerId: string) => void
  /** The profile's (or the app's) LED colour: what "LED color" starts from. */
  defaultLedColor?: string
  /** A nested action editor can restrict choices to engine-supported outputs. */
  allowedOutputKinds?: BindingOutputKind[]
}

/** One choosable action, for the detail panel and for search. */
type Choice = { key: string; label: string; token: string; kind: BindingOutputKind; describe: string; commit: () => void; disabled?: boolean; icon?: string; expanded?: boolean }

// Every output token a configuration line already sends, so the keyboard can
// dot the keys that are taken (choosing one keeps both).
const usedTokens = (text: string) => {
  const used = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at < 0) continue
    for (const token of trimmed.slice(at + 1).split('#')[0].toUpperCase().match(/[A-Z0-9_]+/g) ?? []) used.add(token)
  }
  return used
}

/** Browsing is read-only. A command is committed through the same patch path as
 * the advanced editor, keeping its activation and output behavior intact.
 * The full-screen picker (Binding Editor 7b): categories stepped by LB / RB,
 * a real keyboard with dots on keys already in use, a detail panel naming the
 * focused choice and its raw token, search across every category on Y. */
export function ActionPicker({ inputLabel, command, virtualControllerType, specialOptions, libraryProfiles = [], currentProfileName, onSelect, onClose, onEnableVirtualController, onCapture, onAddStickShift, onAddLayerAction, defaultLedColor = '#ffffff', allowedOutputKinds }: Props) {
  const { t } = useTranslation()
  const { sounds } = useSoundLibrary()
  const title = useId()
  const { layers, text: configText = '' } = useContext(LayerUsageContext)
  const custom = command.outputKind === 'raw' || command.outputKind === 'haptic' || (command.outputKind === 'command' && !command.outputValue.startsWith('CYCLE ') && !builtInCommandOptions.includes(command.outputValue) && !/^(LED_BRIGHTNESS|LIGHT_BAR)\s*=/i.test(command.outputValue))
  // Open on the category the current action is in.
  const systemTokens = new Set(systemKeyChoices.map(key => key.token))
  const [category, setCategory] = useState<Category>(
    parseMenuCommand(command.outputValue) ? 'Virtual menus'
    : command.outputKind === 'virtualController' ? 'Gamepad'
    : command.outputKind === 'mouse' || command.outputKind === 'wheel' ? 'Mouse'
    : command.outputKind === 'loadConfig' && libraryProfiles.length ? 'Configurations'
    : command.outputKind === 'command' && parsePlaySound(command.outputValue) ? 'Sounds'
    : command.outputKind === 'special' || command.outputKind === 'gyroAction' || (command.outputKind === 'command' && !custom) ? 'JSM'
    : custom ? 'Custom'
    : systemTokens.has(command.outputValue) ? 'System'
    : 'Keyboard')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState<Choice | null>(null)
  const [jsmGroup, setJsmGroup] = useState<string | null>(null)
  const [advancedJsm, setAdvancedJsm] = useState(() => jsmActionGroupFor(command.outputValue)?.advanced ?? false)
  const variantsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (jsmGroup) variantsRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled), button:not(:disabled)')?.focus()
  }, [jsmGroup])
  const rootRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Layers is offered where a layer action can be added (the card's Add
  // command); a row's own picker swaps a token, which a layer is not.
  const categories: Category[] = allowedOutputKinds ? ['Gamepad', 'Mouse', 'Keyboard', 'Numpad', 'System'] : ['Gamepad', 'Mouse', 'Keyboard', 'Numpad', ...(onAddLayerAction ? ['Layers' as const] : []), 'Virtual menus', 'System', 'JSM', 'Sounds', ...(libraryProfiles.length ? ['Configurations' as const] : []), 'Custom']
  // The tabs in the app's language; JSM is a name.
  const categoryName = (item: Category) => ({
    Gamepad: t('keymap.pickerGamepad', 'Gamepad'), Mouse: t('keymap.pickerMouse', 'Mouse'), Keyboard: t('keymap.pickerKeyboard', 'Keyboard'), Numpad: t('keymap.pickerNumpad', 'Numpad'),
    'Virtual menus': t('app.nav.virtualMenus', 'Virtual menus'), Layers: t('keymap.pickerLayers', 'Layers'), System: t('keymap.pickerSystemMedia', 'System & media'), JSM: 'JSM', Sounds: t('keymap.pickerSounds', 'Sounds'), Configurations: t('keymap.pickerConfigurations', 'Configurations'), Custom: t('keymap.pickerCustom', 'Custom'),
  })[item]
  const glyphs: Record<string, string> = { faceSouth: 'S', faceNorth: 'N', faceWest: 'W', faceEast: 'E', leftBumper: 'L', rightBumper: 'R', leftStickClick: 'L3', rightStickClick: 'R3', back: '-', start: '+', home: 'HOME', dpadUp: 'UP', dpadDown: 'DOWN', dpadLeft: 'LEFT', dpadRight: 'RIGHT', leftTriggerDigital: 'ZL', rightTriggerDigital: 'ZR', padClick: 'CAPTURE' }
  const outputType = virtualControllerType === 'NONE' ? 'XBOX' : virtualControllerType
  const used = useMemo(() => usedTokens(configText), [configText])
  const current = command.outputValue ? keyDisplayName(command.outputValue) : ''
  // LED brightness and colour are console commands with a value
  // (`"LED_BRIGHTNESS = 40"`, `"LIGHT_BAR = xff8800"`). Picking one adds it
  // with the value it has, or the profile's, and the value is then set in
  // the command's sheet (TODO-54): the picker chooses, the sheet edits.
  /* Legacy brightness commands remain editable in their settings. */
  const colorMatch = /^LIGHT_BAR\s*=\s*x([0-9a-f]{6})\s*$/i.exec(command.outputValue ?? '')
  const colorToken = `LIGHT_BAR = x${(colorMatch?.[1] ?? defaultLedColor.replace(/^#/, '')).toLowerCase()}`

  const pick = (outputKind: BindingOutputKind, outputValue: string) => {
    if (allowedOutputKinds && !allowedOutputKinds.includes(outputKind)) return
    onSelect({ outputKind, outputValue, virtualControllerLogicalOutput: undefined })
    onClose()
  }

  // Every choice, once, so search and the detail panel read from one list.
  const choices = useMemo<Record<Category, Choice[]>>(() => {
    const keyChoice = (key: { token: string; label?: string }): Choice => ({
      key: `key:${key.token}`, label: key.label ?? key.token, token: key.token, kind: 'keyboard',
      describe: `${keyDisplayName(key.token)} key`, commit: () => pick('keyboard', key.token),
    })
    const keys = (rows: { token: string; label?: string }[][]) => rows.flat().filter(key => key.token !== 'SPACER').map(keyChoice)
    const groups: Record<Category, Choice[]> = {
      Gamepad: getVirtualControllerOptions(outputType, t).map(option => ({
        key: `pad:${option.value}`, label: option.label, token: toVirtualControllerToken(option.value, outputType) ?? '', kind: 'virtualController' as const,
        describe: `${outputType === 'DS4' ? 'DualShock 4' : 'Xbox'} ${option.label}`,
        commit: () => {
          if (virtualControllerType === 'NONE') onEnableVirtualController?.()
          onSelect({ outputKind: 'virtualController', outputValue: toVirtualControllerToken(option.value, outputType) ?? '', virtualControllerLogicalOutput: option.value })
          onClose()
        },
      })),
      Mouse: [...mouseOptions, ...wheelOptions].map(token => ({ key: `mouse:${token}`, label: keyDisplayName(token), token, kind: (wheelOptions.includes(token) ? 'wheel' : 'mouse') as BindingOutputKind, describe: keyDisplayName(token), commit: () => pick(wheelOptions.includes(token) ? 'wheel' : 'mouse', token) })),
      Keyboard: keys([...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length), ...EXTENDED_FUNCTION_ROWS]),
      Numpad: keys(NUMPAD_ROWS),
      // Each layer, as a Hold action on this input; the sheet that opens on
      // the new row changes the verb (TODO-55).
      Layers: onAddLayerAction ? layers.map(layer => ({
        key: `layer:${layer.id}`, label: layer.name, token: `# @layer-action = hold ${layer.id}`, kind: 'layerAction' as const,
        describe: t('keymap.layerPickDescribe', 'Holds {{layer}} while this input is down; the settings change what it does', { layer: layer.name }),
        commit: () => { onAddLayerAction(layer.id); onClose() },
      })) : [],
      'Virtual menus': readVirtualMenus(configText).menus.flatMap(menu => MENU_COMMANDS.map(item => ({
        key: `menu:${menu.id}:${item.verb}`, label: `${item.label} ${menu.name}`, token: `MENU_${item.verb} ${menu.id}`, kind: 'command' as const,
        describe: item.description,
        commit: () => { onSelect({ outputKind: 'command', outputValue: `MENU_${item.verb} ${menu.id}`, outputBehavior: 'normal', ...(item.verb === 'HOLD' && ['release', 'turbo'].includes(command.triggerKind) ? { triggerKind: 'regular' as const } : {}) }); onClose() },
      }))),
      System: systemKeyChoices.map(key => ({ ...keyChoice({ token: key.token, label: t(key.labelKey, key.label) }), describe: t(key.labelKey, key.label), icon: key.icon })),
      JSM: [
        ...builtInCommandOptions.filter(token => token === 'CALIBRATE_GYRO').map(token => ({ key: `command:${token}`, label: COMMAND_LABELS[token].label, token, kind: 'command' as const, describe: COMMAND_LABELS[token].describe, commit: () => pick('command', token) })),
        { key: 'cycle', label: 'Cycle binding', token: 'CYCLE 1 | 2 | 3', kind: 'command' as const, describe: 'Each activation sends the next output. Edit, add or reorder the steps in command settings.', commit: () => pick('command', 'CYCLE 1 | 2 | 3') },
        { key: 'heldCalibration', label: 'Calibrate while held', token: 'CALIBRATE', kind: 'special' as const, describe: 'Estimate gyro drift while this input stays held. Keep the controller still; release the input to finish.', commit: () => pick('special', 'CALIBRATE') },
        ...specialOptions.filter(option => !['CALIBRATE', 'NONE', 'DEFAULT'].includes(option.value)).map(option => ({ key: `special:${option.value}`, label: option.label, token: option.value, kind: (command.source.kind !== 'special' && isQueuedGyroAction(option.value) ? 'gyroAction' : 'special') as BindingOutputKind, describe: specialActionDescription(option.value), disabled: option.disabled, commit: () => pick(command.source.kind !== 'special' && isQueuedGyroAction(option.value) ? 'gyroAction' : 'special', option.value) })),
        ...builtInCommandOptions.filter(token => token !== 'CALIBRATE_GYRO').map(token => ({ key: `command:${token}`, label: COMMAND_LABELS[token]?.label ?? token.toLowerCase().replace(/_/g, ' '), token, kind: 'command' as const, describe: COMMAND_LABELS[token]?.describe ?? 'JoyShockMapper command', commit: () => pick('command', token) })),
        ...(onAddStickShift ? [{ key: 'stickShift', label: t('keymap.commandAddStickShift', 'Stick mode shift'), token: 'STICK_SHIFT', kind: 'special' as const, describe: t('keymap.stickShiftDescribe', 'Puts the right stick in another mode while this input is held'), commit: () => { onAddStickShift(); onClose() } }] : []),
        // The light (TODO-54): while held is a setting on the input, the
        // other two are commands; all three set their value in the sheet.
        { key: 'ledColor', label: 'Change LED Color', token: colorToken, kind: 'command' as const, describe: 'Choose a color in command settings. Press keeps the new color; Hold restores the previous light when released.', commit: () => pick('command', colorToken) },
      ],
      Sounds: [
        ...BUILT_IN_SOUNDS.map((name, index) => ({ key: `sound:${index}`, label: t('keymap.playSoundName', 'Play sound · {{name}}', { name }), token: playSoundToken(index), kind: 'command' as const, describe: t('keymap.playSoundDescribe', 'Plays {{name}} on the controller', { name }), commit: () => pick('command', playSoundToken(index)) })),
        ...sounds.filter(sound => sound.ready).map(sound => ({ key: `sound:${sound.id}`, label: t('keymap.playSoundName', 'Play sound · {{name}}', { name: sound.name }), token: playSoundToken(sound.id), kind: 'command' as const, describe: t('keymap.playSoundDescribe', 'Plays {{name}} on the controller', { name: sound.name }), commit: () => pick('command', playSoundToken(sound.id)) })),
      ],
      Custom: [],
      // The one being edited is marked: loading the configuration you are in does nothing.
      Configurations: libraryProfiles.map(name => ({ key: `config:${name}`, label: name === currentProfileName ? t('keymap.commandLoadConfigCurrent', { name }) : name, token: loadConfigBindingValue(name), kind: 'loadConfig' as const, describe: `Loads ${name}`, commit: () => pick('loadConfig', loadConfigBindingValue(name)) })),
    }
    groups.JSM = groups.JSM.map(choice => ({ ...choice, icon: jsmActionIcon(choice.token), ...(choice.key === 'cycle' ? { label: 'Cycle actions' } : {}) }))
    return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, allowedOutputKinds ? values.filter(choice => allowedOutputKinds.includes(choice.kind)) : values])) as Record<Category, Choice[]>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputType, specialOptions, libraryProfiles, currentProfileName, virtualControllerType, t, colorToken, onAddStickShift, onAddLayerAction, layers, sounds, allowedOutputKinds, configText])

  const results = query.trim()
    ? Object.values(choices).flat().filter(choice => `${choice.label} ${choice.token} ${choice.describe}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60)
    : null

  // The first thing the pad can pick: the current action, else the first one
  // in the open category.
  const focusContent = () => {
    const content = rootRef.current?.querySelector<HTMLElement>('.action-picker__content')
    const action = content?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)') ?? content?.querySelector<HTMLElement>('button:not(:disabled)')
    // Empty categories and searches have no action to focus. Keep the pad on
    // the category tab so its next event still bubbles through this dialog.
    const target = action ?? rootRef.current?.querySelector<HTMLElement>(`.action-tab[data-category="${category}"]`)
    if (!action) setFocused(null)
    target?.focus()
    return Boolean(target)
  }

  // Focus starts on an action, not in the search box. The dialog observer in
  // useKeyboardNav lands on the first focusable, which is the search input --
  // and there the D-pad does nothing (arrows belong to a text field) while B
  // closes the whole picker, so a pad had no way to choose anything. The same
  // goes for a category change while an action was focused: the old content
  // unmounts, focus drops to the body, and the next move would have entered
  // the page behind the dialog.
  const refocus = useRef(false)
  const opening = useRef(true)
  useEffect(() => {
    if (opening.current) {
      // A microtask later, so useKeyboardNav's dialog observer -- queued by
      // the mount itself -- has first recorded the command this picker
      // opened from as where focus returns on close. StrictMode runs this
      // effect twice on mount; the flag keeps the second run out of the way.
      queueMicrotask(() => { opening.current = false; focusContent() })
      return
    }
    const active = document.activeElement
    const wanted = refocus.current
    refocus.current = false
    if (!wanted && active && active !== document.body && rootRef.current?.contains(active)) return
    focusContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, results === null])

  // Leaving the search field: Down moves to the first result, Escape clears
  // the search and goes back to the actions rather than closing the picker.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || (event.key === 'Enter' && results?.length)) {
      event.preventDefault()
      focusContent()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // The results are about to unmount, so the actions are focused once the
      // category's own content is back rather than a button that is going.
      if (query) { refocus.current = true; setQuery('') } else focusContent()
    }
  }

  // LB / RB change category, X captures, Y searches (the pad reaches an open
  // picker as `jsm:pad` events, since a dialog owns the pad while it is open).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button === 'LB' || button === 'RB') {
        event.preventDefault()
        // A tab or search field survives the category change too: explicitly
        // land on the new content (or its tab when there are no actions).
        refocus.current = true
        setQuery('')
        setCategory(previous => categories[(categories.indexOf(previous) + (button === 'RB' ? 1 : categories.length - 1)) % categories.length])
      } else if (button === 'X' && onCapture) {
        event.preventDefault()
        onClose(); onCapture()
      } else if (button === 'Y') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    root.addEventListener(PAD_EVENT, onPad)
    return () => root.removeEventListener(PAD_EVENT, onPad)
  })

  const choiceButton = (choice: Choice, extra?: { style?: CSSProperties; className?: string; content?: ReactNode }) => (
    <button key={choice.key} type="button" className={extra?.className ?? 'action-choice'} style={extra?.style} disabled={choice.disabled}
      aria-pressed={command.outputValue === choice.token} aria-expanded={choice.expanded} title={choice.label}
      onFocus={() => setFocused(choice)} onMouseEnter={() => setFocused(choice)} onClick={choice.commit}>
      {extra?.content ?? <>{choice.icon && <BindingIconArt value={choice.icon} size={22} />}<span>{choice.label}</span></>}
      {used.has(choice.token.toUpperCase()) && command.outputValue !== choice.token && <span className="action-used" title="Already used in this configuration" />}
    </button>
  )
  const keyButton = (key: { token: string; label?: string; width?: number }, index: number) => key.token === 'SPACER'
    ? <span key={`space-${index}`} className="key-space" style={{ flexGrow: key.width ?? 1 }} />
    : choiceButton(choices.Keyboard.find(choice => choice.token === key.token) ?? choices.Numpad.find(choice => choice.token === key.token)!, { className: 'key-cap', style: { flexGrow: key.width ?? 1 } })

  const detail = focused ?? Object.values(choices).flat().find(choice => choice.token === command.outputValue) ?? null
  const groupedJsm = jsmActionGroups.map(group => ({ ...group, actions: choices.JSM.filter(choice => jsmActionGroupFor(choice.token)?.id === group.id) })).filter(group => group.actions.length)
  const expandedJsm = groupedJsm.find(group => group.id === jsmGroup)
  const jsmFamilyButton = (group: typeof groupedJsm[number]) => {
    const currentAction = group.actions.find(choice => choice.token === command.outputValue) ?? group.actions[0]
    return choiceButton({ ...currentAction, key: `family:${group.id}`, label: group.label, icon: group.icon,
      disabled: group.actions.every(choice => choice.disabled),
      expanded: group.actions.length > 1 ? jsmGroup === group.id : undefined,
      describe: group.actions.length > 1 ? ({
        gyro: 'Enable or disable gyro on this controller, or every connected controller. Choose held or toggle behaviour in command settings where supported.',
        calibration: 'Use the guided countdown and progress display, or calibrate while holding an input. Keep the controller still during calibration.',
        invert: 'Reverse horizontal movement, vertical movement, or both while the input is held.',
        trackball: 'Keep gyro mouse movement gliding after rotation stops. Choose horizontal, vertical, or both axes.',
        continuous: 'Start calibration immediately, then finish it with a separate action. Keep every connected motion controller still until you finish.',
      }[group.id] ?? currentAction.describe) : currentAction.describe,
      commit: group.actions.length > 1 ? () => setJsmGroup(previous => previous === group.id ? null : group.id) : currentAction.commit,
    }, { content: <><BindingIconArt value={group.icon} size={22} /><span>{group.label}</span>{group.actions.length > 1 && <span className="action-choice__chevron" aria-hidden="true">›</span>}</> })
  }
  const jsmVariants = (advanced: boolean) => expandedJsm?.advanced === advanced && expandedJsm.actions.length > 1
    ? <div ref={variantsRef} className="action-jsm-variants" role="group" aria-label={`${expandedJsm.label} options`}>
        <p className="action-picker-note">{expandedJsm.label} · Choose an option. Activation behaviour is available in command settings.</p>
        <div className="action-grid">{expandedJsm.actions.map(choice => choiceButton(choice))}</div>
      </div>
    : null

  return createPortal(<div className="modal-overlay action-picker-overlay" data-capture-ignore="true">
    <section ref={rootRef} className="action-picker" role="dialog" aria-modal="true" aria-labelledby={title}
      data-hints={`A:Choose;${onCapture ? 'X:Capture;' : ''}Y:Search;B:Back;LB/RB:Category`}
      // The keyboard's Y, as the capsule says; the pad's Y arrives as a pad event.
      onKeyDown={event => {
        if ((event.key === 'y' || event.key === 'Y') && !event.defaultPrevented && !(event.target as HTMLElement).matches('input, textarea')) {
          event.preventDefault()
          searchRef.current?.focus()
        }
      }}>
      <header className="action-picker__header">
        <div className="action-picker__title">
          {command.physicalInput && <InputGlyph command={command.physicalInput} size={36} />}
          <div>
            <span className="action-picker__eyebrow">{inputLabel} · {t(TRIGGER_LABEL_KEYS[command.triggerKind])}</span>
            <h2 id={title}>{t('keymap.pickerTitle', 'Choose an action')}</h2>
          </div>
        </div>
        {current && <span className="action-picker__current">{t('keymap.pickerCurrent', 'Current')} <kbd className="action-pill">{current}</kbd></span>}
        <label className="action-picker__search">
          <Icon name="search" size={16} />
          {/* Out of the focus walk (Y, the keyboard's Y or a click reach it):
              as the dialog's first field it is where the focus engine landed
              on open, and App's focusin handler then selects a text field a
              frame later -- which re-focuses it, undoing the move onto an
              action that the design starts from. */}
          <input ref={searchRef} type="search" tabIndex={-1} value={query} placeholder={t('keymap.pickerSearch', 'Search all actions')} aria-label={t('keymap.pickerSearch', 'Search all actions')}
            onChange={event => setQuery(event.target.value)} onKeyDown={onSearchKeyDown} />
        </label>
        <button type="button" className="ghost-btn" data-modal-close onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
      </header>

      <nav className="action-picker__tabs" aria-label="Action categories">
        <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="LB" size={22} /></span>
        {categories.map(item => <button key={item} type="button" className="action-tab" data-category={item} aria-pressed={!results && category === item} onClick={() => { setQuery(''); setCategory(item) }}>{categoryName(item)}</button>)}
        <span className="action-picker__step" aria-hidden="true"><ButtonGlyph button="RB" size={22} /></span>
        <span className="action-picker__spacer" />
        {onCapture && <button type="button" className="action-tab" onClick={() => { onClose(); onCapture() }}><ButtonGlyph button="X" size={20} />{t('keymap.pickerCapture', 'Capture')}</button>}
      </nav>

      <div className="action-picker__body">
        <div className="action-picker__content" role="region" aria-label={results ? t('keymap.pickerSearchResults', 'Search results') : t('keymap.pickerCategoryActions', '{{category}} actions', { category: categoryName(category) })}>
          {results && (results.length
            ? <div className="action-grid">{results.map(choice => choiceButton(choice))}</div>
            : <p className="action-picker-note">No action matches “{query}”. Custom takes any JoyShockMapper token.</p>)}
          {!results && category === 'Gamepad' && <>
            <p className="action-picker-note">{outputType === 'DS4' ? 'DualShock 4' : 'Xbox'} output{virtualControllerType === 'NONE' ? ' · Choosing a button enables virtual gamepad output.' : ''}</p>
            <div className="action-grid gamepad-actions">{getVirtualControllerOptions(outputType, t).map((option, index) => choiceButton(choices.Gamepad[index], { content: <><InputGlyph command={glyphs[option.value]} family={outputType === 'DS4' ? 'playstation' : 'xbox'} size={26} />{option.label}</> }))}</div>
          </>}
          {!results && category === 'Mouse' && <div className="action-grid">{choices.Mouse.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Keyboard' && <div className="action-keyboard">{[...MAIN_ROWS, ...NAV_ROWS.filter(row => row.length)].map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}<details><summary>Extended function keys</summary><p className="action-picker-note">F13–F24 provide extra shortcut outputs without occupying common gameplay keys.</p>{EXTENDED_FUNCTION_ROWS.map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</details></div>}
          {!results && category === 'Numpad' && <div className="action-numpad">{NUMPAD_ROWS.map((row, i) => <div className="action-key-row" key={i}>{row.map(keyButton)}</div>)}</div>}
          {/* Volume, media and Print Screen are outputs like any other (1f). */}
          {!results && category === 'System' && <div className="action-grid action-grid--tiles">{choices.System.map(choice => choiceButton(choice, { className: 'action-choice action-tile', content: <><BindingIconArt value={choice.icon} size={20} /><span>{choice.label}</span></> }))}</div>}
          {!results && category === 'Sounds' && <div className="action-grid">{choices.Sounds.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Virtual menus' && (choices['Virtual menus'].length
            ? <div className="action-grid">{choices['Virtual menus'].map(choice => choiceButton(choice))}</div>
            : <p className="action-picker-note">Create a menu on the Virtual menus page first. Then choose Open, Close, Toggle or Hold here.</p>)}
          {/* Layers (TODO-55): one row per layer, in its hue; choosing one adds a Hold action. */}
          {!results && category === 'Layers' && (choices.Layers.length
            ? <>
                <p className="action-picker-note">{t('keymap.pickerLayersNote', 'Choosing a layer holds it while this input is down. Change that to Toggle, Turn on or Turn off in the command’s settings.')}</p>
                <div className="action-grid action-grid--layers">{choices.Layers.map((choice, index) => choiceButton(choice, {
                  className: 'action-choice action-layer', style: { ['--layer-hue' as string]: layerHue(layerSlot(layers, layers[index].id)) },
                  content: <><span className="action-layer__swatch" aria-hidden="true" /><span className="action-layer__name">{choice.label}</span>
                    <span className="action-layer__count">{t('keymap.layerBindingCount', { count: visibleOverrideKeys(layers[index].overrides).length, defaultValue: '{{count}} bindings' })}</span></>,
                }))}</div>
              </>
            // No layers yet: say so where a pad user can read it, with the way
            // to the Layers page, rather than an empty category.
            : <div className="action-picker-empty">
                <p className="action-picker-note">{t('keymap.layerActionNoLayers', 'Create a layer on the Layers page first.')}</p>
                <button type="button" className="console-btn" data-hints="A:Go to Layers;B:Back"
                  onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'layers' })) }}>
                  <Icon name="layer" size={16} />{t('keymap.goToLayers', 'Go to Layers')}
                </button>
              </div>)}
          {!results && category === 'JSM' && <>
            <div className="action-grid action-grid--jsm">{groupedJsm.filter(group => !group.advanced).map(jsmFamilyButton)}</div>
            {jsmVariants(false)}
            <details className="action-jsm-advanced" open={advancedJsm} onToggle={event => setAdvancedJsm(event.currentTarget.open)}>
              <summary><BindingIconArt value="lucide:settings-2" size={20} />Advanced actions</summary>
              <div className="action-grid action-grid--jsm">{groupedJsm.filter(group => group.advanced).map(jsmFamilyButton)}{choices.JSM.filter(choice => !jsmActionGroupFor(choice.token)).map(choice => choiceButton(choice))}</div>
              {jsmVariants(true)}
            </details>
            <p className="action-picker-note">Set colours, cycle steps and activation behaviour in command settings. Console commands and expressions are under Custom.</p>
          </>}
          {!results && category === 'Configurations' && <div className="action-grid">{choices.Configurations.map(choice => choiceButton(choice))}</div>}
          {!results && category === 'Custom' && <CustomAction command={command} onPick={pick} />}
        </div>
        <aside className="picker-detail" aria-live="polite">
          <span className="picker-detail__eyebrow">{focused ? 'Selected' : 'Current'}</span>
          {detail ? <>
            <div className="picker-detail__name" data-kind={detail.kind}><strong>{detail.icon && <BindingIconArt value={detail.icon} size={22} />}{detail.label}</strong><p>{detail.describe}</p></div>
            <span className="picker-detail__note">{used.has(detail.token.toUpperCase()) && detail.token !== command.outputValue
              ? 'Already bound elsewhere in this configuration; choosing it keeps both.'
              : 'Keys with a dot are already bound; choosing one keeps both.'}</span>
            {category === 'Custom' && <span className="picker-detail__raw">Raw token <code>{detail.token}</code></span>}
          </> : <span className="picker-detail__note">Move to an action to see what it sends.</span>}
        </aside>
      </div>
    </section>
  </div>, document.body)
}

type CustomKind = 'raw' | 'command' | 'haptic'

/**
 * The picker's Custom category: what has no tile of its own -- a raw
 * JoyShockMapper expression, a console command, or a haptic pulse. These
 * used to live in the command's expanded editor, which is now a settings sheet
 * of true options only (binding card refresh §4).
 */
function CustomAction({ command, onPick }: { command: BindingCommand; onPick: (kind: BindingOutputKind, value: string) => void }) {
  const { t } = useTranslation()
  const initial: CustomKind = command.outputKind === 'haptic' ? 'haptic' : command.outputKind === 'command' ? 'command' : 'raw'
  const [kind, setKind] = useState<CustomKind>(initial)
  const [text, setText] = useState(command.outputKind === 'raw' || command.outputKind === 'command' ? command.outputValue : '')
  const [haptic, setHaptic] = useState(command.outputKind === 'haptic' ? command.outputValue : formatHapticBinding(DEFAULT_HAPTIC_BINDING))
  const kinds: Array<[CustomKind, string]> = [['raw', t('keymap.customRaw', 'Raw expression')], ['command', t('keymap.customCommand', 'Console command')], ['haptic', t('keymap.customHaptic', 'Haptic')]]
  return (
    <div className="action-custom">
      <div className="segmented" role="radiogroup" aria-label={t('keymap.customKind', 'Custom action')} data-hints="MOVE:Choose;A:Select;B:Back">
        {kinds.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}>{label}</button>)}
      </div>
      {kind === 'haptic'
        ? <HapticOutputPicker value={haptic} onChange={setHaptic} />
        : <input className="text-field action-custom__field" type="text" value={text} spellCheck={false} data-capture-ignore="true"
            aria-label={kind === 'raw' ? t('keymap.customRaw', 'Raw expression') : t('keymap.customCommand', 'Console command')}
            placeholder={kind === 'raw' ? t('keymap.customRawPlaceholder', 'Any JoyShockMapper binding, e.g. LCONTROL+C') : t('keymap.advancedCommandPlaceholder')}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && text.trim()) { event.preventDefault(); onPick(kind, text.trim()) } }} />}
      <button type="button" className="console-btn console-btn--primary" disabled={kind !== 'haptic' && !text.trim()}
        onClick={() => onPick(kind, kind === 'haptic' ? haptic : text.trim())} data-hints="A:Use;B:Back">
        {t('keymap.customUse', 'Use')}
      </button>
    </div>
  )
}
