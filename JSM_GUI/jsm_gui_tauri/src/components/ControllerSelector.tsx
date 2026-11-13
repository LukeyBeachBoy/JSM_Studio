import { useEffect, useRef, useState } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerLayoutDevice, controllerModelKey, controllerTargetKey, controllerVariantLabel, savedControllerModels } from '../utils/controllerLayouts'
import styles from './ControllerSelector.module.css'
import { Select } from './ui/Select'

export function ControllerSelector({ devices = [], target, text, onSelect }: { devices?: TelemetryDevice[]; target: string; text: string; onSelect: (target: string) => void }) {
  const [identifying, setIdentifying] = useState(false)
  const previous = useRef(new Map<string, number>())
  useEffect(() => { document.body.dataset.identifyingController = String(identifying); return () => { delete document.body.dataset.identifyingController } }, [identifying])
  useEffect(() => {
    const next = new Map(devices.map(device => [controllerTargetKey(device), device.status?.buttons ?? 0]))
    if (identifying) {
      const pressed = devices.find(device => {
        const key = controllerTargetKey(device), old = previous.current.get(key)
        return old !== undefined && (device.status?.buttons ?? 0) !== 0 && old !== device.status?.buttons
      })
      if (pressed) { onSelect(controllerTargetKey(pressed)); setIdentifying(false) }
    }
    previous.current = next
  }, [devices, identifying, onSelect])
  useEffect(() => { if (!identifying) return; const timer = setTimeout(() => setIdentifying(false), 15000); return () => clearTimeout(timer) }, [identifying])
  const connectedModels = new Set(devices.map(controllerModelKey))
  const keys = [...new Set([...devices.map(controllerTargetKey), ...savedControllerModels(text), target].filter(Boolean))]
    .filter(key => key === target || key.includes('-device-') || !connectedModels.has(key) || devices.some(device => controllerTargetKey(device) === key))
  if (keys.length < 2 && devices.length < 2) return null
  return <div className={styles.selector}>
    <label htmlFor="editing-controller">Controller</label>
    <Select id="editing-controller" ariaLabel="Controller to configure" className={styles.picker}
      value={target || 'shared'} onValueChange={value => onSelect(value === 'shared' ? '' : value)}
      options={[
        { value: 'shared', label: 'Shared layout' },
        ...keys.map(key => {
          const connected = devices.find(device => controllerTargetKey(device) === key)
          const label = controllerVariantLabel(controllerLayoutDevice(key))
          const siblings = devices.filter(device => controllerModelKey(device) === controllerModelKey(controllerLayoutDevice(key)))
          return { value: key, label: connected && siblings.length > 1 ? `${label} · Controller ${siblings.indexOf(connected) + 1}` : !key.includes('-device-') && !connected ? `${label} defaults` : label,
            hint: connected ? 'Connected' : key.includes('-device-') ? 'Disconnected' : 'All controllers of this model' }
        }),
      ]}
    />
    <button className={styles.identify} type="button" aria-pressed={identifying} onClick={() => setIdentifying(value => !value)}>{identifying ? 'Press a button…' : 'Identify'}</button>
  </div>
}
