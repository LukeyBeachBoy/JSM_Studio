import { useEffect, useRef, useState } from 'react'
import { desktopBridge, type CalibrationStatus } from '../platform/desktopBridge'

export type TelemetryPadState = {
  x: number
  y: number
  touched: boolean
}

export type TelemetryDeviceStatus = {
  buttons: number
  leftStick: { x: number; y: number }
  rightStick: { x: number; y: number }
  triggers: { left: number; right: number }
  gyro: { x: number; y: number; z: number }
  leftPad?: TelemetryPadState
  rightPad?: TelemetryPadState
}

export type TelemetryDevice = {
  handle: number
  type: number
  split?: number
  vid?: number
  pid?: number
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

const clampPad = (value: number) => Math.min(1, Math.max(-1, value))

// Keep the latest packet visible immediately, then project touch coordinates to
// the next paint. This removes the packet-to-paint gap without changing packet
// fields or waiting for another telemetry event.
function extrapolatePads(sample: TelemetrySample, elapsedMs: number, previous: TelemetrySample | null) {
  if (!previous || !sample.devices) return sample
  const dt = Math.min(elapsedMs, 20) / 1000
  const previousDevices = new Map((previous.devices ?? []).map(device => [device.handle, device]))
  return {
    ...sample,
    devices: sample.devices.map(device => {
      const before = previousDevices.get(device.handle)
      const status = device.status
      const beforeStatus = before?.status
      if (!status || !beforeStatus) return device
      const project = (pad: TelemetryPadState | undefined, oldPad: TelemetryPadState | undefined) => {
        if (!pad || !oldPad || !pad.touched || !oldPad.touched) return pad
        const vx = (pad.x - oldPad.x) / 0.016
        const vy = (pad.y - oldPad.y) / 0.016
        return { ...pad, x: clampPad(pad.x + vx * dt), y: clampPad(pad.y + vy * dt) }
      }
      return { ...device, status: {
        ...status,
        leftPad: project(status.leftPad, beforeStatus.leftPad),
        rightPad: project(status.rightPad, beforeStatus.rightPad),
      }}
    }),
  }
}

export function useTelemetry() {
  const [sample, setSample] = useState<TelemetrySample | null>(null)
  const latestRef = useRef<TelemetrySample | null>(null)
  const previousRef = useRef<TelemetrySample | null>(null)
  const receivedAtRef = useRef(0)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    let frame = 0
    const render = () => {
      const latest = latestRef.current
      if (latest) setSample(extrapolatePads(latest, performance.now() - receivedAtRef.current, previousRef.current))
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    const dispose = desktopBridge.onTelemetrySample(payload => {
      const next = payload as TelemetrySample
      previousRef.current = latestRef.current
      latestRef.current = next
      receivedAtRef.current = performance.now()
      setSample(next)
    })
    const statusDispose = desktopBridge.onCalibrationStatus((state: CalibrationStatus) => {
      setIsCalibrating(state.calibrating)
      setCountdown(state.calibrating && state.seconds ? state.seconds : null)
    })
    return () => { cancelAnimationFrame(frame); dispose?.(); statusDispose?.() }
  }, [])

  return { sample, isCalibrating, countdown }
}
