import { readVirtualSetting, writeVirtualSetting } from './virtualStickSettings'

export function gyroDeflectionEnabled(text: string, prefix = '') {
  return readVirtualSetting(text, 'GYRO_STICK_DEFLECTION', prefix) === 'ON'
}

export function gyroDeflectionRange(text: string, prefix = '') {
  const raw = readVirtualSetting(text, 'GYRO_DEFLECTION_RANGE', prefix)
  const parts = (raw ?? '30 30').trim().split(/\s+/).map(Number)
  const x = parts[0], y = parts[1] ?? x
  const valid = parts.length <= 2 && [x, y].every(value => Number.isFinite(value) && value >= 1 && value <= 180)
  return { x: valid ? x : 30, y: valid ? y : 30, problem: valid ? null : 'Imported deflection range is outside 1–180°. It is preserved until edited.' }
}

export function writeGyroDeflectionRange(owned: string, source: string, axis: 'x' | 'y', value: number, prefix = '') {
  if (!Number.isFinite(value) || value < 1 || value > 180) return owned
  const range = gyroDeflectionRange(source, prefix)
  return writeVirtualSetting(owned, 'GYRO_DEFLECTION_RANGE', `${axis === 'x' ? value : range.x} ${axis === 'y' ? value : range.y}`, prefix)
}
