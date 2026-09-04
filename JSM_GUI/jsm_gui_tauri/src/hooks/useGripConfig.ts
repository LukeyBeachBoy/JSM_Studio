import { useCallback } from 'react'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { HAPTIC_EFFECTS } from '../utils/hapticBindings'
import { keyName } from '../constants/configKeys'

type GripArgs = { configText: string; setConfigText: React.Dispatch<React.SetStateAction<string>> }

// The grip sensors are the capacitive strips inside the handles: they sense how
// near your hands are, not how hard you squeeze. The physical back buttons
// (L4/R4/L5/R5) are separate switches and none of this touches them.
//
// Both knobs live in the controller's firmware, which is the only place a
// threshold on a capacitive signal can act -- by the time the host sees it, it is
// one bit. They are the pair behind Steam Input's Grip Sensor Calibration page.
// The firmware carries a single capacitive threshold pair rather than one per
// side, which is also why Steam Input shows a single Range and a single Flicker
// Guard.
//
// -1 means "leave the controller's own value alone", which is the default: an
// unset config never overwrites what the device (or Steam) already had.
export const GRIP_FIRMWARE_DEFAULT = -1
const GRIP_RANGE_MAX = 32767

export function useGripConfig({ configText, setConfigText }: GripArgs) {
  const read = useCallback((name: string) => getKeymapValue(configText, name), [configText])
  const num = (name: string, fallback: number) => {
    const n = Number.parseFloat(read(name) ?? '')
    return Number.isFinite(n) ? n : fallback
  }

  const gripSensorRangeValue = num(keyName.GRIP_SENSOR_RANGE, GRIP_FIRMWARE_DEFAULT)
  const gripFlickerGuardValue = num(keyName.GRIP_FLICKER_GUARD, GRIP_FIRMWARE_DEFAULT)
  // Haptics are a plain 0-100 intensity, not a firmware threshold: 0 is off, not
  // "leave it alone", because there is nothing on the device to leave alone.
  const gripHapticIntensityValue = num(keyName.GRIP_HAPTIC_INTENSITY, 0)
  // CLICK is the backend's default: the tap Steam Input plays while calibrating
  // the grip sensors.
  const gripHapticEffectValue = (() => {
    const raw = read(keyName.GRIP_HAPTIC_EFFECT)?.trim().toUpperCase()
    return raw && HAPTIC_EFFECTS.some(effect => effect === raw) ? raw : 'CLICK'
  })()

  const writeClamped = useCallback(
    (name: string, v: string, lo: number, hi: number) => {
      if (v === '') return setConfigText(prev => removeKeymapEntry(prev, name))
      const n = Number.parseFloat(v)
      if (!Number.isFinite(n)) return
      setConfigText(prev => updateKeymapEntry(prev, name, [Math.max(lo, Math.min(hi, Math.round(n)))]))
    },
    [setConfigText]
  )

  const handleGripSensorRangeChange = useCallback(
    (v: string) => writeClamped(keyName.GRIP_SENSOR_RANGE, v, GRIP_FIRMWARE_DEFAULT, GRIP_RANGE_MAX),
    [writeClamped]
  )
  const handleGripFlickerGuardChange = useCallback(
    (v: string) => writeClamped(keyName.GRIP_FLICKER_GUARD, v, GRIP_FIRMWARE_DEFAULT, GRIP_RANGE_MAX),
    [writeClamped]
  )
  const handleGripHapticIntensityChange = useCallback(
    (v: string) => writeClamped(keyName.GRIP_HAPTIC_INTENSITY, v, 0, 100),
    [writeClamped]
  )
  const handleGripHapticEffectChange = useCallback(
    (v: string) => {
      const next = v.trim().toUpperCase()
      if (!HAPTIC_EFFECTS.some(effect => effect === next)) return
      setConfigText(prev => updateKeymapEntry(prev, keyName.GRIP_HAPTIC_EFFECT, [next]))
    },
    [setConfigText]
  )

  return {
    gripSensorRangeValue,
    gripFlickerGuardValue,
    gripHapticIntensityValue,
    gripHapticEffectValue,
    handleGripSensorRangeChange,
    handleGripFlickerGuardChange,
    handleGripHapticIntensityChange,
    handleGripHapticEffectChange,
  }
}
