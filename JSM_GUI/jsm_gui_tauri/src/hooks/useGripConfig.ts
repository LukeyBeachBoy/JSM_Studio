import { useCallback } from 'react'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { keyName } from '../constants/configKeys'

type GripArgs = { configText: string; setConfigText: React.Dispatch<React.SetStateAction<string>> }

// LEFT_GRIP_RANGE / RIGHT_GRIP_RANGE are the squeeze force each grip must reach to
// register. The grip reaches the host as a single bit, so the threshold behind it
// lives in the controller's firmware -- the same setting Steam Input drives -- and
// JoyShockMapper pushes these two values to the device. They are per hand on
// purpose: nobody holds both sides with the same squeeze.
//
// Values are raw firmware units and -1 means "leave the controller's own value
// alone", which is the default: an unset config never overwrites what the device
// (or Steam) already had.
export const GRIP_RANGE_FIRMWARE_DEFAULT = -1
const GRIP_RANGE_MAX = 32767

export function useGripConfig({ configText, setConfigText }: GripArgs) {
  const read = useCallback((name: string) => getKeymapValue(configText, name), [configText])
  const num = (name: string, fallback: number) => {
    const n = Number.parseFloat(read(name) ?? '')
    return Number.isFinite(n) ? n : fallback
  }

  const leftGripRangeValue = num(keyName.LEFT_GRIP_RANGE, GRIP_RANGE_FIRMWARE_DEFAULT)
  const rightGripRangeValue = num(keyName.RIGHT_GRIP_RANGE, GRIP_RANGE_FIRMWARE_DEFAULT)

  const writeClamped = useCallback(
    (name: string, v: string) => {
      if (v === '') return setConfigText(prev => removeKeymapEntry(prev, name))
      const n = Number.parseFloat(v)
      if (!Number.isFinite(n)) return
      const clamped = Math.max(GRIP_RANGE_FIRMWARE_DEFAULT, Math.min(GRIP_RANGE_MAX, Math.round(n)))
      setConfigText(prev => updateKeymapEntry(prev, name, [clamped]))
    },
    [setConfigText]
  )

  const handleLeftGripRangeChange = useCallback((v: string) => writeClamped(keyName.LEFT_GRIP_RANGE, v), [writeClamped])
  const handleRightGripRangeChange = useCallback((v: string) => writeClamped(keyName.RIGHT_GRIP_RANGE, v), [writeClamped])

  return { leftGripRangeValue, rightGripRangeValue, handleLeftGripRangeChange, handleRightGripRangeChange }
}
