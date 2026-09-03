import { useCallback } from 'react'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { keyName } from '../constants/configKeys'

type GripArgs = { configText: string; setConfigText: React.Dispatch<React.SetStateAction<string>> }

// GRIP_THRESHOLD / GRIP_HYSTERESIS are global settings (no LEFT_/RIGHT_ variants --
// both grip sensors share one press distance and one release margin, matching how
// the backend's Schmitt trigger reads them).
export function useGripConfig({ configText, setConfigText }: GripArgs) {
  const read = useCallback((name: string) => getKeymapValue(configText, name), [configText])
  const num = (name: string, fallback: number) => {
    const n = Number.parseFloat(read(name) ?? '')
    return Number.isFinite(n) ? n : fallback
  }

  const gripThresholdValue = num(keyName.GRIP_THRESHOLD, 0.5)
  const gripHysteresisValue = num(keyName.GRIP_HYSTERESIS, 0.08)

  const writeClamped = useCallback(
    (name: string, v: string) => {
      if (v === '') return setConfigText(prev => removeKeymapEntry(prev, name))
      const n = Number.parseFloat(v)
      if (!Number.isFinite(n)) return
      setConfigText(prev => updateKeymapEntry(prev, name, [Math.max(0, Math.min(1, n))]))
    },
    [setConfigText]
  )

  const handleGripThresholdChange = useCallback((v: string) => writeClamped(keyName.GRIP_THRESHOLD, v), [writeClamped])
  const handleGripHysteresisChange = useCallback((v: string) => writeClamped(keyName.GRIP_HYSTERESIS, v), [writeClamped])

  return { gripThresholdValue, gripHysteresisValue, handleGripThresholdChange, handleGripHysteresisChange }
}
