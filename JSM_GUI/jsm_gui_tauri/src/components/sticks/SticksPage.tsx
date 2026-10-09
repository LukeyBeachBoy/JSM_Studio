import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ButtonDefinition } from '../../keymap/schema'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import type { ModeshiftTarget } from '../../utils/modeshift'
import type { OverlayMenu } from '../../utils/overlayLayout'
import { namedMenuOverlay } from '../../utils/namedMenuOverlay'
import { isDirectStickMenu, stickMenuLinks } from '../../utils/stickMenus'
import type { StickMenuConfig } from '../keymap/StickMenuCard'
import { WheelChooser } from './WheelChooser'
import { MenuPreview } from '../keymap/MenuPreview'
import { ModeCards, OpenRow, SubPage, ValueRow } from '../ui/console'
import type { VirtualStickTarget } from '../../utils/virtualStickSettings'
import { InputSideProxies, MoreMenu, readWord, useFocusCurrentCard, useInheritedKeys, usePadButton, WhileHoldingPage, writeKey, type SetText } from './shared'
import { peekModeshiftRequest, takeFineTuneRequest, useFineTuneRequestVersion, useInputSide, useModeshiftRequestVersion } from './inputSide'
import { MORE_MODES, StickCardArt, moreModeOf, stickCardOf, stickModeName, type StickCard } from './stickModes'
import { StickAdvanced, StickFineTune, StickMoreModes } from './StickFineTune'
import { stickDeadzones, type StickCtx } from './stickGroups'
import { MatchFullTurn } from './MatchFullTurn'
import { GameStickMatchGuide } from './GameStickMatchGuide'
import { StickDiagram } from './visuals'
import { SettingOrigin } from '../SettingOrigin'
import styles from './P4.module.css'

// Sticks (console v2, Sticks.dc.html): one stick at a time, chosen on the rail
// (LT / RT). "Left stick is for…" picture cards, the stick drawn live, Ignore
// small movement, Push in (L3) and Fine-tune. Y is More: Change keys, Mode
// shift (D11), the stick's touch and ring bindings, Bind to WASD.

type RenderRow = StickCtx['renderButton']

export type StickInputs = { directions: ButtonDefinition[]; click?: ButtonDefinition; ring?: ButtonDefinition; touch?: ButtonDefinition; rotation: ButtonDefinition[] }

export type SticksPageProps = {
  readText: string
  setText?: SetText
  disabled?: boolean
  liveDevice?: TelemetryDevice
  /** Writes LEFT_/RIGHT_STICK_MODE, letting go of a menu attached to the stick first. */
  onModeChange: (side: 'LEFT' | 'RIGHT', value: string) => void
  inputs: Record<'left' | 'right', StickInputs>
  renderButton: RenderRow
  renderModeshifts: (target: ModeshiftTarget) => ReactNode
  modeshiftTarget: (side: 'left' | 'right') => ModeshiftTarget
  describe: (command: string) => { binding: string; label?: string }
  wheelMenus: Record<'left' | 'right', OverlayMenu | undefined>
  wheelSegments: Record<'left' | 'right', ButtonDefinition[]>
  virtualControllerType: string
  onVirtualControllerTypeChange?: (value: 'XBOX' | 'DS4') => void
  onBindWasd?: (side: 'left' | 'right') => void
}

const CARD_ORDER: StickCard[] = ['MOVING', 'LOOK', 'FLICK', 'WHEEL', 'GAMEPAD']
const CARD_TEXT: Record<StickCard, { label: string; caption: string }> = {
  MOVING: { label: 'Moving', caption: 'Sends W A S D' },
  LOOK: { label: 'Looking around', caption: 'Moves the mouse' },
  FLICK: { label: 'Flick to turn', caption: 'Point to face that way' },
  WHEEL: { label: 'Picking from a wheel', caption: 'Up to 8 slices' },
  GAMEPAD: { label: 'Gamepad stick', caption: 'For games with pad support' },
  MORE: { label: 'More', caption: '' },
}
const FINE_TUNE_HINT: Record<StickCard, string> = {
  MOVING: 'Walk on a light push, outer edge, diagonals, touch',
  LOOK: 'Speed, speed-up, dead zone, mouse-like feel, direction',
  FLICK: 'Flick time, snap, turning output, dead zone, direction',
  WHEEL: 'Slices, push before a slice is picked, on-screen wheel',
  GAMEPAD: 'Match the game, dead zone, direction',
  MORE: 'This mode’s own values, dead zone, direction',
}

export function SticksPage(props: SticksPageProps) {
  useInheritedKeys()
  const { readText, setText, liveDevice } = props
  const side = useInputSide('joysticks')
  const SIDE = side === 'left' ? 'LEFT' : 'RIGHT'
  const name = side === 'left' ? 'Left stick' : 'Right stick'
  const root = useRef<HTMLDivElement>(null)
  const [fineTune, setFineTune] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [moreModes, setMoreModes] = useState(false)
  const [holding, setHolding] = useState(false)
  const [directions, setDirections] = useState(false)
  const [slices, setSlices] = useState(false)
  const [matchTurn, setMatchTurn] = useState(false)
  const [gameStick, setGameStick] = useState<VirtualStickTarget | null>(null)
  const [chooseMenu, setChooseMenu] = useState(false)
  useEffect(() => { setFineTune(null); setAdvanced(null); setMoreModes(false) }, [side])
  const request = useFineTuneRequestVersion()
  useEffect(() => { const taken = takeFineTuneRequest('joysticks'); if (taken) setFineTune(taken.group ?? '') }, [request])
  // A chord's "Also shifts" or a stick mode shift chip: open Mode shift; its list opens the editor.
  const shiftRequest = useModeshiftRequestVersion()
  useEffect(() => { if (peekModeshiftRequest('joysticks', side)) setHolding(true) }, [shiftRequest, side])

  const mode = readWord(readText, `${SIDE}_STICK_MODE`) || 'NO_MOUSE'
  const live = liveDevice?.status ? (side === 'left' ? liveDevice.status.leftStick : liveDevice.status.rightStick) : null
  const menuConfig: StickMenuConfig | undefined = setText ? { text: readText, onChange: setText } : undefined
  const reservedLink = stickMenuLinks(readText, side).find(link => isDirectStickMenu(link.attachment))
  const reserved = reservedLink ? { id: reservedLink.menu.id, name: reservedLink.menu.name } : undefined
  const inputs = props.inputs[side]
  const ctx: StickCtx = {
    side, SIDE, name, text: readText, setText, disabled: props.disabled, mode, live,
    // Moving is written as NO_MOUSE, not by deleting the line: a configuration that
    // includes a base, or a layout for one controller, would otherwise hand the
    // base's mode straight back when Moving is chosen.
    onModeChange: value => props.onModeChange(SIDE, value),
    renderButton: props.renderButton, describe: props.describe,
    buttons: { directions: inputs.directions, click: inputs.click, ring: inputs.ring, touch: inputs.touch },
    wheel: { menu: reservedLink ? namedMenuOverlay(reservedLink.menu) : props.wheelMenus[side], segments: props.wheelSegments[side], menuConfig, reserved },
    virtualControllerType: props.virtualControllerType, onVirtualControllerTypeChange: props.onVirtualControllerTypeChange,
    open: {
      advanced: part => setAdvanced(part), matchFullTurn: () => setMatchTurn(true), gameStick: target => setGameStick(target),
      directions: () => setDirections(true), slices: () => setSlices(true),
    },
    onBindWasd: props.onBindWasd ? () => props.onBindWasd?.(side) : undefined,
  }
  const card: StickCard = reserved ? 'WHEEL' : stickCardOf(mode)
  const { inner, outer, scope } = stickDeadzones(readText, SIDE)
  const innerKey = scope === 'side' ? `${SIDE}_STICK_DEADZONE_INNER` : 'STICK_DEADZONE_INNER'

  const choose = (value: string) => {
    const next = value as StickCard
    if (next === card && next !== 'WHEEL') return
    if (next === 'MOVING') ctx.onModeChange('NO_MOUSE')
    else if (next === 'LOOK') ctx.onModeChange(mode === 'HYBRID_AIM' ? mode : 'AIM')
    else if (next === 'FLICK') ctx.onModeChange(stickCardOf(mode) === 'FLICK' ? mode : 'FLICK')
    else if (next === 'GAMEPAD') ctx.onModeChange(mode === 'LEFT_STICK' || mode === 'RIGHT_STICK' ? mode : side === 'left' ? 'LEFT_STICK' : 'RIGHT_STICK')
    else if (next === 'WHEEL') { if (mode === 'RADIAL_MENU' || reserved) setFineTune('wheel'); else if (menuConfig) setChooseMenu(true); else ctx.onModeChange('RADIAL_MENU') }
  }
  const moreEntry = moreModeOf(mode)
  // Y is More on every row (console v2); B on a top-level tab goes to Layout (App), so the footer says so.
  const stepHints = 'Y:More;LT/RT:Other stick;B:Layout'

  usePadButton(root, 'Y', () => setMore(true))
  useFocusCurrentCard(root, side)
  const push = live ? Math.hypot(live.x, live.y) : 0
  const clickInfo = inputs.click ? props.describe(inputs.click.command) : null

  return (
    <div ref={root} className={styles.front} id={`mapping-section-${side}Stick`} data-stick-page={side}>
      <InputSideProxies page="joysticks" side={side} commands={{ left: ['L3', 'LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING', 'LTOUCH'], right: ['R3', 'RUP', 'RDOWN', 'RLEFT', 'RRIGHT', 'RRING', 'RTOUCH'] }}
        reveal={{
          ...Object.fromEntries(inputs.directions.map(button => [button.command, () => setDirections(true)])),
          ...(inputs.ring ? { [inputs.ring.command]: () => setFineTune('deadzone') } : {}),
          ...(inputs.touch ? { [inputs.touch.command]: () => setFineTune('touch') } : {}),
          ...Object.fromEntries(props.wheelSegments[side].map(button => [button.command, () => setSlices(true)])),
        }} />
      <header className={styles.frontHeading}>
        <h1>{name} is for…</h1>
        {/* Where the mode comes from: a base, this mode, or this file. */}
        <SettingOrigin setting={`${SIDE}_STICK_MODE`} />
        <span>Changes apply live.</span>
      </header>
      <ModeCards columns={6} value={card} onChange={choose} hints={stepHints}
        options={CARD_ORDER.map(value => ({ value, label: CARD_TEXT[value].label, art: <StickCardArt card={value} />,
          // A card keeps its own caption when current; only a variant of it (Aim + flick under Looking around) says which.
          caption: value === 'WHEEL' && reserved ? `Menu · ${reserved.name}` : value === 'WHEEL' && card === 'WHEEL' ? `${props.wheelSegments[side].length || 8} slices`
            : value === card && card !== 'MOVING' && stickModeName(mode) !== CARD_TEXT[value].label ? stickModeName(mode) : CARD_TEXT[value].caption }))}
        more={{ label: moreEntry ? stickModeName(mode) : 'More', caption: moreEntry ? `In use · ${MORE_MODES.length - 1} more` : `${MORE_MODES.length} modes · mouse ring, scroll wheel, steering…`,
          count: moreEntry ? MORE_MODES.length - 1 : MORE_MODES.length, current: card === 'MORE', onOpen: () => setMoreModes(true) }} />
      <div className={styles.frontLower}>
        <div className={styles.stickPanel}>
          {card === 'WHEEL' && ctx.wheel.menu
            ? <MenuPreview menu={ctx.wheel.menu} aspect={1} fill livePoint={live && push > 0.02 ? { x: live.x, y: -live.y } : null} />
            : <StickDiagram live={live} inner={inner} outer={outer} />}
          {card === 'WHEEL' && ctx.wheel.menu ? <div className={styles.stickLegend}><span>Point to light a slice</span></div> : <div className={styles.stickLegend}><span>Inner ring · ignored</span><span>Dashed · full speed</span></div>}
        </div>
        <div className={styles.frontRows}>
          {reserved && <OpenRow label={`Reserved for menu · ${reserved.name}`} hint="The stick picks from the menu; it doesn’t move or look around while the menu has it." value="Edit menu"
            hints={`A:Edit menu;${stepHints}`} onOpen={() => window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: reserved.id }))} />}
          <ValueRow hero label="Ignore small movement" setting={innerKey} value={Math.round(inner * 100)} min={0} max={90} step={1} fineStep={0.1} format={value => `${value}%`}
            caption={card === 'WHEEL' ? 'Push this far before a slice is picked.' : card === 'LOOK' || card === 'FLICK' ? 'Raise it if the view creeps when you let go.' : 'Raise it if your character drifts when you let go.'} extraHints={stepHints}
            onChange={value => writeKey(setText, innerKey, Number((value / 100).toFixed(4)))} onReset={() => writeKey(setText, innerKey, null)} />
          {inputs.click && props.renderButton(inputs.click, { label: `Push in (${side === 'left' ? 'L3' : 'R3'})`, subtitle: clickInfo?.label ?? 'What clicking the stick does' })}
          <OpenRow label="Fine-tune" hint={FINE_TUNE_HINT[card]} value="Open" hints={`A:Open;${stepHints}`} data={{ 'data-stick-fine-tune-row': side }} onOpen={() => setFineTune('')} />
        </div>
      </div>

      {/* The wheel card's chooser: a new wheel (opens in Menus) or one the configuration already has. */}
      {setText && chooseMenu && <WheelChooser open side={side} text={readText} setText={setText} onClose={() => setChooseMenu(false)} legacy={mode === 'RADIAL_MENU' && !reserved} />}
      <MoreMenu open={more} onClose={() => setMore(false)} eyebrow={`Sticks · ${name}`} title="More"
        items={[
          ...(inputs.directions.length ? [{ id: 'keys', label: 'Change keys', hint: 'What up, left, down and right send', onSelect: () => setDirections(true) }] : []),
          ...(props.onBindWasd && inputs.directions.length ? [{ id: 'wasd', label: 'Bind to W A S D', hint: 'Points the four directions at W, A, S and D', onSelect: () => props.onBindWasd?.(side) }] : []),
          { id: 'holding', label: 'Mode shift', hint: 'Hold another button to change this stick', onSelect: () => setHolding(true) },
          ...(inputs.ring ? [{ id: 'ring', label: 'Ring action', hint: 'A binding held on a light or full push', value: props.describe(inputs.ring.command).binding || 'Unbound', onSelect: () => setFineTune('deadzone') }] : []),
          ...(inputs.touch ? [{ id: 'touch', label: 'Touch', hint: 'Resting your thumb on the stick', value: props.describe(inputs.touch.command).binding || 'Unbound', onSelect: () => setFineTune('touch') }] : []),
          { id: 'more-modes', label: 'Other stick modes', hint: `${MORE_MODES.length} modes · mouse ring, scroll wheel, walk/run rings, steering…`, onSelect: () => setMoreModes(true) },
          { id: 'fine-tune', label: 'Fine-tune', hint: FINE_TUNE_HINT[card], onSelect: () => setFineTune('') },
        ]} />
      <WhileHoldingPage open={holding} onClose={() => setHolding(false)} trail={['Sticks', name]}>{props.renderModeshifts(props.modeshiftTarget(side))}</WhileHoldingPage>
      <SubPage open={directions} onClose={() => setDirections(false)} trail={['Sticks', name]} title="Directions" backLabel="Back to Sticks">
        <div className={styles.whileHolding}>
          {inputs.directions.length === 0 && <p className={styles.lede}>This stick’s mode doesn’t send up, left, down and right.</p>}
          {inputs.directions.map(button => <div key={button.command}>{props.renderButton(button)}</div>)}
          {props.onBindWasd && inputs.directions.length > 0 && <OpenRow label="Bind to W A S D" hint="Points up, left, down and right at W, A, S and D" onOpen={() => props.onBindWasd?.(side)} />}
        </div>
      </SubPage>
      <SubPage open={slices} onClose={() => setSlices(false)} trail={['Sticks', name, 'Fine-tune']} title="What each slice does" backLabel="Back to Fine-tune">
        <div className={styles.whileHolding}>
          {props.wheelSegments[side].map((button, index) => { const info = props.describe(button.command); return <div key={button.command}>{props.renderButton(button, { label: `Slice ${index + 1}${info.label ? ` · ${info.label}` : ''}` })}</div> })}
        </div>
      </SubPage>
      {fineTune !== null && <StickFineTune ctx={ctx} group={fineTune || null} onGroup={setFineTune} onClose={() => setFineTune(null)} rotationButtons={inputs.rotation} />}
      <StickAdvanced ctx={ctx} open={advanced !== null} part={advanced ?? 'curve'} onPart={setAdvanced} onClose={() => setAdvanced(null)} />
      {moreModes && <StickMoreModes ctx={ctx} open onClose={() => setMoreModes(false)} rotationButtons={inputs.rotation} />}
      <MatchFullTurn open={matchTurn} onClose={() => setMatchTurn(false)} text={readText} setText={setText} trail={['Sticks', name]} />
      {gameStick && <GameStickMatchGuide open onClose={() => setGameStick(null)} text={readText} setText={setText} target={gameStick} trail={['Sticks', name, 'Fine-tune']} live={push} />}
    </div>
  )
}
