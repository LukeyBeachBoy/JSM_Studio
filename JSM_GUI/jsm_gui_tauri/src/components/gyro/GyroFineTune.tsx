import { useEffect, useState } from 'react'
import { SubPage, FineTune, stepGroup } from '../ui/console'
import { isVirtualStickTarget } from '../../utils/virtualStickSettings'
import type { GyroGroup, GyroSub } from '../../utils/gyroRoutes'
import { useGyro, PadActions } from './GyroContext'
import { useSpeedGroup, useSteadinessGroup, useDirectionGroup, useTiltGroup, useRumbleGroup } from './groups'
import { SpeedAdvanced, type SpeedPart } from './SpeedAdvanced'
import { MatchFullTurn } from './MatchFullTurn'
import { SteadinessAdvanced, type SteadinessPart } from './SteadinessAdvanced'
import { DirectionAdvanced } from './DirectionAdvanced'
import { TiltSettings, type TiltPart } from './TiltSettings'
import { StickSettings, type StickPart } from './StickSettings'
import { GyroMore, type MoreEntry } from './GyroMore'

// Gyro ▸ Fine-tune (GyroFineTune): the rail of five groups (Speed, Steadiness,
// Direction, Tilt, Rumble), one open at a time beside its live visual; LT / RT
// step the groups. Advanced, Match a full turn, Tilt's parts and Stick settings
// open as sub-pages over it and stack: B goes back one.

/** The sub-pages a route opens, bottom first (Tilt's parts open over the Tilt group). */
export const subStack = (sub?: GyroSub | null): GyroSub[] => !sub ? [] : [sub]

type Props = {
  open: boolean
  onClose: () => void
  /** Up to and including "Gyro" (and "While holding RB" for a held variant). */
  trail: string[]
  group: GyroGroup
  onGroup: (group: GyroGroup) => void
  /** Sub-pages opened by a route; changing `routeKey` replaces the stack. */
  initialSub?: GyroSub | null
  routeKey?: number
  /** Tilt ▸ While holding… (the base editor only). */
  onTiltWhileHolding?: () => void
  /** Y's menu (the base editor only): the other screens, copy and paste tuning. */
  more?: MoreEntry[]
}

export function GyroFineTune({ open, onClose, trail, group, onGroup, initialSub, routeKey, onTiltWhileHolding, more }: Props) {
  const gyro = useGyro()
  const [stack, setStack] = useState<GyroSub[]>(() => subStack(initialSub))
  useEffect(() => { setStack(subStack(initialSub)) }, [routeKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const push = (sub: GyroSub) => setStack(previous => [...previous, sub])
  const pop = () => setStack(previous => previous.slice(0, -1))
  const replaceTop = (sub: GyroSub) => setStack(previous => [...previous.slice(0, -1), sub])

  const tiltHeld = gyro.held ? 'Tilt has its own mode shift (Tilt ▸ Mode shift).' : undefined
  const groups = [useSpeedGroup(push), useSteadinessGroup(push), useDirectionGroup(push), useTiltGroup(push, tiltHeld, onTiltWhileHolding), useRumbleGroup()]
  const output = (gyro.get('GYRO_OUTPUT') ?? 'MOUSE').toUpperCase()
  const fineTrail = [...trail, 'Fine-tune']
  const tryIt = gyro.callbacks.onTryIt
  const labelOf = (id: string) => groups.find(item => item.id === id)?.label ?? ''

  const renderSub = (sub: GyroSub, index: number) => {
    const close = pop
    const subTrail = [...fineTrail, labelOf(group)]
    switch (sub.view) {
      case 'speed-advanced':
        return <SpeedAdvanced key={index} open onClose={close} trail={[...fineTrail, 'Speed']} part={(sub.part ?? 'speeds') as SpeedPart}
          onPart={part => replaceTop({ view: 'speed-advanced', part })} onMatchTurn={() => push({ view: 'match-turn' })} />
      case 'match-turn':
        return <MatchFullTurn key={index} open onClose={close} trail={[...fineTrail, 'Speed']} />
      case 'steadiness-advanced':
        return <SteadinessAdvanced key={index} open onClose={close} trail={[...fineTrail, 'Steadiness']} part={(sub.part ?? 'smoothing') as SteadinessPart}
          onPart={part => replaceTop({ view: 'steadiness-advanced', part })} />
      case 'direction-advanced':
        return <DirectionAdvanced key={index} open onClose={close} trail={[...fineTrail, 'Direction']} onTilt={() => push({ view: 'tilt' })} tiltUnavailable={tiltHeld} />
      case 'tilt':
        return <TiltSettings key={index} open onClose={close} trail={[...fineTrail, 'Tilt']} part={(sub.part ?? 'behaviour') as TiltPart}
          onPart={part => replaceTop({ view: 'tilt', part })} onWhileHolding={onTiltWhileHolding} held={Boolean(gyro.held)} />
      case 'stick':
        return <StickSettings key={index} open onClose={close} trail={[...fineTrail, 'Direction']} target={isVirtualStickTarget(output) ? output : 'RIGHT_STICK'}
          part={(sub.part ?? 'setup') as StickPart} onPart={part => replaceTop({ view: 'stick', part })} />
      default:
        void subTrail
        return null
    }
  }

  return <>
    <SubPage open={open} onClose={onClose} trail={trail} title="Fine-tune" stepLabel="Group" backLabel={gyro.held ? 'Back' : 'Back to Gyro'}
      onStep={direction => onGroup(stepGroup(groups, group, direction) as GyroGroup)}
      hints={tryIt ? [{ button: 'X', label: 'Try it' }] : undefined}
      where={`${fineTrail.join(' · ')} · ${labelOf(group)}`}>
      {(() => {
        const page = (
          <div data-gyro-fine-tune-page="" data-group={group}>
            <FineTune groups={groups} active={group} onActive={id => onGroup(id as GyroGroup)}
              railNote={gyro.held ? `${trail[trail.length - 1]}, these replace the normal gyro settings. Anything you don’t change follows them.` : undefined} />
          </div>
        )
        return more ? <GyroMore entries={more} eyebrow="Gyro · Fine-tune" x={tryIt}>{page}</GyroMore> : <PadActions x={tryIt}>{page}</PadActions>
      })()}
    </SubPage>
    {open && stack.map(renderSub)}
  </>
}
