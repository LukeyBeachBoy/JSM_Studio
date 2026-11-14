import { ValueRow } from '../ui/console'
import { readPair, writePair } from '../../utils/gyroSpeed'
import { KeyNumberRow, RowLabel, useGyro } from './GyroContext'

const key = 'GYRO_STEADYING_FLOOR'
const speed = (value: number) => `${Number(value.toFixed(2))} °/s`
const sensitivity = (value: number) => `${Number(value.toFixed(2))}×`

/** Both sensitivity graphs edit the same projected settings, including held variants. */
export function SteadyingRows({ rangeDisabled, floorDisabled }: { rangeDisabled?: string; floorDisabled?: string }) {
  const gyro = useGyro()
  const floor = readPair(gyro.text, key) ?? [0, 0]
  const bandActive = gyro.num('GYRO_CUTOFF_RECOVERY', 0) > gyro.num('GYRO_CUTOFF_SPEED', 0)
  const setFloor = (axis: 0 | 1, value: number) => gyro.setText(previous => {
    const pair: [number, number] = [...floor]
    pair[axis] = value
    return writePair(previous, key, pair)
  })

  return <>
    <RowLabel>Low-speed steadying</RowLabel>
    <KeyNumberRow k="GYRO_CUTOFF_SPEED" label="Gyro cutoff speed" hint="Ignore rotation below this speed."
      fallback={0} min={0} max={360} step={0.1} fineStep={0.01} format={speed} disabled={rangeDisabled} />
    <KeyNumberRow k="GYRO_CUTOFF_RECOVERY" label="Steadying recovery threshold"
      hint={bandActive ? 'Sensitivity reaches the full curve at this speed.' : 'Set recovery above the cutoff to apply the steadying floor.'}
      fallback={0} min={0} max={360} step={0.5} fineStep={0.01} format={speed} disabled={rangeDisabled} />
    {(['horizontal', 'vertical'] as const).map((axis, i) =>
      <ValueRow key={axis} label={`Steadying floor, ${axis} (RWS)`} hint={`Starting sensitivity for ${axis} aim just above the cutoff, capped by the curve.`}
        value={floor[i]} min={0} max={100} step={0.1} fineStep={0.01} format={sensitivity}
        setting={gyro.held ? undefined : key} disabled={floorDisabled ?? gyro.locked} onChange={value => setFloor(i === 0 ? 0 : 1, value)}
        onReset={gyro.get(key) !== undefined ? () => gyro.reset(key) : undefined} data={{ 'data-setting': key }} />
    )}
  </>
}
