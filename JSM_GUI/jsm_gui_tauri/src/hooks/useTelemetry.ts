import { useEffect, useState } from 'react'
import { desktopBridge, type CalibrationStatus } from '../platform/desktopBridge'

export type TelemetryPadState = {
  x: number
  y: number
  touched: boolean
  pressure?: number
  speed?: number
}

export type TelemetryGripState = {
  // The grip is a single capacitive bit on the wire; how hard you must squeeze to
  // set it is decided in the controller, from LEFT_GRIP_RANGE / RIGHT_GRIP_RANGE.
  pressed: boolean
}

export type TelemetryDeviceStatus = {
  buttons: number
  leftStick: { x: number; y: number }
  rightStick: { x: number; y: number }
  triggers: { left: number; right: number }
  gyro: { x: number; y: number; z: number }
  leftPad?: TelemetryPadState
  rightPad?: TelemetryPadState
  leftGrip?: TelemetryGripState
  rightGrip?: TelemetryGripState
  // Capacitive thumbstick contact -- the same family of signal as a pad touch or
  // a grip, so the preview shows all three the same way.
  leftStickTouch?: boolean
  rightStickTouch?: boolean
}

export type TelemetryDevice = {
  handle: number
  type: number
  supportedButtons?: number
  split?: number
  vid?: number
  pid?: number
  // -1 = unknown/unsupported. batteryState mirrors SDL_PowerState: -1 error,
  // 0 unknown, 1 on battery, 2 no battery (wired), 3 charging, 4 charged.
  batteryPercent?: number
  batteryState?: number
  // Physical touchpad dimensions from the driver. 0 = no pad, or the driver
  // would not say. Only the ratio is meaningful; see utils/padGeometry.
  touchpadWidth?: number
  touchpadHeight?: number
  status?: TelemetryDeviceStatus
}

export type TelemetrySample = {
  omega?: number
  t?: number
  u?: number
  sensX?: number
  sensY?: number
  curve?: string
  sampleHz?: number
  devices?: TelemetryDevice[]
  [key: string]: unknown
}

// Telemetry is a preview, not the controller input clock. Publish at most
// once per 60 Hz frame and do no rendering work while another app has focus.
export function useTelemetry() {
  const [sample, setSample] = useState<TelemetrySample | null>(null)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    let latest: TelemetrySample | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastPublishedAt = -Infinity
    let focused = document.hasFocus()
    const active = () => focused && !document.hidden
    const publish = () => {
      timer = undefined
      if (!active() || !latest) return
      lastPublishedAt = performance.now()
      setSample(latest)
    }
    const schedule = () => {
      if (!active() || !latest || timer !== undefined) return
      const delay = Math.max(0, 1000 / 60 - (performance.now() - lastPublishedAt))
      if (delay === 0) publish()
      else timer = setTimeout(publish, delay)
    }
    const pause = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    const onFocus = () => { focused = true; schedule() }
    const onBlur = () => { focused = false; pause() }
    const onVisibility = () => { if (active()) schedule(); else pause() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    const dispose = desktopBridge.onTelemetrySample(payload => {
      latest = payload as TelemetrySample
      schedule()
    })
    const statusDispose = desktopBridge.onCalibrationStatus((state: CalibrationStatus) => {
      setIsCalibrating(state.calibrating)
      setCountdown(state.calibrating && state.seconds ? state.seconds : null)
    })
    return () => {
      pause()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      dispose?.()
      statusDispose?.()
    }
  }, [])

  return { sample, isCalibrating, countdown }
}
