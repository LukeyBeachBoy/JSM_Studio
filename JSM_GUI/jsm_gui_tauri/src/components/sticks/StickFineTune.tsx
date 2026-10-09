import { useEffect, useState, type ReactNode } from 'react'
import { SubPage, FineTune, AdvancedParts, OpenRow, SegmentedRow, ValueRow, stepGroup, type FineTuneGroup } from '../ui/console'
import { OpenRow as UseRow } from '../ui/console'
import type { ButtonDefinition } from '../../keymap/schema'
import { isSet, Note, readNumber, writeChoice, writeKey } from './shared'
import { STICK_POWER_PRESETS, ROTATE_SMOOTH_PRESETS, near } from './presets'
import { MORE_MODES, MORE_MODE_NAMES, moreModeOf, moreModeValue, stickCardOf, type MoreMode } from './stickModes'
import {
  angleGroup, deadZoneGroup, directionGroup, directionsGroup, flickGroup, matchGameGroup, mouseAreaGroup, mouseLikeGroup, mouseRingGroup,
  outputGroup, ringsGroup, scrollGroup, snapGroup, speedGroup, speedUpGroup, steeringGroup, touchGroup, wheelGroup, type StickCtx,
} from './stickGroups'
import { aimSpeed } from './visuals'
import { stickDeadzones } from './stickGroups'
import styles from './P4.module.css'

// Sticks ▸ Fine-tune (console v2, V7): the groups the stick's mode has, one
// open at a time. Each mode's groups:
//   Looking around   Speed · Speed-up · Dead zone & edge · Mouse-like feel · Direction
//   Flick to turn    Flick · Snap & forward zone · Turning output · Dead zone & edge · Direction
//   Wheel            Wheel · Dead zone & edge · Direction
//   Gamepad stick    Match the game · Dead zone & edge · Direction
//   Moving           Directions · Dead zone & edge (with the light-push ring) · Direction · Touch
//   a More mode      that mode · Dead zone & edge · Direction
// Every mode also has Touch when the stick senses a thumb.

export function stickGroupsFor(ctx: StickCtx, extras: { hot: string | null; onTest: () => void; rotationButtons: ButtonDefinition[] }): FineTuneGroup[] {
  const card = stickCardOf(ctx.mode)
  const tail = [deadZoneGroup(ctx, { flicks: card === 'FLICK' }), directionGroup(ctx), touchGroup(ctx)].filter((group): group is FineTuneGroup => Boolean(group))
  if (ctx.wheel.reserved) return [wheelGroup(ctx, extras.hot, extras.onTest), ...tail]
  switch (card) {
    case 'LOOK': return [speedGroup(ctx), speedUpGroup(ctx), deadZoneGroup(ctx), mouseLikeGroup(ctx), directionGroup(ctx), ...tail.slice(2)]
    case 'FLICK': return [flickGroup(ctx), snapGroup(ctx), outputGroup(ctx), ...tail]
    case 'WHEEL': return [wheelGroup(ctx, extras.hot, extras.onTest), ...tail]
    case 'GAMEPAD': return [matchGameGroup(ctx), ...tail]
    case 'MOVING': return [directionsGroup(ctx), ...tail]
  }
  const more = moreModeOf(ctx.mode)
  const group = more ? moreGroup(ctx, more, extras.rotationButtons) : null
  return group ? [group, ...tail] : tail
}

/** A More mode's own group; `useRow` is "Use <mode> on this stick" on the More page. */
export function moreGroup(ctx: StickCtx, entry: MoreMode, rotationButtons: ButtonDefinition[], useRow?: ReactNode): FineTuneGroup {
  switch (entry) {
    case 'MOUSE_RING': return mouseRingGroup(ctx, useRow)
    case 'MOUSE_AREA': return mouseAreaGroup(ctx, useRow)
    case 'SCROLL_WHEEL': return scrollGroup(ctx, useRow, rotationButtons)
    case 'RINGS': return ringsGroup(ctx, useRow)
    case 'ANGLE': return angleGroup(ctx, useRow)
    case 'STEERING': return steeringGroup(ctx, useRow)
    default: {
      const name = MORE_MODE_NAMES[entry]
      return {
        id: entry, label: name.label, title: name.label, description: name.caption, status: entry === 'HYBRID_AIM' ? 'Tuned under Looking around' : 'Tuned under Flick to turn',
        content: <>{useRow}<Note>{entry === 'HYBRID_AIM' ? 'Once picked, its speeds are in Fine-tune: Speed and Mouse-like feel.' : 'Once picked, it is tuned in Fine-tune: Flick, Snap and Turning output.'}</Note></>,
      }
    }
  }
}

type FineTuneProps = { ctx: StickCtx; group: string | null; onGroup: (id: string) => void; onClose: () => void; rotationButtons: ButtonDefinition[] }

export function StickFineTune({ ctx, group, onGroup, onClose, rotationButtons }: FineTuneProps) {
  const [hot, setHot] = useState<string | null>(null)
  useEffect(() => { if (!hot) return; const id = window.setTimeout(() => setHot(null), 1000); return () => window.clearTimeout(id) }, [hot])
  const testSlice = () => { const list = ctx.wheel.segments; if (!list.length) return; const index = Math.max(0, list.findIndex(button => button.command === hot)); setHot(list[(index + 1) % list.length].command) }
  const groups = stickGroupsFor(ctx, { hot, onTest: testSlice, rotationButtons })
  const active = groups.some(item => item.id === group) ? group! : groups[0]?.id ?? ''
  const card = stickCardOf(ctx.mode)
  const note = card === 'FLICK' ? 'Flick settings are shared by both sticks and the trackpad sticks.'
    : card === 'LOOK' ? (active === 'mouselike' ? 'Mouse-like speeds are shared by every stick that uses this feel.' : 'Speed and speed-up are shared by both sticks and the trackpad sticks.')
    : card === 'GAMEPAD' ? 'Gamepad stick sends this stick to the game as a real pad stick. Needs Xbox or PlayStation output.'
    : active === 'deadzone' ? 'Dead zones work in every stick mode, including wheels and flicks.' : undefined
  return (
    <SubPage open onClose={onClose} trail={['Sticks', ctx.name]} title="Fine-tune" stepLabel="Group" backLabel="Back to Sticks"
      onStep={direction => onGroup(stepGroup(groups, active, direction))}
      where={`Sticks · ${ctx.name} · Fine-tune · ${groups.find(item => item.id === active)?.label ?? ''}`}>
      <div data-stick-fine-tune={ctx.side}>
        <FineTune groups={groups} active={active} onActive={onGroup} railNote={note} />
      </div>
    </SubPage>
  )
}

/** Sticks ▸ Fine-tune ▸ Advanced (StickAdvanced): Exact curve and Smoothing for tiny turns. */
export function StickAdvanced({ ctx, open, part, onPart, onClose }: { ctx: StickCtx; open: boolean; part: string; onPart: (part: string) => void; onClose: () => void }) {
  const power = readNumber(ctx.text, 'STICK_POWER', 1)
  const smooth = readNumber(ctx.text, 'ROTATE_SMOOTH_OVERRIDE', -1)
  const smoothPreset = ROTATE_SMOOTH_PRESETS.find(item => near(item.smooth, smooth))
  const named = STICK_POWER_PRESETS.find(item => near(item.power, power))
  const { inner, outer } = stickDeadzones(ctx.text, ctx.SIDE)
  return (
    <SubPage open={open} onClose={onClose} trail={['Sticks', ctx.name, 'Fine-tune']} title="Advanced" stepLabel="Part" backLabel="Back to Fine-tune"
      onStep={direction => onPart(stepGroup([{ id: 'curve' }, { id: 'smoothing' }], part, direction))}>
      <AdvancedParts active={part} onActive={onPart} parts={[
        { id: 'curve', eyebrow: 'Looking around · Speed', title: 'Exact curve', description: 'Type the curve’s shape instead of picking a preset.',
          content: <>
            <ValueRow hero label="Curve number" setting="STICK_POWER" value={power} min={0} max={6} step={0.1} fineStep={0.01} format={value => `${named ? `${named.label} · ` : ''}${value.toFixed(1)}`}
              caption="1 is even. Higher is gentler near the centre; lower is quicker." onChange={value => writeKey(ctx.setText, 'STICK_POWER', value === 1 ? null : value)} onReset={() => writeKey(ctx.setText, 'STICK_POWER', null)} />
            <svg viewBox="0 0 300 160" role="img" aria-label="Curve family" className={styles.inlineArt}>
              <path d="M30 140 H290 M30 10 V140" stroke="rgba(255,255,255,.1)" />
              {[0.5, 1, 2, 3].map(value => <path key={value} d={Array.from({ length: 51 }, (_, i) => `${i ? 'L' : 'M'}${30 + (i / 50) * 260},${140 - (aimSpeed(i / 50, inner, outer, value, 1)) * 125}`).join(' ')} stroke={near(value, power) ? 'var(--accent)' : '#808c99'} strokeDasharray={near(value, power) ? undefined : '4 4'} strokeWidth={near(value, power) ? 2 : 1.5} fill="none" />)}
              {![0.5, 1, 2, 3].some(value => near(value, power)) && <path d={Array.from({ length: 51 }, (_, i) => `${i ? 'L' : 'M'}${30 + (i / 50) * 260},${140 - aimSpeed(i / 50, inner, outer, power, 1) * 125}`).join(' ')} stroke="var(--accent)" strokeWidth="2" fill="none" />}
              <text x="160" y="156" fill="#808c99" fontSize="10" textAnchor="middle">How far you push the stick →</text>
            </svg>
            <OpenRow label="Match a full turn (360°)" hint="Makes turn speeds true to the game. Also used by flicks and gyro." value={isSet(ctx.text, 'REAL_WORLD_CALIBRATION') ? 'Set' : 'Start'} onOpen={ctx.open.matchFullTurn} />
          </> },
        { id: 'smoothing', eyebrow: 'Flick to turn · Flick', title: 'Smoothing for tiny turns', description: 'Hides jitter when you roll the stick only a little.',
          content: <>
            <SegmentedRow label="Smoothing" setting="ROTATE_SMOOTH_OVERRIDE" value={smoothPreset?.value ?? 'custom'}
              options={[...ROTATE_SMOOTH_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'custom', label: 'Custom', caption: 'Custom: type the size of turn that counts as tiny.' }]}
              onChange={value => { const found = ROTATE_SMOOTH_PRESETS.find(item => item.value === value); writeChoice(ctx.setText, { ROTATE_SMOOTH_OVERRIDE: found ? (found.smooth === -1 ? null : found.smooth) : 1 }, { ROTATE_SMOOTH_OVERRIDE: -1 }) }}
              onReset={() => writeKey(ctx.setText, 'ROTATE_SMOOTH_OVERRIDE', null)} />
            {!smoothPreset && <ValueRow label="Tiny turn" setting="ROTATE_SMOOTH_OVERRIDE" value={smooth} min={0} max={100} step={0.1} fineStep={0.01} onChange={value => writeKey(ctx.setText, 'ROTATE_SMOOTH_OVERRIDE', value)} />}
            <Note>Bigger turns are never smoothed. Custom lets you type the size of turn that counts as tiny. Flicks with mouse output also use Match a full turn (part 1).</Note>
          </> },
      ]} />
    </SubPage>
  )
}

/** More stick modes (StickSmallModes): the rail is the modes (LT / RT "Mode");
 *  each shows its values and "Use <mode>" puts it on this stick. */
export function StickMoreModes({ ctx, open, onClose, rotationButtons }: { ctx: StickCtx; open: boolean; onClose: () => void; rotationButtons: ButtonDefinition[] }) {
  const currentEntry = moreModeOf(ctx.mode)
  const [active, setActive] = useState<string>(currentEntry ?? 'MOUSE_RING')
  const groups: FineTuneGroup[] = [
    ...MORE_MODES.map(entry => {
      const inUse = currentEntry === entry
      const use = <UseRow label={inUse ? `${MORE_MODE_NAMES[entry].label} is in use` : `Use ${MORE_MODE_NAMES[entry].label}`} hint={inUse ? `On the ${ctx.name.toLowerCase()} now` : `Puts it on the ${ctx.name.toLowerCase()}`}
        value={inUse ? 'In use' : undefined} data={{ 'data-use-mode': entry }} hints={`A:Use ${MORE_MODE_NAMES[entry].label}`}
        onOpen={() => { if (!inUse) ctx.onModeChange(moreModeValue(entry, ctx.mode, ctx.side)) }} />
      return { ...moreGroup(ctx, entry, rotationButtons, use), changed: inUse }
    }),
    deadZoneGroup(ctx),
  ]
  const current = groups.find(item => item.id === active) ?? groups[0]
  return (
    <SubPage open={open} onClose={onClose} trail={['Sticks', ctx.name]} title="Other stick modes" stepLabel="Mode" backLabel="Back to Sticks"
      onStep={direction => setActive(stepGroup(groups, current.id, direction))} where={`Sticks · ${ctx.name} · Other stick modes · ${current.label}`}>
      <div data-stick-more-modes={ctx.side}>
        <FineTune groups={groups} active={current.id} onActive={setActive} railLabel="Mode"
          railNote="Each mode’s values show on its line; “Use …” puts that mode on this stick." />
      </div>
    </SubPage>
  )
}
