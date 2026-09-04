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
  // TOUCHPAD_SENS is a FloatXY: "4" means both axes, "4 2" means X then Y. The old
  // parseFloat kept only the first number, so a vertical value in an existing config
  // was silently dropped on read and erased on the next write.
  const sensitivity = (pad?: Pad) => {
    const parts = (read(keyName.TOUCHPAD_SENS, pad) ?? '').trim().split(/\s+/).map(v => Number.parseFloat(v))
    const x = Number.isFinite(parts[0]) ? parts[0] : undefined
    const y = Number.isFinite(parts[1]) ? parts[1] : x
    return { x, y }
  }
    const acceleration = (pad?: Pad) => { const n = Number.parseFloat(read(keyName.TOUCHPAD_ACCELERATION, pad) ?? ''); return Number.isFinite(n) ? n : undefined }
  // These are global in JoyShockMapper -- there are no LEFT_/RIGHT_ variants --
  // so they live above the per-pad cards. TOUCHPAD_MIN_CUTOFF and
  // TOUCHPAD_SPEED_COEFF are the One Euro filter's two dials; they replace
  // the One Euro filter's two dials.
  const globalNum = (name: string, fallback: number) => { const n = Number.parseFloat(read(name) ?? ''); return Number.isFinite(n) ? n : fallback }
  // Must track the backend's JSMSetting defaults in main.cpp -- these are
  // display fallbacks for "not set in config", not independent defaults.
  const touchpadMinCutoffValue = globalNum(keyName.TOUCHPAD_MIN_CUTOFF, 6.0)
  const touchpadSpeedCoeffValue = globalNum(keyName.TOUCHPAD_SPEED_COEFF, 0.6)
  const touchpadTrackballDecayValue = globalNum(keyName.TOUCHPAD_TRACKBALL_DECAY, 0)
  const value = (name: string, pad?: Pad) => (read(name, pad) ?? '').trim().toUpperCase()
  const touchpadModeValue = mode(); const leftTouchpadModeValue = mode('LEFT'); const rightTouchpadModeValue = mode('RIGHT')
  const gridSizeValue = grid(); const leftGridSizeValue = grid('LEFT'); const rightGridSizeValue = grid('RIGHT')
  const sensAll = sensitivity(); const sensLeft = sensitivity('LEFT'); const sensRight = sensitivity('RIGHT')
  const touchpadSensitivityValue = sensAll.x; const leftTouchpadSensitivityValue = sensLeft.x; const rightTouchpadSensitivityValue = sensRight.x
  const touchpadSensitivityYValue = sensAll.y; const leftTouchpadSensitivityYValue = sensLeft.y; const rightTouchpadSensitivityYValue = sensRight.y
  const touchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE); const leftTouchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE, 'LEFT'); const rightTouchpadDualStageModeValue = value(keyName.TOUCHPAD_DUAL_STAGE_MODE, 'RIGHT')
  const touchpadAccelerationValue = acceleration(); const leftTouchpadAccelerationValue = acceleration('LEFT'); const rightTouchpadAccelerationValue = acceleration('RIGHT')
  const update = useCallback((name: string, val: string, pad?: Pad) => setConfigText(prev => val ? updateKeymapEntry(prev, key(name, pad), [val]) : removeKeymapEntry(prev, key(name, pad))), [setConfigText])
  const handleMode = useCallback((val: string, pad?: Pad) => { const normalized = normalizeTouchpadMode(val); setConfigText(prev => { let n = normalized ? updateKeymapEntry(prev, key(keyName.TOUCHPAD_MODE, pad), [normalized]) : removeKeymapEntry(prev, key(keyName.TOUCHPAD_MODE, pad)); if (!pad && normalized) { n = updateKeymapEntry(n, keyName.LEFT_TOUCHPAD_MODE, [normalized]); n = updateKeymapEntry(n, keyName.RIGHT_TOUCHPAD_MODE, [normalized]) } return n }) }, [setConfigText])
  const handleGrid = useCallback((c: number, r: number, pad?: Pad) => setConfigText(prev => updateKeymapEntry(prev, key(keyName.GRID_SIZE, pad), [Math.max(1, Math.min(5, Math.round(c))), Math.max(1, Math.min(5, Math.round(r)))])), [setConfigText])
  const handleSens = useCallback((v: string, pad?: Pad, axis: 'x' | 'y' = 'x') => {
    const cur = sensitivity(pad)
    if (v === '') {
      // Clearing X removes the setting entirely; clearing Y collapses back to one value.
      if (axis === 'x') return update(keyName.TOUCHPAD_SENS, '', pad)
      return update(keyName.TOUCHPAD_SENS, cur.x === undefined ? '' : String(cur.x), pad)
    }
    const n = Number.parseFloat(v)
    if (!Number.isFinite(n)) return
    const x = axis === 'x' ? n : (cur.x ?? n)
    const y = axis === 'y' ? n : (cur.y ?? n)
    // Emit the pair only when the axes differ, so single-value configs stay single-value.
    update(keyName.TOUCHPAD_SENS, x === y ? String(x) : `${x} ${y}`, pad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [update, configText])
  const handleDual = useCallback((v: string, pad?: Pad) => { const n = v.trim().toUpperCase(); update(keyName.TOUCHPAD_DUAL_STAGE_MODE, n === 'NO_SKIP' ? '' : ((TOUCHPAD_DUAL_STAGE_MODE_VALUES as readonly string[]).includes(n) ? n : ''), pad) }, [update])
    const handleAcceleration = useCallback((v: string, pad?: Pad) => { if (v === '') return update(keyName.TOUCHPAD_ACCELERATION, '', pad); const n = Number.parseFloat(v); if (Number.isFinite(n)) update(keyName.TOUCHPAD_ACCELERATION, String(Math.max(0, Math.min(5, n))), pad) }, [update])
    const simple = (name: string) => (v: string, pad?: Pad) => update(name, v.trim().toUpperCase(), pad)
  const clampedGlobal = (name: string, lo: number, hi: number) => (v: string) => { if (v === '') return setConfigText(prev => removeKeymapEntry(prev, name)); const n = Number.parseFloat(v); if (Number.isFinite(n)) setConfigText(prev => updateKeymapEntry(prev, name, [Math.max(lo, Math.min(hi, n))])) }
  return { touchpadMinCutoffValue, touchpadSpeedCoeffValue, touchpadTrackballDecayValue, handleTouchpadMinCutoffChange: clampedGlobal(keyName.TOUCHPAD_MIN_CUTOFF, 0, 20), handleTouchpadSpeedCoeffChange: clampedGlobal(keyName.TOUCHPAD_SPEED_COEFF, 0, 5), handleTouchpadTrackballDecayChange: clampedGlobal(keyName.TOUCHPAD_TRACKBALL_DECAY, 0, 60), touchpadModeValue, leftTouchpadModeValue, rightTouchpadModeValue, gridSizeValue, leftGridSizeValue, rightGridSizeValue, touchpadSensitivityValue, leftTouchpadSensitivityValue, rightTouchpadSensitivityValue, touchpadSensitivityYValue, leftTouchpadSensitivityYValue, rightTouchpadSensitivityYValue, touchpadDualStageModeValue, leftTouchpadDualStageModeValue, rightTouchpadDualStageModeValue, touchpadAccelerationValue, leftTouchpadAccelerationValue, rightTouchpadAccelerationValue, touchStickModeValue:value(keyName.TOUCH_STICK_MODE), leftTouchStickModeValue:value(keyName.TOUCH_STICK_MODE, 'LEFT'), rightTouchStickModeValue:value(keyName.TOUCH_STICK_MODE, 'RIGHT'), touchDeadzoneInnerValue:value(keyName.TOUCH_DEADZONE_INNER), leftTouchDeadzoneInnerValue:value(keyName.TOUCH_DEADZONE_INNER, 'LEFT'), rightTouchDeadzoneInnerValue:value(keyName.TOUCH_DEADZONE_INNER, 'RIGHT'), touchRingModeValue:value(keyName.TOUCH_RING_MODE), leftTouchRingModeValue:value(keyName.TOUCH_RING_MODE, 'LEFT'), rightTouchRingModeValue:value(keyName.TOUCH_RING_MODE, 'RIGHT'), touchStickRadiusValue:value(keyName.TOUCH_STICK_RADIUS), leftTouchStickRadiusValue:value(keyName.TOUCH_STICK_RADIUS, 'LEFT'), rightTouchStickRadiusValue:value(keyName.TOUCH_STICK_RADIUS, 'RIGHT'), touchStickAxisValue:value(keyName.TOUCH_STICK_AXIS), leftTouchStickAxisValue:value(keyName.TOUCH_STICK_AXIS, 'LEFT'), rightTouchStickAxisValue:value(keyName.TOUCH_STICK_AXIS, 'RIGHT'), touchpadWarnings: analyzeTouchpadConfig(configText).warnings, handleTouchpadModeChange:(v:string)=>handleMode(v), handleLeftTouchpadModeChange:(v:string)=>handleMode(v,'LEFT'), handleRightTouchpadModeChange:(v:string)=>handleMode(v,'RIGHT'), handleGridSizeChange:(c:number,r:number)=>handleGrid(c,r), handleLeftGridSizeChange:(c:number,r:number)=>handleGrid(c,r,'LEFT'), handleRightGridSizeChange:(c:number,r:number)=>handleGrid(c,r,'RIGHT'), handleTouchpadSensitivityChange:(v:string)=>handleSens(v), handleLeftTouchpadSensitivityChange:(v:string)=>handleSens(v,'LEFT'), handleRightTouchpadSensitivityChange:(v:string)=>handleSens(v,'RIGHT'), handleTouchpadSensitivityYChange:(v:string)=>handleSens(v,undefined,'y'), handleLeftTouchpadSensitivityYChange:(v:string)=>handleSens(v,'LEFT','y'), handleRightTouchpadSensitivityYChange:(v:string)=>handleSens(v,'RIGHT','y'), handleTouchpadDualStageModeChange:(v:string)=>handleDual(v), handleLeftTouchpadDualStageModeChange:(v:string)=>handleDual(v,'LEFT'), handleRightTouchpadDualStageModeChange:(v:string)=>handleDual(v,'RIGHT'), handleTouchpadAccelerationChange:(v:string)=>handleAcceleration(v), handleLeftTouchpadAccelerationChange:(v:string)=>handleAcceleration(v,'LEFT'), handleRightTouchpadAccelerationChange:(v:string)=>handleAcceleration(v,'RIGHT'), handleTouchStickModeChange:simple(keyName.TOUCH_STICK_MODE), handleLeftTouchStickModeChange:(v:string)=>simple(keyName.TOUCH_STICK_MODE)(v,'LEFT'), handleRightTouchStickModeChange:(v:string)=>simple(keyName.TOUCH_STICK_MODE)(v,'RIGHT'), handleTouchDeadzoneInnerChange:simple(keyName.TOUCH_DEADZONE_INNER), handleLeftTouchDeadzoneInnerChange:(v:string)=>simple(keyName.TOUCH_DEADZONE_INNER)(v,'LEFT'), handleRightTouchDeadzoneInnerChange:(v:string)=>simple(keyName.TOUCH_DEADZONE_INNER)(v,'RIGHT'), handleTouchRingModeChange:simple(keyName.TOUCH_RING_MODE), handleLeftTouchRingModeChange:(v:string)=>simple(keyName.TOUCH_RING_MODE)(v,'LEFT'), handleRightTouchRingModeChange:(v:string)=>simple(keyName.TOUCH_RING_MODE)(v,'RIGHT'), handleTouchStickRadiusChange:simple(keyName.TOUCH_STICK_RADIUS), handleLeftTouchStickRadiusChange:(v:string)=>simple(keyName.TOUCH_STICK_RADIUS)(v,'LEFT'), handleRightTouchStickRadiusChange:(v:string)=>simple(keyName.TOUCH_STICK_RADIUS)(v,'RIGHT'), handleTouchStickAxisChange:simple(keyName.TOUCH_STICK_AXIS), handleLeftTouchStickAxisChange:(v:string)=>simple(keyName.TOUCH_STICK_AXIS)(v,'LEFT'), handleRightTouchStickAxisChange:(v:string)=>simple(keyName.TOUCH_STICK_AXIS)(v,'RIGHT') }
}
