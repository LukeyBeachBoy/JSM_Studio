import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetrySample } from '../../hooks/useTelemetry'
import type { ConfigLayer } from '../../utils/layers'
import { layerHue, layerSlotOf } from '../../utils/layers'
import { controllerHasTwoTrackpads, controllerVisualFamily } from '../../utils/controllerStatus'
import { createVirtualMenu, readVirtualMenus, writeVirtualMenus, virtualMenuProblem, type MenuAttachment, type MenuType, type VirtualMenu } from '../../utils/virtualMenus'
import { readVirtualSetting } from '../../utils/virtualStickSettings'
import { analyzeVirtualControllerConfig, type VirtualControllerType } from '../../utils/virtualController'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { hitTestRegion } from '../../utils/overlayLayout'
import { describeBinding } from '../../utils/bindingDescription'
import { describeScreenPosition } from '../../utils/menuDescriptions'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { requestValueEntry } from '../../nav/textEntry'
import { showToast } from '../../utils/toast'
import { MenuPreview } from '../keymap/MenuPreview'
import { BindingIconArt, IconPickerPage } from '../keymap/IconPicker'
import { BindingSheetBody } from '../keymap/binding/BindingSheet'
import { Sheet } from '../ui/Sheet'
import { ModeCards, OpenRow, SubPage, ValueRow } from '../ui/console'
import { Icon, type IconName } from '../icons/Icon'
import { MoreChip } from '../modes/MoreChip'
import { MenuDetails } from './MenuDetails'
import { MenuPositionPage } from './MenuPositionPage'
import { menuSlotApi } from './menuSlotApi'
import { behaviourSentence, menuOpeners, selectionLabel, SOURCE_LABEL, TYPE_CAPTION, TYPE_LABEL, unitOf } from './menuText'
import styles from './Menus.module.css'

// Menus (console v2, MenuEditor.dc.html): the rail of menus (LT/RT), the menu
// at full size -- the focused control: point the stick at a slice, A changes
// its action on the binding sheet, Y its icon and name -- its shape and slice
// count, and on the right the slice, what opens it, its look and where it sits.
// Details (MenuEditorMore) and Position on screen are sub-pages. The catalogue
// always saves to Default (D16), whichever mode is being edited.

const MAX_MENUS = 16
const KINDS: { type: MenuType; icon: IconName }[] = [{ type: 'RADIAL', icon: 'shapeRadial' }, { type: 'TOUCH', icon: 'padGrid' }, { type: 'HOTBAR', icon: 'menuLayout' }]

type Template = { key: string; label: string; caption: string; build: (id: string, name: string) => VirtualMenu }
const attach = (source: MenuAttachment['source'], selection: MenuAttachment['selection'] = 'ACTIVATION_RELEASE'): MenuAttachment => ({ source, activation: 'COMMAND', input: 'NONE', selection, confirm: 'NONE', cancel: 'NONE' })
/** The Kit's empty state: start from a shape people use. */
export const MENU_TEMPLATES: Template[] = [
  { key: 'weapons', label: 'Weapon wheel', caption: '8 slots on a stick', build: (id, name) => ({ ...createVirtualMenu(id, name), attachments: [attach('RSTICK')] }) },
  { key: 'quick', label: 'Quick wheel', caption: '4 big slices on a pad', build: (id, name) => ({ ...createVirtualMenu(id, name), actions: Array.from({ length: 4 }, (_, index) => ({ binding: String(index + 1), label: `Slot ${index + 1}`, icon: '' })), columns: 4, attachments: [attach('RIGHT')] }) },
  { key: 'hotbar', label: 'Hotbar', caption: '1 to 0 along a strip', build: (id, name) => ({ ...createVirtualMenu(id, name), type: 'HOTBAR', columns: 10, actions: Array.from({ length: 10 }, (_, index) => ({ binding: String((index + 1) % 10), label: `Slot ${(index + 1) % 10}`, icon: '' })), attachments: [attach('DPAD', 'CLICK')] }) },
  { key: 'empty', label: 'Start empty', caption: 'Wheel, grid or strip', build: (id, name) => ({ ...createVirtualMenu(id, name), actions: Array.from({ length: 8 }, () => ({ binding: 'NONE', label: '', icon: '' })), attachments: [attach('RIGHT')] }) },
]

type Props = {
  /** Default, as the menus read it (imports resolved). */
  text: string
  /** Writes Default, whichever mode is being edited (D16). */
  setText: Dispatch<SetStateAction<string>>
  configName: string
  deviceType?: number
  sample?: TelemetrySample | null
  initialMenuId?: string | null
  /** The modes, for "which mode opens this menu". */
  layers?: ConfigLayer[]
  /** X Show in game (D13). */
  onShowInGame?: (menuId: string) => void
  showReason?: string | null
}

export function MenusPage({ text, setText, configName, deviceType, sample, initialMenuId, layers = [], onShowInGame, showReason }: Props) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(deviceType)
  const catalog = useMemo(() => readVirtualMenus(text), [text])
  const [selected, setSelected] = useState<string | null>(initialMenuId ?? null)
  const menu = catalog.menus.find(item => item.id === selected) ?? catalog.menus[0]
  const [slot, setSlot] = useState(0)
  const [editProblem, setEditProblem] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'action' | 'name' | 'icon' | 'center'>(null)
  const [details, setDetails] = useState<null | 'opened' | 'more'>(null)
  const [positioning, setPositioning] = useState<null | 'one' | 'all'>(null)
  const [creating, setCreating] = useState(false)
  const preview = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLElement>(null)
  useEffect(() => { if (initialMenuId) setSelected(initialMenuId) }, [initialMenuId])
  useEffect(() => { setSlot(0) }, [menu?.id])
  // A wheel with a centre action has one more slot: the centre, after the slices.
  const centre = !!menu?.centerAction && menu.type === 'RADIAL'
  const slots = menu ? menu.actions.length + (centre ? 1 : 0) : 0
  const slotIndex = menu ? Math.min(slot, slots - 1) : 0
  const isCentre = centre && slotIndex === menu!.actions.length
  const action = isCentre ? menu?.centerAction : menu?.actions[slotIndex]
  const slotName = isCentre ? 'Centre' : `Slice ${slotIndex + 1}`
  const controller = (readVirtualSetting(text, 'VIRTUAL_CONTROLLER') ?? 'NONE') as VirtualControllerType
  const output = analyzeVirtualControllerConfig(text)
  const openers = useMemo(() => menuOpeners(text, layers), [text, layers])
  const live = sample?.devices?.flatMap(device => device.status?.virtualMenus ?? []).find(state => state.id === menu?.id && state.open)
  const telemetryKnown = !!sample?.devices?.some(device => device.status?.virtualMenus !== undefined)

  const update = (next: VirtualMenu[]) => {
    const problem = virtualMenuProblem(next)
    setEditProblem(problem)
    if (!problem) setText(previous => writeVirtualMenus(previous, next))
    return !problem
  }
  const change = (patch: Partial<VirtualMenu>) => { if (menu) update(catalog.menus.map(old => old.id === menu.id ? { ...old, ...patch } : old)) }
  const changeAction = (index: number, patch: Partial<VirtualMenu['actions'][number]>) => { if (!menu) return; if (index === menu.actions.length && menu.centerAction) change({ centerAction: { ...menu.centerAction, ...patch } }); else change({ actions: menu.actions.map((old, i) => i === index ? { ...old, ...patch } : old) }) }
  const presentation = (patch: Partial<VirtualMenu['placement']>) => { if (menu) change({ placement: { ...menu.placement, ...patch } }) }
  const setCount = (count: number) => { if (menu) change({ columns: Math.min(menu.columns, count), actions: Array.from({ length: count }, (_, index) => menu.actions[index] ?? { binding: 'NONE', label: '', icon: '' }) }) }
  const setType = (type: MenuType) => { if (menu && type !== menu.type) change({ type, actions: type === 'RADIAL' && menu.actions.length === 1 ? [...menu.actions, { binding: 'NONE', label: '', icon: '' }] : menu.actions }) }
  const enableOutput = () => setText(previous => previous + '\nVIRTUAL_CONTROLLER = XBOX\n')

  const create = (template: Template) => {
    if (catalog.problem || catalog.menus.length >= MAX_MENUS) return
    let index = 1
    while (catalog.menus.some(item => item.id === `menu${index}`) || new RegExp(`MENU_(?:OPEN|CLOSE|TOGGLE|HOLD) menu${index}(?=[\\s"'])`).test(text)) index += 1
    let name = template.label
    for (let n = 2; catalog.menus.some(item => item.name.toLowerCase() === name.toLowerCase()); n++) name = `${template.label} ${n}`
    const next = template.build(`menu${index}`, name)
    // A source another menu already owns is taken; fall back to the first free pad or stick.
    const taken = new Set(catalog.menus.flatMap(item => item.attachments.filter(a => a.activation === 'ALWAYS').map(a => a.source)))
    next.attachments = next.attachments.map(a => taken.has(a.source) ? { ...a, source: (['RIGHT', 'RSTICK', 'LSTICK', 'LEFT'] as const).find(source => !taken.has(source)) ?? a.source } : a)
    if (update([...catalog.menus, next])) { setSelected(next.id); setCreating(false); requestAnimationFrame(() => preview.current?.focus()) }
  }
  const renameMenu = (target: VirtualMenu) => requestValueEntry({
    title: `Rename ${target.name}`, eyebrow: 'Menus · Rename', value: target.name, hint: 'Shown on the rail, in pickers and on the overlay.',
    onDone: value => {
      const name = value.trim()
      if (!name || name === target.name) return
      if (name.length > 120) { showToast('Keep the name under 120 characters.', 'error'); return }
      update(catalog.menus.map(item => item.id === target.id ? { ...item, name } : item))
    },
  })
  const renameSlot = () => {
    if (!menu || !action) return
    requestValueEntry({ title: `Name ${slotName.toLowerCase()}`, eyebrow: `${menu.name} · ${slotName}`, value: action.label, hint: 'Shown on the slice in the overlay.',
      suggestions: [describeBinding(action.binding, t)].filter(Boolean), onDone: label => changeAction(slotIndex, { label: label.trim() }) })
  }

  // LT / RT step the rail (MenuEditor footer "LT RT Menu").
  useEffect(() => {
    const onStep = (event: Event) => {
      if (catalog.menus.length < 2 || !menu) return
      event.preventDefault()
      const index = catalog.menus.findIndex(item => item.id === menu.id)
      const next = catalog.menus[Math.min(catalog.menus.length - 1, Math.max(0, index + (event as CustomEvent<number>).detail))]
      setSelected(next.id)
      requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(next.id)}"]`)?.focus({ preventScroll: true }))
    }
    window.addEventListener('jsm:section-step', onStep)
    return () => window.removeEventListener('jsm:section-step', onStep)
  }, [catalog.menus, menu])

  // The preview: ◂ ▸ and the stick pick the slice; A its action, Y its icon and
  // name, X shows the menu in the game.
  useEffect(() => {
    const node = preview.current
    if (!node || !menu) return
    const overlay = namedMenuOverlay(menu)
    const onStick = (event: Event) => {
      if (document.activeElement !== node) return
      const { leftStick, rightStick } = (event as CustomEvent<{ leftStick: { x: number; y: number }; rightStick: { x: number; y: number } }>).detail
      const point = Math.hypot(leftStick.x, leftStick.y) > .5 ? leftStick : rightStick
      if (Math.hypot(point.x, point.y) <= .5) {
        // Letting the stick back to the middle picks the centre, as the overlay does.
        if (deflected.current && menu.centerAction && menu.type === 'RADIAL') setSlot(menu.actions.length)
        deflected.current = false
        return
      }
      event.preventDefault()
      deflected.current = true
      const index = hitTestRegion(overlay, point.x, -point.y)
      if (index >= 0 && index < menu.actions.length) setSlot(index)
    }
    const deflected = { current: false }
    node.addEventListener('jsm:preview-stick', onStick)
    return () => node.removeEventListener('jsm:preview-stick', onStick)
  }, [menu])
  const latest = useRef({ menu, onShowInGame, showReason })
  latest.current = { menu, onShowInGame, showReason }
  useEffect(() => {
    const node = document.querySelector<HTMLElement>('[data-virtual-menus-page]')
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      const target = event.target as HTMLElement | null
      const { menu, onShowInGame, showReason } = latest.current
      if (button === 'Y' && target?.closest('[data-menu-preview]')) { event.preventDefault(); setSheet('name') }
      else if (button === 'Y' && target?.closest('[data-menu-id]')) {
        const found = catalog.menus.find(item => item.id === target.closest<HTMLElement>('[data-menu-id]')?.dataset.menuId)
        if (found) { event.preventDefault(); renameMenu(found) }
      }
      else if (button === 'X' && menu && onShowInGame && !showReason) { event.preventDefault(); onShowInGame(menu.id) }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  })
  /** The nearest slice in the arrow's direction, from the selected one's place on
   *  the drawing; null when it is already the furthest that way. */
  const sliceToward = (key: string): number | null => {
    const centres = new Map<number, { x: number; y: number }>()
    preview.current?.querySelectorAll<HTMLElement>('[role="button"][aria-label]').forEach(region => {
      const index = Number(region.getAttribute('aria-label')?.split(':')[1])
      const box = (region.querySelector<HTMLElement>('[data-nav-box]') ?? region).getBoundingClientRect()
      if (Number.isInteger(index) && box.width) centres.set(index, { x: box.left + box.width / 2, y: box.top + box.height / 2 })
    })
    const from = centres.get(slotIndex)
    if (!from) return null
    const [dx, dy] = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[key] ?? [0, 0]
    let best: { index: number; score: number } | null = null
    for (const [index, at] of centres) {
      if (index === slotIndex) continue
      const along = (at.x - from.x) * dx + (at.y - from.y) * dy
      const across = Math.abs((at.x - from.x) * dy + (at.y - from.y) * dx)
      // Anything further that way counts; the nearest (sideways counting double) wins,
      // so on a ring Right climbs to the rightmost slice and only then leaves.
      if (along < 6) continue
      const score = along + across * 2
      if (!best || score < best.score) best = { index, score }
    }
    return best?.index ?? null
  }

  const onPreviewKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!menu || event.target !== event.currentTarget) return
    if (event.key.startsWith('Arrow')) {
      // The D-pad moves to the slice that way on the drawing. At the edge (no
      // slice further that way) the arrow is left alone, so focus moves on to
      // the panel beside the preview -- a wrap-around here trapped focus.
      const next = sliceToward(event.key)
      if (next === null) return
      event.preventDefault(); event.stopPropagation()
      setSlot(next)
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSheet('action') }
    else if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setSheet('name') }
  }

  const sourceName = (attachment?: MenuAttachment) => attachment ? (attachment.source === 'RIGHT' && deviceType !== undefined && !controllerHasTwoTrackpads(deviceType) ? 'Touchpad' : SOURCE_LABEL[attachment.source]) : 'Nothing yet'
  const showHint = onShowInGame ? (showReason ? '' : 'X:Show in game;') : ''

  // The empty state (Kit: "Empty state · Menus tab, nothing made yet").
  if (!catalog.menus.length && !catalog.problem) return (
    <div className={styles.page} data-virtual-menus-page="" data-empty="">
      <section className={styles.emptyState} aria-label="Start a menu">
        <p>Hold a button, point at what you want, let go. Good for weapons, emotes and build items. Start from a shape:</p>
        <TemplateCards onPick={create} />
      </section>
      {editProblem && <p role="alert" className={styles.alert}>{editProblem}</p>}
    </div>
  )

  const hue = (opener: { layerIndex?: number }) => opener.layerIndex === undefined ? undefined : layerHue(layerSlotOf(opener.layerIndex))
  const placeLine = menu ? `${describeScreenPosition(menu.placement.x, menu.placement.y)} · shows ${({ touch: 'when opened', navigate: 'while moving', ring: 'on a slice', never: 'never' } as const)[menu.placement.reveal]}` : ''
  return (
    <div className={styles.page} data-virtual-menus-page="">
      <nav ref={rail} className={styles.rail} aria-label="Menus">
        <span className={styles.railKeys} aria-hidden="true"><span className={styles.key}>LT</span>Menu<span className={styles.key}>RT</span></span>
        {catalog.menus.map(item => {
          const openedIn = (openers.get(item.id) ?? []).find(opener => opener.layer)
          const attachment = item.attachments[0]
          return <div key={item.id} className="more-host" style={{ position: 'relative' }}><button type="button" className={styles.railItem} data-menu-id={item.id} aria-current={menu?.id === item.id ? 'true' : undefined}
            data-hints={`A:Edit;Y:Rename;${showHint}LT/RT:Menu;B:Back`} data-caption={`${item.name} · ${behaviourSentence(item)}`}
            onClick={() => { setSelected(item.id); requestAnimationFrame(() => preview.current?.focus()) }} onFocus={() => setSelected(item.id)}>
            <b>{item.name}</b>
            <span>
              {openedIn && <><span className={styles.modeTag} style={{ '--mode-hue': hue(openedIn) } as CSSProperties} aria-hidden="true" />{openedIn.layer!.name} · </>}
              {openedIn ? sourceName(attachment).toLowerCase() : sourceName(attachment)} · {openedIn ? item.actions.length : unitOf(item.type, item.actions.length)}
            </span>
          </button><MoreChip label={`Rename ${item.name}`} /></div>
        })}
        <button type="button" className={`${styles.railItem} ${styles.newMenu}`} aria-disabled={catalog.menus.length >= MAX_MENUS || !!catalog.problem ? 'true' : undefined}
          data-reason={catalog.menus.length >= MAX_MENUS ? 'A configuration holds up to 16 menus' : catalog.problem ? 'Fix the menu catalogue in the source first' : undefined}
          data-hints="A:Choose a start;B:Back" onClick={() => { if (catalog.menus.length < MAX_MENUS && !catalog.problem) setCreating(true) }}>
          <Icon name="add" size={20} /><b>New menu</b>
        </button>
        <p className={styles.railNote}><b>{catalog.menus.length} of {MAX_MENUS}</b> · {MAX_MENUS - catalog.menus.length} free</p>
      </nav>

      <section className={styles.centre} aria-label={menu?.name ?? 'Menu'}>
        {catalog.problem ? <p role="alert" className={styles.alert}>{catalog.problem}</p> : menu && <>
          <header className={styles.title}><h2>{menu.name}</h2><span>{behaviourSentence(menu)}</span></header>
          {editProblem && <p role="alert" className={styles.alert}>{editProblem}</p>}
          <div ref={preview} className={styles.preview} role="button" tabIndex={0} data-menu-preview="" data-preview-navigation="" data-arrows="horizontal"
            aria-label={`${menu.name}, ${isCentre ? 'centre' : `slice ${slotIndex + 1} of ${menu.actions.length}`}: ${action?.label || describeBinding(action?.binding ?? '', t) || 'nothing'}`}
            data-hints={`MOVE:Slice;A:Change action;${showHint}Y:Icon and name;LT/RT:Menu;B:Back`}
            data-caption={`${isCentre ? 'Centre' : `Slice ${slotIndex + 1} of ${menu.actions.length}`} · ${action?.label || describeBinding(action?.binding ?? '', t) || 'Nothing yet'}`}
            // A click on a slice selects it (the drawing's own onSelect); a click
            // elsewhere only takes focus. Double-click, A or Enter open the action.
            onKeyDown={onPreviewKey} onClick={event => { if (!(event.target as HTMLElement).closest('[role="button"][aria-label]')) preview.current?.focus() }}
            onDoubleClick={() => setSheet('action')}>
            <div className={styles.previewArt}>
              <MenuPreview menu={namedMenuOverlay(menu)} aspect={menu.type === 'HOTBAR' ? 5 : 1} selectedCommand={`${menu.id}:${slotIndex}`} hotCommand={live ? `${menu.id}:${live.selected}` : null}
                livePoint={live?.cursor ? { x: live.cursor.x * 2 - 1, y: live.cursor.y * 2 - 1 } : null} maxHeight={310} managedFocus
                onSelect={command => { setSlot(Number(command.split(':')[1])); preview.current?.focus() }} />
            </div>
            <p className={styles.previewCaption}>{isCentre ? 'Centre' : `Slice ${slotIndex + 1} of ${menu.actions.length}`} · {action?.label || describeBinding(action?.binding ?? '', t) || 'Nothing yet'}{!telemetryKnown && ' · Saved layout'}</p>
          </div>
          <div className={styles.kinds}>
            {KINDS.map(kind => {
              const reason = kind.type === 'HOTBAR' && menu.attachments.some(a => a.navigation === 'JOYSTICK_CURSOR') ? 'A cursor needs a wheel or a grid: set Stick moves to Straight to a slice first'
                : kind.type !== 'HOTBAR' && menu.attachments.some(a => a.source === 'DPAD' || a.source === 'ABXY') ? 'The D-pad and face buttons only step a hotbar: remove those controls first' : undefined
              return <button key={kind.type} type="button" className={styles.kind} role="radio" aria-checked={menu.type === kind.type} data-current={menu.type === kind.type ? 'true' : undefined}
                aria-disabled={reason ? 'true' : undefined} data-reason={reason} data-hints={reason ? 'B:Back' : `A:Use ${TYPE_LABEL[kind.type]};${showHint}LT/RT:Menu;B:Back`}
                data-caption={`${TYPE_LABEL[kind.type]} · ${TYPE_CAPTION[kind.type]}`} onClick={() => { if (!reason) setType(kind.type) }}>
                <span className={styles.kindArt} aria-hidden="true"><Icon name={kind.icon} size={40} /></span><b>{TYPE_LABEL[kind.type]}</b>
              </button>
            })}
            <Stepper label={menu.type === 'TOUCH' ? 'Zones' : menu.type === 'HOTBAR' ? 'Slots' : 'Slices'} value={menu.actions.length} min={menu.type === 'RADIAL' ? 2 : 1} max={25}
              caption="Fewer drops the last ones; other menus and buttons stay as they are" onChange={setCount} />
            {menu.type === 'TOUCH' && <Stepper label="Columns" value={menu.columns} min={1} max={menu.actions.length} caption="How many zones across the grid is" onChange={columns => change({ columns })} />}
          </div>
        </>}
      </section>

      {menu && !catalog.problem && <aside className={styles.side} aria-label={`${menu.name} · slice and look`}>
        <section className={styles.slotPanel} aria-label={isCentre ? 'Centre' : `Slice ${slotIndex + 1} of ${menu.actions.length}`}>
          <span className={styles.eyebrow}>{isCentre ? 'Centre action' : `Slice ${slotIndex + 1} of ${menu.actions.length}`}</span>
          <div className={styles.slotHead}>
            <span className={styles.slotIcon}>{action?.icon ? <BindingIconArt value={action.icon} size={30} /> : <Icon name="menuLayout" size={26} />}</span>
            <span className={styles.slotText}><b>{action?.label || slotName}</b><span>{action && action.binding.trim().toUpperCase() !== 'NONE' ? `Sends ${describeBinding(action.binding, t)}` : 'Sends nothing yet'}</span></span>
          </div>
          <div className={styles.slotChips}>
            <button type="button" className={styles.chip} data-hints="A:Change action;B:Back" onClick={() => setSheet('action')}><span className={styles.key}>A</span>Change action</button>
            <button type="button" className={styles.chip} data-hints="A:Icon and name;B:Back" onClick={() => setSheet('name')}><span className={styles.key}>Y</span>Icon and name</button>
          </div>
          {output.warnings.length > 0 && <p role="status" className={styles.warn}>
            {controller === 'NONE' ? 'Some slices send gamepad buttons, which need a virtual controller. ' : 'Some slices use another virtual controller’s buttons. '}
            {controller === 'NONE' && <button type="button" className={styles.inlineButton} data-hints="A:Turn on Xbox output;B:Back" onClick={enableOutput}>Use Xbox output</button>}
          </p>}
        </section>
        <OpenRow icon={<Icon name="joysticks" size={22} />} label="Opened by" hint={menu.attachments[0] ? `Picks ${selectionLabel(menu.attachments[0].selection, menu.attachments[0]).toLowerCase()}` : 'Nothing opens it yet'}
          value={menu.attachments.length > 1 ? `${sourceName(menu.attachments[0])} +${menu.attachments.length - 1}` : sourceName(menu.attachments[0])} onOpen={() => setDetails('opened')}
          hints={`A:Open;${showHint}LT/RT:Menu;B:Back`} />
        <section className={styles.look} aria-label="Look">
          <span className={styles.eyebrow}>Look</span>
          <ValueRow label="Size" value={menu.placement.size} min={120} max={1600} step={10} format={value => `${value} px`} onChange={size => presentation({ size })} />
          <ValueRow label="Slice name size" value={menu.placement.labelFontSize ?? 18} min={8} max={40} step={1} format={value => `${value} px`} onChange={labelFontSize => presentation({ labelFontSize })} />
          <ValueRow label="Key size" value={menu.placement.outputFontSize ?? menu.placement.fontSize} min={8} max={40} step={1} format={value => `${value} px`} onChange={outputFontSize => presentation({ outputFontSize })} />
        </section>
        <OpenRow icon={<Icon name="overview" size={22} />} label="Position on screen" hint={placeLine} onOpen={() => setPositioning('one')} hints={`A:Open;${showHint}LT/RT:Menu;B:Back`} />
        <OpenRow label="More" hint="Names, keys, icons, when it shows, centre, delete" onOpen={() => setDetails('more')} hints={`A:Open;${showHint}LT/RT:Menu;B:Back`} />
        {onShowInGame && <button type="button" className={styles.showButton} aria-disabled={showReason ? 'true' : undefined} data-reason={showReason ?? undefined}
          data-hints={showReason ? 'B:Back' : 'A:Show in game;B:Back'} data-caption="Show in game · Runs the configuration with this menu open, until you return"
          onClick={() => { if (!showReason) onShowInGame(menu.id) }}><span className={styles.key}>X</span>Show in game</button>}
      </aside>}

      {menu && sheet === 'action' && action && <SlotSheet menu={menu} index={isCentre ? -1 : slotIndex} family={family} controller={controller} enableOutput={enableOutput}
        onRename={label => changeAction(slotIndex, { label })} onChange={binding => changeAction(slotIndex, { binding })} onClose={() => { setSheet(null); requestAnimationFrame(() => preview.current?.focus()) }} />}
      {menu && sheet === 'center' && menu.centerAction && <SlotSheet menu={menu} index={-1} family={family} controller={controller} enableOutput={enableOutput}
        onRename={label => change({ centerAction: { ...menu.centerAction!, label } })} onChange={binding => change({ centerAction: { ...menu.centerAction!, binding } })} onClose={() => setSheet(null)} />}
      {menu && sheet === 'name' && action && <Sheet open inPlace onClose={() => { setSheet(null); requestAnimationFrame(() => preview.current?.focus()) }} eyebrow={`${menu.name} · ${slotName}`} title="Icon and name"
        hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Done' }]} lead={action.icon ? <BindingIconArt value={action.icon} size={28} /> : undefined}>
        <div className={styles.sheetRows}>
          <OpenRow label="Name" hint="Shown on the slice in the overlay" value={action.label || 'No name'} onOpen={renameSlot} hints="A:Rename;B:Done" />
          <OpenRow label="Icon" hint="Drawn on the slice" value={action.icon ? action.icon.split(':').pop() : 'None'} onOpen={() => setSheet('icon')} hints="A:Choose an icon;B:Done" />
        </div>
      </Sheet>}
      {menu && sheet === 'icon' && action && <IconPickerPage value={action.icon} itemLabel={action.label || slotName} item={`${menu.id}:${slotIndex}`} menuName={menu.name}
        onChange={icon => { changeAction(slotIndex, { icon }); setSheet('name') }} onClose={() => setSheet('name')} />}
      {menu && details && <MenuDetails menu={menu} menus={catalog.menus} panel={details} deviceType={deviceType} family={family}
        onChange={change} onRename={() => renameMenu(menu)} onEditCentre={() => setSheet('center')} onPositionAll={() => setPositioning('all')}
        onDelete={() => { update(catalog.menus.filter(old => old.id !== menu.id)); setDetails(null); setSelected(null) }} onClose={() => setDetails(null)} />}
      {menu && positioning && <MenuPositionPage menu={menu} menus={catalog.menus} all={positioning === 'all'} onAll={() => setPositioning('all')}
        onChange={(id, patch) => update(catalog.menus.map(item => item.id === id ? { ...item, placement: { ...item.placement, ...patch } } : item))} onClose={() => setPositioning(null)} />}
      {creating && <SubPage open onClose={() => setCreating(false)} trail={['Menus']} title="New menu">
        <section className={styles.emptyState} aria-label="Start a menu">
          <p>Hold a button, point at what you want, let go. Good for weapons, emotes and build items. Start from a shape:</p>
          <TemplateCards onPick={create} />
        </section>
      </SubPage>}
      <span hidden data-config-name={configName} />
    </div>
  )
}

function TemplateCards({ onPick }: { onPick: (template: Template) => void }) {
  const art = (template: Template) => {
    const sample = template.build('preview', template.label)
    // The well wears the theme's tokens (the kit's art well is one dark colour).
    return <span className={styles.templateArt}><MenuPreview menu={namedMenuOverlay({ ...sample, placement: { ...sample.placement, size: 220, labelFontSize: 14, outputFontSize: 13 } })} aspect={sample.type === 'HOTBAR' ? 5 : 1} maxHeight={150} /></span>
  }
  return <ModeCards options={MENU_TEMPLATES.map(template => ({ value: template.key, label: template.label, caption: template.caption, art: art(template) }))} value=""
    onChange={key => { const template = MENU_TEMPLATES.find(item => item.key === key); if (template) onPick(template) }} useLabel={card => card.value === 'empty' ? 'Start empty' : `Start a ${card.label.toLowerCase()}`} />
}

/** A count changed with ◂ ▸ ("Slices ◂ 8 ▸ · 2 to 25"). */
function Stepper({ label, value, min, max, caption, onChange }: { label: string; value: number; min: number; max: number; caption: string; onChange: (value: number) => void }) {
  const step = (by: number) => { const next = Math.min(max, Math.max(min, value + by)); if (next !== value) onChange(next) }
  return <div className={styles.stepper} tabIndex={0} role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} data-arrows="horizontal"
    data-hints="MOVE:Change;A:Type a number;B:Back" data-caption={`${label} · ${caption}`}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
      else if (event.key === 'Enter') { event.preventDefault(); requestValueEntry({ title: label, value: String(value), numeric: true, hint: `${min} to ${max}`, onDone: text => { const n = Math.round(Number(text)); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))) } }) }
    }}>
    <span>{label}</span>
    <b><button type="button" tabIndex={-1} aria-hidden="true" onClick={() => step(-1)}>◂</button>{value}<button type="button" tabIndex={-1} aria-hidden="true" onClick={() => step(1)}>▸</button></b>
    <small>{min} to {max}</small>
  </div>
}

/** A slice's action on the binding sheet (BIND's BindingSheetBody). */
function SlotSheet({ menu, index, family, controller, enableOutput, onRename, onChange, onClose }: {
  menu: VirtualMenu; index: number; family: ReturnType<typeof controllerVisualFamily>; controller: VirtualControllerType; enableOutput: () => void
  onRename: (label: string) => void; onChange: (binding: string) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const item = index < 0 ? menu.centerAction! : menu.actions[index]
  const name = index < 0 ? 'Centre' : `Slice ${index + 1}`
  const api = menuSlotApi({
    value: item.binding, onChange, title: `${menu.name} · ${item.label || name}`, shortName: item.label || name, label: item.label || undefined,
    onRename, family, glyph: item.icon ? <BindingIconArt value={item.icon} size={28} /> : <Icon name="menuLayout" size={28} />,
    virtualControllerType: controller, onEnableVirtualController: enableOutput, t,
  })
  // inPlace: the sheet opens full-screen pickers; a body-level sheet would sit over them (console.css).
  return <Sheet open inPlace onClose={onClose} width={700} eyebrow={`${menu.name} · ${name}`} title={item.label || name}
    lead={api.glyph} description="Let go to pick · hold while pointing to hold"
    hints={[{ button: 'A', label: 'Choose' }, { button: 'X', label: 'Clear' }, { button: 'B', label: 'Done' }]}>
    <BindingSheetBody api={api} />
  </Sheet>
}
