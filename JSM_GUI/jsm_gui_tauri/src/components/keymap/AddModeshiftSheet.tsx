import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../ui/Dialog'
import { InputGlyph } from '../glyphs/InputGlyph'
import { capLabel } from './binding/inputGroups'
import { desktopBridge } from '../../platform/desktopBridge'
import { getPressedControllerCommandSet, type ControllerVisualFamily } from '../../utils/controllerStatus'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import styles from './AddSheets.module.css'

type Option = { value: string; label: string; disabled?: boolean }

// The groups of "Hold which button?" (3e), laid out like the controller.
// Anything the list of held inputs offers that fits none of them goes in a
// last group, so every input the controller has can be chosen here.
const GROUPS: Array<{ key: string; labelKey: string; label: string; commands: string[] }> = [
  { key: 'grips', labelKey: 'keymap.holdGroupGrips', label: 'Back grips', commands: ['LSL', 'LSR', 'RSR', 'RSL', 'LMINI', 'RMINI', 'MISC6', 'MISC5', 'MISC4'] },
  { key: 'face', labelKey: 'keymap.holdGroupFace', label: 'Face', commands: ['S', 'E', 'W', 'N'] },
  { key: 'shoulders', labelKey: 'keymap.holdGroupShoulders', label: 'Shoulders', commands: ['L', 'R', 'ZL', 'ZR', 'ZLF', 'ZRF'] },
  { key: 'sticks', labelKey: 'keymap.holdGroupSticks', label: 'Sticks', commands: ['L3', 'R3', 'LTOUCH', 'RTOUCH', 'LRING', 'RRING'] },
  { key: 'dpad', labelKey: 'keymap.holdGroupDpad', label: 'D-pad', commands: ['UP', 'DOWN', 'LEFT', 'RIGHT'] },
  // A touch on the shared pad, and each pad's click (MISC3 / MISC2 on a
  // Steam Controller), so a dual-pad controller offers both sides.
  { key: 'pads', labelKey: 'keymap.holdGroupPads', label: 'Trackpads', commands: ['TOUCH', 'MISC3', 'MISC2', 'TRING'] },
  { key: 'system', labelKey: 'keymap.holdGroupSystem', label: 'System', commands: ['-', '+', 'HOME', 'CAPTURE', 'MIC', 'MISC1'] },
]
const OTHER_GROUP = { key: 'other', labelKey: 'keymap.holdGroupOther', label: 'Other' }

// Each choice is the controller's glyph and its short name ("LT full", "Left
// pad click"); a paddle also says where it sits, which its name cannot.
const WHERE_KEYS: Record<string, [string, string]> = {
  // JoyShockMapper's paddle names follow the Joy-Con SL / SR pair on each
  // side, so the right side mirrors the left: L4 = LSL, L5 = LSR, R4 = RSR,
  // R5 = RSL (utils/controllerStatus, and the Steam Controller's own map).
  LSL: ['keymap.holdUpperLeft', 'Upper left'], LSR: ['keymap.holdLowerLeft', 'Lower left'],
  RSR: ['keymap.holdUpperRight', 'Upper right'], RSL: ['keymap.holdLowerRight', 'Lower right'],
}
// The pad's own navigation buttons move and choose in this sheet, so pressing
// them cannot also pick them.
const NAV_BUTTONS = new Set(['S', 'E', 'W', 'N', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R', '-', '+'])

type Props = {
  /** The input being given a modeshift: "A", and its command. */
  inputName: string
  command: string
  family: ControllerVisualFamily
  /** Every input that can be held, as the modeshift list offers them. */
  modifiers: Option[]
  /** Inputs that already shift this one (held, not released). */
  taken: string[]
  onNext: (trigger: string) => void
  onClose: () => void
  /** Selected when the sheet comes back from the picker's Cancel. */
  initial?: string | null
  /** Over the title, when this is not step 1 of an add: changing a shift's held button. */
  eyebrow?: string
}

/**
 * Add modeshift, step 1 (binding card refresh 3e): "Hold which button to
 * change what A does?" -- every input the controller has, grouped like the
 * controller; pressing one on the pad selects it. Step 2 is the action picker.
 */
export function AddModeshiftSheet({ inputName, command, family, modifiers, taken, onNext, onClose, initial = null, eyebrow }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(initial)
  const [supported, setSupported] = useState<Set<string> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const self = command.toUpperCase()

  // The pad in hand: which inputs it has, and which one was just pressed.
  useEffect(() => {
    let previous = new Set<string>()
    return desktopBridge.onTelemetrySample(payload => {
      const device = (payload as { devices?: TelemetryDevice[] } | null)?.devices?.[0]
      if (!device) return
      if (typeof device.supportedButtons === 'number' && device.supportedButtons > 0) {
        const all = getPressedControllerCommandSet({ ...device, status: { ...device.status, buttons: device.supportedButtons } } as TelemetryDevice)
        setSupported(current => current && current.size === all.size ? current : all)
      }
      const pressed = getPressedControllerCommandSet(device)
      const fresh = [...pressed].filter(input => !previous.has(input) && !NAV_BUTTONS.has(input))
      previous = pressed
      if (fresh.length) {
        setSelected(fresh[0])
        bodyRef.current?.querySelector<HTMLElement>(`[data-hold-input="${CSS.escape(fresh[0])}"]`)?.focus()
      }
    })
  }, [])

  const groups = useMemo(() => {
    const byValue = new Map(modifiers.filter(option => !option.disabled).map(option => [option.value.toUpperCase(), option]))
    // Optional hardware (paddles, grips, mini buttons) is offered only when
    // the connected controller reports it; everything else is always there.
    const optional = ['LMINI', 'RMINI', 'MISC1', 'MISC2', 'MISC3', 'MISC4', 'MISC5', 'MISC6', 'LSL', 'LSR', 'RSL', 'RSR', 'MIC']
    const offered = (value: string) => byValue.has(value) && (value === self || !supported || supported.has(value) || !optional.includes(value))
    const placed = new Set(GROUPS.flatMap(group => group.commands))
    const grouped = GROUPS.map(group => ({ ...group, items: group.commands.filter(offered).map(value => byValue.get(value)!) }))
    // What fits no group: pad regions, stick-menu segments, anything new.
    const other = [...byValue.keys()].filter(value => !placed.has(value) && offered(value)).map(value => byValue.get(value)!)
    return [...grouped, { ...OTHER_GROUP, commands: other.map(option => option.value), items: other }].filter(group => group.items.length > 0)
  }, [modifiers, supported, self])

  // What fits no group (pad regions, stick-menu segments) takes the words
  // after the dash in its option label ("T1 — left pad grid region 1").
  const name = (option: Option, other: boolean) => {
    const value = option.value.toUpperCase()
    const words = other ? option.label.split(' — ')[1] : undefined
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : capLabel(value, family)
  }
  const sublabel = (option: Option) => {
    const value = option.value.toUpperCase()
    if (value === self) return t('keymap.holdThisInput', 'This input')
    const where = WHERE_KEYS[value]
    return where ? t(where[0], where[1]) : ''
  }

  // A click from the keyboard or pad (A) chooses and moves on; the mouse selects.
  const choose = (value: string) => (event: MouseEvent<HTMLButtonElement>) => {
    setSelected(value)
    if (event.detail === 0) onNext(value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && selected && !(event.target as HTMLElement).closest('[data-hold-input]')) { event.preventDefault(); onNext(selected) }
  }

  return (
    <Dialog onClose={onClose} width={900} tone="shift"
      eyebrow={eyebrow ?? t('keymap.newModeshiftStep1', 'Mode shift · Step 1 of 2')}
      title={t('keymap.holdWhichButton', 'Hold which button to change what {{input}} does?', { input: inputName })}
      aside={
        <span className={styles.chain} aria-hidden="true">
          {selected ? <InputGlyph command={selected} family={family} size={30} /> : <span className={styles.unknownCap}>?</span>}
          <span className={styles.chainPlus}>+</span>
          <InputGlyph command={command} family={family} size={30} />
        </span>
      }
      // The pad's face, bumper, d-pad and View / Menu buttons move around this
      // sheet, so only the rest can be chosen by pressing them; say which.
      footerNote={t('keymap.holdPressOnController', 'Or press a grip, trigger, stick or pad on your controller')}
      hints={[{ button: 'DPAD', label: t('keymap.sheetMove', 'Move') }, { button: 'A', label: t('keymap.sheetNext', 'Next') }, { button: 'B', label: t('common.cancel', 'Cancel') }]}
      actions={
        <>
          <button type="button" className="console-btn" onClick={onClose} data-hints="A:Cancel;B:Cancel">{t('common.cancel', 'Cancel')}</button>
          <button type="button" className="console-btn console-btn--primary" disabled={!selected} onClick={() => selected && onNext(selected)} data-hints="A:Next;B:Cancel">{t('keymap.sheetNext', 'Next')}</button>
        </>
      }>
      <div ref={bodyRef} className={styles.holdGrid} onKeyDown={onKeyDown}>
        {groups.map(group => (
          <section key={group.key} className={styles.holdGroup} data-other={group.key === OTHER_GROUP.key ? 'true' : undefined} aria-label={t(group.labelKey, group.label)}>
            <span className={styles.groupLabel}>{t(group.labelKey, group.label)}</span>
            <div className={styles.holdItems}>
              {group.items.map(option => {
                const value = option.value.toUpperCase()
                const disabled = value === self || taken.includes(value)
                return (
                  // A taken input cannot be the selection, so it never reads as pressed.
                  <button key={value} type="button" className={styles.holdItem} data-hold-input={value}
                    aria-pressed={!disabled && selected === value} aria-disabled={disabled ? 'true' : undefined} data-reason={disabled ? (value === self ? 'This is the input being changed' : 'Already has a change while this is held') : undefined} data-caption={option.label}
                    data-hints="MOVE:Move;A:Next;B:Cancel" onClick={event => { if (!disabled) choose(value)(event) }}>
                    <InputGlyph command={value} family={family} size={28} className={styles.holdGlyph} />
                    <span className={styles.holdName}>{name(option, group.key === OTHER_GROUP.key)}</span>
                    {sublabel(option) && <span className={styles.holdSub}>{sublabel(option)}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
