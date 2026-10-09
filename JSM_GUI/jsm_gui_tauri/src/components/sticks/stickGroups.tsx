import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ButtonDefinition } from '../../keymap/schema'
import type { OverlayMenu } from '../../utils/overlayLayout'
import { hitTestRegion } from '../../utils/overlayLayout'
import type { FineTuneGroup } from '../ui/console'
import { ModeCards, OpenRow, SegmentedRow, ValueRow } from '../ui/console'
import { SummaryRow } from '../ui/SummaryRow'
import { MenuPreview } from '../keymap/MenuPreview'
import type { StickMenuConfig } from '../keymap/StickMenuCard'
import { connectStickMenu } from '../../utils/stickMenus'
import { readVirtualMenus, writeVirtualMenus } from '../../utils/virtualMenus'
import { updateKeymapEntry } from '../../utils/keymap'
import { describeMenuPlacement } from '../../utils/menuDescriptions'
import { getKeymapValue } from '../../utils/keymap'
import { MODE_NUMBERS, readModeNumber, writeModeNumber } from '../../utils/sourceModeSettings'
import { readVirtualSetting, VIRTUAL_STICK_FIELDS, virtualStickValues, writeVirtualSetting, writeVirtualStickNumber, type VirtualStickTarget } from '../../utils/virtualStickSettings'
import { isSet, Note, readNumber, readWord, SubHead, VisualPanel, writeChoice, writeKey, writeKeys, type SetText } from './shared'
import { FLICK_EXPONENT_PRESETS, NO_SPEEDUP_CAP, STICK_POWER_PRESETS, STICK_SPEEDUP_PRESETS, UNPOWER_PRESETS, near } from './presets'
import { FlickCompass, GameCurve, HybridWedge, MouseRingScreen, SpeedCurve, SpeedUpChart, StickDiagram, StickPanel, DeadZoneBar, aimSpeed } from './visuals'
import type { StickSide } from './stickModes'
import styles from './P4.module.css'

// The Fine-tune groups of a stick (console v2: StickFineTuneAim, StickSpeedUp,
// StickDeadZone, StickHybridAim, StickFineTuneFlick, StickFlickSnap,
// StickFlickOutput, StickGamepadOutput, StickFineTuneOther, StickSmallModes).
// Every group is data the screens assemble per mode: StickFineTune for the
// stick's own mode, StickMoreModes for the More list.

type RenderRow = (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; emptyLabel?: string; modeshifts?: boolean; xAction?: { label: string; run: () => void } }) => ReactNode

export type StickCtx = {
  side: StickSide
  SIDE: 'LEFT' | 'RIGHT'
  name: string
  text: string
  setText?: SetText
  disabled?: boolean
  mode: string
  live: { x: number; y: number } | null
  onModeChange: (value: string) => void
  renderButton: RenderRow
  describe: (command: string) => { binding: string; label?: string }
  buttons: { directions: ButtonDefinition[]; click?: ButtonDefinition; ring?: ButtonDefinition; touch?: ButtonDefinition }
  wheel: { menu?: OverlayMenu; segments: ButtonDefinition[]; menuConfig?: StickMenuConfig; reserved?: { id: string; name: string } }
  virtualControllerType: string
  onVirtualControllerTypeChange?: (value: 'XBOX' | 'DS4') => void
  open: { advanced: (part: 'curve' | 'smoothing') => void; matchFullTurn: () => void; gameStick: (target: VirtualStickTarget) => void; directions: () => void; slices: () => void }
  onBindWasd?: () => void
}

const tryIt = { label: 'Try it', run: () => window.dispatchEvent(new Event('jsm:start-test')) }
const sensPair = (text: string) => { const raw = (getKeymapValue(text, 'STICK_SENS') ?? '').trim().split(/\s+/).map(part => Number.parseFloat(part)); const x = Number.isFinite(raw[0]) ? raw[0] : 360; return { x, y: Number.isFinite(raw[1]) ? raw[1] : x, own: Number.isFinite(raw[1]) && raw[1] !== x } }

/** The dead zones in force for a stick: its own keys, else the shared ones, else JSM's 0.15 / 0.10. */
export function stickDeadzones(text: string, SIDE: 'LEFT' | 'RIGHT') {
  const own = isSet(text, `${SIDE}_STICK_DEADZONE_INNER`, `${SIDE}_STICK_DEADZONE_OUTER`)
  const shared = (key: 'INNER' | 'OUTER', fallback: number) => readNumber(text, `STICK_DEADZONE_${key}`, fallback)
  return {
    inner: readNumber(text, `${SIDE}_STICK_DEADZONE_INNER`, shared('INNER', 0.15)),
    outer: readNumber(text, `${SIDE}_STICK_DEADZONE_OUTER`, shared('OUTER', 0.1)),
    scope: own ? 'side' as const : 'both' as const,
  }
}

const vcWarning = (ctx: StickCtx, what: string) => ctx.virtualControllerType === 'NONE' && (
  <div className={styles.notice} data-tone="warn" role="status">
    <span>{what} needs Xbox or PlayStation output. Until it is on, nothing reaches the game.</span>
    {ctx.onVirtualControllerTypeChange && <OpenRow label="Turn on Xbox output" hint="Controller output for this configuration" onOpen={() => ctx.onVirtualControllerTypeChange?.('XBOX')} />}
  </div>
)

// ---------------------------------------------------------------- Speed
export function speedGroup(ctx: StickCtx): FineTuneGroup {
  const sens = sensPair(ctx.text)
  const power = readNumber(ctx.text, 'STICK_POWER', 1)
  const preset = STICK_POWER_PRESETS.find(item => near(item.power, power))
  const { inner, outer } = stickDeadzones(ctx.text, ctx.SIDE)
  const push = ctx.live ? Math.min(1, Math.hypot(ctx.live.x, ctx.live.y)) : 0
  const writeSens = (x: number, y?: number) => writeKey(ctx.setText, 'STICK_SENS', y === undefined || y === x ? x : [x, y])
  return {
    id: 'speed', label: 'Speed', title: 'Speed', description: 'How fast the view turns, and how a push becomes speed.',
    status: isSet(ctx.text, 'STICK_SENS', 'STICK_POWER') ? `Changed: ${sens.x}°/s${preset ? ` · ${preset.label}` : ' · custom curve'}` : `Default · ${sens.x}°/s`, changed: isSet(ctx.text, 'STICK_SENS', 'STICK_POWER'),
    content: <>
      <ValueRow hero label="Turn speed" setting="STICK_SENS" value={sens.x} min={0} max={1200} step={30} fineStep={1} format={value => `${value}°/s`}
        caption={`A full push turns you ${sens.x}° every second.`} onX={tryIt}
        onChange={value => writeSens(value, sens.own ? sens.y : undefined)} onReset={() => writeKey(ctx.setText, 'STICK_SENS', null)} />
      <SegmentedRow label="How a push becomes speed" setting="STICK_POWER" value={preset?.value ?? 'custom'} onX={tryIt}
        options={[...STICK_POWER_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'custom', label: 'Custom', caption: `Custom curve number ${power}: set it under Advanced.` }]}
        onChange={value => { const found = STICK_POWER_PRESETS.find(item => item.value === value); if (found) writeChoice(ctx.setText, { STICK_POWER: found.power === 1 ? null : found.power }, { STICK_POWER: 1 }); else ctx.open.advanced('curve') }}
        onReset={() => writeKey(ctx.setText, 'STICK_POWER', null)} />
      <SummaryRow label="Up and down speed" hint={sens.own ? 'Its own speed' : 'Same as left/right'} setting="STICK_SENS"
        toggle={{ on: sens.own, onChange: on => writeSens(sens.x, on ? Math.round(sens.x * 0.75) : undefined) }} />
      {sens.own && <ValueRow label="Up and down" setting="STICK_SENS" value={sens.y} min={0} max={1200} step={30} fineStep={1} format={value => `${value}°/s`}
        onChange={value => writeSens(sens.x, value)} onReset={() => writeSens(sens.x)} />}
      <OpenRow label="Advanced" hint="Exact curve number, Match a full turn (360°)" onOpen={() => ctx.open.advanced('curve')} />
    </>,
    visual: <VisualPanel title="How a push becomes turning" chip={ctx.live ? `live ${Math.round(aimSpeed(push, inner, outer, power, sens.x))} °/s` : 'no controller'}
      caption="Dashed: Quick start and Precise centre."
      legend={[{ mark: <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="var(--accent)" /></svg>, label: 'Inner ring', detail: `Ignored · ${Math.round(inner * 100)}%` },
        { mark: <svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="none" stroke="var(--accent)" strokeDasharray="3 3" /></svg>, label: 'Outer ring', detail: `Full speed past ${Math.round((1 - outer) * 100)}%` },
        { mark: <svg width="18" height="18"><circle cx="9" cy="9" r="4.5" fill="#a6d65a" /></svg>, label: 'Your stick now', detail: `${Math.round(push * 100)}% push` }]}>
      <SpeedCurve inner={inner} outer={outer} power={power} sens={sens.x} push={push} alternatives={STICK_POWER_PRESETS.map(item => ({ label: item.label, power: item.power }))} />
    </VisualPanel>,
  }
}

// ---------------------------------------------------------------- Speed-up
/** Seconds the stick has been held at full tilt, from telemetry. */
function useHeldSeconds(push: number, full: number) {
  const since = useRef<number | null>(null)
  const [, tick] = useState(0)
  const atFull = push >= full
  if (atFull && since.current === null) since.current = performance.now()
  if (!atFull) since.current = null
  useEffect(() => { if (!atFull) return; const id = window.setInterval(() => tick(value => value + 1), 100); return () => window.clearInterval(id) }, [atFull])
  return since.current === null ? 0 : (performance.now() - since.current) / 1000
}

function SpeedUpVisual({ ctx, rate, cap }: { ctx: StickCtx; rate: number; cap: number }) {
  const sens = sensPair(ctx.text).x
  const { outer } = stickDeadzones(ctx.text, ctx.SIDE)
  const push = ctx.live ? Math.hypot(ctx.live.x, ctx.live.y) : 0
  const held = useHeldSeconds(push, 1 - outer - 0.01)
  const now = sens * Math.min(cap, 1 + rate * held)
  const topAt = rate > 0 && cap < NO_SPEEDUP_CAP ? (cap - 1) / rate : null
  return (
    <VisualPanel title="Speed while you hold full tilt" chip={`${held.toFixed(1)} s · ${Math.round(now)} °/s`}
      caption="Seconds held at full tilt, left to right. Hold the stick out to watch the dot climb."
      legend={[{ mark: '◷', label: 'Held at full tilt', detail: `${held.toFixed(1)} s` }, ...(topAt !== null ? [{ mark: '▲', label: 'At top speed', detail: held >= topAt ? `since ${topAt.toFixed(1)} s` : `from ${topAt.toFixed(1)} s` }] : [])]}>
      <SpeedUpChart sens={sens} rate={rate} cap={cap} held={held} presets={STICK_SPEEDUP_PRESETS.filter(item => item.rate > 0).map(item => ({ label: `${item.label} · ${item.cap}×`, rate: item.rate, cap: item.cap }))} />
    </VisualPanel>
  )
}

export function speedUpGroup(ctx: StickCtx): FineTuneGroup {
  const rate = readNumber(ctx.text, 'STICK_ACCELERATION_RATE', 0)
  const cap = readNumber(ctx.text, 'STICK_ACCELERATION_CAP', NO_SPEEDUP_CAP)
  const sens = sensPair(ctx.text).x
  const preset = STICK_SPEEDUP_PRESETS.find(item => near(item.rate, rate) && (item.rate === 0 || near(item.cap, cap)))
  const capShown = cap >= NO_SPEEDUP_CAP ? 11 : Math.min(10, cap)
  return {
    id: 'speedup', label: 'Speed-up', title: 'Speed-up', description: 'Hold the stick all the way out and the turn keeps getting faster.',
    status: rate <= 0 ? 'Off' : `Changed: ${preset?.label ?? 'Custom'} · up to ${cap >= NO_SPEEDUP_CAP ? 'no limit' : `${cap}×`}`, changed: isSet(ctx.text, 'STICK_ACCELERATION_RATE', 'STICK_ACCELERATION_CAP'),
    content: <>
      <SegmentedRow label="How much" hint="Only builds while the stick is pushed fully." setting="STICK_ACCELERATION_RATE" value={preset?.value ?? 'custom'}
        options={[...STICK_SPEEDUP_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'custom', label: 'Custom', caption: 'Custom: set how fast it builds and the top speed below.' }]}
        onChange={value => { const found = STICK_SPEEDUP_PRESETS.find(item => item.value === value); if (found) writeChoice(ctx.setText, { STICK_ACCELERATION_RATE: found.rate || null, STICK_ACCELERATION_CAP: found.rate ? found.cap : null }, { STICK_ACCELERATION_RATE: 0, STICK_ACCELERATION_CAP: NO_SPEEDUP_CAP }) }}
        onReset={() => writeKeys(ctx.setText, { STICK_ACCELERATION_RATE: null, STICK_ACCELERATION_CAP: null })} onX={tryIt} />
      <ValueRow hero label="How fast it builds" setting="STICK_ACCELERATION_RATE" value={rate} min={0} max={10} step={0.1} fineStep={0.01} format={value => `${value.toFixed(1)}× / s`}
        caption={`Adds another ${sens}°/s for every second you hold full tilt. Default is off (0).`}
        onChange={value => writeKey(ctx.setText, 'STICK_ACCELERATION_RATE', value || null)} onReset={() => writeKey(ctx.setText, 'STICK_ACCELERATION_RATE', null)} onX={tryIt} />
      <ValueRow label="Top speed" hint="Stops building here. Default: no limit" setting="STICK_ACCELERATION_CAP" value={capShown} min={1} max={11} step={0.5} fineStep={0.1}
        format={value => value >= 11 ? 'No limit' : `${value}× · ${Math.round(value * sens)}°/s`}
        onChange={value => writeKey(ctx.setText, 'STICK_ACCELERATION_CAP', value >= 11 ? null : value)} onReset={() => writeKey(ctx.setText, 'STICK_ACCELERATION_CAP', null)} />
      <Note>Ease off the edge and you drop straight back to your normal speed.</Note>
    </>,
    visual: <SpeedUpVisual ctx={ctx} rate={rate} cap={cap} />,
  }
}

// ---------------------------------------------------------------- Dead zone & edge
export function deadZoneGroup(ctx: StickCtx, options: { flicks?: boolean } = {}): FineTuneGroup {
  const { inner, outer, scope } = stickDeadzones(ctx.text, ctx.SIDE)
  const target = (key: 'INNER' | 'OUTER') => scope === 'side' ? `${ctx.SIDE}_STICK_DEADZONE_${key}` : `STICK_DEADZONE_${key}`
  const setScope = (next: string) => {
    if (next === scope) return
    if (next === 'both') writeKeys(ctx.setText, { STICK_DEADZONE_INNER: inner, STICK_DEADZONE_OUTER: outer, LEFT_STICK_DEADZONE_INNER: null, LEFT_STICK_DEADZONE_OUTER: null, RIGHT_STICK_DEADZONE_INNER: null, RIGHT_STICK_DEADZONE_OUTER: null })
    else writeKeys(ctx.setText, { [`${ctx.SIDE}_STICK_DEADZONE_INNER`]: inner, [`${ctx.SIDE}_STICK_DEADZONE_OUTER`]: outer })
  }
  const push = ctx.live ? Math.min(1, Math.hypot(ctx.live.x, ctx.live.y)) : 0
  const ring = readWord(ctx.text, `${ctx.SIDE}_RING_MODE`)
  return {
    id: 'deadzone', label: 'Dead zone & edge', title: 'Dead zone & edge', description: 'How far the stick moves before it counts, and where full tilt starts.',
    status: options.flicks ? `Flicks past ${Math.round((1 - outer) * 100)}%` : `Ignore ${Math.round(inner * 100)}% · full past ${Math.round((1 - outer) * 100)}%`,
    changed: isSet(ctx.text, `${ctx.SIDE}_STICK_DEADZONE_INNER`, `${ctx.SIDE}_STICK_DEADZONE_OUTER`, 'STICK_DEADZONE_INNER', 'STICK_DEADZONE_OUTER', `${ctx.SIDE}_RING_MODE`),
    content: <>
      <SegmentedRow label="Applies to" hint="Split them if one stick is worn and drifts more." value={scope}
        options={[{ value: 'both', label: 'Both sticks', caption: 'One dead zone for both sticks.' }, { value: 'side', label: `${ctx.side === 'left' ? 'Left' : 'Right'} stick only`, caption: 'This stick has its own dead zone.' }]}
        onChange={setScope} />
      <ValueRow hero label="Ignore small movement" setting={target('INNER')} value={Math.round(inner * 100)} min={0} max={90} step={1} fineStep={0.1} format={value => `${value}%`}
        caption="Raise it if the view drifts when you let go of the stick." onChange={value => writeKey(ctx.setText, target('INNER'), Number((value / 100).toFixed(4)))}
        onReset={() => writeKey(ctx.setText, target('INNER'), null)} />
      <ValueRow label="Full tilt starts at" hint="Lower it if you can’t reach top speed. Default 90%" setting={target('OUTER')} value={Math.round((1 - outer) * 100)} min={10} max={100} step={1} fineStep={0.1}
        format={value => `${value}%`} onChange={value => writeKey(ctx.setText, target('OUTER'), Number(((100 - value) / 100).toFixed(4)))} onReset={() => writeKey(ctx.setText, target('OUTER'), null)} />
      <SubHead>Light-push ring</SubHead>
      <SegmentedRow label="The ring binding fires" setting={`${ctx.SIDE}_RING_MODE`} value={ring === 'INNER' ? 'INNER' : 'OUTER'}
        options={[{ value: 'INNER', label: 'On a light push', caption: 'Inner: the ring binding is held while the stick is pushed only a little.' }, { value: 'OUTER', label: 'On a full push', caption: 'Outer (default): the ring binding is held while the stick is pushed fully.' }]}
        onChange={value => writeKey(ctx.setText, `${ctx.SIDE}_RING_MODE`, value === 'OUTER' ? null : value)} onReset={() => writeKey(ctx.setText, `${ctx.SIDE}_RING_MODE`, null)} />
      {ctx.buttons.ring && ctx.renderButton(ctx.buttons.ring, { label: 'Ring action', subtitle: 'Fires in every stick mode' })}
    </>,
    visual: <VisualPanel title={`Your ${ctx.name.toLowerCase()}, live`} chip={ctx.live ? `${push <= inner ? 'resting' : 'moving'} · ${Math.round(push * 100)}%${push <= inner ? ' · ignored' : ''}` : 'no controller'}
      caption="Let go of the stick: if the dot settles outside the inner ring, raise the dead zone until it sits inside.">
      <StickDiagram live={ctx.live} inner={inner} outer={outer} />
      <DeadZoneBar inner={inner} outer={outer} push={push} />
    </VisualPanel>,
  }
}

// ---------------------------------------------------------------- Direction
export function directionGroup(ctx: StickCtx): FineTuneGroup {
  const key = `${ctx.SIDE}_STICK_AXIS`
  const values = (readVirtualSetting(ctx.text, key) ?? 'STANDARD STANDARD').trim().toUpperCase().split(/\s+/)
  if (values.length === 1) values.push(values[0])
  const write = (index: number, inverted: boolean) => {
    const next = values.map((value, i) => i === index ? (inverted ? 'INVERTED' : 'STANDARD') : value)
    ctx.setText?.(previous => next.every(value => value === 'STANDARD') ? writeVirtualSetting(previous, key, '') : writeVirtualSetting(previous, key, next[0] === next[1] ? next[0] : next.join(' ')))
  }
  const flipped = [values[0] === 'INVERTED' ? 'left and right flipped' : '', values[1] === 'INVERTED' ? 'up and down flipped' : ''].filter(Boolean)
  const { inner, outer } = stickDeadzones(ctx.text, ctx.SIDE)
  return {
    id: 'direction', label: 'Direction', title: 'Direction', description: 'Flip the stick before its mode reads it.',
    status: flipped.length ? `Changed: ${flipped.join(', ')}` : 'Normal up, down, left, right', changed: isSet(ctx.text, key),
    content: <>
      <SummaryRow label="Flip left and right" hint="Before the stick mode reads it" setting={key} toggle={{ on: values[0] === 'INVERTED', onChange: on => write(0, on) }} />
      <SummaryRow label="Flip up and down" hint="Each stick has its own" setting={key} toggle={{ on: values[1] === 'INVERTED', onChange: on => write(1, on) }} />
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live ? { x: values[0] === 'INVERTED' ? -ctx.live.x : ctx.live.x, y: values[1] === 'INVERTED' ? -ctx.live.y : ctx.live.y } : null} inner={inner} outer={outer}
      caption="The dot shows the stick after flipping: push right and it should go where you expect." />,
  }
}

// ---------------------------------------------------------------- Mouse-like feel
export function mouseLikeGroup(ctx: StickCtx): FineTuneGroup {
  const on = ctx.mode === 'HYBRID_AIM'
  const [xMeta, yMeta, angleMeta, cutoffMeta] = MODE_NUMBERS.HYBRID_AIM
  const x = readModeNumber(ctx.text, xMeta)
  const y = readModeNumber(ctx.text, yMeta)
  const angle = readModeNumber(ctx.text, angleMeta)
  const cutoff = readModeNumber(ctx.text, cutoffMeta)
  const returnOn = (readVirtualSetting(ctx.text, 'RETURN_DEADZONE_IS_ACTIVE') ?? 'ON').toUpperCase() !== 'OFF'
  const edgeOn = (readVirtualSetting(ctx.text, 'EDGE_PUSH_IS_ACTIVE') ?? 'ON').toUpperCase() !== 'OFF'
  const write = (meta: typeof xMeta, value: number) => ctx.setText?.(previous => writeModeNumber(previous, meta, value, ctx.text))
  const push = ctx.live ? Math.hypot(ctx.live.x, ctx.live.y) : 0
  return {
    id: 'mouselike', label: 'Mouse-like feel', title: 'Mouse-like feel', description: 'Move the stick and the view moves like a mouse; hold it out to keep turning.',
    status: on ? `Changed: on · ${x === y ? `${x} both ways` : `${x} · ${y}`}` : 'Off · plain stick aim', changed: on,
    content: <>
      <SummaryRow label="Mouse-like feel" hint="Small moves for precise aim, plus normal stick turning" setting={`${ctx.SIDE}_STICK_MODE`}
        toggle={{ on, onChange: next => ctx.onModeChange(next ? 'HYBRID_AIM' : 'AIM') }} />
      {on && <>
        <SubHead>Speed</SubHead>
        <ValueRow hero label="Mouse-like speed, left and right" setting="MOUSELIKE_FACTOR" value={x} min={xMeta.min} max={xMeta.max} step={5} fineStep={1}
          caption="How far the view moves per move of the stick." onChange={value => write(xMeta, value)} onReset={() => writeKey(ctx.setText, 'MOUSELIKE_FACTOR', null)} onX={tryIt} />
        <SummaryRow label="Up and down" hint={x === y ? 'Same as left/right' : 'Its own mouse-like speed'} setting="MOUSELIKE_FACTOR" toggle={{ on: x !== y, onChange: own => write(yMeta, own ? Math.max(0, x - 15) : x) }} />
        {x !== y && <ValueRow label="Up and down speed" setting="MOUSELIKE_FACTOR" value={y} min={yMeta.min} max={yMeta.max} step={5} fineStep={1} onChange={value => write(yMeta, value)} />}
        <SubHead>Coming back to centre</SubHead>
        <SummaryRow label="Ignore the way back" hint="Letting go doesn’t drag the view backwards" setting="RETURN_DEADZONE_IS_ACTIVE"
          toggle={{ on: returnOn, onChange: next => ctx.setText?.(previous => writeVirtualSetting(previous, 'RETURN_DEADZONE_IS_ACTIVE', next ? '' : 'OFF')) }} />
        {returnOn && <>
          <ValueRow label="Fully ignored within" setting="RETURN_DEADZONE_ANGLE" value={angle} min={0} max={89} step={1} format={value => `${value}°`} onChange={value => write(angleMeta, value)} onReset={() => writeKey(ctx.setText, 'RETURN_DEADZONE_ANGLE', null)} />
          <ValueRow label="Back to normal by" setting="RETURN_DEADZONE_ANGLE_CUTOFF" value={cutoff} min={1} max={90} step={1} format={value => `${value}°`} onChange={value => write(cutoffMeta, value)} onReset={() => writeKey(ctx.setText, 'RETURN_DEADZONE_ANGLE_CUTOFF', null)} />
        </>}
        <SubHead>At the edge</SubHead>
        <SummaryRow label="Keep turning at the edge" hint="Hold the stick out and the turn carries on" setting="EDGE_PUSH_IS_ACTIVE"
          toggle={{ on: edgeOn, onChange: next => ctx.setText?.(previous => writeVirtualSetting(previous, 'EDGE_PUSH_IS_ACTIVE', next ? '' : 'OFF')) }} />
      </>}
    </>,
    visual: <VisualPanel title="Coming back to centre" chip={ctx.live ? (push < 0.1 ? 'resting' : 'moving') : 'no controller'}
      caption="Moving the stick back toward the middle inside the bright wedge doesn’t move the view."
      legend={[{ mark: '■', label: 'Ignored', detail: `${angle}°` }, { mark: '□', label: 'Fading back in', detail: `by ${cutoff}°` }, { mark: '◌', label: 'Edge', detail: edgeOn ? 'keeps turning' : 'stops' }]}>
      <HybridWedge ignored={angle} fade={cutoff} edge={edgeOn} active={on && returnOn} />
    </VisualPanel>,
  }
}

// ---------------------------------------------------------------- Flick
const flickOutput = (text: string) => (readVirtualSetting(text, 'FLICK_STICK_OUTPUT') ?? 'MOUSE').toUpperCase()
const liveAngle = (live: StickCtx['live'], outer: number) => live && Math.hypot(live.x, live.y) >= 1 - outer - 0.05 ? ((Math.atan2(live.x, live.y) * 180) / Math.PI + 360) % 360 : null

export function flickGroup(ctx: StickCtx): FineTuneGroup {
  const time = readNumber(ctx.text, 'FLICK_TIME', 0.1)
  const exponent = readNumber(ctx.text, 'FLICK_TIME_EXPONENT', 0)
  const preset = FLICK_EXPONENT_PRESETS.find(item => near(item.exponent, exponent))
  const gamepad = flickOutput(ctx.text) !== 'MOUSE'
  const why = gamepad ? 'With a gamepad stick output, the stick is held fully for as long as the turn needs, so this doesn’t apply.' : undefined
  const { outer } = stickDeadzones(ctx.text, ctx.SIDE)
  const angle = liveAngle(ctx.live, outer)
  return {
    id: 'flick', label: 'Flick', title: 'Flick', description: 'Push the stick toward a direction and you turn to face it.',
    status: isSet(ctx.text, 'FLICK_TIME', 'FLICK_TIME_EXPONENT') ? `Changed: ${time.toFixed(2)} s${preset && preset.exponent ? ` · ${preset.label.toLowerCase()} small flicks` : ''}` : `Default · ${time.toFixed(2)} s`,
    changed: isSet(ctx.text, 'FLICK_TIME', 'FLICK_TIME_EXPONENT') || ctx.mode !== 'FLICK',
    content: <>
      <SegmentedRow label="What the stick does" setting={`${ctx.SIDE}_STICK_MODE`} value={ctx.mode}
        options={[{ value: 'FLICK', label: 'Flick and turn', caption: 'Flick and turn: point to face that way, then roll round the edge to keep turning.' }, { value: 'FLICK_ONLY', label: 'Flick only', caption: 'Flick only: point to face that way; rolling does nothing.' }, { value: 'ROTATE_ONLY', label: 'Turn only', caption: 'Turn: roll the stick round its edge to keep turning.' }]}
        onChange={ctx.onModeChange} />
      <ValueRow hero label="Flick time" setting="FLICK_TIME" value={time} min={0} max={1} step={0.01} fineStep={0.001} format={value => `${value.toFixed(2)} s`} disabled={why}
        caption="How long a 180° flick takes. Lower is snappier." onChange={value => writeKey(ctx.setText, 'FLICK_TIME', value)} onReset={() => writeKey(ctx.setText, 'FLICK_TIME', null)} onX={tryIt} />
      <SegmentedRow label="Small flicks" setting="FLICK_TIME_EXPONENT" value={preset?.value ?? 'custom'} disabled={why}
        options={[...FLICK_EXPONENT_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'custom', label: 'Custom', caption: `Custom: exponent ${exponent}.` }]}
        onChange={value => { const found = FLICK_EXPONENT_PRESETS.find(item => item.value === value); if (found) writeChoice(ctx.setText, { FLICK_TIME_EXPONENT: found.exponent || null }, { FLICK_TIME_EXPONENT: 0 }) }}
        onReset={() => writeKey(ctx.setText, 'FLICK_TIME_EXPONENT', null)} />
      {preset === undefined && <ValueRow label="Small-flick exponent" setting="FLICK_TIME_EXPONENT" value={exponent} min={0} max={4} step={0.1} fineStep={0.01} onChange={value => writeKey(ctx.setText, 'FLICK_TIME_EXPONENT', value)} />}
      <OpenRow label="Advanced" hint="Match a full turn (360°), smoothing for tiny turns" onOpen={() => ctx.open.advanced('smoothing')} />
    </>,
    visual: <VisualPanel title="Where a flick takes you" chip={angle === null ? (ctx.live ? 'centred' : 'no controller') : `live ${Math.round(angle > 180 ? 360 - angle : angle)}° ${angle > 180 ? 'left' : 'right'}`}
      caption={`Point and you face that way in ${time.toFixed(2)} s. Keep rolling the stick and the view keeps turning with it.`}>
      <FlickCompass angle={angle} snap={0} forward={0} />
    </VisualPanel>,
  }
}

export function snapGroup(ctx: StickCtx): FineTuneGroup {
  const raw = readWord(ctx.text, 'FLICK_SNAP_MODE')
  const snap = raw === '4' ? '4' : raw === '8' ? '8' : 'NONE'
  const strength = readNumber(ctx.text, 'FLICK_SNAP_STRENGTH', 1)
  const forward = readNumber(ctx.text, 'FLICK_DEADZONE_ANGLE', 0)
  const { outer } = stickDeadzones(ctx.text, ctx.SIDE)
  const angle = liveAngle(ctx.live, outer)
  const landed = angle === null || snap === 'NONE' ? angle : Math.round(angle / (360 / Number(snap))) * (360 / Number(snap))
  return {
    id: 'snap', label: 'Snap & forward zone', title: 'Snap & forward zone', description: 'Land flicks on clean angles, and push forward without turning.',
    status: snap === 'NONE' && forward === 0 ? 'Snap off · no forward zone' : `Changed: ${snap === 'NONE' ? 'snap off' : `${snap} ways`} · ${forward ? `${forward}° forward` : 'no forward zone'}`,
    changed: isSet(ctx.text, 'FLICK_SNAP_MODE', 'FLICK_SNAP_STRENGTH', 'FLICK_DEADZONE_ANGLE'),
    content: <>
      <SegmentedRow label="Snap to" setting="FLICK_SNAP_MODE" value={snap}
        options={[{ value: 'NONE', label: 'Off', caption: 'Off: flicks land wherever you point.' }, { value: '4', label: '4 directions', caption: '4: forward, left, right, behind.' }, { value: '8', label: '8 directions', caption: '8 adds the diagonals.' }]}
        onChange={value => writeKey(ctx.setText, 'FLICK_SNAP_MODE', value === 'NONE' ? null : value)} onReset={() => writeKey(ctx.setText, 'FLICK_SNAP_MODE', null)} />
      <ValueRow hero label="Snap strength" setting="FLICK_SNAP_STRENGTH" value={Math.round(strength * 100)} min={0} max={100} step={5} fineStep={1} format={value => `${value}%`}
        disabled={snap === 'NONE' ? 'Snap strength is used once Snap to is 4 or 8 directions.' : undefined}
        caption="100% always lands on a snap point. Lower lets a flick land in between." onChange={value => writeKey(ctx.setText, 'FLICK_SNAP_STRENGTH', Number((value / 100).toFixed(3)))} onReset={() => writeKey(ctx.setText, 'FLICK_SNAP_STRENGTH', null)} />
      <ValueRow label="Forward zone" hint="Push roughly forward to turn without a flick. Default: off" setting="FLICK_DEADZONE_ANGLE" value={forward} min={0} max={90} step={1} format={value => value === 0 ? 'Off' : `${value}° each side`}
        onChange={value => writeKey(ctx.setText, 'FLICK_DEADZONE_ANGLE', value || null)} onReset={() => writeKey(ctx.setText, 'FLICK_DEADZONE_ANGLE', null)} />
    </>,
    visual: <VisualPanel title="Where a flick lands" chip={angle === null ? (ctx.live ? 'centred' : 'no controller') : `push ${Math.round(angle)}° · lands ${Math.round(landed ?? angle)}°`}
      legend={[{ mark: '●', label: snap === 'NONE' ? 'Snap points · off' : `${snap} snap points` }, { mark: '◢', label: forward ? `Forward zone · ${forward * 2}° in all` : 'Forward zone · off' }, { mark: '—', label: 'Your push' }]}>
      <FlickCompass angle={angle} snap={snap === 'NONE' ? 0 : Number(snap)} forward={forward} strength={strength} />
    </VisualPanel>,
  }
}

export function outputGroup(ctx: StickCtx): FineTuneGroup {
  const output = flickOutput(ctx.text)
  const target = output === 'LEFT_STICK' || output === 'RIGHT_STICK' ? output as VirtualStickTarget : null
  const speed = readNumber(ctx.text, 'VIRTUAL_STICK_CALIBRATION', 360)
  return {
    id: 'output', label: 'Turning output', title: 'Turning output', description: 'Send flicks as mouse movement, or through a gamepad stick.',
    status: output === 'MOUSE' ? 'Mouse' : `Changed: ${output === 'LEFT_STICK' ? 'left' : 'right'} gamepad stick`, changed: isSet(ctx.text, 'FLICK_STICK_OUTPUT', 'VIRTUAL_STICK_CALIBRATION'),
    content: <>
      <ModeCards variant="compare" columns={3} value={output} useLabel={card => `Use ${card.label}`}
        options={[{ value: 'MOUSE', label: 'Mouse', caption: 'Most precise. Uses Match a full turn (360°).' }, { value: 'LEFT_STICK', label: 'Left gamepad stick', caption: 'For a game that turns with the left stick' }, { value: 'RIGHT_STICK', label: 'Right gamepad stick', caption: 'The usual camera stick' }]}
        onChange={value => ctx.setText?.(previous => writeVirtualSetting(previous, 'FLICK_STICK_OUTPUT', value === 'MOUSE' ? '' : value))} />
      {target && <>
        {vcWarning(ctx, 'A gamepad stick output')}
        <ValueRow hero label="Game’s top turn speed" setting="VIRTUAL_STICK_CALIBRATION" value={speed} min={30} max={20000} step={30} fineStep={1}
          format={value => `${value}°/s`} hint={`One full turn in ${(360 / speed).toFixed(2)} s`} caption="Hold the game’s stick fully and time one full turn. Shared with gyro to joystick."
          onChange={value => writeKey(ctx.setText, 'VIRTUAL_STICK_CALIBRATION', value)} onReset={() => writeKey(ctx.setText, 'VIRTUAL_STICK_CALIBRATION', null)} />
        <OpenRow label="Find the game’s dead zone" hint="Guided, about a minute" value="Start" onOpen={() => ctx.open.gameStick(target)} />
        <GameStickRows ctx={ctx} target={target} compact />
        <Note>With a gamepad stick, Flick time and Small flicks don’t apply: the stick is held fully for as long as the turn needs.</Note>
      </>}
    </>,
    visual: <VisualPanel title="How a flick reaches the game" chip="flick 180°" caption="If flicks fall short or overshoot, re-time the game’s full turn and adjust the top turn speed.">
      <svg viewBox="0 0 380 150" role="img" aria-label="Flick timeline">
        <path d="M30 110 H350" stroke="rgba(255,255,255,.1)" />
        {target ? <>
          <rect x="30" y="50" width={Math.min(320, (180 / speed) * 640)} height="40" rx="6" fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke="var(--accent)" />
          <text x="36" y="74" fill="#e3eaf1" fontSize="12">Full tilt for {(180 / speed).toFixed(2)} s</text>
          <text x="190" y="138" fill="#808c99" fontSize="11" textAnchor="middle">180° at {speed}°/s takes {(180 / speed).toFixed(2)} s</text>
        </> : <>
          <path d="M30 110 C120 110 140 40 230 40 H350" stroke="var(--accent)" strokeWidth="2" fill="none" />
          <text x="190" y="138" fill="#808c99" fontSize="11" textAnchor="middle">Mouse: the turn is sent as mouse movement over the flick time</text>
        </>}
      </svg>
    </VisualPanel>,
  }
}

// ---------------------------------------------------------------- Match the game (gamepad stick)
/** The game-stick correction rows for one target stick, shared by the
 *  Gamepad stick mode and the flick's gamepad output. */
export function GameStickRows({ ctx, target, compact }: { ctx: StickCtx; target: VirtualStickTarget; compact?: boolean }) {
  const values = virtualStickValues(ctx.text, target)
  const key = (field: keyof typeof VIRTUAL_STICK_FIELDS) => `${target}_${field}`
  const write = (field: keyof typeof VIRTUAL_STICK_FIELDS, value: number) => ctx.setText?.(previous => writeVirtualStickNumber(previous, target, field, value, ctx.text))
  const curve = UNPOWER_PRESETS.find(item => item.unpower === values.exponent || (item.unpower === 0 && values.exponent === 1))
  return <>
    <ValueRow hero={!compact} label="Game’s dead zone" setting={key('UNDEADZONE_INNER')} value={Math.round(values.inner * 1000) / 10} min={0} max={Math.round((0.999 - values.outer) * 1000) / 10} step={1} fineStep={0.1}
      format={value => `${value}%`} caption="Raise it until the view just creeps with the stick at rest, then back off a little."
      onChange={value => write('UNDEADZONE_INNER', value / 100)} onReset={() => writeKey(ctx.setText, key('UNDEADZONE_INNER'), null)} />
    <ValueRow label="Outer range" hint="Lower it if the game hits top speed early" setting={key('UNDEADZONE_OUTER')} value={Math.round((1 - values.outer) * 1000) / 10} min={Math.round((values.inner + 0.001) * 1000) / 10} max={100} step={1} fineStep={0.1}
      format={value => `Full at ${value}%`} onChange={value => write('UNDEADZONE_OUTER', (100 - value) / 100)} onReset={() => writeKey(ctx.setText, key('UNDEADZONE_OUTER'), null)} />
    <SegmentedRow label="Response curve" hint="Undo a game that is slow near the centre." setting={key('UNPOWER')} value={curve?.value ?? 'custom'}
      options={[...UNPOWER_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'custom', label: 'Custom', caption: `Custom exponent ${values.exponent}.` }]}
      onChange={value => { const found = UNPOWER_PRESETS.find(item => item.value === value); if (found) writeChoice(ctx.setText, { [key('UNPOWER')]: found.unpower || null }, { [key('UNPOWER')]: 0 }); else write('UNPOWER', 1.5) }}
      onReset={() => writeKey(ctx.setText, key('UNPOWER'), null)} />
    {!curve && <ValueRow label="Curve exponent" setting={key('UNPOWER')} value={values.exponent} min={0} max={8} step={0.1} fineStep={0.01} onChange={value => write('UNPOWER', value)} />}
    {!compact && <ValueRow label="Stick share with gyro" hint="How much this stick adds when gyro also aims" setting={key('VIRTUAL_SCALE')} value={values.scale} min={0} max={4} step={0.05} fineStep={0.01}
      format={value => `${value.toFixed(2)}×`} onChange={value => write('VIRTUAL_SCALE', value)} onReset={() => writeKey(ctx.setText, key('VIRTUAL_SCALE'), null)} />}
    <SummaryRow label="Dead-zone test signal" hint="Sends the game’s dead zone while the stick rests, to find it. Turn it off when done." setting={`${target}_DEADZONE_PROBE`}
      toggle={{ on: values.probe, onChange: on => ctx.setText?.(previous => writeVirtualSetting(previous, `${target}_DEADZONE_PROBE`, on ? 'ON' : 'OFF')) }} />
  </>
}

export function matchGameGroup(ctx: StickCtx): FineTuneGroup {
  const target: VirtualStickTarget = ctx.mode === 'LEFT_STICK' ? 'LEFT_STICK' : 'RIGHT_STICK'
  const values = virtualStickValues(ctx.text, target)
  const push = ctx.live ? Math.min(1, Math.hypot(ctx.live.x, ctx.live.y)) : 0
  const changed = isSet(ctx.text, ...['UNDEADZONE_INNER', 'UNDEADZONE_OUTER', 'UNPOWER', 'VIRTUAL_SCALE', 'DEADZONE_PROBE'].map(field => `${target}_${field}`))
  return {
    id: 'match', label: 'Match the game', title: 'Match the game', description: 'Line your stick up with how the game reads a pad stick.',
    status: values.inner ? `Changed: game’s dead zone ${Math.round(values.inner * 100)}%` : changed ? 'Changed' : 'Default · sends as it is', changed,
    content: <>
      <SegmentedRow label="Sends as" setting={`${ctx.SIDE}_STICK_MODE`} value={target}
        options={[{ value: 'LEFT_STICK', label: 'Left pad stick', caption: 'The game sees this stick as its left stick.' }, { value: 'RIGHT_STICK', label: 'Right pad stick', caption: 'The game sees this stick as its right stick.' }]} onChange={ctx.onModeChange} />
      {vcWarning(ctx, 'Gamepad stick')}
      <OpenRow label="Find the game’s dead zone" hint="Guided: the test signal is on while you raise it" value="Start" onOpen={() => ctx.open.gameStick(target)} />
      <GameStickRows ctx={ctx} target={target} />
    </>,
    visual: <VisualPanel title="What the game receives" chip={ctx.live ? `${push < 0.05 ? 'resting' : 'moving'} · sends ${Math.round(Math.max(values.probe && push < 0.05 ? values.inner : 0, push) * 100)}%` : 'no controller'}
      caption="Every push starts just past the game’s dead zone, so the smallest nudge still moves the view.">
      <GameCurve inner={values.inner} outer={values.outer} exponent={values.exponent} probe={values.probe} push={push} />
    </VisualPanel>,
  }
}

// ---------------------------------------------------------------- Wheel
function WheelVisual({ ctx, hot }: { ctx: StickCtx; hot: string | null }) {
  const menu = ctx.wheel.menu
  const live = ctx.live
  const deadzone = readNumber(ctx.text, `${ctx.SIDE}_STICK_MENU_DEADZONE`, 0.35)
  const slice = menu && live && Math.hypot(live.x, live.y) >= deadzone ? hitTestRegion(menu, live.x, -live.y) : -1
  return (
    <VisualPanel title="Your wheel" chip={live ? (slice >= 0 ? `live · slice ${slice + 1}` : 'live · nothing picked') : 'no controller'}
      caption="Push the stick to try it. The slice you point at lights up here and in game."
      legend={[{ mark: '○', label: 'Nothing picked inside' }, { mark: '■', label: 'Lit slice · where you point' }]}>
      {menu ? <MenuPreview menu={menu} aspect={1} fill hotCommand={hot ?? (slice >= 0 ? ctx.wheel.segments[slice]?.command ?? null : null)} livePoint={live && Math.hypot(live.x, live.y) > 0.02 ? { x: live.x, y: -live.y } : null} />
        : <p className={styles.note}>Set at least two slices to draw the wheel.</p>}
    </VisualPanel>
  )
}

export function wheelGroup(ctx: StickCtx, hot: string | null, onTest: () => void): FineTuneGroup {
  const reserved = ctx.wheel.reserved
  const slices = Math.max(2, Math.min(25, Math.round(readNumber(ctx.text, `${ctx.SIDE}_STICK_MENU_SIZE`, 8))))
  const deadzone = readNumber(ctx.text, `${ctx.SIDE}_STICK_MENU_DEADZONE`, 0.35)
  const test = { label: 'Test a slice', run: onTest }
  return {
    id: 'wheel', label: 'Wheel', title: 'Wheel', description: 'Point the stick at a slice; come back to centre to let go.',
    status: reserved ? `Menu · ${reserved.name}` : `${slices} slices · picks past ${Math.round(deadzone * 100)}%`, changed: isSet(ctx.text, `${ctx.SIDE}_STICK_MENU_SIZE`, `${ctx.SIDE}_STICK_MENU_DEADZONE`),
    content: reserved ? <>
      <Note>This stick is reserved for the menu “{reserved.name}”. Its slices, look and activation are edited in Menus.</Note>
      <OpenRow label="What each slice does" hint="Names, icons and keys" value="Menus" onOpen={() => window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: reserved.id }))} />
    </> : <>
      <ValueRow label="Slices" hint="Numbered clockwise from the top" setting={`${ctx.SIDE}_STICK_MENU_SIZE`} value={slices} min={2} max={25} step={1} onX={test}
        onChange={value => writeKey(ctx.setText, `${ctx.SIDE}_STICK_MENU_SIZE`, value)} onReset={() => writeKey(ctx.setText, `${ctx.SIDE}_STICK_MENU_SIZE`, null)} />
      <ValueRow hero label="Push before a slice is picked" setting={`${ctx.SIDE}_STICK_MENU_DEADZONE`} value={Math.round(deadzone * 100)} min={0} max={95} step={5} fineStep={1} format={value => `${value}%`} onX={test}
        caption="Inside this ring nothing is picked. Raise it if a slice fires as you let go."
        onChange={value => writeKey(ctx.setText, `${ctx.SIDE}_STICK_MENU_DEADZONE`, Number((value / 100).toFixed(3)))} onReset={() => writeKey(ctx.setText, `${ctx.SIDE}_STICK_MENU_DEADZONE`, null)} />
      <OpenRow label="What each slice does" hint="Names, icons and keys" value={`${ctx.wheel.segments.length} slices`} onOpen={ctx.open.slices} />
      {ctx.wheel.menu && <OpenRow label="On-screen wheel" hint={`Where it shows and how it looks · ${describeMenuPlacement(ctx.wheel.menu).replace('zone', 'slice')}`} value="Arrange"
        onOpen={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: ctx.side === 'left' ? 'LSTICK' : 'RSTICK' }))} />}
      <SubHead>Advanced</SubHead>
      {ctx.wheel.menuConfig && <OpenInMenusRow side={ctx.side} config={ctx.wheel.menuConfig} />}
    </>,
    visual: <WheelVisual ctx={ctx} hot={hot} />,
  }
}

/** Converts an older RADIAL_MENU wheel into a menu in Menus, keeping its slices, names and icons. */
function OpenInMenusRow({ side, config }: { side: StickSide; config: StickMenuConfig }) {
  const [problem, setProblem] = useState<string | null>(null)
  const convert = () => {
    const result = connectStickMenu(config.text, side)
    setProblem(result.problem ?? null)
    if (!result.id) return
    config.onChange(previous => writeVirtualMenus(updateKeymapEntry(previous, `${side.toUpperCase()}_STICK_MODE`, ['NO_MOUSE']), readVirtualMenus(result.text).menus))
    window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: result.id }))
  }
  return <>
    <OpenRow label="Open in Menus" hint="Converts this wheel, keeping its slices, names and icons" value="Menus" onOpen={convert} />
    {problem && <Note tone="warn">{problem}</Note>}
  </>
}

// ---------------------------------------------------------------- Moving
export function directionsGroup(ctx: StickCtx): FineTuneGroup {
  const summary = ctx.buttons.directions.map(button => ctx.describe(button.command).binding || '—')
  return {
    id: 'directions', label: 'Directions', title: 'Directions', description: 'What up, left, down and right send. Push between two and both fire.',
    status: summary.some(value => value !== '—') ? summary.join(' · ') : 'Unbound',
    changed: summary.some(value => value !== '—'),
    content: <>
      {ctx.buttons.directions.map(button => <div key={button.command}>{ctx.renderButton(button)}</div>)}
      {ctx.onBindWasd && <OpenRow label="Bind to W A S D" hint="Points up, left, down and right at W, A, S and D" onOpen={ctx.onBindWasd} />}
      <Note>Diagonals: hold two directions and both keys are sent. A binding sheet’s “Stick diagonal” gives a diagonal its own action.</Note>
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live} {...stickDeadzones(ctx.text, ctx.SIDE)} />,
  }
}

export function touchGroup(ctx: StickCtx): FineTuneGroup | null {
  const touch = ctx.buttons.touch
  if (!touch) return null
  const info = ctx.describe(touch.command)
  return {
    id: 'touch', label: 'Touch', title: 'Touch', description: 'What resting your thumb on the stick does.',
    status: info.binding || 'Unbound', changed: Boolean(info.binding),
    content: <>{ctx.renderButton(touch, { label: 'Thumb on the stick' })}<Note>The stick top senses your thumb on controllers that have it. It fires in every stick mode.</Note></>,
  }
}

// ---------------------------------------------------------------- Small modes
export function mouseRingGroup(ctx: StickCtx, useRow?: ReactNode): FineTuneGroup {
  const radius = readNumber(ctx.text, 'MOUSE_RING_RADIUS', 128)
  const width = readNumber(ctx.text, 'SCREEN_RESOLUTION_X', 1920)
  const height = readNumber(ctx.text, 'SCREEN_RESOLUTION_Y', 1080)
  return {
    id: 'MOUSE_RING', label: 'Mouse ring', title: 'Mouse ring', description: 'The cursor sits on a ring round the screen centre, wherever the stick points.',
    status: `Ring ${radius} px · screen ${width}×${height}`, changed: isSet(ctx.text, 'MOUSE_RING_RADIUS', 'SCREEN_RESOLUTION_X', 'SCREEN_RESOLUTION_Y'),
    content: <>
      {useRow}
      <ValueRow hero label="Ring size" setting="MOUSE_RING_RADIUS" value={radius} min={0} max={4000} step={10} fineStep={1} format={value => `${value} px`}
        caption="How far from the centre the cursor sits. Mouse area uses the same distance." onChange={value => writeKey(ctx.setText, 'MOUSE_RING_RADIUS', value)} onReset={() => writeKey(ctx.setText, 'MOUSE_RING_RADIUS', null)} />
      <ValueRow label="Screen width" hint="Used to find the centre of your screen" setting="SCREEN_RESOLUTION_X" value={width} min={1} max={16384} step={10} fineStep={1} format={value => `${value} px`}
        onChange={value => writeKey(ctx.setText, 'SCREEN_RESOLUTION_X', value)} onReset={() => writeKey(ctx.setText, 'SCREEN_RESOLUTION_X', null)} />
      <ValueRow label="Screen height" setting="SCREEN_RESOLUTION_Y" value={height} min={1} max={16384} step={10} fineStep={1} format={value => `${value} px`}
        onChange={value => writeKey(ctx.setText, 'SCREEN_RESOLUTION_Y', value)} onReset={() => writeKey(ctx.setText, 'SCREEN_RESOLUTION_Y', null)} />
      <Note>While you push the stick, other mouse movement is ignored. Good for twin-stick games and mouse-driven weapon wheels.</Note>
    </>,
    visual: <VisualPanel title="Where the cursor goes" chip={ctx.live ? 'live' : 'no controller'} caption="Point the stick and the cursor jumps to that spot on the ring. Let go and it stays put.">
      <MouseRingScreen radius={radius} width={width} height={height} live={ctx.live} />
    </VisualPanel>,
  }
}

export function mouseAreaGroup(ctx: StickCtx, useRow?: ReactNode): FineTuneGroup {
  const radius = readNumber(ctx.text, 'MOUSE_RING_RADIUS', 128)
  return {
    id: 'MOUSE_AREA', label: 'Mouse area', title: 'Mouse area', description: 'The cursor moves as far as the stick does, and comes back when you let go.',
    status: `Reaches ${radius} px`, changed: isSet(ctx.text, 'MOUSE_RING_RADIUS'),
    content: <>
      {useRow}
      <ValueRow hero label="How far it reaches" setting="MOUSE_RING_RADIUS" value={radius} min={0} max={2000} step={10} fineStep={1} format={value => `${value} px`}
        caption="A full push moves the cursor this far. Mouse ring uses the same distance." onChange={value => writeKey(ctx.setText, 'MOUSE_RING_RADIUS', value)} onReset={() => writeKey(ctx.setText, 'MOUSE_RING_RADIUS', null)} />
      <Note>Holding the stick still stops the cursor; returning to the centre moves it back. It doesn’t lock the cursor to a box.</Note>
    </>,
    visual: <VisualPanel title="Where the cursor goes" chip={ctx.live ? 'live' : 'no controller'}><MouseRingScreen radius={radius} width={1920} height={1080} live={ctx.live} /></VisualPanel>,
  }
}

export function scrollGroup(ctx: StickCtx, useRow: ReactNode, rotationButtons: ButtonDefinition[]): FineTuneGroup {
  const sens = readNumber(ctx.text, 'SCROLL_SENS', 30)
  return {
    id: 'SCROLL_WHEEL', label: 'Scroll wheel', title: 'Scroll wheel', description: 'Roll the stick round its edge; each step sends the left or right binding.',
    status: `${sens}° of turn per step`, changed: isSet(ctx.text, 'SCROLL_SENS'),
    content: <>
      {useRow}
      <ValueRow hero label="Turn per step" setting="SCROLL_SENS" value={sens} min={1} max={180} step={1} format={value => `${value}°`} caption="How far you roll the stick for one step."
        onChange={value => writeKey(ctx.setText, 'SCROLL_SENS', value)} onReset={() => writeKey(ctx.setText, 'SCROLL_SENS', null)} />
      <SubHead>What each step does</SubHead>
      {rotationButtons.map(button => <div key={button.command}>{ctx.renderButton(button, { label: button.command.endsWith('LEFT') ? 'Roll anticlockwise' : 'Roll clockwise' })}</div>)}
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live} {...stickDeadzones(ctx.text, ctx.SIDE)} />,
  }
}

export function ringsGroup(ctx: StickCtx, useRow?: ReactNode): FineTuneGroup {
  const which = ctx.mode === 'INNER_RING' ? 'INNER_RING' : 'OUTER_RING'
  const active = ctx.mode === 'INNER_RING' || ctx.mode === 'OUTER_RING'
  const ringInfo = ctx.buttons.ring ? ctx.describe(ctx.buttons.ring.command).binding : ''
  return {
    id: 'RINGS', label: 'Walk/run rings', title: 'Walk/run rings', description: 'Directions, plus one binding held on a light push or a full push.',
    status: `${which === 'INNER_RING' ? 'Inner ring' : 'Outer ring'} · ${ringInfo ? `ring sends ${ringInfo}` : 'no ring action'}`, changed: active,
    content: <>
      {useRow}
      <SegmentedRow label="Which ring" value={which} disabled={active ? undefined : 'Use Walk/run rings on this stick first.'}
        options={[{ value: 'INNER_RING', label: 'Inner ring', caption: 'The ring action holds while you push only a little: walk.' }, { value: 'OUTER_RING', label: 'Outer ring', caption: 'The ring action holds while you push fully: run.' }]}
        onChange={ctx.onModeChange} />
      {ctx.buttons.ring && ctx.renderButton(ctx.buttons.ring, { label: 'Ring action' })}
      <OpenRow label="Directions" hint="Up, left, down and right" onOpen={ctx.open.directions} />
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live} {...stickDeadzones(ctx.text, ctx.SIDE)} />,
  }
}

export function angleGroup(ctx: StickCtx, useRow?: ReactNode): FineTuneGroup {
  const [innerMeta, outerMeta] = MODE_NUMBERS.ANGLE
  const centre = readModeNumber(ctx.text, innerMeta)
  const ends = readModeNumber(ctx.text, outerMeta)
  const current = ctx.mode.includes('_ANGLE_TO_') ? ctx.mode : null
  return {
    id: 'ANGLE', label: 'Angle to axis', title: 'Angle to axis', description: 'Where you point the stick sets one gamepad axis; how far you push turns it on.',
    status: `Centre ${centre}° · ends ${ends}°${current ? ` · ${current.startsWith('LEFT') ? 'left' : 'right'} ${current.endsWith('_X') ? 'across' : 'up-down'}` : ''}`, changed: isSet(ctx.text, innerMeta.key, outerMeta.key),
    content: <>
      {useRow}
      {current && vcWarning(ctx, 'Angle to axis')}
      <SegmentedRow label="Sends to" value={current ?? ''} disabled={current ? undefined : 'Use Angle to axis on this stick first.'}
        options={[{ value: 'LEFT_ANGLE_TO_X', label: 'Left · across' }, { value: 'LEFT_ANGLE_TO_Y', label: 'Left · up-down' }, { value: 'RIGHT_ANGLE_TO_X', label: 'Right · across' }, { value: 'RIGHT_ANGLE_TO_Y', label: 'Right · up-down' }]}
        onChange={ctx.onModeChange} />
      <ValueRow hero label="Centre" hint={innerMeta.help} setting={innerMeta.key} value={centre} min={0} max={89} step={1} format={value => `${value}°`}
        onChange={value => ctx.setText?.(previous => writeModeNumber(previous, innerMeta, value, ctx.text))} onReset={() => writeKey(ctx.setText, innerMeta.key, null)} />
      <ValueRow label="Ends" hint={outerMeta.help} setting={outerMeta.key} value={ends} min={0} max={89} step={1} format={value => `${value}°`}
        onChange={value => ctx.setText?.(previous => writeModeNumber(previous, outerMeta, value, ctx.text))} onReset={() => writeKey(ctx.setText, outerMeta.key, null)} />
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live} {...stickDeadzones(ctx.text, ctx.SIDE)} />,
  }
}

export function steeringGroup(ctx: StickCtx, useRow?: ReactNode): FineTuneGroup {
  const [rangeMeta, powerMeta, unwindMeta] = MODE_NUMBERS.WIND
  const range = readModeNumber(ctx.text, rangeMeta)
  const power = readModeNumber(ctx.text, powerMeta)
  const unwind = readModeNumber(ctx.text, unwindMeta)
  const current = ctx.mode.endsWith('_WIND_X') ? ctx.mode : null
  const row = (meta: typeof rangeMeta, label: string, hero?: boolean) => (
    <ValueRow hero={hero} label={label} hint={meta.help} setting={meta.key} value={readModeNumber(ctx.text, meta)} min={meta.min} max={meta.max} step={meta.step} fineStep={meta.step < 1 ? 0.01 : 1}
      format={value => `${value}${meta.unit ?? ''}`} onChange={value => ctx.setText?.(previous => writeModeNumber(previous, meta, value, ctx.text))} onReset={() => writeKey(ctx.setText, meta.key, null)} />
  )
  return {
    id: 'STEERING', label: 'Steering', title: 'Steering', description: 'Wind the stick round to turn the wheel; let go and it comes back.',
    status: `${range}° · back ${unwind}°/s · curve ${power}`, changed: isSet(ctx.text, rangeMeta.key, powerMeta.key, unwindMeta.key),
    content: <>
      {useRow}
      {current && vcWarning(ctx, 'Steering')}
      <SegmentedRow label="Sends to" value={current ?? ''} disabled={current ? undefined : 'Use Steering on this stick first.'}
        options={[{ value: 'LEFT_WIND_X', label: 'Left pad stick' }, { value: 'RIGHT_WIND_X', label: 'Right pad stick' }]} onChange={ctx.onModeChange} />
      {row(rangeMeta, 'Full lock', true)}
      {row(unwindMeta, 'Return to centre')}
      {row(powerMeta, 'Curve')}
    </>,
    visual: <StickPanel title={`Your ${ctx.name.toLowerCase()}, live`} live={ctx.live} {...stickDeadzones(ctx.text, ctx.SIDE)} />,
  }
}
