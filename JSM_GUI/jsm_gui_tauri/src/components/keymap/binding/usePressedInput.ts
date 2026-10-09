import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../../../platform/desktopBridge'
import { getPressedControllerCommandSet } from '../../../utils/controllerStatus'
import type { TelemetryDevice } from '../../../hooks/useTelemetry'
import { deliberatePresses } from '../../../nav/usePressToFind'

// "Press the button to hold" / "Pick the other one by pressing it" (console v2,
// BindingWhileHolding, BindingMore): the pad in hand chooses by being pressed.
// The pad's own navigation buttons move and choose on the screen, so pressing
// them cannot also pick them; those are chosen from the list instead.
export const NAV_BUTTONS = new Set(['S', 'E', 'W', 'N', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R', '-', '+'])

/** Calls `onPress` with each input newly pressed (navigation excluded) while
 *  `active`, and returns which inputs the connected pad has. */
export function usePressedInput(active: boolean, onPress: (input: string) => void) {
  const latest = useRef(onPress)
  latest.current = onPress
  const [supported, setSupported] = useState<Set<string> | null>(null)
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!active) return
    let previous: Set<string> | null = null
    setListening(true)
    const stop = desktopBridge.onTelemetrySample(payload => {
      const device = (payload as { devices?: TelemetryDevice[] } | null)?.devices?.[0]
      if (!device) return
      if (typeof device.supportedButtons === 'number' && device.supportedButtons > 0) {
        const all = getPressedControllerCommandSet({ ...device, status: { ...device.status, buttons: device.supportedButtons } } as TelemetryDevice)
        setSupported(current => current && current.size === all.size ? current : all)
      }
      // Only real presses: a thumb resting on a pad or stick, or a hand on the
      // grip sensors, is not "pressing" anything (those are picked from the list).
      const pressed = deliberatePresses(device)
      // The first sample only learns what is already held (the A that opened this).
      const fresh = previous ? [...pressed].filter(input => !previous!.has(input) && !NAV_BUTTONS.has(input)) : []
      previous = pressed
      if (fresh.length) latest.current(fresh[0])
    })
    return () => { setListening(false); stop?.() }
  }, [active])
  return { supported, listening }
}
