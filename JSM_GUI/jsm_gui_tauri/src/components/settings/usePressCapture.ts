import { selectedControllerSample } from '../../utils/controllerSelection'
import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import { controllerHasTwoTrackpads, getPressedControllerCommandSet } from '../../utils/controllerStatus'
import type { TelemetrySample } from '../../hooks/useTelemetry'

// Pick buttons by pressing them (console v2, Hold to swap: "X then press the
// buttons"). While capturing, the app's own navigation pauses
// (body[data-pad-listening], as Press it now does), so A and B are buttons like
// any other. It waits for the opening press to be let go, then captures one
// simultaneous combination. The first release freezes that combination so
// rolling from one button to another cannot keep adding unrelated buttons.
// Escape (or 8 s with nothing pressed) cancels.

/** Inputs that are not buttons a chord can hold: stick and pad directions. */
const NOT_BUTTONS = /^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$|^(LEFT|RIGHT)_?(TOUCH|PAD)/
const CONTACTS = new Set(['LTOUCH', 'RTOUCH', 'TOUCH'])
const STEAM_CONTACTS = new Set(['MISC4', 'MISC5', 'MISC6'])

export function usePressCapture(onDone: (buttons: string[]) => void, { buttonsOnly = false, mouseButtons = false } = {}) {
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
    let gathered: string[] = []
    let releasing = false
    let finished = false
    const finish = (result: string[] | null) => {
      if (finished) return
      finished = true
      setCapturing(false)
      setHeld([])
      if (result && result.length) done.current(result)
    }
    let idle = window.setTimeout(() => finish(null), 8000)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null) } }
    window.addEventListener('keydown', onKey, true)
    let controllerHeld: string[] = [], mouseHeld: string[] = []
    const nativeMouse = mouseButtons && '__TAURI_INTERNALS__' in window
    let controllerReady = false, mouseReady = !nativeMouse
    const sample = () => {
      if (finished || !controllerReady || !mouseReady) return
      const pressed = [...new Set([...controllerHeld, ...mouseHeld])]
      if (!ready) { if (pressed.length === 0) ready = true; return }
      if (gathered.length && gathered.some(command => !pressed.includes(command))) releasing = true
      if (!releasing && pressed.length) {
        window.clearTimeout(idle)
        idle = window.setTimeout(() => finish(null), 8000)
        if (pressed.length !== gathered.length) {
          gathered = pressed
          setHeld(gathered)
        }
      } else if (releasing && gathered.every(command => !pressed.includes(command))) {
        finish(gathered)
      }
    }
    const unsubscribe = desktopBridge.onTelemetrySample(payload => {
      const device = selectedControllerSample(payload as TelemetrySample)?.devices?.[0]
      if (finished) return
      controllerReady = true
      if (!device?.status) { controllerHeld = []; sample(); return }
      // A thumb resting on a trackpad is contact, not a press.
      const status = { ...device.status, leftPad: device.status.leftPad && { ...device.status.leftPad, touched: false }, rightPad: device.status.rightPad && { ...device.status.rightPad, touched: false } }
      const pressed = [...getPressedControllerCommandSet({ ...device, status })].map(command => command.toUpperCase()).filter(command =>
        !NOT_BUTTONS.test(command) && !command.startsWith('GRIP_') &&
        (!buttonsOnly || (!CONTACTS.has(command) && !(controllerHasTwoTrackpads(device.type) && STEAM_CONTACTS.has(command)))))
      // Trigger values are analog; the runtime uses the same half-pull threshold.
      if (device.status.triggers?.left >= 0.5) pressed.push('ZL')
      if (device.status.triggers?.right >= 0.5) pressed.push('ZR')
      controllerHeld = pressed
      sample()
    })

    let polling = false
    const pollMouse = async () => {
      if (polling || finished || !nativeMouse) return
      polling = true
      try { mouseHeld = await desktopBridge.mouseSideButtons(); mouseReady = true; sample() } catch { /* retry while listening */ }
      finally { polling = false }
    }
    const mouseTimer = nativeMouse ? window.setInterval(() => void pollMouse(), 16) : undefined
    void pollMouse()
    const onMouse = (event: MouseEvent) => {
      if (!mouseButtons || (event.button !== 3 && event.button !== 4)) return
      event.preventDefault(); event.stopPropagation()
      const command = event.button === 3 ? 'MOUSE_BACK' : 'MOUSE_FORWARD'
      mouseHeld = event.type === 'mousedown' ? [...new Set([...mouseHeld, command])] : mouseHeld.filter(button => button !== command)
      sample()
    }
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('mouseup', onMouse, true)
    return () => {
      finished = true
      delete document.body.dataset.padListening
      delete document.body.dataset.padListeningMessage
      window.clearTimeout(idle)
      window.removeEventListener('keydown', onKey, true)
      unsubscribe()
      window.clearInterval(mouseTimer)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('mouseup', onMouse, true)
      window.dispatchEvent(new Event('jsm:interaction-hint'))
    }
  }, [capturing, buttonsOnly, mouseButtons])

  return { capturing, held, start: () => setCapturing(true), cancel: () => setCapturing(false) }
}
