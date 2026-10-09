import { useEffect, useRef, useState, type ReactNode } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import type { ButtonDefinition } from '../../keymap/schema'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import type { ModeshiftTarget } from '../../utils/modeshift'
import type { OverlayMenu } from '../../utils/overlayLayout'
import { hitTestRegion, toUnit } from '../../utils/overlayLayout'
import type { TouchpadModeCardConfig } from '../keymap/TouchpadSettingsSection'
import type { LivePadTouch } from '../keymap/TouchpadGridSection'
import type { TouchpadAccelValues } from '../../hooks/useTouchpadConfig'
import { MenuPreview } from '../keymap/MenuPreview'
import { ScreenAreaPreview } from '../keymap/ScreenAreaPreview'
import { ModeCards, OpenRow, SegmentedRow, SubPage, SwitchRow, ValueRow } from '../ui/console'
import { describeMenuPlacement } from '../../utils/menuDescriptions'
import { MOUSE_AREA_FIT_OPTIONS, describeMouseArea, mapTouchToArea } from '../../utils/mouseArea'
import { modeshiftTriggers } from '../../utils/modeshift'
import { InputSideProxies, MoreMenu, readNumber, readWord, useFocusCurrentCard, useInheritedKeys, usePadButton, WhileHoldingPage, writeKeys, type SetText } from '../sticks/shared'
import { takeFineTuneRequest, useFineTuneRequestVersion, useInputSide, setInputSide } from '../sticks/inputSide'
import { PAD_CARDS, PAD_CARD_NAMES, PadCardArt, SHAPE_NAMES, padCardOf, padCardWrites, padKey, padPrefix, type PadCard, type PadSide } from './padModes'
import { TrackpadFineTune } from './TrackpadFineTune'
import { SettingOrigin } from '../SettingOrigin'
import p4 from '../sticks/P4.module.css'
import styles from './Trackpads.module.css'

// Trackpads (console v2, Trackpads.dc.html, TrackpadsMouseArea): one pad at a
// time, chosen on the rail (LT / RT); a one-pad controller (DualSense) gets a
// one-item rail. "Left pad is for…" cards, the pad drawn like the overlay with
// your thumb on it, the rows its mode needs, Touch and Click (D11) and
// Fine-tune. Y is More: While holding…, Touch, Click, touch-stick directions,
// other controllers' inputs.

export type RenderBindingRow = (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; emptyLabel?: string; modeshifts?: boolean; xAction?: { label: string; run: () => void } }) => ReactNode

export type PadConfig = {
  side: PadSide
  card: TouchpadModeCardConfig
  /** The pad's zones (LT1.. / RT1.. / T1..) in grid order. */
  regions: ButtonDefinition[]
  menu?: OverlayMenu
  menuKey: string
  live: LivePadTouch | null
  touch?: ButtonDefinition
  click?: ButtonDefinition
  modeshiftTarget: ModeshiftTarget
  /** Bound inputs this pad doesn't have (a one-pad controller's CAPTURE on a Steam Controller). */
  other?: ButtonDefinition[]
  pressure?: number
  speed?: number
}

export type TrackpadsPageProps = {
  readText: string
  setText?: SetText
  disabled?: boolean
  liveDevice?: TelemetryDevice
  pads: PadConfig[]
  padAspect: number
  selectedRegion: string | null
  onSelectRegion: (command: string) => void
  renderButton: RenderBindingRow
  renderModeshifts: (target: ModeshiftTarget) => ReactNode
  describe: (command: string) => { binding: string; label?: string }
  /** TUP, TDOWN, TLEFT, TRIGHT, TRING: one set shared by every touch stick. */
  stickButtons: ButtonDefinition[]
  onBindTouchStickWasd?: () => void
  warnings: string[]
  accel?: { values: TouchpadAccelValues; link?: string }
  virtualControllerType: string
}

const WHERE_FOUR = ['Top', 'Right', 'Bottom', 'Left']

export function TrackpadsPage(props: TrackpadsPageProps) {
  useInheritedKeys()
  const { readText, setText, pads } = props
  const chosen = useInputSide('touchpad')
  const pad = pads.find(item => item.side === chosen) ?? pads[0]
  const side = pad.side
  const twoPads = pads.length > 1
  const name = side === 'left' ? 'Left pad' : side === 'right' ? 'Right pad' : 'Touchpad'
  const root = useRef<HTMLDivElement>(null)
  const [fineTune, setFineTune] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [holding, setHolding] = useState(false)
  const [directions, setDirections] = useState(false)
  const [others, setOthers] = useState(false)
  // The on-screen picker is up: the row says so in the capsule until it comes back.
  const [drawing, setDrawing] = useState(false)
  useEffect(() => desktopBridge.onMouseAreaPicked(() => setDrawing(false)), [])
  useEffect(() => { if (!drawing) return; const id = window.setTimeout(() => setDrawing(false), 120000); return () => window.clearTimeout(id) }, [drawing])
  useEffect(() => { setFineTune(null) }, [side])
  const request = useFineTuneRequestVersion()
  useEffect(() => {
    const taken = takeFineTuneRequest('touchpad')
    if (!taken) return
    if (taken.group === 'mouse') {
      // Trackpad feel (Home): the first pad set to Mouse, at Glide.
      const mousePad = pads.find(item => padCardOf(readText, item.side) === 'MOUSE')
      if (mousePad && mousePad.side !== 'single') setInputSide('touchpad', mousePad.side)
      setFineTune('glide')
    } else setFineTune(taken.group ?? 'speed')
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  const card = padCardOf(readText, side)
  const P = padPrefix(side)
  const shape = (readWord(readText, padKey.gridShape(side)) || 'RECTANGLE')
  const regions = card === 'ZONES' || card === 'TOUCH_STICK' ? pad.regions : []
  const selected = regions.find(button => button.command.toUpperCase() === props.selectedRegion?.toUpperCase()) ?? regions[0] ?? null
  const selectedIndex = selected ? regions.indexOf(selected) + 1 : 0
  const columns = Math.max(1, pad.card.gridColumns || 1)
  const where = (index: number) => shape === 'FOUR_WAY' ? `${WHERE_FOUR[index - 1] ?? ''} zone`
    : shape === 'EIGHT_WAY' || shape === 'RADIAL' ? `Slice ${index}, clockwise from up` : `Row ${Math.floor((index - 1) / columns) + 1}, column ${((index - 1) % columns) + 1}`
  const stepRegion = () => {
    if (regions.length < 2 || !selected) return
    props.onSelectRegion(regions[selectedIndex % regions.length].command)
    // The row changes under focus (X "Next zone"): the footer re-reads its caption once it has.
    requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('jsm:interaction-hint'))))
  }
  const livePoint = pad.live?.touched ? { x: pad.live.x, y: pad.live.y } : null
  // Touch the pad to jump to the zone under your thumb. A row never changes
  // under focus, though: while a control on this page has focus (the pad is
  // walking the rows) the live point still shows where the thumb is, and the
  // selected zone stays put.
  const lastJump = useRef<string | null>(null)
  useEffect(() => {
    if (!livePoint || !pad.menu || card !== 'ZONES') { lastJump.current = null; return }
    const hit = regions.find((_, index) => index === hitIndex(pad.menu!, livePoint))
    if (!hit || hit.command === lastJump.current) return
    lastJump.current = hit.command
    const active = document.activeElement
    if (active && active !== document.body && root.current?.contains(active)) return
    props.onSelectRegion(hit.command)
  })

  const choose = (value: string) => {
    if (value === card) return
    writeKeys(setText, padCardWrites(readText, side, value as PadCard))
  }
  const options = PAD_CARDS.map(value => ({
    value, label: PAD_CARD_NAMES[value].label, art: <PadCardArt card={value} />,
    caption: value === 'ZONES' && card === 'ZONES' ? `${SHAPE_NAMES[shape] ?? shape} · ${regions.length} zone${regions.length === 1 ? '' : 's'}`
      : value === 'PS_TOUCHPAD' && twoPads ? 'Needs a one-pad controller' : PAD_CARD_NAMES[value].caption,
    unavailable: value === 'PS_TOUCHPAD' && twoPads ? 'PlayStation touchpad passes one pad to a DS4 game; it isn’t available on a two-pad controller.' : undefined,
    skipNavigation: value === 'PS_TOUCHPAD' && twoPads,
  }))
  usePadButton(root, 'Y', () => setMore(true))
  usePadButton(root, 'X', regions.length > 1 ? stepRegion : undefined)
  useFocusCurrentCard(root, side)
  // B on a top-level tab goes to Layout (App), so the footer says so.
  const stepHints = `Y:More;LT/RT:${twoPads ? 'Other pad' : 'Pad'};B:Layout`
  const area = pad.card.mouseArea ?? null
  const fit = pad.card.mouseAreaFit ?? 'STRETCH'
  const areaCursor = card === 'MOUSE_AREA' && livePoint ? mapTouchToArea(toUnit(livePoint.x), toUnit(livePoint.y), area ?? { x: 0, y: 0, w: 1, h: 1 }, fit, props.padAspect, 16 / 9) : null
  const clickShift = pad.click ? modeshiftTriggers(readText, pad.modeshiftTarget).includes(pad.click.command) : false
  // The live chip names the zone under the thumb (hit-tested), not the selected row.
  const hitZone = card === 'ZONES' && livePoint && pad.menu ? regions[hitIndex(pad.menu, livePoint)] ?? null : null
  const hitInfo = hitZone ? props.describe(hitZone.command) : null
  const hitName = hitZone ? (hitInfo?.label || where(regions.indexOf(hitZone) + 1).toLowerCase()) : 'the middle'
  const stickMode = readWord(readText, `${P}TOUCH_STICK_MODE`)

  const touchClickRows = <>
    {pad.touch && <div>{props.renderButton(pad.touch, { label: 'Touch', subtitle: 'Your thumb on the pad', modeshifts: true })}</div>}
    {pad.click && <div>{props.renderButton(pad.click, { label: 'Click', subtitle: 'Pressing the pad in', modeshifts: true })}</div>}
  </>

  let rows: ReactNode
  if (card === 'ZONES') {
    rows = <>
      {selected && <div className={styles.zoneRow}>{props.renderButton(selected, { label: where(selectedIndex), subtitle: `Zone ${selectedIndex} of ${regions.length}`, xAction: regions.length > 1 ? { label: 'Next zone', run: stepRegion } : undefined })}</div>}
      <SwitchRow label="Click required" hint="Zones fire only when you press the pad in" setting={padKey.requiresClick(side)} extraHints={stepHints}
        on={readWord(readText, padKey.requiresClick(side)) === 'ON'} onChange={on => writeKeys(setText, { [padKey.requiresClick(side)]: on ? 'ON' : 'OFF' })}
        onReset={readWord(readText, padKey.requiresClick(side)) ? () => writeKeys(setText, { [padKey.requiresClick(side)]: null }) : undefined} />
      {pad.menu && <OpenRow label="On-screen menu" hint={describeMenuPlacement(pad.menu)} value="Arrange" hints={`A:Arrange;${stepHints}`}
        onOpen={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: pad.menuKey }))} />}
      {touchClickRows}
    </>
  } else if (card === 'MOUSE_AREA') {
    rows = <>
      <OpenRow label="Screen area" hint={`Where the pad lands on screen · ${describeMouseArea(area)}`} value="Draw" hints={`A:Draw on screen;${stepHints}`}
        disabled={drawing ? 'Drawing on screen… Enter keeps it, Esc cancels, Tab moves to the next screen.' : undefined}
        data={{ 'data-setting': `${P}TOUCHPAD_AREA` }} onOpen={() => { if (!pad.card.onPickMouseArea) return; pad.card.onPickMouseArea(); setDrawing(true) }} />
      <SegmentedRow label="Pad fit" hint="How a square pad lies over a wide box" setting={`${P}TOUCHPAD_AREA_FIT`} value={fit} extraHints={stepHints}
        options={MOUSE_AREA_FIT_OPTIONS.map(option => ({ value: option.value, label: option.value === 'STRETCH' ? 'Stretch to fill' : 'Keep pad shape' }))}
        onChange={value => pad.card.onMouseAreaFitChange?.(value)} />
      {pad.click && <OpenRow label="Click zones" hint={clickShift ? 'Zones while the pad is pressed in' : 'Press the pad in to use zones instead'} value={clickShift ? 'Set' : 'None'} hints={`A:Open;${stepHints}`} onOpen={() => setHolding(true)} />}
      {touchClickRows}
    </>
  } else if (card === 'MOUSE') {
    rows = <>
      <ValueRow hero label="Sensitivity" setting={`${P}TOUCHPAD_SENS`} value={readNumber(readText, `${P}TOUCHPAD_SENS`, 1)} min={0} max={10} step={0.05} fineStep={0.01} format={value => `${value.toFixed(2)}×`}
        caption="How far the cursor goes for a swipe across the pad." extraHints={stepHints}
        onChange={value => { const y = readNumber(readText, `${P}TOUCHPAD_SENS`, NaN, 1); writeKeys(setText, { [`${P}TOUCHPAD_SENS`]: Number.isFinite(y) && y !== value ? `${value} ${y}` : value }) }} />
      {pad.click && <OpenRow label="Click zones" hint={clickShift ? 'Zones while the pad is pressed in' : 'Press the pad in to use zones instead'} value={clickShift ? 'Set' : 'None'} hints={`A:Open;${stepHints}`} onOpen={() => setHolding(true)} />}
      {touchClickRows}
    </>
  } else if (card === 'TOUCH_STICK') {
    rows = <>
      <OpenRow label="Dragging acts as" hint="Where you land is the centre; drag to push" value={stickMode ? stickMode.replace(/_/g, ' ').toLowerCase() : 'Directions you bind'} hints={`A:Change;${stepHints}`} onOpen={() => setFineTune('zones:stick')} />
      <OpenRow label="Directions" hint="Up, down, left, right and ring · shared by every touch stick" hints={`A:Open;${stepHints}`} onOpen={() => setDirections(true)} />
      {touchClickRows}
    </>
  } else {
    rows = <>
      {card === 'PS_TOUCHPAD' && props.virtualControllerType !== 'DS4' && <p className={p4.note} data-tone="warn">PlayStation touchpad needs PlayStation output (DS4).</p>}
      {card === 'OFF' && <p className={p4.note}>Touching this pad does nothing. Its touch and click can still be bound.</p>}
      {touchClickRows}
    </>
  }

  return (
    <div ref={root} className={p4.front} id={`trackpad-${side === 'single' ? 'shared' : side}`} data-trackpad-page={side}>
      <InputSideProxies page="touchpad" side={side === 'right' ? 'right' : 'left'} commands={twoPads
        ? { left: ['LEFT_PAD', 'MISC4', 'MISC3', ...pads[0].regions.map(button => button.command)], right: ['RIGHT_PAD', 'TOUCH', 'MISC2', ...(pads[1]?.regions.map(button => button.command) ?? [])] }
        : { left: [], right: [] }}
        reveal={{ ...Object.fromEntries(props.stickButtons.map(button => [button.command, () => setDirections(true)])), ...Object.fromEntries((pad.other ?? []).map(button => [button.command, () => setOthers(true)])) }} />
      {props.warnings.length > 0 && <div className={p4.notice} data-tone="warn" role="status"><span>{props.warnings.join(' ')}</span></div>}
      <header className={p4.frontHeading}>
        <h1>{name} is for…</h1>
        <SettingOrigin setting={`${P}TOUCHPAD_MODE`} />
        <span>Changes apply live.</span>
      </header>
      <ModeCards columns={6} value={card} onChange={choose} options={options} hints={stepHints} className={styles.cards} />
      <div className={p4.frontLower} data-pad="true">
        <div className={styles.padVisual} data-pad-visual="" data-input-command={side === 'left' ? 'LEFT_PAD' : side === 'right' ? 'RIGHT_PAD' : undefined}>
          {/* A touch stick draws its ring, not the zones it is built on. */}
          {card === 'ZONES' && pad.menu
            ? <div className={styles.padArt} style={{ width: Math.min(320, 300 * Math.max(1, props.padAspect)) }}><MenuPreview menu={pad.menu} aspect={props.padAspect} fill selectedCommand={selected?.command ?? null} onSelect={props.onSelectRegion} livePoint={livePoint} managedFocus /></div>
            : card === 'MOUSE_AREA'
              ? <div className={styles.padArt}><ScreenAreaPreview area={area} fit={fit} padAspect={props.padAspect} width={360} cursor={areaCursor} /><p>{name} is this box · cursor follows your thumb</p></div>
              : <PadSurface live={livePoint} card={card} aspect={props.padAspect} />}
          <p className={styles.padLive}>{livePoint ? <><span className={p4.liveChip}>● {card === 'ZONES' ? `thumb on ${hitName}` : card === 'TOUCH_STICK' ? 'dragging' : 'touching'}</span></> : <span>{card === 'ZONES' && (shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' || shape === 'RADIAL') ? 'Middle ring presses nothing' : 'Touch the pad to try it'}</span>}</p>
        </div>
        <div className={p4.frontRows}>
          {rows}
          <OpenRow label="Fine-tune" hint={card === 'ZONES' ? 'Zone shape, centre dead zone, touch and click, touch stick, feel' : card === 'MOUSE_AREA' ? 'Touch and click, click damping, lift-off, feel' : card === 'MOUSE' ? 'Speed and curve, glide, click, feel' : 'Touch and click, touch stick, feel'}
            value="Open" hints={`A:Open;${stepHints}`} data={{ 'data-trackpad-fine-tune': side }} onOpen={() => setFineTune(card === 'MOUSE' ? 'speed' : card === 'MOUSE_AREA' ? 'area' : card === 'TOUCH_STICK' ? 'zones:stick' : 'zones')} />
        </div>
      </div>

      <MoreMenu open={more} onClose={() => setMore(false)} eyebrow={`Trackpads · ${name}`} title="More"
        items={[
          { id: 'holding', label: 'Mode shift', hint: 'Hold another button to change this pad (click zones too)', onSelect: () => setHolding(true) },
          ...(pad.touch ? [{ id: 'touch', label: 'Touch', hint: 'Your thumb on the pad', value: props.describe(pad.touch.command).binding || 'Unbound', onSelect: () => setFineTune('more') }] : []),
          ...(pad.click ? [{ id: 'click', label: 'Click', hint: 'Pressing the pad in', value: props.describe(pad.click.command).binding || 'Unbound', onSelect: () => setFineTune('more') }] : []),
          { id: 'directions', label: 'Touch-stick directions', hint: 'Up, down, left, right and ring, shared by every touch stick', onSelect: () => setDirections(true) },
          ...(pad.other?.length ? [{ id: 'other', label: 'Other controller types', hint: `${pad.other.length} bindings for inputs this pad doesn’t have`, onSelect: () => setOthers(true) }] : []),
          { id: 'fine-tune', label: 'Fine-tune', hint: 'Speed, glide, zones, click, feel', onSelect: () => setFineTune(card === 'MOUSE' ? 'speed' : 'zones') },
        ]} />
      <WhileHoldingPage open={holding} onClose={() => setHolding(false)} trail={['Trackpads', name]}>{props.renderModeshifts(pad.modeshiftTarget)}</WhileHoldingPage>
      <SubPage open={directions} onClose={() => setDirections(false)} trail={['Trackpads', name]} title="Touch-stick directions" backLabel="Back to Trackpads">
        <div className={p4.whileHolding} data-touch-stick-directions="">
          <p className={p4.lede}>Shared by every touch stick.</p>
          {props.stickButtons.map(button => <div key={button.command}>{props.renderButton(button)}</div>)}
          {props.onBindTouchStickWasd && <OpenRow label="Bind to W A S D" hint="Points up, left, down and right at W, A, S and D" onOpen={props.onBindTouchStickWasd} />}
        </div>
      </SubPage>
      <SubPage open={others} onClose={() => setOthers(false)} trail={['Trackpads', name]} title="Other controller types" backLabel="Back to Trackpads">
        <div className={p4.whileHolding}>
          <p className={p4.lede}>This click belongs to single-pad controllers. It is kept in this configuration but does not fire on the connected Steam Controller.</p>
          {pad.other?.map(button => <div key={button.command}>{props.renderButton(button, { modeshifts: true })}</div>)}
        </div>
      </SubPage>
      {fineTune !== null && <TrackpadFineTune page={props} pad={pad} name={name} group={fineTune} onGroup={setFineTune} onClose={() => setFineTune(null)}
        onDirections={() => setDirections(true)} onHolding={() => setHolding(true)} onOthers={() => setOthers(true)} selected={selected} stepRegion={stepRegion} />}
    </div>
  )
}

/** Which zone a touch lands in, by the overlay's own hit test. */
const hitIndex = (menu: OverlayMenu, point: { x: number; y: number }) => hitTestRegion(menu, point.x, point.y)

/** A pad with no zones drawn: the surface and your thumb on it. */
function PadSurface({ live, card, aspect }: { live: { x: number; y: number } | null; card: PadCard; aspect: number }) {
  const w = 220 * Math.min(1.4, Math.max(0.7, aspect))
  return (
    <svg viewBox={`0 0 ${w + 20} 240`} className={styles.surface} role="img" aria-label={live ? 'Thumb on the pad' : 'Pad'}>
      <rect x="10" y="10" width={w} height="220" rx="18" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" />
      {card === 'TOUCH_STICK' && <circle cx={10 + w / 2} cy="120" r="60" fill="none" stroke="#aebbc8" strokeDasharray="4 4" />}
      {card === 'OFF' && <path d={`M40 200 L${w - 20} 40`} stroke="#aebbc8" strokeWidth="2" />}
      {live && <circle cx={10 + w / 2 + live.x * (w / 2)} cy={120 + live.y * 110} r="9" fill="#a6d65a" stroke="#e3eaf1" strokeWidth="2" />}
    </svg>
  )
}
