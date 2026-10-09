import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../../utils/controllerStatus'
import type { TelemetrySample } from '../../hooks/useTelemetry'

// Pick buttons by pressing them (console v2, Hold to swap: "X then press the
// buttons"). While capturing, the app's own navigation pauses
// (body[data-pad-listening], as Press it now does), so A and B are buttons like
// any other. It waits for everything to be let go, then gathers every button
// held at once until they are all let go again: that set is the result.
// Escape (or 8 s with nothing pressed) cancels.

/** Inputs that are not buttons a chord can hold: stick and pad directions. */
const NOT_BUTTONS = /^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$|^(LEFT|RIGHT)_?(TOUCH|PAD)/

export function usePressCapture(onDone: (buttons: string[]) => void) {
  const [capturing, setCapturing] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!capturing) return
    document.body.dataset.padListening = 'true'
    document.body.dataset.padListeningMessage = 'Press the buttons together, then let go · Esc cancels'
    window.dispatchEvent(new Event('jsm:interaction-hint'))
    let ready = false
    let gathered = new Set<string>()
    const finish = (result: string[] | null) => {
      setCapturing(false)
      setHeld([])
      if (result && result.length) done.current(result)
    }
    let idle = window.setTimeout(() => finish(null), 8000)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null) } }
    window.addEventListener('keydown', onKey, true)
    const unsubscribe = desktopBridge.onTelemetrySample(payload => {
      const device = (payload as TelemetrySample)?.devices?.[0]
      // A thumb resting on a trackpad is contact, not a press.
      const status = device?.status ? { ...device.status, leftPad: device.status.leftPad && { ...device.status.leftPad, touched: false }, rightPad: device.status.rightPad && { ...device.status.rightPad, touched: false } } : undefined
      const pressed = [...getPressedControllerCommandSet(device && status ? { ...device, status } : device)].map(command => command.toUpperCase()).filter(command => !NOT_BUTTONS.test(command))
      if (!ready) { if (pressed.length === 0) ready = true; return }
      if (pressed.length) {
        window.clearTimeout(idle)
        idle = window.setTimeout(() => finish(null), 8000)
        pressed.forEach(command => gathered.add(command))
        setHeld([...gathered])
      } else if (gathered.size) {
        const result = [...gathered]
        gathered = new Set()
        finish(result)
      }
    })
    return () => {
      delete document.body.dataset.padListening
      delete document.body.dataset.padListeningMessage
      window.clearTimeout(idle)
      window.removeEventListener('keydown', onKey, true)
      unsubscribe()
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }
  }, [capturing])

  return { capturing, held, start: () => setCapturing(true), cancel: () => setCapturing(false) }
}
