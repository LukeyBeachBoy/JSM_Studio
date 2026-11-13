import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerSupportsInput, getPressedControllerCommandSet } from '../utils/controllerStatus'
import styles from './AzeronStatus.module.css'
import { ModelControllerSvg } from './ModelControllerSvg'

export function AzeronStatus({ device, boundCommands, bindingLabels, selectedCommand, onSelectCommand }: {
  device: TelemetryDevice
  boundCommands?: Set<string>
  bindingLabels?: Record<string, string>
  selectedCommand?: string | null
  onSelectCommand?: (command: string) => void
}) {
  const pressed = getPressedControllerCommandSet(device)
  const commands = Array.from({ length: 6 }, (_, i) => `JOY${i + 27}`)
  const nativeStatus: Record<string, string> = {
    active: 'JSM has native control. Button numbers stay the same across Azeron profiles.',
    connecting: 'Connecting to the Cyborg’s physical inputs…',
    'vendor-app-open': 'Quit Azeron Software, including its tray icon, to let JSM take control. JSM will reconnect automatically.',
    'interface-unavailable': 'The native interface is unavailable. Check the USB connection and other remappers’ device hiding.',
    'recovery-unavailable': 'Native control is waiting for device ownership or the recovery helper. Close any other JSM mapper and check the installation.',
    'unsupported-firmware': 'This firmware or its stick calibration is not supported by native control.',
    'calibration-unavailable': 'JSM could not read a valid stick calibration. Reconnect the Cyborg, or calibrate it in Azeron Software and then quit that app.',
    'connection-lost': 'Native input was interrupted. Reconnecting…',
    'platform-unsupported': 'Native Cyborg control currently requires Windows.',
    released: 'Onboard control restored.',
  }
  return <section className={styles.panel} aria-label="Azeron Cyborg 2 inputs">
    <ModelControllerSvg device={device} boundCommands={boundCommands} bindingLabels={bindingLabels} selectedCommand={selectedCommand} onSelectCommand={onSelectCommand} backView="focus" frontCaption="Azeron Cyborg 2 · physical buttons" />
    <div className={styles.footer}>
      <p role="status" data-native-active={device.nativeInputStatus === 'active'}>{nativeStatus[device.nativeInputStatus ?? ''] ?? 'Native control status is unavailable. Start the updated SDL mapper to use physical button numbering.'}</p>
      <div className={styles.legend} aria-label="Live feedback legend"><span data-live="">Pressed / adjusted stick</span><span>Physical stick</span></div>
    </div>
    {commands.some(command => controllerSupportsInput(device, command)) && <details open={commands.includes(selectedCommand ?? '') || commands.some(command => pressed.has(command)) || undefined}>
    <summary>Additional joystick assignments · 27–32</summary>
    <div className={styles.grid}>
      {commands.filter(command => controllerSupportsInput(device, command)).map(command => <button
        key={command} type="button" aria-label={`${command}${bindingLabels?.[command] ? `: ${bindingLabels[command]}` : ''}`}
        aria-pressed={selectedCommand === command} data-pressed={pressed.has(command)}
        onClick={() => onSelectCommand?.(command)}>
        <strong>{command.replace('JOY', '')}</strong><span>{bindingLabels?.[command] || 'Unbound'}</span>
      </button>)}
    </div>
    </details>}
  </section>
}
