import type { TelemetryDevice } from '../hooks/useTelemetry'

export type ControllerModel = 'xbox-series' | 'xbox-elite-2' | 'dualsense' | 'dualshock-4' | 'switch-pro' | '8bitdo-ultimate-2' | '8bitdo-pro-2' | 'dualsense-edge'

/** Prefer physical VID/PID variants over the shared JSM controller type. */
export function controllerArtworkModel(device: Pick<TelemetryDevice, 'type' | 'vid' | 'pid'>): ControllerModel | undefined {
  if (device.vid === 0x054c && device.pid === 0x0df2) return 'dualsense-edge'
  const types: Partial<Record<number, ControllerModel>> = {
    3: 'switch-pro', 4: 'dualshock-4', 5: 'dualsense',
    7: 'xbox-elite-2', 8: 'xbox-series',
    15: '8bitdo-pro-2', 16: '8bitdo-pro-2', 18: '8bitdo-ultimate-2',
  }
  return types[device.type]
}
