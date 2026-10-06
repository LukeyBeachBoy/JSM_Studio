import { placeMenu } from '../../utils/padGeometry'
import { Fragment, useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, type SelectOption } from '../ui/Select'
import { InputGlyph } from '../glyphs/InputGlyph'
import './VirtualMenuLibrary.css'
import { Sheet } from '../ui/Sheet'
import { SummaryRow } from '../ui/SummaryRow'
import { BindingLabelField } from './BindingLabelField'
import { VirtualMenuActionEditor } from './VirtualMenuActionEditor'
import { MenuPreview } from './MenuPreview'
import { VirtualMenuPreview } from './VirtualMenuPreview'
import { buildModifierOptions, resolveModifierOptionLabel } from '../../utils/modifierOptions'
import { controllerVisualFamily, controllerHasTwoTrackpads } from '../../utils/controllerStatus'
import { readVirtualSetting } from '../../utils/virtualStickSettings'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { createVirtualMenu, readVirtualMenus, writeVirtualMenus, virtualMenuProblem, MENU_SOURCES, MENU_SELECTIONS, type VirtualMenu, type MenuAttachment, type MenuType } from '../../utils/virtualMenus'
import type { TelemetrySample } from '../../hooks/useTelemetry'
import { analyzeVirtualControllerConfig, type VirtualControllerType } from '../../utils/virtualController'

type Props = { initialMenuId?: string | null; text: string; setText: Dispatch<SetStateAction<string>>; configName: string; deviceType?: number; sample?: TelemetrySample | null }
export function VirtualMenuLibrary({ text, setText, configName, deviceType, sample, initialMenuId }: Props) {
  const { t } = useTranslation()
  const [advanced, setAdvanced] = useState(false)
  const [positioning, setPositioning] = useState<string | null>(null)
  const [controls, setControls] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(initialMenuId ?? null)
  const [action, setAction] = useState<number | null>(null)
  const [editProblem, setEditProblem] = useState<string | null>(null)
  const catalog = readVirtualMenus(text)
  const menu = catalog.menus.find(menu => menu.id === selected) ?? catalog.menus[0]
  const family = controllerVisualFamily(deviceType)
  const inputs = buildModifierOptions(false, 0).filter(option => !option.disabled && !['LEFT_STICK', 'RIGHT_STICK'].includes(option.value))
    .map(option => ({ value: option.value, label: resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)[0], icon: option.value === 'NONE' ? undefined : <InputGlyph command={option.value} family={family} size={24} className="virtual-menu-input-glyph" />, description: `Use ${resolveModifierOptionLabel(option, t, family)}. Confirm and cancel inputs are consumed while the menu is active. An automatic activation input keeps its ordinary binding.` }))
  const optionalInputs = [{ value: 'NONE', label: 'Source default' }, ...inputs.filter(option => option.value !== 'NONE')]
  const controller = (readVirtualSetting(text, 'VIRTUAL_CONTROLLER') ?? 'NONE') as VirtualControllerType
  const output = analyzeVirtualControllerConfig(text)
  const update = (next: VirtualMenu[]) => {
    const problem = virtualMenuProblem(next); setEditProblem(problem)
    if (!problem) setText(previous => writeVirtualMenus(previous, next))
  }
  const change = (patch: Partial<VirtualMenu>) => { if (menu) update(catalog.menus.map(old => old.id === menu.id ? { ...old, ...patch } : old)) }
  const changeAttachment = (index: number, patch: Partial<MenuAttachment>) => { if (menu) change({ attachments: menu.attachments.map((old, i) => i === index ? { ...old, ...patch } : old) }) }
  const changeAction = (index: number, patch: Partial<VirtualMenu['actions'][number]>) => { if (!menu) return; if (index === menu.actions.length && menu.centerAction) change({ centerAction: { ...menu.centerAction, ...patch } }); else change({ actions: menu.actions.map((old, i) => i === index ? { ...old, ...patch } : old) }) }
  const editingAction = menu && action !== null ? action === menu.actions.length ? menu.centerAction : menu.actions[action] : undefined
  const presentation = (patch: Partial<VirtualMenu['placement']>) => { if (menu) change({ placement: { ...menu.placement, ...patch } }) }
  const sourceOptions = MENU_SOURCES.filter(source => (menu?.type === 'HOTBAR' || !['DPAD', 'ABXY'].includes(source.value)) && (deviceType === undefined || controllerHasTwoTrackpads(deviceType) || source.value !== 'LEFT'))
  const live = sample?.devices?.flatMap(device => device.status?.virtualMenus ?? []).find(state => state.id === menu?.id && state.open)
  const library = <aside className="virtual-menus__library" aria-label="Virtual menu library">
    {!catalog.menus.length && !catalog.problem && <p className="virtual-menus__empty">No menus yet.</p>}
    {catalog.menus.map(item => <button key={item.id} type="button" className="virtual-menus__item" aria-pressed={menu?.id === item.id} onClick={() => { setSelected(item.id); setAction(null); setControls(null); setAdvanced(false) }}>
      <strong>{item.name}</strong><span>{item.type === 'RADIAL' ? 'Radial wheel' : item.type === 'HOTBAR' ? 'Hotbar' : 'Touch grid'} · {item.actions.length} actions</span>
    </button>)}
    <button type="button" className="button button--secondary" disabled={!!catalog.problem || catalog.menus.length >= 16} onClick={() => {
      let index = 1; while (catalog.menus.some(item => item.id === `menu${index}`) || new RegExp(`MENU_(?:OPEN|CLOSE|TOGGLE|HOLD) menu${index}(?=[\\s"'])`).test(text)) index += 1
      const next = createVirtualMenu(`menu${index}`)
      next.attachments = [{ source: 'RIGHT', activation: 'COMMAND', input: 'NONE', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE' }]
      update([...catalog.menus, next]); setSelected(next.id)
    }}>Create virtual menu</button>
  </aside>
  return <div className="virtual-menus" data-virtual-menus-page>
    {library}
    <section className="virtual-menus__editor" aria-label={menu?.name ?? 'Menu editor'}>
    {editProblem && <p role="alert">{editProblem}</p>}
    {catalog.problem ? <p role="alert">{catalog.problem}</p> : !menu ? null : <>
      <h2>{menu.name}</h2>
      <div className="button-row virtual-menus__name"><span>Menu name</span><BindingLabelField value={menu.name} onChange={name => change({ name })} placeholder="Name this menu" /></div>
      <div className="virtual-menus__workspace">
      <section className="virtual-menus__stack virtual-menus__preview-column" aria-label="Menu preview">
        <h3>Menu preview</h3>
        <div className="virtual-menus__preview">
        <div className="virtual-menus__preview-canvas">
          <VirtualMenuPreview key={menu.id + menu.type} menu={namedMenuOverlay(menu)} aspect={menu.type === 'HOTBAR' ? 5 : 1} hotCommand={live ? `${menu.id}:${live.selected}` : null} livePoint={live?.cursor ? { x: live.cursor.x * 2 - 1, y: live.cursor.y * 2 - 1 } : null} onSelect={command => setAction(Number(command.split(':')[1]))} />
        </div>
        <p className="virtual-menus__preview-help">Choose Edit actions to select an action from the menu preview. {menu.type === 'RADIAL' ? 'Point the stick around the wheel; D-pad right/down steps clockwise and left/up steps back.' : 'Use the stick or D-pad to move between actions.'} Select edits the action; Back leaves the preview. You can also click any action.</p>
        {!sample?.devices?.some(device => device.status?.virtualMenus !== undefined) && <p className="virtual-menus__note">Saved layout preview</p>}
        {output.warnings.length > 0 && <p role="status">{controller === 'NONE' ? 'These gamepad actions require virtual output. Enable Xbox or DS4 output in Controller Preferences.' : 'Some actions use a different virtual controller scheme. Choose the matching output or convert the bindings in Controller Preferences.'}</p>}
        </div>
        <MenuPositionPreview menu={menu} onChange={presentation} onExpand={() => setPositioning(menu.id)} />
      </section>
      <div className="virtual-menus__columns"><section className="virtual-menus__stack" aria-label="Appearance"><h3>Appearance</h3>
      <MenuChoice label="Menu layout" hint="Choose the shape used to arrange and navigate your actions." adjust={{ kind: 'choice', value: menu.type, options: [{ value: 'RADIAL', label: 'Radial wheel' }, { value: 'TOUCH', label: 'Touch grid' }, { value: 'HOTBAR', label: 'Hotbar' }], onChange: type => change({ type: type as MenuType, actions: type === 'RADIAL' && menu.actions.length === 1 ? [...menu.actions, { binding: 'NONE', label: '', icon: '' }] : menu.actions }) }} />

      {menu.type === 'TOUCH' && <SummaryRow label="Grid columns" adjust={{ kind: 'number', value: menu.columns, min: 1, max: menu.actions.length, step: 1, onChange: columns => change({ columns }) }} />}
      <section className="virtual-menus__quick-appearance" aria-label="Menu appearance">
        <h3>Menu appearance</h3>
        <p>Make the menu large enough to read at a glance.</p>
        <SummaryRow label="Menu width" value={`${menu.placement.size} px`} hint="Increase the overlay width to make hotbar and grid labels easier to read." adjust={{ kind: 'number', value: menu.placement.size, min: 120, max: 1600, step: 10, onChange: size => presentation({ size }) }} />
        <SummaryRow label="Action label size" value={`${menu.placement.labelFontSize ?? 18} px`} adjust={{ kind: 'number', value: menu.placement.labelFontSize ?? 18, min: 8, max: 40, step: 1, onChange: labelFontSize => presentation({ labelFontSize }) }} />
        <SummaryRow label="Output name size" value={`${menu.placement.outputFontSize ?? menu.placement.fontSize} px`} adjust={{ kind: 'number', value: menu.placement.outputFontSize ?? menu.placement.fontSize, min: 8, max: 40, step: 1, onChange: outputFontSize => presentation({ outputFontSize }) }} />
        <SummaryRow label="Action labels" toggle={{ on: menu.placement.showLabels, onChange: value => presentation({ showLabels: value }) }} />
        <SummaryRow label="Output names" toggle={{ on: menu.placement.showKeys, onChange: value => presentation({ showKeys: value }) }} />
        <SummaryRow label="Icons" toggle={{ on: menu.placement.showIcons, onChange: value => presentation({ showIcons: value }) }} />
      </section>

      <SummaryRow label="Advanced configuration" hint="Large appearance preview and overlay visibility." value="Edit" onActivate={() => setAdvanced(true)} />
      </section><section className="virtual-menus__stack" aria-label="Behaviour and controls"><h3>Behaviour &amp; controls</h3>
      <SummaryRow label="Number of actions" help="Reducing the count removes the trailing actions from this menu. Other menus and physical bindings stay independent." adjust={{ kind: 'number', value: menu.actions.length, min: menu.type === 'RADIAL' ? 2 : 1, max: 25, step: 1, onChange: count => change({ columns: Math.min(menu.columns, count), actions: Array.from({ length: count }, (_, index) => menu.actions[index] ?? { binding: 'NONE', label: '', icon: '' }) }) }} />
      {menu.type === 'RADIAL' && <SummaryRow label="Centre deadzone" value={`${Number((menu.deadzone * 100).toPrecision(12))}%`} hint={menu.centerAction ? "The centre selects its own action." : "Touch the centre to clear the highlight. Joystick cursor also clears it at rest; direct Joystick retains it."} help="With a centre action, pad contact can highlight the centre. Stick click or activation-release selects it at rest; lift/return selection commits the preceding segment. Continuous selection requires actual contact or deflection." adjust={{ kind: 'number', value: menu.deadzone * 100, min: menu.centerAction ? 5 : 0, max: 99, step: 1, onChange: value => change({ deadzone: value / 100 }) }} />}
      {menu.type === 'RADIAL' && <SummaryRow label="Centre action" hint="Give the centre its own binding, such as holstering a weapon." help="Without a centre action, touching the radial centre clears the highlight. Joystick cursor also clears it at rest; direct Joystick retains the last highlight at rest. The centre binding is retained when you switch to a grid or hotbar and becomes available when you return to a radial wheel." toggle={{ on: !!menu.centerAction, onChange: enabled => change({ centerAction: enabled ? { binding: 'NONE', label: 'Holster', icon: '' } : undefined, ...(enabled ? { deadzone: Math.max(menu.deadzone, .28) } : {}) }) }} />}
      <section className="virtual-menus__navigation-controls" aria-label="Navigation controls">
      <h4>Navigation controls</h4>
      {menu.attachments.map((attachment, index) => <Fragment key={`${menu.id}:${index}`}>
        <SummaryRow label={`Menu controls${menu.attachments.length > 1 ? ` ${index + 1}` : ''}`} value={MENU_SOURCES.find(source => source.value === attachment.source)?.label} onActivate={() => setControls(index)} />
        <Sheet open={controls === index} onClose={() => setControls(null)} eyebrow={`Virtual menus · ${configName}`} title={`${menu.name} · Menu controls${menu.attachments.length > 1 ? ` ${index + 1}` : ''}`} description="Configure how you navigate, open and select actions in this menu.">
        <div className="virtual-menu-controls">
        <MenuChoice label="Navigation input" hint="Moves the highlighted action. Navigation, confirm and cancel are consumed only while this menu is open; other inputs keep their normal bindings." adjust={{ kind: 'choice', value: attachment.source, options: sourceOptions, onChange: source => changeAttachment(index, { source: source as MenuAttachment['source'], ...(!['LSTICK', 'RSTICK'].includes(source) ? { navigation: undefined } : {}), ...(['DPAD', 'ABXY'].includes(source) && attachment.selection === 'TOUCH_RELEASE' ? { selection: 'CLICK' } : {}) }) }} />
        {['LSTICK', 'RSTICK'].includes(attachment.source) && <MenuChoice label="Navigation mode" hint={attachment.navigation === 'JOYSTICK_CURSOR' ? menu.centerAction && menu.type === 'RADIAL' ? 'The cursor follows stick deflection. Returning to centre previews the centre action; lift/return selection runs the preceding action.' : 'The cursor follows stick deflection. Return to centre, then release the menu opener to close without selecting. Lift/return selection still commits the preceding action.' : 'Deflect the stick to highlight an action directly.'} adjust={{ kind: 'choice', value: attachment.navigation ?? 'JOYSTICK', options: [{ value: 'JOYSTICK', label: 'Joystick', description: 'Highlight actions directly with stick deflection.' }, ...(menu.type !== 'HOTBAR' ? [{ value: 'JOYSTICK_CURSOR', label: 'Joystick cursor', description: 'Move the trackpad-style cursor from the centre with stick deflection. With activation-release selection and no centre action, returning to centre clears the highlight; releasing the opener then closes without choosing anything.' }] : [])], onChange: navigation => changeAttachment(index, { navigation: navigation as MenuAttachment['navigation'] }) }} />}
        <MenuChoice label="Menu activation" hint={attachment.activation === 'ALWAYS' && ['LSTICK', 'RSTICK'].includes(attachment.source) ? 'Use directly with the stick. This reserves it for menus instead of movement or camera; no activation button is required.' : 'Choose binding commands or an automatic activation rule.'} adjust={{ kind: 'choice', value: attachment.activation, options: [{ value: 'COMMAND', label: 'Binding commands', description: 'Open, Close, Toggle and Hold commands in regular binding cards control this menu.' }, { value: 'HOLD', label: 'While an input is held' }, { value: 'TOGGLE', label: 'Toggle with an input' }, { value: 'ALWAYS', label: 'Always available', description: 'No activation button required. Reserves the navigation input for this menu, including when its overlay is hidden.' }], onChange: activation => changeAttachment(index, { activation: activation as MenuAttachment['activation'], ...(['HOLD', 'TOGGLE'].includes(activation) && attachment.input === 'NONE' ? { input: 'L' } : {}), ...(activation === 'ALWAYS' && attachment.selection === 'ACTIVATION_RELEASE' ? { selection: 'CLICK' } : {}) }) }} />
        {['HOLD', 'TOGGLE'].includes(attachment.activation) && <>
          <MenuChoice label="Activation input" adjust={{ kind: 'choice', value: attachment.input.replace(/^!/, ''), options: inputs.filter(input => input.value !== 'NONE'), onChange: input => changeAttachment(index, { input: (attachment.input.startsWith('!') ? '!' : '') + input }) }} />
          <MenuChoice label="Activation matches while" hint={attachment.activation === 'TOGGLE' ? 'Toggle when the activation input changes to the state below.' : 'Keep the menu active while the activation input is in the state below.'} help="The state refers to the Activation input above: Touched or held means a button is pressed or a capacitive sensor detects contact; Released means that button is up or the sensor has no contact. For automatic Hold, activation-release selection runs when this state ends, including pressing an input configured as Released. For automatic Toggle, it runs on the next transition into this state that deactivates the menu."
            adjust={{ kind: 'choice', value: attachment.input.startsWith('!') ? 'released' : 'held', options: [{ value: 'held', label: 'Touched or held' }, { value: 'released', label: 'Released' }], onChange: value => changeAttachment(index, { input: (value === 'released' ? '!' : '') + attachment.input.replace(/^!/, '') }) }} />
        </>}
        <MenuChoice label="Select action" hint="Choose when the highlighted action runs. Highlighting alone does not execute it unless continuous selection is chosen." adjust={{ kind: 'choice', value: attachment.selection, options: MENU_SELECTIONS.map(selection => selection.value === 'ACTIVATION_RELEASE' ? { ...selection, label: attachment.activation === 'COMMAND' ? 'Release the last Hold binding' : attachment.activation === 'TOGGLE' ? 'When toggled off' : 'When activation ends', description: attachment.activation === 'COMMAND' ? 'Run the highlighted action when the last Hold binding ends and no Open or Toggle command keeps the menu active. Close and Toggle commands cancel without running it.' : attachment.activation === 'TOGGLE' ? 'Run the highlighted action on the next activation-state transition that toggles the menu off. Cancel closes without running it.' : 'Run the highlighted action when the chosen activation state ends. For Released activation, this happens when the input is pressed or touched.' } : selection).filter(selection => (attachment.activation !== 'ALWAYS' || selection.value !== 'ACTIVATION_RELEASE') && (!['DPAD', 'ABXY'].includes(attachment.source) || selection.value !== 'TOUCH_RELEASE')), onChange: selection => changeAttachment(index, { selection: selection as MenuAttachment['selection'] }) }} />
        {attachment.selection === 'CLICK' && <MenuChoice label="Confirm input" hint="Source default uses pad click, stick click, D-pad up or the top face button." adjust={{ kind: 'choice', value: attachment.confirm, options: optionalInputs, onChange: confirm => changeAttachment(index, { confirm }) }} />}
        <MenuChoice label="Cancel input" hint="Cancel closes without selecting. For a held menu, release its activation input before opening it again." adjust={{ kind: 'choice', value: attachment.cancel, options: [{ value: 'NONE', label: 'No separate input' }, ...inputs.filter(input => input.value !== 'NONE')], onChange: cancel => changeAttachment(index, { cancel }) }} />
        {menu.type === 'HOTBAR' && <p>Left/right cycles the hotbar. D-pad up confirms by default; pads use their left/right regions and click, while sticks use left/right tilt and stick click. Selection is remembered for this controller.</p>}
        {attachment.source === 'ABXY' && <p>Left and right face buttons cycle the hotbar; the top button confirms. Choose the bottom button as a toggle to open it, or hold any other activation input.</p>}
        <div className="virtual-menu-controls__delete">
          <p>Removes this control setup. The menu, its actions and other control setups stay available.</p>
          <button type="button" className="button button--danger virtual-menu-controls__delete-button" onClick={() => { change({ attachments: menu.attachments.filter((_, i) => i !== index) }); setControls(null) }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>Delete menu controls{menu.attachments.length > 1 ? ` ${index + 1}` : ''}
          </button>
        </div>
        </div></Sheet>
      </Fragment>)}
      <SummaryRow label="Add navigation controls" hint="Configure another pad or stick for this menu. Openers are chosen in regular binding cards." value="Add controls" onActivate={() => {
        const candidates = sourceOptions.filter(source => !['DPAD', 'ABXY'].includes(source.value))
        // A menu can navigate with several independent sources.
        const source = candidates.find(source => !catalog.menus.some(other => other.attachments.some(old => old.source === source.value && other.id === menu.id)))
        if (source) { change({ attachments: [...menu.attachments, { source: source.value, activation: 'COMMAND', input: 'NONE', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE' }] }); setControls(menu.attachments.length) }
      }} />
      </section>
      </section></div></div>
      <Sheet open={advanced} onClose={() => setAdvanced(false)} width={1440} eyebrow={`Virtual menus · ${configName}`} title={`${menu.name} · Advanced configuration`}>
      <div className="virtual-menu-appearance">
      <MenuAppearancePreview menu={menu} />
      <div className="virtual-menus__advanced">
        <MenuChoice label="Show overlay" hint="Controls visibility only. Activation enables navigation; highlighting identifies a candidate. Select action controls when its commands run. The editor preview is always available." adjust={{ kind: 'choice', value: menu.placement.reveal, options: [{ value: 'touch', label: 'When activated' }, { value: 'navigate', label: 'While activated and navigating' }, { value: 'ring', label: 'While navigating with an action highlighted' }, { value: 'never', label: 'Never' }], onChange: reveal => presentation({ reveal: reveal as VirtualMenu['placement']['reveal'] }) }} />
        <SummaryRow label="Menu width" adjust={{ kind: 'number', value: menu.placement.size, min: 120, max: 1600, step: 10, onChange: size => presentation({ size }) }} />
        <SummaryRow label="Action label size" adjust={{ kind: 'number', value: menu.placement.labelFontSize ?? 18, min: 8, max: 40, step: 1, onChange: labelFontSize => presentation({ labelFontSize }) }} />
        <SummaryRow label="Output name size" adjust={{ kind: 'number', value: menu.placement.outputFontSize ?? menu.placement.fontSize, min: 8, max: 40, step: 1, onChange: outputFontSize => presentation({ outputFontSize }) }} />
        {(['showLabels', 'showKeys', 'showIcons'] as const).map(key => <SummaryRow key={key} label={key === 'showLabels' ? 'Action labels' : key === 'showKeys' ? 'Output names' : 'Icons'} toggle={{ on: menu.placement[key], onChange: value => presentation({ [key]: value }) }} />)}
      </div></div></Sheet>
      <Sheet open={positioning !== null} onClose={() => setPositioning(null)} width={1440} eyebrow={`Virtual menus · ${configName}`} title="Position virtual menus" description="All saved menus are shown to scale, including hidden overlays. Select a menu to move it. Overlap is useful for menus opened separately; check your activation bindings for menus that can appear together." hints={[{ button: 'DPAD', label: 'Move' }, { button: 'B', label: 'Close' }]}>
        {positioning !== null && <MenuPositionWorkspace menus={catalog.menus} selectedId={positioning} onSelect={setPositioning} onChange={(id, patch) => update(catalog.menus.map(item => item.id === id ? { ...item, placement: { ...item.placement, ...patch } } : item))} />}
      </Sheet>
      <SummaryRow label="Delete this menu" hint="Removes this menu and its controls. Commands referencing its identity become inactive until the menu is recreated." value="Delete" onActivate={() => { update(catalog.menus.filter(old => old.id !== menu.id)); setAction(null); setSelected(null) }} />
      {action !== null && editingAction && <VirtualMenuActionEditor title={`${menu.name} · ${editingAction.label || (action === menu.actions.length ? 'Centre action' : `Action ${action + 1}`)}`} value={editingAction.binding} virtualControllerType={controller} onClose={() => setAction(null)}
        label={editingAction.label} icon={editingAction.icon} family={family}
        onLabelChange={label => changeAction(action, { label })} onIconChange={icon => changeAction(action, { icon })}
        onEnableVirtualController={() => setText(previous => previous + '\nVIRTUAL_CONTROLLER = XBOX\n')}
        onChange={binding => changeAction(action, { binding })} />}
    </>}
    </section>
  </div>
}

const OPTION_DESCRIPTIONS: Record<string, string> = {
  RADIAL: 'Choose an action by direction around a wheel. A centre action is optional.',
  TOUCH: 'Choose an action by its position in a rectangular grid.',
  HOTBAR: 'Step left or right through a horizontal row. Remembers the highlighted action.',
  RIGHT: 'Move your thumb on the right trackpad to highlight an action.',
  LEFT: 'Move your thumb on the left trackpad to highlight an action.',
  RSTICK: 'Tilt the right stick toward an action; returning to centre ends navigation. The last highlight is retained unless a radial centre action replaces it.',
  LSTICK: 'Tilt the left stick toward an action; returning to centre ends navigation. The last highlight is retained unless a radial centre action replaces it.',
  DPAD: 'Left and right step through a hotbar; Up confirms by default.',
  ABXY: 'West and east face buttons step through a hotbar; the north button confirms by default.',
  COMMAND: 'Regular binding cards control when the menu opens. Choose Open, Close, Toggle or Hold for this menu.',
  HOLD: 'The activation input keeps the menu open while its chosen state matches.',
  TOGGLE: 'Each time the activation input enters its chosen state, switch between open and closed.',
  ALWAYS: 'The menu is always available and consumes its navigation input. No opener is needed.',
  held: 'The activation button is pressed, or the chosen capacitive sensor detects touch.',
  released: 'The activation button is not pressed, or the chosen capacitive sensor detects no touch.',
  ACTIVATION_RELEASE: 'Select when the last Hold binding is released, or when automatic activation ends. Open stays open; Close and Toggle cancel without selecting.',
  CLICK: 'Press the confirm input to select the highlighted action while keeping the menu open.',
  TOUCH_RELEASE: 'Select the previous highlight when you lift your thumb from the pad or return the stick to centre.',
  CONTINUOUS: 'Hold the highlighted action while touching the pad or deflecting the stick. D-pad and face-button hotbars hold their remembered action for the entire activation. Changing the highlight releases the previous action.',
  touch: 'Show while the menu is active, even before navigation starts. Hold, Toggle, Open or an automatic rule determines activation. Always available keeps it active.',
  navigate: 'Show only while active and using the navigation input: pad contact, stick deflection beyond the deadzone, or a held previous/next hotbar button. Hide when navigation stops.',
  ring: 'Show only while active, using the navigation input and highlighting an action. Hide in an empty centre or when navigation stops. A highlight is a candidate; Select action determines when its commands run.',
  never: 'Keep the in-game overlay hidden. Activation, navigation and action execution still work, and the visual editor preview remains available.',
}
function MenuChoice({ label, hint, help, adjust }: { label: string; hint?: string; help?: string; adjust: { kind: 'choice'; value: string; options: SelectOption[]; onChange: (value: string) => void } }) {
  const id = useId()
  return <div className="virtual-menus__field">
    <label htmlFor={id}>{label}</label>
    {(hint || help) && <p id={`${id}-help`} title={[hint, help].filter(Boolean).join(' ')}>{hint} {help}</p>}
    <Select id={id} ariaLabel={label} ariaDescribedBy={hint || help ? `${id}-help` : undefined} value={adjust.value} onValueChange={adjust.onChange}
      title={hint ?? help} options={adjust.options.map(option => ({ ...option, description: option.description ?? OPTION_DESCRIPTIONS[option.value] ?? (option.value === 'NONE' ? label === 'Cancel input' ? 'No separate cancel button. Bind Close menu to any regular input to cancel.' : 'Use the navigation input’s default confirm button: pad click, stick click, D-pad Up or north face button.' : `Use ${option.label} while this menu is open.`) }))} />
  </div>
}
function MenuAppearancePreview({ menu }: { menu: VirtualMenu }) {
  const host = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(300)
  useEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new ResizeObserver(() => setHeight(node.clientHeight))
    observer.observe(node)
    setHeight(node.clientHeight)
    return () => observer.disconnect()
  }, [])
  return <section className="virtual-menu-appearance__preview" aria-label="Live appearance preview">
    <div ref={host} className="virtual-menu-appearance__canvas">
      <MenuPreview menu={namedMenuOverlay(menu)} aspect={menu.type === 'HOTBAR' ? 5 : 1} maxHeight={height} />
    </div>
    <p>{menu.placement.size} px wide · {menu.placement.labelFontSize ?? 18} px action labels · {menu.placement.outputFontSize ?? menu.placement.fontSize} px output names. Preview scales down to fit when needed.</p>
  </section>
}
function MenuPositionFields({ menu, onChange }: { menu: VirtualMenu; onChange: (patch: Partial<VirtualMenu['placement']>) => void }) {
  return <div className="virtual-menus__position-values">{(['x', 'y'] as const).map(axis => <SummaryRow key={axis} label={axis === 'x' ? 'Horizontal position' : 'Vertical position'} value={`${Number((menu.placement[axis] * 100).toFixed(2))}%`} adjust={{ kind: 'number', value: Number((menu.placement[axis] * 100).toFixed(2)), min: 0, max: 100, step: 1, onChange: value => onChange({ [axis]: value / 100 }) }} />)}</div>
}
function MenuPositionPreview({ menu, onChange, onExpand }: { menu: VirtualMenu; onChange: (patch: Partial<VirtualMenu['placement']>) => void; onExpand: () => void }) {
  return <section className="virtual-menus__position" aria-label="Overlay screen preview">
    <h3>Position on your screen</h3>
    <p>Drag or click to position the menu; use arrow keys to fine-tune. Menu size is shown to scale.</p>
    <MenuPositionScreen menu={menu} onChange={onChange} />
    <MenuPositionFields menu={menu} onChange={onChange} />
    <button type="button" className="button button--secondary" onClick={onExpand}>Position all menus</button>
  </section>
}
function MenuPositionScreen({ menu, menus = [menu], onChange, compare = false }: { menu: VirtualMenu; menus?: VirtualMenu[]; onChange: (patch: Partial<VirtualMenu['placement']>) => void; compare?: boolean }) {
  const screenWidth = window.screen.availWidth || window.screen.width || 1920
  const screenHeight = window.screen.availHeight || window.screen.height || 1080
  return <>
    <div className="virtual-menus__screen" style={{ aspectRatio: `${screenWidth} / ${screenHeight}` }} role="slider" tabIndex={0} aria-label="Overlay position" aria-valuetext={`${Math.round(menu.placement.x * 100)}% across, ${Math.round(menu.placement.y * 100)}% down`} aria-valuenow={Math.round(menu.placement.x * 100)} aria-valuemin={0} aria-valuemax={100}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const box = event.currentTarget.getBoundingClientRect(); onChange({ x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }) }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const box = event.currentTarget.getBoundingClientRect(); onChange({ x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) }) }}
      onKeyDown={event => { const delta = event.shiftKey ? .05 : .01; const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y'; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); onChange({ [axis]: Math.min(1, Math.max(0, menu.placement[axis] + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -delta : delta))) }) }}>
      {menus.map((item, index) => {
        const box = placeMenu(item.placement, item.type === 'HOTBAR' ? 5 : 1, { x: 0, y: 0, width: screenWidth, height: screenHeight })
        return <div key={item.id} className="virtual-menus__screen-menu" data-menu-id={item.id} data-current={item.id === menu.id} data-compare={compare} style={{ left: `${box.x / screenWidth * 100}%`, top: `${box.y / screenHeight * 100}%`, width: `${box.width / screenWidth * 100}%`, height: `${box.height / screenHeight * 100}%`, zIndex: item.id === menu.id ? menus.length + 1 : index + 1, ...(compare ? { color: positionColor(index) } : {}) }}>
          <MenuPreview menu={namedMenuOverlay(item)} aspect={item.type === 'HOTBAR' ? 5 : 1} fill />
          {compare && <span className="virtual-menus__screen-label">{index + 1} · {item.name}</span>}
        </div>
      })}
    </div>
    <p className="virtual-menus__screen-caption">{screenWidth} × {screenHeight} · {menu.placement.size} px wide · {Math.round(menu.placement.x * 100)}% across / {Math.round(menu.placement.y * 100)}% down</p>
  </>
}
const positionColor = (index: number) => `hsl(${(index * 137.5 + 35) % 360} 80% 70%)`
const revealLabels: Record<VirtualMenu['placement']['reveal'], string> = { touch: 'When activated', navigate: 'While navigating', ring: 'With an action highlighted', never: 'Overlay hidden' }
function MenuPositionWorkspace({ menus, selectedId, onSelect, onChange }: { menus: VirtualMenu[]; selectedId: string; onSelect: (id: string) => void; onChange: (id: string, patch: Partial<VirtualMenu['placement']>) => void }) {
  const menu = menus.find(item => item.id === selectedId) ?? menus[0]
  const [matchId, setMatchId] = useState('')
  if (!menu) return null
  const otherMenus = menus.filter(item => item.id !== menu.id)
  const match = otherMenus.find(item => item.id === matchId) ?? otherMenus[0]
  const area = { x: 0, y: 0, width: window.screen.availWidth || window.screen.width || 1920, height: window.screen.availHeight || window.screen.height || 1080 }
  const box = placeMenu(menu.placement, menu.type === 'HOTBAR' ? 5 : 1, area)
  const overlaps = otherMenus.filter(item => {
    const other = placeMenu(item.placement, item.type === 'HOTBAR' ? 5 : 1, area)
    return box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y
  })
  return <div className="virtual-menu-position-workspace">
    <section className="virtual-menu-position-workspace__canvas" aria-label="All menu positions">
      <p>Moving <strong>{menu.name}</strong> · Click or drag on the screen. Arrow keys move by 1%; Shift + arrow moves by 5%.</p>
      <MenuPositionScreen menu={menu} menus={menus} compare onChange={patch => onChange(menu.id, patch)} />
    </section>
    <div className="virtual-menu-position-workspace__settings">
      <section className="virtual-menu-position-workspace__list" aria-label="Choose menu to position">
        {menus.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === menu.id} onClick={() => onSelect(item.id)}><span className="virtual-menu-position-workspace__marker" style={{ color: positionColor(index) }}>{index + 1}</span><span><strong>{item.name}</strong><small>{revealLabels[item.placement.reveal]}</small></span></button>)}
      </section>
      <MenuPositionFields menu={menu} onChange={patch => onChange(menu.id, patch)} />
      {match && <section className="virtual-menu-position-workspace__match">
        <MenuChoice label="Match position with" adjust={{ kind: 'choice', value: match.id, options: otherMenus.map(item => ({ value: item.id, label: item.name, description: `Use the same horizontal and vertical position as ${item.name}.` })), onChange: setMatchId }} />
        <button type="button" className="button button--secondary" onClick={() => onChange(menu.id, { x: match.placement.x, y: match.placement.y })}>Use this position</button>
      </section>}
      <p role="status">{overlaps.length ? `Overlapping footprints: ${overlaps.map(item => item.name).join(', ')}.` : 'No overlapping footprints.'} Footprints include the corners around radial wheels. Menus with different activation bindings may still appear together.</p>
    </div>
  </div>
}
