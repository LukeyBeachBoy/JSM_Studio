import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage, SegmentedRow, OpenRow } from '../../ui/console'
import { Menu, type MenuItem } from '../../ui/Menu'
import { Icon } from '../../icons/Icon'
import { InputGlyph } from '../../glyphs/InputGlyph'
import { KindPicker, SEND_KINDS, type SendKind } from '../pickers/KindPicker'
import { ShiftedBinding } from '../InputModeshifts'
import { OriginMarker } from '../OriginMarker'
import { addModeshift, modeshiftTriggers, readModeshift, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../../utils/modeshift'
import { heldInput, isReleasedInput, withRelease } from '../../../utils/released'
import { getBindingLabel, setBindingLabel } from '../../../utils/bindingLabels'
import { describeBinding } from '../../../utils/bindingDescription'
import { commandForValue, replaceFirstOutput } from '../../../utils/bindingCommands'
import { getActionSpecialOptionList } from '../../../keymap/schema'
import { inputPage } from '../../../utils/inputNavigation'
import { requestValueEntry } from '../../../nav/textEntry'
import { formatStickModeLabel } from '../../../constants/sticks'
import { requestModeshift } from '../../sticks/inputSide'
import { HOLD_GROUPS, OPTIONAL_INPUTS, capLabel, groupOptions } from './inputGroups'
import { usePressedInput } from './usePressedInput'
import { KIND_ICONS, sendKindOf, type BindingApi } from './model'
import { focusSoon, usePadButtons } from './hooks'
import styles from './binding.module.css'

// Chords (Steam Input's chorded press; console v2, BindingWhileHolding): what
// this input sends while another one is held -- `HELD,INPUT = …`. One
// full-screen page in two panels side by side, walked with the D-pad: (1) the
// button to hold, pressed or picked; (2) what this input sends then, from the
// eight kinds, and whether it works while that button is held or not held.
// LT / RT are not "Step" here: a trigger is one of the buttons a chord is most
// often held with, so pressing one while panel 1 has focus picks it.
//
// A stick that changes while the held button is down (`HELD,LEFT|RIGHT_STICK_MODE`)
// is that stick's Mode shift, edited on the Sticks page; a chord only links to
// it ("Also shifts: Right stick · Flick ▸").
//
// With chords already made, it opens on their list (not drawn in the design:
// the same rows and Y menu as everywhere else). A opens one in the same two
// steps; Y names or removes it.

const PAGE_NAMES = { buttons: 'Buttons', triggers: 'Triggers', joysticks: 'Sticks', touchpad: 'Trackpads' } as const
/** The sticks holding `trigger` also shifts (its Mode shift on the Sticks page). */
export function stickShiftsOf(text: string, trigger: string) {
  return (['LEFT', 'RIGHT'] as const).flatMap(side => {
    const mode = readModeshift(text, trigger, `${side}_STICK_MODE`)
    return mode ? [{ side, mode }] : []
  })
}

type Props = { api: BindingApi; onClose: () => void }

export function WhileHoldingPage({ api, onClose }: Props) {
  const { t } = useTranslation()
  const props = api.modeshifts!
  const { text } = props
  const input = api.button.command.toUpperCase()
  const target = useMemo<ModeshiftTarget>(() => ({ id: api.button.command, title: api.longName, buttons: [{ command: api.button.command, label: api.longName, definition: api.button }] }), [api.button, api.longName])
  const triggers = modeshiftTriggers(text, target)
  const [view, setView] = useState<{ mode: 'list' } | { mode: 'steps'; trigger: string | null }>(() => triggers.length ? { mode: 'list' } : { mode: 'steps', trigger: null })
  const page = PAGE_NAMES[inputPage(input)]
  const close = () => { if (view.mode === 'steps' && triggers.length) setView({ mode: 'list' }); else onClose() }

  return (
    <SubPage open onClose={close} trail={[page, api.longName]} title={t('bind.whileHoldingTitle', 'Chords')}
      backLabel={view.mode === 'steps' ? t('common.cancel', 'Cancel') : t('bind.back', 'Back')}
      hints={view.mode === 'steps' ? [{ button: 'A', label: 'Choose' }, { button: 'Y', label: 'Name, remove' }] : [{ button: 'A', label: 'Change' }, { button: 'Y', label: 'Name, remove' }]}>
      {view.mode === 'list'
        ? <ShiftList api={api} target={target} triggers={triggers} onEdit={trigger => setView({ mode: 'steps', trigger })} onAdd={() => setView({ mode: 'steps', trigger: null })} />
        : <Steps key={view.trigger ?? 'new'} api={api} target={target} triggers={triggers} trigger={view.trigger}
            onTrigger={trigger => setView({ mode: 'steps', trigger })}
            onRemoved={() => { if (modeshiftTriggers(text, target).length > 1) setView({ mode: 'list' }); else onClose() }} />}
    </SubPage>
  )
}

/** One chord, in words: "With LB held", "sends Marker · also shifts Right stick". */
function useShiftWords(api: BindingApi) {
  const { t } = useTranslation()
  const props = api.modeshifts!
  const input = api.button.command.toUpperCase()
  return (trigger: string) => {
    const held = capLabel(heldInput(trigger), api.family)
    const value = readModeshift(props.text, trigger, input) ?? ''
    const sends = value && value.toUpperCase() !== 'NONE' ? describeBinding(value, t) : t('bind.nothing', 'nothing')
    const sticks = stickShiftsOf(props.text, trigger).map(({ side }) => `also shifts ${side === 'LEFT' ? 'Left' : 'Right'} stick`)
    return {
      title: isReleasedInput(trigger) ? t('bind.whileNotHeld', 'With {{held}} let go', { held }) : t('bind.whileHeld', 'With {{held}} held', { held }),
      sub: [`sends ${sends}`, ...sticks].join(' · '),
      name: getBindingLabel(props.text, `${trigger},${input}`) ?? '',
    }
  }
}

function shiftMenu(api: BindingApi, target: ModeshiftTarget, trigger: string, onRemoved: () => void, t: (key: string, fallback: string) => string): MenuItem[] {
  const props = api.modeshifts!
  const input = api.button.command.toUpperCase()
  const key = `${trigger},${input}`
  return [
    {
      label: t('bind.name', 'Name'), icon: <Icon name="details" size={16} />, onSelect: () => requestValueEntry({
        title: t('bind.nameThisChange', 'Name this change'), input: api.button.command, eyebrow: `${api.longName} · with ${capLabel(heldInput(trigger), api.family)} ${isReleasedInput(trigger) ? 'let go' : 'held'}`,
        value: getBindingLabel(props.text, key) ?? '', onDone: value => props.onChange(previous => setBindingLabel(previous, key, value.trim())),
      }),
    },
    { kind: 'separator' as const },
    { label: t('bind.removeChange', 'Remove chord'), icon: <Icon name="remove" size={16} />, onSelect: () => { props.onChange(previous => removeModeshift(previous, target, trigger)); onRemoved() } },
  ]
}

function ShiftList({ api, target, triggers, onEdit, onAdd }: { api: BindingApi; target: ModeshiftTarget; triggers: string[]; onEdit: (trigger: string) => void; onAdd: () => void }) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const words = useShiftWords(api)
  const [menu, setMenu] = useState<string | null>(null)
  const last = useRef<HTMLElement | null>(null)
  // The first chord takes the pad as the list opens (and again when the editor
  // hands back to it), so the next D-pad press never lands on the page behind.
  useEffect(() => { focusSoon(() => root.current, '[data-modeshift-row], [data-add-shift]') }, [])
  usePadButtons(root, (button, element) => {
    if (button !== 'Y') return false
    const row = element.closest<HTMLElement>('[data-modeshift-row]')
    if (!row) return false
    last.current = row
    setMenu(row.dataset.modeshiftRow ?? null)
    return true
  })
  return (
    <div ref={root} className={styles.whList} data-while-holding-list="">
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{t('bind.whileHoldingHeading', '{{input}} chords', { input: api.shortName })}</h2>
          <p className={styles.panelText}>{t('bind.whileHoldingListText', 'Hold another button to make {{input}} send something else.', { input: api.shortName })}</p>
        </div>
      </div>
      {triggers.map((trigger, index) => {
        const { title, sub, name } = words(trigger)
        return (
          <button key={trigger} type="button" className={styles.whRow} data-modeshift-row={trigger} data-autofocus={index === 0 ? '' : undefined}
            data-hints="A:Change;Y:Name, remove;B:Back" data-caption={`${title} · ${sub}`} onClick={() => onEdit(trigger)}>
            <span className={styles.whChain} aria-hidden="true">
              <InputGlyph command={heldInput(trigger)} family={api.family} size={32} /><b>+</b>
              <InputGlyph command={api.button.command} family={api.family} size={32} />
            </span>
            <span className={styles.whRowText}>
              <span className={styles.whRowTitle}>{name || title}</span>
              <span className={styles.whRowSub}>{name ? `${title} · ${sub}` : sub}</span>
              <OriginMarker setting={`${trigger},${api.button.command.toUpperCase()}`} addressable />
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        )
      })}
      <OpenRow icon={<Icon name="add" size={22} />} label={t('bind.addAnother', 'Add another')} hint={t('bind.addAnotherHint', 'Hold a different button for a different action')}
        onOpen={onAdd} hints="A:Add;B:Back" data={{ 'data-add-shift': '' }} />
      {menu && (
        <Menu open onOpenChange={open => { if (!open) setMenu(null) }} items={shiftMenu(api, target, menu, () => setMenu(null), t)} ariaLabel={t('bind.thisChange', 'This change')}
          returnFocusTo={() => last.current} align="end"
          trigger={<button type="button" tabIndex={-1} aria-hidden="true" data-nav-skip style={{ position: 'absolute', right: 32, top: 80, width: 1, height: 1, opacity: 0, border: 0, padding: 0 }} />} />
      )}
    </div>
  )
}

type StepsProps = {
  api: BindingApi
  target: ModeshiftTarget
  triggers: string[]
  /** The change being edited, or null for a new one. */
  trigger: string | null
  onTrigger: (trigger: string) => void
  onRemoved: () => void
}

function Steps({ api, target, triggers, trigger, onTrigger, onRemoved }: StepsProps) {
  const { t } = useTranslation()
  const props = api.modeshifts!
  const { text, onChange } = props
  const family = api.family
  const input = api.button.command.toUpperCase()
  const root = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<string | null>(trigger ? heldInput(trigger) : null)
  const [released, setReleased] = useState(trigger ? isReleasedInput(trigger) : false)
  const [everything, setEverything] = useState(Boolean(trigger && HOLD_GROUPS.some(group => group.rest && group.commands.includes(heldInput(trigger)))))
  const [picking, setPicking] = useState<SendKind | null>(null)
  const [allActivations, setAllActivations] = useState(false)
  const [menu, setMenu] = useState(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  const current = held ? withRelease(held, released) : null
  const exists = Boolean(current && triggers.includes(current))
  const value = current ? readModeshift(text, current, input) ?? '' : ''
  const currentKind = value && value.toUpperCase() !== 'NONE' ? sendKindOf(commandForValue(input, value)) : null
  const self = input

  // Changing step 1 or Held / Not held on a chord that exists renames it. A
  // stick the old held button shifts stays with that button (its Mode shift).
  const moveTo = (nextHeld: string, nextReleased: boolean) => {
    const next = withRelease(nextHeld, nextReleased)
    if (trigger && triggers.includes(trigger) && next !== trigger) {
      if (triggers.includes(next)) return
      onChange(previous => renameModeshift(previous, target, trigger, next))
      onTrigger(next)
    }
    setHeld(nextHeld)
    setReleased(nextReleased)
  }

  // The pad in hand picks the button to hold by being pressed -- only while
  // panel 1 has the focus. In panel 2 the triggers and the rest are the pad
  // being used to choose a kind, so a press there never rewrites the chord.
  const [inStepOne, setInStepOne] = useState(!trigger)
  useEffect(() => {
    const read = () => setInStepOne(Boolean(root.current?.querySelector('[data-step="1"]')?.contains(document.activeElement)))
    read()
    document.addEventListener('focusin', read)
    return () => document.removeEventListener('focusin', read)
  }, [])
  // On open: the held button's cap (editing) or the first cap (new), so the
  // pad is never left on nothing behind the page.
  useEffect(() => { focusSoon(() => root.current, '[data-step="1"] [data-autofocus], [data-step="1"] [data-hold-input]') }, [])
  const { supported, listening } = usePressedInput(true, pressed => {
    if (!root.current?.querySelector('[data-step="1"]')?.contains(document.activeElement)) return
    if (pressed === self || (triggers.includes(pressed) && pressed !== trigger)) return
    moveTo(pressed, released)
    root.current?.querySelector<HTMLElement>(`[data-hold-input="${CSS.escape(pressed)}"]`)?.focus()
  })
  const groups = useMemo(() => groupOptions(HOLD_GROUPS, props.modifiers, value => value === self || !supported || supported.has(value) || !OPTIONAL_INPUTS.has(value)), [props.modifiers, supported, self])

  usePadButtons(root, button => {
    if (button !== 'Y' || !current || !exists) return false
    lastFocus.current = document.activeElement as HTMLElement | null
    setMenu(true)
    return true
  })

  const choose = (patch: { outputKind?: string; outputValue?: string }) => {
    if (!current) return
    const kind = (patch.outputKind ?? 'keyboard') as Parameters<typeof replaceFirstOutput>[1]
    onChange(previous => {
      // A new chord starts plain: addModeshift copies the input's own line, and
      // its modifiers ("!M\", a tap) must not ride along as "Tap Space".
      const fresh = !triggers.includes(current)
      const base = fresh ? addModeshift(previous, target, current) : previous
      return writeModeshift(base, current, input, replaceFirstOutput(fresh ? '' : readModeshift(base, current, input) ?? '', kind, patch.outputValue ?? ''))
    })
    if (!trigger) onTrigger(current)
    focusSoon(() => root.current, '[data-step="2"] [data-kind-tile][data-current="true"], [data-step="2"] [data-kind-tile]')
  }

  const alsoShifts = current ? stickShiftsOf(text, current) : []
  const heldName = held ? capLabel(held, family) : null
  const needHeld = 'Press a button first'

  return (
    <div ref={root} className={styles.wh} data-while-holding={trigger ?? 'new'}>
      <section className={styles.panel} data-step="1" aria-label="Step 1 · The button to hold">
        <div className={styles.panelHead}>
          <p className={styles.eyebrowLabel}>Step 1 · The button to hold</p>
          {listening && inStepOne && <span className={styles.pill}><span className={styles.listenDot} aria-hidden="true" />Listening</span>}
        </div>
        <h2 className={styles.panelTitle}>{heldName ? `Hold ${heldName}` : 'The button to hold'}</h2>
        <p className={styles.panelText}>A grip, trigger, stick click or pad: pressed on the controller, or chosen from the list. Face buttons, bumpers and the D-pad are in the list only.</p>
        <div className={styles.holdGraphic} aria-hidden="true">
          <span className={styles.quiet}>Hold one of these</span>
          <span className={styles.holdSlot} data-set={held ? 'true' : undefined} data-glyph-slot={held ? '' : undefined}>
            {held && <InputGlyph command={held} family={family} size={28} />}{heldName ?? '?'}
          </span>
          <span className={styles.holdPlus}>+</span>
          <span className={styles.holdTarget}><InputGlyph command={api.button.command} family={family} size={56} /></span>
          <span className={styles.holdSlot} data-set={currentKind ? 'true' : undefined}>{currentKind ? SEND_KINDS.find(kind => kind.kind === currentKind)?.label : 'Step 2'}</span>
        </div>
        <div className={styles.capGroups}>
          {groups.filter(group => !group.rest || everything).map(group => (
            <div key={group.key} style={{ display: 'contents' }}>
              <span className={styles.capGroupLabel}>{group.label}</span>
              <span className={styles.caps}>
                {group.items.map(option => {
                  const own = option === self
                  const taken = triggers.includes(withRelease(option, released)) && withRelease(option, released) !== trigger
                  const reason = own ? 'This is the button being changed' : taken ? `${api.shortName} already has a change while ${capLabel(option, family)} is ${released ? 'not held' : 'held'}` : undefined
                  return (
                    <button key={option} type="button" className={styles.cap} data-hold-input={option} aria-pressed={held === option}
                      aria-disabled={reason ? 'true' : undefined} data-reason={reason} data-caption={capLabel(option, family)}
                      data-autofocus={!trigger && group === groups[0] && option === group.items[0] ? '' : trigger && held === option ? '' : undefined}
                      data-hints={reason ? 'B:Cancel' : 'A:Choose;B:Cancel'}
                      data-glyph-cap=""
                      onClick={() => { if (reason) return; moveTo(option, released); focusSoon(() => root.current, '[data-step="2"] [data-kind-tile]:not([aria-disabled="true"])') }}>
                      <InputGlyph command={option} family={family} size={30} />
                      <span>{capLabel(option, family)}</span>
                    </button>
                  )
                })}
              </span>
            </div>
          ))}
          {!everything && (
            <>
              <span className={styles.capGroupLabel}>Everything else</span>
              <span className={styles.caps}>
                <button type="button" className={styles.cap} data-glyph-cap="" data-hints="A:Show them;B:Cancel" data-caption="Face, D-pad, system, edges, zones"
                  onClick={() => { setEverything(true); focusSoon(() => root.current, '[data-hold-input="S"], [data-hold-input="UP"]') }}>
                  {['S', 'DPAD', 'HOME'].map(command => <InputGlyph key={command} command={command} family={family} size={24} />)}
                  <span className={styles.capMore}>Face, D-pad, system, edges, zones ▸</span>
                </button>
              </span>
            </>
          )}
        </div>
      </section>

      <div className={styles.whCol}>
        <section className={styles.panel} data-step="2" aria-label={`Step 2 · What ${api.shortName} does`}>
          <div className={styles.panelHead}>
            <p className={styles.eyebrowLabel}>Step 2 · What {api.shortName} does</p>
            {!held && <span className={styles.quiet} style={{ fontSize: 'var(--fs-hint)' }}>{needHeld}</span>}
            {held && value && <span className={styles.pill} data-tone="quiet">{describeBinding(value, t)}</span>}
          </div>
          <h2 className={styles.panelTitle}>With it held, {api.shortName} sends…</h2>
          <div className={styles.kindTiles}>
            {SEND_KINDS.map(kind => (
              <button key={kind.kind} type="button" className={styles.kindTile} data-kind-tile={kind.kind} data-current={currentKind === kind.kind ? 'true' : undefined}
                aria-disabled={held ? undefined : 'true'} data-reason={held ? undefined : needHeld}
                data-hints={held ? `A:Choose;${exists ? 'Y:Name, remove;' : ''}B:Cancel` : 'B:Cancel'} data-caption={`${kind.label} · ${kind.caption}`}
                onClick={() => { if (held) setPicking(kind.kind) }}>
                <Icon name={KIND_ICONS[kind.kind]} size={22} />{t(`bind.kind.${kind.kind}`, kind.label)}
              </button>
            ))}
          </div>
          <SegmentedRow label={`While ${heldName ?? 'that button'} is`} value={released ? 'released' : 'held'} disabled={held ? undefined : needHeld}
            options={[{ value: 'held', label: 'Held', caption: `Held: ${api.shortName} changes while ${heldName ?? 'it'} is down` }, { value: 'released', label: 'Not held', caption: `Not held: ${api.shortName} changes while ${heldName ?? 'it'} is up` }]}
            onChange={next => held && moveTo(held, next === 'released')} />
          {exists && current && (
            <OpenRow icon={<Icon name="buttons" size={22} />} label="Every way of pressing" hint="Tap, hold, double-tap… with it held, and how each is sent"
              value="▸" onOpen={() => setAllActivations(true)} hints="A:Open;Y:Name, remove;B:Cancel" />
          )}
          {/* The held button also shifts a stick: that is the stick's Mode shift, one A away. */}
          {alsoShifts.map(({ side, mode }) => {
            const stick = side === 'LEFT' ? 'Left stick' : 'Right stick'
            return (
              <OpenRow key={side} icon={<Icon name="joysticks" size={22} />} label={`Also shifts: ${stick} · ${formatStickModeLabel(mode, t)}`}
                hint={`Sticks ▸ ${stick} ▸ Mode shift · ${heldName} ${released ? 'let go' : 'held'}`} value="▸" hints="A:Open Mode shift;B:Cancel"
                data={{ 'data-also-shifts': side }}
                onOpen={() => requestModeshift({ page: 'joysticks', side: side === 'LEFT' ? 'left' : 'right', trigger: current! })} />
            )
          })}
        </section>
      </div>

      {picking && current && (
        <KindPicker kind={picking} {...api.pickerProps} specialOptions={getActionSpecialOptionList(t)}
          inputLabel={`${capLabel(held!, family)} + ${api.shortName}`} command={commandForValue(input, value)}
          onSelect={choose} onClose={() => setPicking(null)} />
      )}
      {allActivations && current && (
        // Its own sub-page, stacked on this one, so the pickers it opens stack over it in turn.
        <SubPage open onClose={() => setAllActivations(false)} trail={[PAGE_NAMES[inputPage(input)], api.longName, 'Chords']}
          title={`With ${capLabel(held!, family)} ${released ? 'let go' : 'held'}`} backLabel="Done">
          <div style={{ maxWidth: 760 }}><ShiftedBinding {...props} target={target} trigger={current} button={api.button} embedded /></div>
        </SubPage>
      )}
      {menu && current && (
        <Menu open onOpenChange={open => { if (!open) setMenu(false) }} items={shiftMenu(api, target, current, onRemoved, t)} ariaLabel="This change" align="end"
          returnFocusTo={() => lastFocus.current}
          trigger={<button type="button" tabIndex={-1} aria-hidden="true" data-nav-skip style={{ position: 'absolute', right: 32, top: 80, width: 1, height: 1, opacity: 0, border: 0, padding: 0 }} />} />
      )}
    </div>
  )
}
