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
  /** Last native stick report submitted successfully to the virtual device. */
  virtualSticks?: { left: { x: number; y: number }; right: { x: number; y: number } }
  virtualMenus?: { id: string; source: number; open: boolean; selected: number; navigating?: boolean; cursor?: { x: number; y: number } }[]
}

export type TelemetryDevice = {
  activeProfile?: string
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

// Telemetry is a preview, not the controller input clock: publishing faster
// than the display can draw is wasted work. So it is published once per frame
// via requestAnimationFrame, which is the panel's own clock -- 60 Hz, 144 Hz or
// whatever this monitor runs at -- rather than the fixed 60 Hz this used to be.
// No rendering work happens at all while another app has focus.
export function useTelemetry() {
  const [sample, setSample] = useState<TelemetrySample | null>(null)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    let latest: TelemetrySample | null = null
    let frame: number | undefined
    let focused = document.hasFocus()
    const active = () => focused && !document.hidden
    const publish = () => {
      frame = undefined
      if (!active() || !latest) return
      setSample(latest)
    }
    // One publish per displayed frame. Samples arriving between frames replace
    // `latest` rather than queueing, so the UI always draws the newest state and
    // never works through a backlog.
    const schedule = () => {
      if (!active() || !latest || frame !== undefined) return
      frame = requestAnimationFrame(publish)
    }
    const pause = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
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

  // --- Tell the backend how fast this display actually is -------------------
  // The emitter has to know, or it would keep sending at 60 Hz and the frames
  // above would have nothing new to draw. Measured rather than assumed, because
  // there is no reliable API for it. Re-measured whenever the window regains
  // focus, since it may have been dragged to a different monitor since.
  useEffect(() => {
    let raf = 0
    let cancelled = false
    const measure = () => {
      let frames = 0
      let start = 0
      const step = (now: number) => {
        if (cancelled) return
        if (!start) start = now
        if (++frames < 40) {
          raf = requestAnimationFrame(step)
          return
        }
        const hz = Math.round((frames - 1) * 1000 / (now - start))
        // A measurement taken while the window was occluded or throttled is not
        // the panel's rate; ignore it rather than pinning the emitter low.
        if (hz >= 30) desktopBridge.setUiRefreshHz(Math.min(1000, hz)).catch(() => {})
      }
      frames = 0
      start = 0
      raf = requestAnimationFrame(step)
    }
    measure()
    window.addEventListener('focus', measure)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('focus', measure)
    }
  }, [])

  return { sample, isCalibrating, countdown }
}
