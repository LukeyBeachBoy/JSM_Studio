import { useCallback, useMemo } from 'react'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { keyName } from '../constants/configKeys'
import {
  analyzeTouchpadConfig,
  normalizeTouchpadMode,
  TOUCHPAD_DUAL_STAGE_MODE_VALUES,
  type TouchpadMode,
} from '../utils/touchpadConfig'

type TouchpadArgs = {
  configText: string
  setConfigText: React.Dispatch<React.SetStateAction<string>>
}

export function useTouchpadConfig({ configText, setConfigText }: TouchpadArgs) {
  const touchpadModeValue = useMemo<TouchpadMode>(
    () => normalizeTouchpadMode(getKeymapValue(configText, keyName.TOUCHPAD_MODE)),
    [configText]
  )
  const gridSizeRaw = useMemo(() => getKeymapValue(configText, keyName.GRID_SIZE), [configText])
  const gridSizeValue = useMemo(() => {
    if (gridSizeRaw) {
      const tokens = gridSizeRaw.split(/\s+/).map(token => Number(token))
      const cols = Number.isFinite(tokens[0]) ? tokens[0] : 2
      const rows = Number.isFinite(tokens[1]) ? tokens[1] : 1
      return { columns: cols, rows: rows }
    }
    return { columns: 2, rows: 1 }
  }, [gridSizeRaw])

  const touchpadSensitivityValue = useMemo(() => {
    const raw = getKeymapValue(configText, keyName.TOUCHPAD_SENS)
    if (!raw) return undefined
    const parsed = parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }, [configText])
  const touchpadDualStageModeRaw = useMemo(
    () => (getKeymapValue(configText, keyName.TOUCHPAD_DUAL_STAGE_MODE) ?? '').trim().toUpperCase(),
    [configText]
  )
  const touchStickModeValue = useMemo(
    () => (getKeymapValue(configText, keyName.TOUCH_STICK_MODE) ?? '').trim().toUpperCase(),
    [configText]
  )
  const touchDeadzoneInnerValue = useMemo(() => getKeymapValue(configText, keyName.TOUCH_DEADZONE_INNER) ?? '', [configText])
  const touchRingModeValue = useMemo(
    () => (getKeymapValue(configText, keyName.TOUCH_RING_MODE) ?? '').trim().toUpperCase(),
    [configText]
  )
  const touchStickRadiusValue = useMemo(() => getKeymapValue(configText, keyName.TOUCH_STICK_RADIUS) ?? '', [configText])
  const touchStickAxisValue = useMemo(
    () => (getKeymapValue(configText, keyName.TOUCH_STICK_AXIS) ?? '').trim().toUpperCase(),
    [configText]
  )
  const touchpadWarnings = useMemo(() => analyzeTouchpadConfig(configText).warnings, [configText])

  const handleTouchpadModeChange = useCallback(
    (value: string) => {
      const upper = normalizeTouchpadMode(value)
      setConfigText(prev => {
        let next = prev
        if (upper === '') {
          next = removeKeymapEntry(next, keyName.TOUCHPAD_MODE)
          next = removeKeymapEntry(next, keyName.LEFT_TOUCHPAD_MODE)
          next = removeKeymapEntry(next, keyName.RIGHT_TOUCHPAD_MODE)
          return next
        }
        next = updateKeymapEntry(next, keyName.TOUCHPAD_MODE, [upper])
        // Steam Controller 2026 has two physical pads. Keep the legacy
        // combined control useful by mirroring an explicit mode to both pads;
        // the dedicated left/right controls can override these afterwards.
        next = updateKeymapEntry(next, keyName.LEFT_TOUCHPAD_MODE, [upper])
        next = updateKeymapEntry(next, keyName.RIGHT_TOUCHPAD_MODE, [upper])
        if (upper === 'GRID_AND_STICK' && !gridSizeRaw) {
          next = updateKeymapEntry(next, keyName.GRID_SIZE, [gridSizeValue.columns, gridSizeValue.rows])
        }
        return next
      })
    },
    [gridSizeRaw, gridSizeValue.columns, gridSizeValue.rows, setConfigText]
  )

  const handleGridSizeChange = useCallback((columns: number, rows: number) => {
    const cols = Math.max(1, Math.min(5, Math.round(columns)))
    const rws = Math.max(1, Math.min(5, Math.round(rows)))
    setConfigText(prev => updateKeymapEntry(prev, keyName.GRID_SIZE, [cols, rws]))
  }, [setConfigText])

  const handleTouchpadSensitivityChange = useCallback((value: string) => {
    if (value === '') {
      setConfigText(prev => removeKeymapEntry(prev, keyName.TOUCHPAD_SENS))
      return
    }
    const parsed = parseFloat(value)
    if (Number.isNaN(parsed)) return
    setConfigText(prev => updateKeymapEntry(prev, keyName.TOUCHPAD_SENS, [parsed]))
  }, [setConfigText])

  const handleTouchpadDualStageModeChange = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase()
    setConfigText(prev => {
      if (!normalized || normalized === 'NO_SKIP') {
        return removeKeymapEntry(prev, keyName.TOUCHPAD_DUAL_STAGE_MODE)
      }
      if (!(TOUCHPAD_DUAL_STAGE_MODE_VALUES as readonly string[]).includes(normalized)) {
        return prev
      }
      return updateKeymapEntry(prev, keyName.TOUCHPAD_DUAL_STAGE_MODE, [normalized])
    })
  }, [setConfigText])

  const handleTouchStickModeChange = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase()
    setConfigText(prev =>
      !normalized
        ? removeKeymapEntry(prev, keyName.TOUCH_STICK_MODE)
        : updateKeymapEntry(prev, keyName.TOUCH_STICK_MODE, [normalized])
    )
  }, [setConfigText])

  const handleTouchDeadzoneInnerChange = useCallback((value: string) => {
    const nextValue = value.trim()
    setConfigText(prev => {
      if (!nextValue) return removeKeymapEntry(prev, keyName.TOUCH_DEADZONE_INNER)
      const numeric = Number(nextValue)
      if (Number.isNaN(numeric)) return prev
      return updateKeymapEntry(prev, keyName.TOUCH_DEADZONE_INNER, [numeric])
    })
  }, [setConfigText])

  const handleTouchRingModeChange = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase()
    setConfigText(prev =>
      !normalized
        ? removeKeymapEntry(prev, keyName.TOUCH_RING_MODE)
        : updateKeymapEntry(prev, keyName.TOUCH_RING_MODE, [normalized])
    )
  }, [setConfigText])

  const handleTouchStickRadiusChange = useCallback((value: string) => {
    const nextValue = value.trim()
    setConfigText(prev => {
      if (!nextValue) return removeKeymapEntry(prev, keyName.TOUCH_STICK_RADIUS)
      const numeric = Number(nextValue)
      if (Number.isNaN(numeric)) return prev
      return updateKeymapEntry(prev, keyName.TOUCH_STICK_RADIUS, [numeric])
    })
  }, [setConfigText])

  const handleTouchStickAxisChange = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase()
    setConfigText(prev =>
      !normalized
        ? removeKeymapEntry(prev, keyName.TOUCH_STICK_AXIS)
        : updateKeymapEntry(prev, keyName.TOUCH_STICK_AXIS, [normalized])
    )
  }, [setConfigText])

  return {
    touchpadModeValue,
    gridSizeValue,
    touchpadSensitivityValue,
    touchpadDualStageModeValue: touchpadDualStageModeRaw,
    touchStickModeValue,
    touchDeadzoneInnerValue,
    touchRingModeValue,
    touchStickRadiusValue,
    touchStickAxisValue,
    touchpadWarnings,
    handleTouchpadModeChange,
    handleGridSizeChange,
    handleTouchpadSensitivityChange,
    handleTouchpadDualStageModeChange,
    handleTouchStickModeChange,
    handleTouchDeadzoneInnerChange,
    handleTouchRingModeChange,
    handleTouchStickRadiusChange,
    handleTouchStickAxisChange,
  }
}
