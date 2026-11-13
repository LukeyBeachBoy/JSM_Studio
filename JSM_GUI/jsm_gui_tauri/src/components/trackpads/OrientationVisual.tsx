import type { TelemetryDeviceStatus } from '../../hooks/useTelemetry'
import { rotatePadPoint, type PadPoint } from '../../utils/touchpadOrientation'
import { VisualPanel } from '../sticks/shared'
import type { PadSide } from './padModes'

const validPoint = (point?: PadPoint): point is PadPoint => !!point &&
  Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
const coordinates = (point: PadPoint) => `x ${point.x.toFixed(2)}, y ${point.y.toFixed(2)}`

export function OrientationVisual({ side, name, rotation, status }: {
  side: PadSide; name: string; rotation: number; status?: TelemetryDeviceStatus
}) {
  const pad = status?.[side === 'left' ? 'leftPad' : 'rightPad']
  const sensor = status?.[side === 'left' ? 'leftPadRaw' : 'rightPadRaw']
  const touched = !!pad?.touched
  const raw = touched && validPoint(sensor) ? sensor : null
  const output = raw ? rotatePadPoint(raw, rotation) : touched && validPoint(pad) ? pad : null
  const state = !status ? 'No controller connected' : !pad ? 'No pad telemetry' : !touched ? 'Touch the pad to see live input' : raw ? 'Live sensor input' : 'Live mapper output · raw input unavailable'
  const reference = rotatePadPoint({ x: 0, y: -0.8 }, rotation)
  const description = `${name} orientation, ${rotation} degrees clockwise. ${state}.${raw ? ` Sensor: ${coordinates(raw)}.` : ''}${output ? ` ${raw ? 'Preview' : 'Mapper output'}: ${coordinates(output)}.` : ''}`
  const diagram = (cx: number, label: string, point: PadPoint | null, direction: PadPoint) => <g>
    <text x={cx} y={22} textAnchor="middle" fill="var(--text-1)" fontSize={13}>{label}</text>
    <rect x={cx - 70} y={42} width={140} height={140} rx={12} fill="var(--surface-sunken)" stroke="var(--line-2)" />
    <path d={`M${cx - 62} 112 H${cx + 62} M${cx} 50 V174`} stroke="var(--text-3)" strokeDasharray="3 5" opacity={0.5} />
    <line x1={cx} y1={112} x2={cx + direction.x * 62} y2={112 + direction.y * 62} stroke="var(--accent)" strokeWidth={2} />
    <circle cx={cx + direction.x * 62} cy={112 + direction.y * 62} r={4} fill="none" stroke="var(--accent)" strokeWidth={2} />
    <text x={cx} y={201} textAnchor="middle" fill="var(--text-2)" fontSize={11}>{point ? coordinates(point) : 'No touch'}</text>
    {point && <circle data-orientation-point={label === 'Sensor input' ? 'raw' : 'output'} cx={cx + point.x * 70} cy={112 + point.y * 70} r={5} fill="var(--telemetry)" stroke="var(--surface-sunken)" strokeWidth={2} />}
  </g>
  return <VisualPanel title={`${name} orientation`} chip={`${rotation > 0 ? '+' : ''}${rotation}°`}
    caption={`${state}. Hollow markers show how sensor-up is rotated; filled dots show your touch. Positive angles rotate clockwise.${raw ? ' The right dot previews the current setting immediately.' : output ? ' Raw input is unavailable, so the right dot shows the mapper’s already-rotated output.' : ''}`}>
    <svg viewBox="0 0 380 212" role="img" aria-label={description} data-pad-orientation={side}>
      {diagram(96, 'Sensor input', raw, { x: 0, y: -0.8 })}
      {diagram(284, raw ? 'Rotated preview' : 'Mapper output', output, reference)}
    </svg>
  </VisualPanel>
}
