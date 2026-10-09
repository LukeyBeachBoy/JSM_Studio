import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { SubPage, OpenRow, ValueRow } from '../ui/console'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { controllerHasTwoTrackpads, type ControllerVisualFamily } from '../../utils/controllerStatus'
import { MENU_SELECTIONS, MENU_SOURCES, virtualMenuProblem, type MenuAttachment, type VirtualMenu } from '../../utils/virtualMenus'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { inputDisplayName } from '../../keymap/inputNames'
import { MenuPreview } from '../keymap/MenuPreview'
import { MenuPositionScreen } from '../keymap/VirtualMenuLibrary'
import { ButtonCapture } from '../modes/ButtonCapture'
import { useDeleteGuard } from '../modes/deleteGuard'
import { InputGlyph } from '../glyphs/InputGlyph'
import { Icon } from '../icons/Icon'
import { ACTIVATION_CAPTION, ACTIVATION_LABEL, NAVIGATION_CAPTION, NAVIGATION_LABEL, REVEAL_CAPTION, REVEAL_LABEL, selectionCaption, selectionLabel, SOURCE_CAPTION, SOURCE_LABEL, TYPE_LABEL } from './menuText'
import styles from './Menus.module.css'

// A menu's two sub-pages (console v2, MenuEditorMore): "Opened by" -- how it
// opens as cards, then only the rows that apply to that choice, one set of
// controls at a time ("Controls 1 of 2") -- and "More" (name, text and icons,
// the wheel's centre, when it shows, position, delete). ◂ ▸ change a row's
// value in place; Y removes the open set of controls.

type Panel = 'opened' | 'more'
type Option = { value: string; label: string; caption?: string }

/** A value changed with ◂ ▸ in place. */
function StepRow({ label, hint, value, options, onChange, id }: { label: string; hint?: string; value: string; options: Option[]; onChange: (value: string) => void; id?: string }) {
  const index = Math.max(0, options.findIndex(option => option.value === value))
  const current = options[index]
  const step = (by: 1 | -1) => { if (options.length < 2) return; const next = options[(index + by + options.length) % options.length]; if (next.value !== value) onChange(next.value) }
  return <div id={id} className={styles.stepRow} tabIndex={0} role="listbox" aria-label={label}
    data-arrows="horizontal" data-hints="MOVE:Change;Y:Remove these controls;B:Back to the menu"
    data-caption={`${label} · ${current?.label ?? value}${current?.caption ? ` · ${current.caption}` : ''}`}
    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) } }}>
    <span className={styles.stepText}><b>{label}</b>{(current?.caption ?? hint) && <small>{current?.caption ?? hint}</small>}</span>
    <span className={styles.stepValue}>{options.length > 1 && <button type="button" tabIndex={-1} data-nav-skip aria-label="Previous" className={styles.stepArrow} onClick={() => step(-1)}>◂</button>}{current?.label ?? value}{options.length > 1 && <button type="button" tabIndex={-1} data-nav-skip aria-label="Next" className={styles.stepArrow} onClick={() => step(1)}>▸</button>}</span>
    <span role="option" aria-selected="true" hidden>{current?.label}</span>
  </div>
}

/** A button choice: A presses one on the controller (or picks it); X clears it. */
function InputRow({ label, hint, input, empty, family, onPick, onClear }: { label: string; hint: string; input: string; empty: string; family: ControllerVisualFamily; onPick: () => void; onClear?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const bare = input.replace(/^!/, '')
  useEffect(() => {
    const node = ref.current
    if (!node || !onClear) return
    const onPad = (event: Event) => { if ((event as CustomEvent<PadEventDetail>).detail.button === 'X') { event.preventDefault(); onClear() } }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [onClear])
  return <button ref={ref} type="button" className={styles.stepRow}
    data-hints={`A:Press a button;${onClear && bare !== 'NONE' ? 'X:Clear;' : ''}Y:Remove these controls;B:Back to the menu`}
    data-caption={`${label} · ${hint}`} onClick={onPick}>
    <span className={styles.stepText}><b>{label}</b><small>{hint}</small></span>
    <span className={styles.stepValue}>{bare && bare !== 'NONE' ? <><InputGlyph command={bare} family={family} size={22} />{inputDisplayName(bare, family)}</> : empty}</span>
  </button>
}

type Props = {
  menu: VirtualMenu
  menus: VirtualMenu[]
  panel: Panel
  deviceType?: number
  family: ControllerVisualFamily
  onChange: (patch: Partial<VirtualMenu>) => void
  onRename: () => void
  onEditCentre: () => void
  onPositionAll: () => void
  onDelete: () => void
  onClose: () => void
}

/** The menu at a glance, beside either page: the drawing, its sizes, where it sits. */
function PreviewColumn({ menu, menus }: { menu: VirtualMenu; menus: VirtualMenu[] }) {
  return <section className={styles.detailPanel} aria-label="Preview">
    <header className={styles.panelHead}><h2>Preview</h2></header>
    <div className={styles.detailPreview}><MenuPreview menu={namedMenuOverlay(menu)} aspect={menu.type === 'HOTBAR' ? 5 : 1} maxHeight={240} /></div>
    <p className={styles.note}>{menu.placement.size} px wide · names {menu.placement.labelFontSize ?? 18} px · keys {menu.placement.outputFontSize ?? menu.placement.fontSize} px</p>
    <div className={styles.thumb} aria-hidden="true"><MenuPositionScreen menu={menu} menus={menus} compare onChange={() => {}} /></div>
    <p className={styles.note}>{menus.length === 1 ? 'The menu where it opens' : `All ${menus.length} menus where they open`}</p>
  </section>
}

export function MenuDetails(props: Props) {
  return props.panel === 'more' ? <MorePage {...props} /> : <OpenedByPage {...props} />
}

/** Lands the pad on the page's own first control, then asks the footer to read it. */
function useLanding(root: RefObject<HTMLElement | null>, selector: string) {
  useEffect(() => {
    requestAnimationFrame(() => {
      const node = root.current
      if (!node) return
      ;(node.querySelector<HTMLElement>(selector) ?? node.querySelector<HTMLElement>('button:not([aria-disabled="true"]):not([data-nav-skip]), [tabindex="0"]'))?.focus({ preventScroll: true })
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, [])
}

function OpenedByPage({ menu, menus, deviceType, family, onChange, onClose }: Props) {
  useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState(0)
  const [capture, setCapture] = useState<null | 'input' | 'confirm' | 'cancel'>(null)
  const index = Math.min(controls, Math.max(0, menu.attachments.length - 1))
  const attachment = menu.attachments[index]
  const stick = attachment && (attachment.source === 'LSTICK' || attachment.source === 'RSTICK')
  const opener = attachment && ['HOLD', 'TOGGLE'].includes(attachment.activation)
  const problem = virtualMenuProblem(menus.map(item => item.id === menu.id ? menu : item))

  const changeAttachment = (patch: Partial<MenuAttachment>) => onChange({ attachments: menu.attachments.map((old, i) => i === index ? { ...old, ...patch } : old) })
  const removeControls = () => { if (!attachment) return; onChange({ attachments: menu.attachments.filter((_, i) => i !== index) }); setControls(Math.max(0, index - 1)) }
  const sources = MENU_SOURCES.filter(source => (menu.type === 'HOTBAR' || !['DPAD', 'ABXY'].includes(source.value)) && (deviceType === undefined || controllerHasTwoTrackpads(deviceType) || source.value !== 'LEFT'))
    .map(source => ({ value: source.value, label: SOURCE_LABEL[source.value], caption: SOURCE_CAPTION[source.value] }))
  const addControls = () => {
    const free = sources.filter(source => !['DPAD', 'ABXY'].includes(source.value) && !menu.attachments.some(old => old.source === source.value))
    const source = free[0] ?? sources[0]
    if (!source) return
    onChange({ attachments: [...menu.attachments, { source: source.value as MenuAttachment['source'], activation: 'COMMAND', input: 'NONE', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE' }] })
    setControls(menu.attachments.length)
  }

  // The page opens on the way it opens (the current card), never on a value
  // stepper, so the first Right moves between cards rather than changing a value.
  useLanding(root, '[role="radio"][aria-checked="true"]')
  const latest = useRef({ removeControls, attachment })
  latest.current = { removeControls, attachment }
  useEffect(() => {
    const node = root.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented || (event as CustomEvent<PadEventDetail>).detail.button !== 'Y' || !latest.current.attachment) return
      event.preventDefault()
      latest.current.removeControls()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const selections = attachment ? MENU_SELECTIONS.filter(selection => (attachment.activation !== 'ALWAYS' || selection.value !== 'ACTIVATION_RELEASE') && (!['DPAD', 'ABXY'].includes(attachment.source) || selection.value !== 'TOUCH_RELEASE'))
    .map(selection => ({ value: selection.value, label: selectionLabel(selection.value, attachment), caption: selectionCaption(selection.value, attachment) })) : []
  const note: ReactNode = attachment && menu.type === 'HOTBAR'
    ? attachment.source === 'ABXY' ? 'The left and right face buttons step the hotbar; the top one uses it.' : 'Left and right step the hotbar; up (or a click) uses it. It remembers the slot.'
    : null

  return (
    <SubPage open onClose={onClose} trail={['Menus', menu.name]} title="Opened by" badge={null} backLabel="Back to the menu" hints={[{ button: 'MOVE', label: 'Change' }]}>
      <div ref={root} className={styles.details}>
        <PreviewColumn menu={menu} menus={menus} />
        <section className={styles.detailPanel} data-panel="opened" aria-label="Opened by">
          <header className={styles.panelHead}><h2>Opened by</h2><span>Controls {attachment ? index + 1 : 0} of {menu.attachments.length}</span></header>
          {menu.attachments.length > 1 && <StepRow label="Controls" hint="Each way to open it has its own controls" value={String(index)}
            options={menu.attachments.map((item, i) => ({ value: String(i), label: `${i + 1} of ${menu.attachments.length} · ${SOURCE_LABEL[item.source]}` }))} onChange={value => setControls(Number(value))} />}
          {problem && <p role="alert" className={styles.alert}>{problem}</p>}
          {attachment ? <>
            <span className={styles.eyebrow}>How it opens</span>
            <div className={styles.howCards} role="radiogroup" aria-label="How it opens">
              {(['COMMAND', 'HOLD', 'TOGGLE', 'ALWAYS'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={attachment.activation === value} className={styles.howCard}
                data-current={attachment.activation === value ? 'true' : undefined} data-hints={`A:Use ${ACTIVATION_LABEL[value]};Y:Remove these controls;B:Back to the menu`}
                data-caption={`${ACTIVATION_LABEL[value]} · ${ACTIVATION_CAPTION[value]}`}
                onClick={() => changeAttachment({
                  activation: value,
                  ...(['HOLD', 'TOGGLE'].includes(value) && attachment.input === 'NONE' ? { input: 'L' } : {}),
                  ...(value === 'ALWAYS' && attachment.selection === 'ACTIVATION_RELEASE' ? { selection: 'CLICK' as const } : {}),
                })}>
                <b>{ACTIVATION_LABEL[value]}</b><span>{ACTIVATION_CAPTION[value]}</span>
              </button>)}
            </div>
            {opener && <>
              <InputRow label="Opener" hint={attachment.activation === 'HOLD' ? 'Held to keep it open' : 'Tapped to open and close it'} input={attachment.input} empty="None" family={family} onPick={() => setCapture('input')} />
              <StepRow label="Opener works when" value={attachment.input.startsWith('!') ? 'released' : 'held'}
                options={[{ value: 'held', label: 'Held or touched', caption: 'While the button is down or the sensor is touched.' }, { value: 'released', label: 'Let go', caption: 'While the button is up or nothing touches the sensor.' }]}
                onChange={value => changeAttachment({ input: (value === 'released' ? '!' : '') + attachment.input.replace(/^!/, '') })} />
            </>}
            <span className={styles.eyebrow}>Pick with</span>
            <StepRow label="Navigate with" value={attachment.source} options={sources} onChange={source => changeAttachment({
              source: source as MenuAttachment['source'],
              ...(!['LSTICK', 'RSTICK'].includes(source) ? { navigation: undefined } : {}),
              ...(['DPAD', 'ABXY'].includes(source) && attachment.selection === 'TOUCH_RELEASE' ? { selection: 'CLICK' as const } : {}),
            })} />
            {stick && <StepRow label="Stick moves" value={attachment.navigation ?? 'JOYSTICK'}
              options={[{ value: 'JOYSTICK', label: NAVIGATION_LABEL.JOYSTICK, caption: NAVIGATION_CAPTION.JOYSTICK }, ...(menu.type !== 'HOTBAR' ? [{ value: 'JOYSTICK_CURSOR', label: NAVIGATION_LABEL.JOYSTICK_CURSOR, caption: NAVIGATION_CAPTION.JOYSTICK_CURSOR }] : [])]}
              onChange={navigation => changeAttachment({ navigation: navigation as MenuAttachment['navigation'] })} />}
            <StepRow label="When it picks" value={attachment.selection} options={selections} onChange={selection => changeAttachment({ selection: selection as MenuAttachment['selection'] })} />
            {attachment.selection === 'CLICK' && <InputRow label="Confirm button" hint="Uses the highlighted slice" input={attachment.confirm} empty={stick ? 'Stick click' : attachment.source === 'DPAD' ? 'D-pad up' : attachment.source === 'ABXY' ? 'Top face button' : 'Pad click'} family={family}
              onPick={() => setCapture('confirm')} onClear={() => changeAttachment({ confirm: 'NONE' })} />}
            <InputRow label="Cancel button" hint="Closes without picking" input={attachment.cancel} empty="None" family={family}
              onPick={() => setCapture('cancel')} onClear={() => changeAttachment({ cancel: 'NONE' })} />
            {note && <p className={styles.note}>{note}</p>}
          </> : <p className={styles.note}>Nothing opens {menu.name} yet. Add a pad or stick for it below.</p>}
          <OpenRow icon={<Icon name="add" size={20} />} label="Another way to open it" hint="Pad or stick" onOpen={addControls} hints="A:Add;B:Back to the menu" />
          {attachment && <button type="button" className={`${styles.stepRow} ${styles.dangerRow}`} data-hints="A:Remove;B:Back to the menu"
            data-caption={`Remove these controls · ${SOURCE_LABEL[attachment.source]} stops opening ${menu.name}`} onClick={removeControls}>
            <span className={styles.stepText}><b><Icon name="remove" size={18} /> Remove these controls</b></span>
            <span className={styles.stepValue}><span className={styles.key}>Y</span></span>
          </button>}
        </section>
      </div>
      <ButtonCapture open={!!capture} trail={['Menus', menu.name, 'Opened by']} title={capture === 'confirm' ? 'Confirm button' : capture === 'cancel' ? 'Cancel button' : 'Opener'}
        purpose={capture === 'confirm' ? `Uses the highlighted slice of ${menu.name}` : capture === 'cancel' ? `Closes ${menu.name} without picking` : `Opens ${menu.name}`}
        onPick={command => {
          const field = capture
          setCapture(null)
          if (!attachment || !field) return
          changeAttachment({ [field]: field === 'input' && attachment.input.startsWith('!') ? `!${command}` : command })
        }} onClose={() => setCapture(null)} />
    </SubPage>
  )
}

function MorePage({ menu, menus, onChange, onRename, onEditCentre, onPositionAll, onDelete, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState(false)
  const guard = useDeleteGuard(deleting, () => setDeleting(false))
  useLanding(root, '[data-panel="more"] button')
  const reveal = (Object.keys(REVEAL_LABEL) as VirtualMenu['placement']['reveal'][]).map(value => ({ value, label: REVEAL_LABEL[value], caption: REVEAL_CAPTION[value] }))

  return (
    <SubPage open onClose={deleting ? () => setDeleting(false) : onClose} trail={['Menus', menu.name]} title="More" badge={null} backLabel={deleting ? 'Keep it' : 'Back to the menu'}>
      <div ref={root} className={styles.details}>
        <PreviewColumn menu={menu} menus={menus} />
        <section className={styles.detailPanel} data-panel="more" aria-label={`More · ${menu.name}`}>
          <header className={styles.panelHead}><h2>More</h2><span>{menu.name}</span></header>
          <OpenRow label="Menu name" hint="On the rail, in pickers and the overlay" value={menu.name} onOpen={onRename} hints="A:Rename;B:Back to the menu" />
          <span className={styles.eyebrow}>Text and icons</span>
          <ValueRow label="Slice name size" value={menu.placement.labelFontSize ?? 18} min={8} max={40} step={1} format={value => `${value} px`} onChange={labelFontSize => onChange({ placement: { ...menu.placement, labelFontSize } })} />
          <ValueRow label="Key size" value={menu.placement.outputFontSize ?? menu.placement.fontSize} min={8} max={40} step={1} format={value => `${value} px`} onChange={outputFontSize => onChange({ placement: { ...menu.placement, outputFontSize } })} />
          <div className={styles.shows} role="group" aria-label="Shows">
            <span>Shows</span>
            {([['showLabels', 'Names'], ['showKeys', 'Keys'], ['showIcons', 'Icons']] as const).map(([key, label]) => (
              <button key={key} type="button" role="switch" aria-checked={menu.placement[key]} className={styles.showChip} data-on={menu.placement[key] ? 'true' : undefined}
                data-hints={`A:${menu.placement[key] ? 'Hide' : 'Show'};B:Back to the menu`} data-caption={`${label} · ${menu.placement[key] ? 'shown on each slice' : 'hidden'}`}
                onClick={() => onChange({ placement: { ...menu.placement, [key]: !menu.placement[key] } })}>{menu.placement[key] ? '✓ ' : ''}{label}</button>
            ))}
          </div>
          {menu.type === 'RADIAL' && <>
            <span className={styles.eyebrow}>Wheel centre</span>
            <button type="button" role="switch" aria-checked={!!menu.centerAction} className={styles.stepRow} data-hints="A:Switch;B:Back to the menu"
              data-caption="Centre action · Its own binding, like holster. Without one, the centre clears the highlight."
              onClick={() => onChange({ centerAction: menu.centerAction ? undefined : { binding: 'NONE', label: 'Holster', icon: '' }, ...(!menu.centerAction ? { deadzone: Math.max(menu.deadzone, .28) } : {}) })}>
              <span className={styles.stepText}><b>Centre action</b><small>Its own binding, like holster</small></span>
              <span className={styles.switch} data-on={menu.centerAction ? 'true' : undefined} aria-hidden="true"><span /></span>
            </button>
            {menu.centerAction && <OpenRow label="Centre does" hint="What the centre sends" value={menu.centerAction.label || 'Centre'} onOpen={onEditCentre} hints="A:Change action;B:Back to the menu" />}
            <ValueRow label="Centre dead zone" hint="The dashed ring picks nothing" value={Math.round(menu.deadzone * 100)} min={menu.centerAction ? 5 : 0} max={99} step={1} format={value => `${value}%`} onChange={value => onChange({ deadzone: value / 100 })} />
          </>}
          <span className={styles.eyebrow}>On screen</span>
          <StepRow label="Appears" value={menu.placement.reveal} options={reveal} onChange={value => onChange({ placement: { ...menu.placement, reveal: value as VirtualMenu['placement']['reveal'] } })} />
          <OpenRow label="Position all menus" hint="See overlaps, match positions" onOpen={onPositionAll} hints="A:Open;B:Back to the menu" />
          {!deleting ? <button type="button" className={`${styles.stepRow} ${styles.dangerRow}`} data-delete-row="" data-hints="A:Delete…;B:Back to the menu"
            data-caption={`Delete this menu · ${menu.name} and its controls go; bindings that open it stop working until it is made again`} onClick={() => setDeleting(true)}>
            <span className={styles.stepText}><b><Icon name="remove" size={18} /> Delete this menu</b></span>
          </button> : <div ref={guard.ref} onKeyDown={guard.onKeyDown} className={styles.deletePanel} role="alertdialog" data-focus-trap="true" aria-label={`Delete ${menu.name}?`}>
            <b>Delete {menu.name}?</b>
            <p>Its {menu.actions.length} {TYPE_LABEL[menu.type] === 'Grid' ? 'zones' : 'slices'} and controls go with it. Bindings that open it do nothing until it is made again. Nothing leaves the file until you save.</p>
            <button type="button" className={styles.keep} data-keep="" data-modal-close data-hints="A:Keep it;B:Keep it" onClick={() => setDeleting(false)}><b>Keep it</b><small>Nothing changes.</small></button>
            <button type="button" className={styles.deleteButton} data-delete="" data-hints="A:Delete;B:Keep it" onClick={onDelete}>Delete {menu.name}</button>
          </div>}
        </section>
      </div>
    </SubPage>
  )
}
