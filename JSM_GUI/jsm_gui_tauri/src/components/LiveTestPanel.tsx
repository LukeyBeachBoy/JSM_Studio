import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { getPressedControllerCommandSet } from '../utils/controllerStatus'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { getKeymapValue } from '../utils/keymap'
import { describeBinding } from '../utils/bindingDescription'
import { inputDisplayName } from '../keymap/inputNames'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import styles from './LiveTestPanel.module.css'

/** Telemetry identifies the physical input; output text is read from the config,
 * rather than claiming that the browser observed an OS key or game response. */
export function LiveTestPanel({ device, text }: { device?: TelemetryDevice; text: string }) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<{ id: number; input: string; output: string }[]>([])
  const previous = useRef(new Set<string>())
  const sequence = useRef(0)
  const family = controllerVisualFamily(device?.type)
  useEffect(() => {
    const value = (key: string) => getKeymapValue(text, key)
    const pressed = device ? getPressedControllerCommandSet(device) : new Set<string>()
    if ((device?.status?.triggers?.left ?? 0) > .5) pressed.add('ZL')
    if ((device?.status?.triggers?.right ?? 0) > .5) pressed.add('ZR')
    const fresh = [...pressed].filter(input => !previous.current.has(input))
    previous.current = pressed
    if (!fresh.length) return
    setEvents(current => [...fresh.map(input => ({ id: ++sequence.current, input,
      output: value('GYRO_ON') === input ? 'Gyro aim enabled' : describeBinding(value(input) ?? '', t) || 'No button action',
    })), ...current].slice(0, 8))
  }, [device, text, t])
  return <section className={styles.panel} aria-label="Test feedback">
    <div className={styles.controller}>{device && <ControllerStatusSvg device={device} backView="always" />}</div>
    <div className={styles.feedback}><h2>Input feedback</h2><p>Press a button to see its configured output. Check movement and aim in your game.</p>
      <ul aria-live="polite" aria-relevant="additions">
        {!events.length && <li>Waiting for a controller input…</li>}
        {events.map(event => <li key={event.id}><span>{inputDisplayName(event.input, family)}</span><b>{event.output}</b></li>)}
      </ul>
    </div>
  </section>
}
