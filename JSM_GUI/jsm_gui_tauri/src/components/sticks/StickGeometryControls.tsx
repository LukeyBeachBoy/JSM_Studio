import { OpenRow, SwitchRow, ValueRow } from '../ui/console'
import { rotationToUp, type StickGeometry, type StickPoint } from '../../utils/stickGeometry'
import { writeKey, type SetText } from './shared'
import { StickCalibration } from './StickCalibration'

export function StickGeometryControls({ side, geometry, raw, setText, cyborg, disabled, global }: {
  side: 'LEFT' | 'RIGHT'; geometry: StickGeometry; raw: StickPoint | null; setText?: SetText; cyborg: boolean; disabled?: boolean; global?: boolean
}) {
  const unavailable = disabled || !setText ? 'This layout is read-only' : undefined
  const rotationKey = `${side}_STICK_ROTATION`, ringKey = `${side}_STICK_RESTRICTOR_RING`, rangeKey = `${side}_STICK_RESTRICTOR_RANGE`
  return <div data-stick-geometry={side}>
    {cyborg && <SwitchRow global={global} label="Restrictor ring" setting={ringKey} on={geometry.restrictor} disabled={unavailable}
      hint={`Reach full movement with the ring’s shorter travel.${global ? ' Default for every game.' : ''}`}
      onChange={on => writeKey(setText, ringKey, on ? 'ON' : 'OFF')} onReset={() => writeKey(setText, ringKey, null)} />}
    {cyborg && geometry.restrictor && <ValueRow global={global} label="Ring travel" setting={rangeKey} value={Math.round(geometry.range * 1000) / 10}
      min={10} max={100} step={1} fineStep={.1} format={value => `${value}%`} disabled={unavailable}
      caption="Physical travel that becomes full input. Lower it if the adjusted vector cannot reach the edge with the ring fitted."
      onChange={value => writeKey(setText, rangeKey, Number((value / 100).toFixed(3)))} onReset={() => writeKey(setText, rangeKey, null)} />}
    <ValueRow global={global} label="Stick rotation" setting={rotationKey} value={geometry.rotation} min={-180} max={180} step={1} fineStep={.1}
      format={value => `${value > 0 ? '+' : ''}${value.toFixed(1)}°`} disabled={unavailable}
      caption="Align your natural flick with a cardinal direction. Positive turns clockwise; negative turns anticlockwise."
      onChange={value => writeKey(setText, rotationKey, value)} onReset={() => writeKey(setText, rotationKey, null)} />
    <OpenRow label="Use current direction as up" hint="Hold the stick in your natural forward direction, then select this."
      value="Align" disabled={unavailable ?? (!raw || Math.hypot(raw.x, raw.y) < .25 ? 'Hold the stick forward to align it' : undefined)}
      onOpen={() => { if (raw && Math.hypot(raw.x, raw.y) >= .25) writeKey(setText, rotationKey, rotationToUp(raw)) }} />
    <StickCalibration side={side} geometry={geometry} raw={raw} setText={setText} disabled={unavailable} global={global} />
  </div>
}
