import { useEffect, useState } from 'react'
import { desktopBridge, type WindowsPointerSpeed } from '../../platform/desktopBridge'

// Windows' pointer speed (Settings ▸ Mouse), for "Ignore Windows pointer
// speed" (GyroSpeedGame): read through the get_windows_pointer_speed command
// (SystemParametersInfo SPI_GETMOUSESPEED / SPI_GETMOUSE). Asked again each
// time the screen shows it, since it can change while Studio is open.

/** The Settings slider's 11 notches, as SPI_GETMOUSESPEED's 1-20. */
const NOTCH_SPEEDS = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
export const pointerNotch = (speed: number) => {
  let best = 0
  NOTCH_SPEEDS.forEach((value, index) => { if (Math.abs(value - speed) < Math.abs(NOTCH_SPEEDS[best] - speed)) best = index })
  return best + 1
}

export function usePointerSpeed(active: boolean) {
  const [value, setValue] = useState<WindowsPointerSpeed | null | undefined>(undefined)
  useEffect(() => {
    if (!active) return
    let disposed = false
    void desktopBridge.getWindowsPointerSpeed().then(result => { if (!disposed) setValue(result) }).catch(() => { if (!disposed) setValue(null) })
    return () => { disposed = true }
  }, [active])
  return value
}

/** "6 of 11 · needs no fix", or why it is unknown. */
export function pointerSpeedText(value: WindowsPointerSpeed | null | undefined) {
  if (value === undefined) return 'Reading Windows pointer speed…'
  if (value === null) return 'Windows pointer speed can’t be read here'
  const notch = pointerNotch(value.speed)
  const fine = value.speed === 10 && !value.enhancePrecision
  return `Windows pointer speed ${notch} of 11${value.enhancePrecision ? ' · Enhance pointer precision on' : ''} · ${fine ? 'needs no fix' : 'games that read the Windows pointer feel it: turn this on'}`
}
