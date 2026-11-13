import type { TelemetrySample } from '../hooks/useTelemetry'
import { controllerLayoutDevice } from './controllerLayouts'

let selected = ''
const listeners = new Set<() => void>()
export const selectedController = () => selected
export const subscribeControllerSelection = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function selectController(target: string) {
  if (target === selected) return
  selected = target
  listeners.forEach(listener => listener())
}
export function selectedControllerSample(sample: TelemetrySample | null, target = selected): TelemetrySample | null {
  if (!sample) return null
  const device = target ? controllerLayoutDevice(target, sample.devices) : sample.devices?.[0]
  const motion = device?.status?.motion
  // Old packets have only one global curve reading. It is unambiguous only
  // with one connected device; never show another controller's speed.
  const legacy = sample.devices?.length === 1 && sample.devices[0] === device
  return {
    ...sample, devices: device ? [device] : [],
    omega: motion?.omega ?? (legacy ? sample.omega : undefined),
    sensX: motion?.sensX ?? (legacy ? sample.sensX : undefined),
    sensY: motion?.sensY ?? (legacy ? sample.sensY : undefined),
    sampleHz: motion?.sampleHz ?? (legacy ? sample.sampleHz : undefined),
  }
}
