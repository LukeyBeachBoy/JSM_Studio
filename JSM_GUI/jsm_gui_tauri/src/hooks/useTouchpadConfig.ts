import { useCallback } from 'react'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { keyName } from '../constants/configKeys'
import { analyzeTouchpadConfig, normalizeTouchpadMode, TOUCHPAD_DUAL_STAGE_MODE_VALUES, type TouchpadMode } from '../utils/touchpadConfig'

type TouchpadArgs = { configText: string; setConfigText: React.Dispatch<React.SetStateAction<string>> }
type Pad = 'LEFT' | 'RIGHT'
const key = (name: string, pad?: Pad) => pad ? `${pad}_${name}` : name

export function useTouchpadConfig({ configText, setConfigText }: TouchpadArgs) {
  const read = useCallback((name: string, pad?: Pad) => getKeymapValue(configText, key(name, pad)), [configText])
  const mode = (pad?: Pad): TouchpadMode => normalizeTouchpadMode(read(keyName.TOUCHPAD_MODE, pad))
  const grid = (pad?: Pad) => { const v = read(keyName.GRID_SIZE, pad)?.split(/\s+/).map(Number) ?? []; return { columns: Number.isFinite(v[0]) ? v[0] : 2, rows: Number.isFinite(v[1]) ? v[1] : 1 } }
  const sensitivity = (pad?: Pad) => { const n = Number.parseFloat(read(keyName.TOUCHPAD_SENS, pad) ?? ''); return Number.isFinite(n) ? n : undefined }
  const value = (name: string, pad?: Pad) => (read(name, pad) ?? '').trim().toUpperCase()
  const touchpadModeValue = mode(); const leftTouchpadModeValue = mode('LEFT'); const rightTouchpadModeValue = mode('RIGHT')
  const gridSizeValue = grid(); const leftGridSizeValue = grid('LEFT'); const rightGridSizeValue = grid('RIGHT')
  const touchpadSensitivityValue = sensitivity(); const leftTouchpadSensitivityValue = sensitivity('LEFT'); const rightTouchpadSensitivityValue = sensitivity('RIGHT')
  const touchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE); const leftTouchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE, 'LEFT'); const rightTouchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE, 'RIGHT')
  const update = useCallback((name: string, val: string, pad?: Pad) => setConfigText(prev => val ? updateKeymapEntry(prev, key(name, pad), [val]) : removeKeymapEntry(prev, key(name, pad))), [setConfigText])
  const handleMode = useCallback((val: string, pad?: Pad) => { const normalized = normalizeTouchpadMode(val); setConfigText(prev => { let n = normalized ? updateKeymapEntry(prev, key(keyName.TOUCHPAD_MODE, pad), [normalized]) : removeKeymapEntry(prev, key(keyName.TOUCHPAD_MODE, pad)); if (!pad && normalized) { n = updateKeymapEntry(n, keyName.LEFT_TOUCHPAD_MODE, [normalized]); n = updateKeymapEntry(n, keyName.RIGHT_TOUCHPAD_MODE, [normalized]) } return n }) }, [setConfigText])
  const handleGrid = useCallback((c: number, r: number, pad?: Pad) => setConfigText(prev => updateKeymapEntry(prev, key(keyName.GRID_SIZE, pad), [Math.max(1, Math.min(5, Math.round(c))), Math.max(1, Math.min(5, Math.round(r)))])), [setConfigText])
  const handleSens = useCallback((v: string, pad?: Pad) => { if (v === '') return update(keyName.TOUCHPAD_SENS, '', pad); const n = Number.parseFloat(v); if (Number.isFinite(n)) update(keyName.TOUCHPAD_SENS, String(n), pad) }, [update])
  const handleDual = useCallback((v: string, pad?: Pad) => { const n = v.trim().toUpperCase(); update(keyName.TOUCHPAD_DUAL_STAGE_MODE, n === 'NO_SKIP' ? '' : ((TOUCHPAD_DUAL_STAGE_MODE_VALUES as readonly string[]).includes(n) ? n : ''), pad) }, [update])
  const simple = (name: string) => (v: string, pad?: Pad) => update(name, v.trim().toUpperCase(), pad)
  return { touchpadModeValue, leftTouchpadModeValue, rightTouchpadModeValue, gridSizeValue, leftGridSizeValue, rightGridSizeValue, touchpadSensitivityValue, leftTouchpadSensitivityValue, rightTouchpadSensitivityValue, touchpadDualStageModeValue, leftTouchpadDualStageModeValue, rightTouchpadDualStageModeValue, touchStickModeValue:value(keyName.TOUCH_STICK_MODE), touchDeadzoneInnerValue:value(keyName.TOUCH_DEADZONE_INNER), touchRingModeValue:value(keyName.TOUCH_RING_MODE), touchStickRadiusValue:value(keyName.TOUCH_STICK_RADIUS), touchStickAxisValue:value(keyName.TOUCH_STICK_AXIS), touchpadWarnings: analyzeTouchpadConfig(configText).warnings, handleTouchpadModeChange:(v:string)=>handleMode(v), handleLeftTouchpadModeChange:(v:string)=>handleMode(v,'LEFT'), handleRightTouchpadModeChange:(v:string)=>handleMode(v,'RIGHT'), handleGridSizeChange:(c:number,r:number)=>handleGrid(c,r), handleLeftGridSizeChange:(c:number,r:number)=>handleGrid(c,r,'LEFT'), handleRightGridSizeChange:(c:number,r:number)=>handleGrid(c,r,'RIGHT'), handleTouchpadSensitivityChange:(v:string)=>handleSens(v), handleLeftTouchpadSensitivityChange:(v:string)=>handleSens(v,'LEFT'), handleRightTouchpadSensitivityChange:(v:string)=>handleSens(v,'RIGHT'), handleTouchpadDualStageModeChange:(v:string)=>handleDual(v), handleLeftTouchpadDualStageModeChange:(v:string)=>handleDual(v,'LEFT'), handleRightTouchpadDualStageModeChange:(v:string)=>handleDual(v,'RIGHT'), handleTouchStickModeChange:simple(keyName.TOUCH_STICK_MODE), handleTouchDeadzoneInnerChange:simple(keyName.TOUCH_DEADZONE_INNER), handleTouchRingModeChange:simple(keyName.TOUCH_RING_MODE), handleTouchStickRadiusChange:simple(keyName.TOUCH_STICK_RADIUS), handleTouchStickAxisChange:simple(keyName.TOUCH_STICK_AXIS) }
}
