import { GyroModeshifts } from './GyroModeshifts'
import { useContext, useState, type Dispatch, type SetStateAction } from 'react'
import { GyroVirtualStick } from './GyroVirtualStick'
import { GyroRotationFeedback } from './GyroRotationFeedback'
import { MotionInputTuning } from './MotionInputTuning'
import { GyroActivationConditions } from './GyroActivationConditions'
import { SettingPrefix } from './SettingOrigin'
import { isVirtualStickTarget, readVirtualSetting, writeVirtualSetting } from '../utils/virtualStickSettings'
import { useTranslation } from 'react-i18next'
import { SummaryRow } from './ui/SummaryRow'
import { Sheet } from './ui/Sheet'
import { SettingOrigins } from './SettingOrigin'
import { layerEntries } from '../utils/layers'
import { SensitivityValues, parseSensitivityValues } from '../utils/keymap'
import { parseGyroActivation, writeGyroActivation, type GyroActivationMode } from '../utils/gyroActivation'
import type { AccelCurveLink } from '../utils/accelCurve'
import { TelemetrySample } from '../hooks/useTelemetry'
import {
  GyroCalibrationSection,
  GyroGeneralSection,
  GyroOrientationSection,
  GyroSettingRow,
  SelectPill,
  type GyroDevice,
} from './GyroBehaviorControls'
import { GyroSensitivitySection } from './SensitivityControls'
import { GyroDampeningSection, GyroDiagnosticsSection, GyroNoiseSection } from './NoiseSteadyingControls'
import styles from './GyroPage.module.css'
import { usePreferences } from '../platform/preferenceStore'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { HelpButton } from './HelpButton'
import { gyroDeflectionEnabled } from '../utils/gyroDeflectionSettings'

// The Gyro page (Gyro.dc.html, console refinement 1d): the essentials as
// rows -- general, calibration, sensitivity -- then Fine tuning, one summary
// row per group that opens a sheet: Steadying, Orientation, Dampening and
// Diagnostics. Each section carries an id and data-section, which is how the
// shell's section list (LB/RB) discovers them; the page keeps no list of its
// own. Saving is the title bar's state button, not a button per section.

type FineSheet = 'noise' | 'orientation' | 'dampening' | 'diagnostics' | 'feedback'

const FINE_KEYS: Record<Exclude<FineSheet, 'diagnostics'>, string[]> = {
  feedback: ['GYRO_HAPTIC_INTENSITY', 'GYRO_HAPTIC_INTERVAL', 'GYRO_HAPTIC_EFFECT', 'GYRO_HAPTIC_SIDE'],
  noise: ['GYRO_CUTOFF_SPEED', 'GYRO_CUTOFF_RECOVERY', 'GYRO_STEADYING_FLOOR', 'GYRO_SMOOTH_TIME', 'GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTHING_DECAY', 'ONE_EURO_FILTER', 'ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF', 'GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE'],
  orientation: ['GYRO_SPACE', 'GYRO_AXIS_X', 'GYRO_AXIS_Y', 'ROLL_CONTRIBUTION'],
  dampening: ['DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'GYRO_CLICK_DAMPEN'],
}

const FINE_TEXT: Record<FineSheet, { title: string; description: string }> = {
  feedback: { title: 'Rotation feedback', description: 'Haptic pulses that follow how far you turn the controller.' },
  noise: { title: 'Noise & Steadying', description: 'Filters noise and stabilizes slow aiming while preserving small corrections.' },
  orientation: { title: 'Orientation', description: 'Which way tilting moves the aim, and how roll counts.' },
  dampening: { title: 'Dampening', description: 'Reduces overshoot and the aim disturbance from button presses.' },
  diagnostics: { title: 'Diagnostics', description: 'What the gyro reads right now, and which devices it reads.' },
}

export type GyroPageProps = {
  embedded?: boolean
  configText: string
  setConfigText: Dispatch<SetStateAction<string>>
  devices?: GyroDevice[]
  sensitivity: SensitivityValues
  modeshiftSensitivity?: SensitivityValues
  gyroActivationMode: GyroActivationMode
  gyroActivationButton: string
  touchpadMode: string
  touchpadGridCells: number
  touchpadGridCommands?: string[]
  isCalibrating: boolean
  statusMessage?: string | null
  ignoredDevices?: string[]
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
  onInGameSensChange: (value: string) => void
  onRealWorldCalibrationChange: (value: string) => void
  onGyroSpaceChange: (value: string) => void
  onGyroAxisXChange: (value: string) => void
  onGyroAxisYChange: (value: string) => void
  onGyroOutputChange: (value: string) => void
  onGyroActivationModeChange: (mode: GyroActivationMode, fallbackButton?: string) => void
  onGyroActivationButtonChange: (button: string) => void
  counterOsMouseSpeed: boolean
  onCounterOsMouseSpeedChange: (enabled: boolean) => void
  onOpenCalibration?: () => void
  onOpenRwcGuide?: () => void
  hasPendingChanges: boolean
  onApply: () => void
  onCancel: () => void
  lockMessage?: string
  // Sensitivity.
  mode: 'static' | 'accel'
  sensitivityView: 'base' | 'modeshift'
  sample: TelemetrySample | null
  telemetry: {
    omega: string
    sensX: string
    sensY: string
    timestamp: string
    sampleHz?: string
  }
  onModeChange: (mode: 'static' | 'accel') => void
  onSensitivityViewChange: (view: 'base' | 'modeshift') => void
  onAccelCurveChange: (value: string) => void
  onNaturalVHalfChange: (value: string) => void
  onPowerVRefChange: (value: string) => void
  onPowerExponentChange: (value: string) => void
  onSigmoidMidChange: (value: string) => void
  onSigmoidWidthChange: (value: string) => void
  onJumpTauChange: (value: string) => void
  onMinThresholdChange: (value: string) => void
  onMaxThresholdChange: (value: string) => void
  onMinSensXChange: (value: string) => void
  onMinSensYChange: (value: string) => void
  onMaxSensXChange: (value: string) => void
  onMaxSensYChange: (value: string) => void
  onStaticSensXChange: (value: string) => void
  onStaticSensYChange: (value: string) => void
  onRollContributionChange: (value: string) => void
  modeshiftButton: string | null
  onModeshiftButtonChange: (value: string) => void
  accelCurveLink?: string
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
  // Noise, steadying and dampening.
  onCutoffSpeedChange: (value: string) => void
  onSteadyingFloorChange: (axis: 'X' | 'Y', value: string) => void
  onCutoffRecoveryChange: (value: string) => void
  onSmoothTimeChange: (value: string) => void
  onSmoothThresholdChange: (value: string) => void
  onSmoothingDecayChange: (value: string) => void
  onOneEuroFilterChange: (value: string) => void
  onOneEuroMinCutoffChange: (value: string) => void
  onOneEuroSpeedCoeffChange: (value: string) => void
  onAngleSnapChange: (value: string) => void
  onAngleSnapSmoothChange: (value: string) => void
  onDecelBrakeStrengthChange: (value: string) => void
  onDecelBrakeThresholdChange: (value: string) => void
  onGyroClickDampenChange: (value: string) => void
}

export function GyroPage(props: GyroPageProps) {
  const { runtime } = usePreferences()
  const { t } = useTranslation()
  const fineText = {
    ...FINE_TEXT,
    noise: { title: t('gyroPage.noiseSteadyingTitle'), description: t('gyroPage.noiseSteadyingDesc') },
    dampening: { title: t('gyroPage.dampeningTitle'), description: t('gyroPage.dampeningDesc') },
  }
  const { isCalibrating, lockMessage, hasPendingChanges } = props
  const disabled = isCalibrating
  const shiftPrefix = props.sensitivityView === 'modeshift' && props.modeshiftButton ? props.modeshiftButton + ',' : ''
  const origins = useContext(SettingOrigins)
  const [sheet, setSheet] = useState<FineSheet | null>(null)
  // How many of a group's settings this file (or layer) sets itself.
  const own = layerEntries(origins.own)
  const changed = (keys: string[]) => {
    const count = keys.filter(key => Object.prototype.hasOwnProperty.call(own, shiftPrefix + key) || Object.prototype.hasOwnProperty.call(own, key)).length
    return count ? `${count} changed` : ''
  }
  const definedValues = (values: SensitivityValues) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
  // The hook's display values contain only the active scope. Native unset
  // held settings inherit base values; keep that fallback in the fine sheets.
  const activeSensitivity = { ...parseSensitivityValues(props.configText), ...definedValues(props.sensitivity), ...(shiftPrefix ? definedValues(props.modeshiftSensitivity ?? {}) : {}) }
  const s = activeSensitivity
  const output = readVirtualSetting(props.configText, 'GYRO_OUTPUT', shiftPrefix) ?? 'MOUSE'
  const deflection = isVirtualStickTarget(output) && gyroDeflectionEnabled(props.configText, shiftPrefix)
  const activation = parseGyroActivation(props.configText, shiftPrefix)
  const fineSummary: Record<FineSheet, string> = {
    feedback: Number(readVirtualSetting(props.configText, 'GYRO_HAPTIC_INTENSITY', shiftPrefix) ?? 0) > 0 ? `${readVirtualSetting(props.configText, 'GYRO_HAPTIC_INTENSITY', shiftPrefix)}% · ${readVirtualSetting(props.configText, 'GYRO_HAPTIC_INTERVAL', shiftPrefix) ?? 15}°` : 'Off',
    noise: [s.oneEuroFilter ? 'Filter on' : 'Filter off', (s.cutoffRecovery ?? 0) > (s.cutoffSpeed ?? 0) ? t('gyroPage.steadyingSummary', { speed: s.cutoffRecovery }) : '', deflection ? '' : s.angleSnap ? `Snap ${s.angleSnap}°` : 'Snap off'].filter(Boolean).join(' · '),
    orientation: [s.gyroSpace ? s.gyroSpace.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Local space',
      s.gyroAxisX && s.gyroAxisX.toUpperCase() !== 'STANDARD' ? 'X inverted' : '', s.gyroAxisY && s.gyroAxisY.toUpperCase() !== 'STANDARD' ? 'Y inverted' : ''].filter(Boolean).join(' · '),
    dampening: [!deflection && s.decelBrakeStrength ? t('gyroPage.brakeSummary', { amount: Math.round(s.decelBrakeStrength * 100) }) : '', !deflection && s.gyroClickDampen ? `Click ${Math.round(s.gyroClickDampen * 100)}%` : ''].filter(Boolean).join(' · ') || 'Default',
    diagnostics: 'Live readings and devices',
  }
  const fineSheet = (key: FineSheet, body: React.ReactNode) => (
    <Sheet open={sheet === key} onClose={() => setSheet(null)} eyebrow="Gyro · Fine tuning" title={fineText[key].title} description={fineText[key].description}
      hints={[{ button: 'A', label: 'Adjust' }, { button: 'Y', label: 'Use Default' }, { button: 'B', label: 'Close' }]}>
      <div className="sheet-embed">{body}</div>
    </Sheet>
  )

  const section = (key: 'general' | 'calibration' | 'sensitivity' | 'fine', body: React.ReactNode) => {
    const label = key === 'fine' ? t('gyroPage.sections.fine', 'Fine tuning') : t(`gyroPage.sections.${key}`)
    return (
      <section id={props.embedded ? undefined : `gyro-${key}`} className={`page-section ${styles.section}`} data-section={label} aria-label={label}>
        <h3 className={styles.heading}>{label}</h3>
        {body}
      </section>
    )
  }

  return (
    <div className={`${styles.page} ${disabled ? styles.locked : ''}`.trim()} aria-disabled={disabled || undefined}>
      {disabled && <p className={styles.lockNote} role="status">{lockMessage ?? t('gyroPage.locked')}</p>}
      <div className={styles.inputGroup} role="group" aria-label="Gyro settings">
      <header className={styles.inputHeader}>
        <h2>Gyro</h2>
        <span>Rotation aiming</span>
      </header>
      {section('general',
        <GyroGeneralSection hideGlobalSettings={props.embedded}
          sensitivity={{ ...activeSensitivity, gyroOutput: output === 'MOUSE' ? undefined : output }}
          motionFeedbackEnabled={Number(readVirtualSetting(props.configText, 'GYRO_HAPTIC_INTENSITY', shiftPrefix) ?? 0) > 0 && (readVirtualSetting(props.configText, 'GYRO_HAPTIC_EFFECT', shiftPrefix) ?? 'TICK') !== 'OFF'}
          gyroActivationMode={activation.mode}
          gyroActivationButton={activation.button}
          activationDetails={<GyroActivationConditions text={props.configText} setText={props.setConfigText} prefix={shiftPrefix} deviceType={props.devices?.[0]?.type} gridCommands={props.touchpadGridCommands} disabled={disabled} />}
          touchpadMode={props.touchpadMode}
          touchpadGridCells={props.touchpadGridCells}
          touchpadGridCommands={props.touchpadGridCommands}
          devices={props.devices}
          disabled={disabled}
          onGyroActivationModeChange={(mode, fallback) => props.setConfigText(previous => writeGyroActivation(previous, mode, activation.button || fallback || 'R3', shiftPrefix))}
          onGyroActivationButtonChange={button => props.setConfigText(previous => writeGyroActivation(previous, activation.mode, button, shiftPrefix))}
          onGyroOutputChange={next => props.setConfigText(previous => writeVirtualSetting(previous, 'GYRO_OUTPUT', next || 'MOUSE', shiftPrefix))}
          counterOsMouseSpeed={props.counterOsMouseSpeed}
          onCounterOsMouseSpeedChange={props.onCounterOsMouseSpeedChange}
        />)}
      {isVirtualStickTarget(output) && <section id={props.embedded ? undefined : "gyro-virtual-stick"} className={`page-section ${styles.section}`} data-section="Gyro to joystick" aria-label="Gyro to joystick">
        <h3 className={styles.heading}>Gyro to joystick</h3>
        <GyroVirtualStick text={props.configText} target={output} prefix={shiftPrefix} setText={props.setConfigText} disabled={disabled} sample={props.sample} />
      </section>}
      {output === 'PS_MOTION' && <section className={`page-section ${styles.section}`} data-section="PlayStation motion" aria-label="PlayStation motion">
        <h3 className={styles.heading}>PlayStation motion passthrough</h3>
        <p>Pass the physical gyro and accelerometer to a virtual PlayStation 4 controller. The physical controller can be Steam, Nintendo or PlayStation; a PlayStation controller is not required. The game interprets those sensors; gyro sensitivity and camera compensation do not affect this output.</p>
        <p>Motion passthrough always forwards the physical sensors. Aiming activation and filters do not suppress or alter those samples.</p>
        {readVirtualSetting(props.configText, 'VIRTUAL_CONTROLLER') !== 'DS4' && <p role="status">Motion passthrough requires PlayStation 4 virtual output.</p>}
        <SummaryRow setting="VIRTUAL_CONTROLLER" label="Virtual controller" value={readVirtualSetting(props.configText, 'VIRTUAL_CONTROLLER') ?? 'NONE'}
          adjust={{ kind: 'choice', value: readVirtualSetting(props.configText, 'VIRTUAL_CONTROLLER') ?? 'NONE', options: [{ value: 'NONE', label: 'Off' }, { value: 'XBOX', label: 'Xbox 360' }, { value: 'DS4', label: 'PlayStation 4' }], onChange: next => props.setConfigText(previous => writeVirtualSetting(previous, 'VIRTUAL_CONTROLLER', next)) }} />
      </section>}
      {!props.embedded && output === 'MOUSE' && section('calibration',
        <GyroCalibrationSection
          sensitivity={activeSensitivity}
          disabled={disabled}
          onInGameSensChange={props.onInGameSensChange}
          onRealWorldCalibrationChange={props.onRealWorldCalibrationChange}
          onOpenCalibration={props.onOpenCalibration}
          onOpenRwcGuide={props.onOpenRwcGuide}
        />)}
      {output !== 'PS_MOTION' && !deflection && section('sensitivity',
        <GyroSensitivitySection hideScope
          sensitivity={{ ...props.sensitivity, gyroOutput: output }}
          modeshiftSensitivity={{ ...activeSensitivity, gyroOutput: output }}
          disabled={disabled}
          mode={props.mode}
          sensitivityView={props.sensitivityView}
          touchpadMode={props.touchpadMode}
          touchpadGridCells={props.touchpadGridCells}
          devices={props.devices}
          onModeChange={props.onModeChange}
          onSensitivityViewChange={props.onSensitivityViewChange}
          onAccelCurveChange={props.onAccelCurveChange}
          onNaturalVHalfChange={props.onNaturalVHalfChange}
          onPowerVRefChange={props.onPowerVRefChange}
          onPowerExponentChange={props.onPowerExponentChange}
          onSigmoidMidChange={props.onSigmoidMidChange}
          onSigmoidWidthChange={props.onSigmoidWidthChange}
          onJumpTauChange={props.onJumpTauChange}
          onMinThresholdChange={props.onMinThresholdChange}
          onMaxThresholdChange={props.onMaxThresholdChange}
          onMinSensXChange={props.onMinSensXChange}
          onMinSensYChange={props.onMinSensYChange}
          onMaxSensXChange={props.onMaxSensXChange}
          onMaxSensYChange={props.onMaxSensYChange}
          onStaticSensXChange={props.onStaticSensXChange}
          onStaticSensYChange={props.onStaticSensYChange}
          modeshiftButton={props.modeshiftButton}
          onModeshiftButtonChange={props.onModeshiftButtonChange}
          accelCurveLink={props.accelCurveLink}
          onAccelCurveLinkChange={props.onAccelCurveLinkChange}
        />)}
      {section('fine', <>
        {(output === 'PS_MOTION' ? ['feedback'] as const : ['noise', 'orientation', 'dampening', 'feedback', 'diagnostics'] as const).filter(key => !props.embedded || key !== 'diagnostics').map(key => (
          <SummaryRow key={key} size="tile" label={fineText[key].title} hint={fineSummary[key]} value={key === 'diagnostics' ? '' : changed(FINE_KEYS[key].filter(setting => !deflection || !['GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE', 'DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'GYRO_CLICK_DAMPEN'].includes(setting)))}
            onActivate={() => setSheet(key)} />
        ))}
      </>)}
      {!props.embedded && <GyroModeshifts {...props} />}
      </div>
      {!props.embedded && <section id="gyro-motion" className={`page-section ${styles.inputGroup} ${styles.tiltGroup}`} data-section="Tilt" aria-label="Tilt">
        <header className={styles.inputHeader}>
          <h2>Tilt</h2>
          <span>Position, steering and actions</span>
          <HelpButton title="Tilt and gyro">
            <p>Tilt uses your angle from a neutral position. Gyro uses rotation speed, or angular travel in deflection mode. Both can run together: gyro can aim while leaning triggers an action.</p>
            <p>Each input has its own activation and modeshifts. A tilt modeshift can change tilt behaviour while gyro keeps its normal configuration.</p>
            <p>Bind Set tilt neutral under Buttons to capture your comfortable holding position as the centre.</p>
          </HelpButton>
        </header>
        <MotionInputTuning text={props.configText} setText={props.setConfigText} disabled={disabled} deviceType={props.devices?.[0]?.type} gridCommands={props.touchpadGridCommands} />
        <GyroModeshifts {...props} input="tilt" />
      </section>}
      {fineSheet('noise', <SettingPrefix prefix={shiftPrefix}><GyroNoiseSection
          sensitivity={activeSensitivity}
          deflection={deflection}
          disabled={disabled}
          onCutoffSpeedChange={props.onCutoffSpeedChange}
          onCutoffRecoveryChange={props.onCutoffRecoveryChange}
          onSteadyingFloorChange={props.onSteadyingFloorChange}
          onSmoothTimeChange={props.onSmoothTimeChange}
          onSmoothThresholdChange={props.onSmoothThresholdChange}
          onSmoothingDecayChange={props.onSmoothingDecayChange}
          onOneEuroFilterChange={props.onOneEuroFilterChange}
          onOneEuroMinCutoffChange={props.onOneEuroMinCutoffChange}
          onOneEuroSpeedCoeffChange={props.onOneEuroSpeedCoeffChange}
          onAngleSnapChange={props.onAngleSnapChange}
          onAngleSnapSmoothChange={props.onAngleSnapSmoothChange}
        /></SettingPrefix>)}
      {fineSheet('feedback', <SettingPrefix prefix={shiftPrefix}><GyroRotationFeedback text={props.configText} setText={props.setConfigText} prefix={shiftPrefix} deviceType={props.devices?.[0]?.type} disabled={disabled} /></SettingPrefix>)}
      {fineSheet('orientation', <SettingPrefix prefix={shiftPrefix}><GyroOrientationSection
          sensitivity={activeSensitivity}
          sensitivityPrefix={shiftPrefix}
          disabled={disabled}
          onGyroSpaceChange={props.onGyroSpaceChange}
          onGyroAxisXChange={props.onGyroAxisXChange}
          onGyroAxisYChange={props.onGyroAxisYChange}
          onRollContributionChange={props.onRollContributionChange}
        />
        {(activeSensitivity.gyroSpace ?? 'LOCAL') === 'LOCAL' && ['MOUSE_X_FROM_GYRO_AXIS', 'MOUSE_Y_FROM_GYRO_AXIS'].map((key, i) => {
          const value = readVirtualSetting(props.configText, key, shiftPrefix) ?? (i === 0 ? 'Y' : 'X')
          const label = i === 0 ? 'Horizontal local motion source' : 'Vertical local motion source'
          const direction = i === 0 ? 'horizontal' : 'vertical'
          const descriptions = [
            { value: 'X', label: 'Pitch (X)', motion: 'Tilt the front of the controller up or down.' },
            { value: 'Y', label: 'Yaw (Y)', motion: 'Turn the controller left or right while keeping it level.' },
            { value: 'Z', label: 'Roll (Z)', motion: 'Lean the controller so one grip rises and the other falls.' },
            { value: 'XY', label: 'Pitch + yaw (XY)', motion: 'Combine front-up/front-down tilt with left/right turning.' },
            { value: 'XZ', label: 'Pitch + roll (XZ)', motion: 'Combine front-up/front-down tilt with leaning from grip to grip.' },
            { value: 'YZ', label: 'Yaw + roll (YZ)', motion: 'Combine left/right turning with leaning from grip to grip.' },
            { value: 'XYZ', label: 'All axes (XYZ)', motion: 'Combine pitch, yaw and roll: tilting, turning and leaning.' },
            { value: 'NONE', label: 'No axes', motion: `Disable local gyro movement for ${direction} aim. The other aim direction is unaffected.` },
          ]
          const options = descriptions.map(option => ({
            value: option.value,
            label: option.label,
            description: option.value === 'NONE' ? option.motion : `${option.motion} This drives ${direction} aim.${option.value.length > 1 ? ' The signed rotation speeds are added, so movements can reinforce or cancel each other.' : ''}${option.value === (i === 0 ? 'Y' : 'X') ? ` This is the default source for ${direction} aim.` : ''}`,
          }))
          return <GyroSettingRow key={key} setting={key} label={label}
            description={`Choose which controller rotations drive ${direction} aim in Local gyro space. Highlight an option in the dropdown for its explanation.`}
            value={<SelectPill ariaLabel={label} value={value} options={options} disabled={disabled}
              onChange={next => props.setConfigText(previous => writeVirtualSetting(previous, key, next, shiftPrefix))} />} />
        })}
        </SettingPrefix>)}
      {fineSheet('dampening', <SettingPrefix prefix={shiftPrefix}><GyroDampeningSection
          sensitivity={activeSensitivity}
          deflection={deflection}
          disabled={disabled}
          onDecelBrakeStrengthChange={props.onDecelBrakeStrengthChange}
          onDecelBrakeThresholdChange={props.onDecelBrakeThresholdChange}
          onGyroClickDampenChange={props.onGyroClickDampenChange}
        />{!deflection && <SummaryRow setting="TRACKBALL_DECAY" label="Gyro trackball slowdown" value={`${readVirtualSetting(props.configText, 'TRACKBALL_DECAY', shiftPrefix) ?? 1} / s`} disabled={disabled}
          help="Controls gyro momentum while a Gyro trackball action is held. Higher values stop the coast sooner. Bind Gyro trackball (or its horizontal/vertical variants) to the input you want to clutch."
          adjust={{ kind: 'number', value: Number(readVirtualSetting(props.configText, 'TRACKBALL_DECAY', shiftPrefix) ?? 1), min: 0, max: 60, step: 0.1, onChange: next => props.setConfigText(previous => writeVirtualSetting(previous, 'TRACKBALL_DECAY', next, shiftPrefix)) }} />}</SettingPrefix>)}
      {fineSheet('diagnostics', <><GyroDiagnosticsSection
          sensitivity={props.sensitivity}
          deflection={deflection}
          sample={props.sample}
          hasPendingChanges={hasPendingChanges}
          telemetry={props.telemetry}
          devices={props.devices}
          ignoredDevices={props.ignoredDevices}
          disabled={disabled}
          onToggleIgnoreDevice={props.onToggleIgnoreDevice}
        /><SettingPrefix prefix=""><SummaryRow setting="AUTO_CALIBRATE_GYRO" label="Automatic drift calibration" hint="All motion controllers in this profile" disabled={disabled}
          help="The native motion engine estimates drift while the controller is still. This is separate from the Steam Controller’s firmware calibration setting. Manual calibration remains available."
          toggle={{ on: readVirtualSetting(props.configText, 'AUTO_CALIBRATE_GYRO') === 'ON', onChange: next => props.setConfigText(previous => writeVirtualSetting(previous, 'AUTO_CALIBRATE_GYRO', next ? 'ON' : 'OFF')) }} /></SettingPrefix>
          <SettingPrefix prefix=""><AdvancedDisclosure label="Manual calibration schedule" summary="Countdown and duration for this configuration">
            <p className="sheet-note">Timed calibration applies to every connected motion controller. These values override Studio defaults for this configuration; held-input overrides do not affect the native calibration command.</p>
            {[
              { key: 'GYRO_CALIBRATION_DELAY', label: 'Wait before calibration', min: 0, max: 30, fallback: runtime?.gyroCalibrationDelay ?? 0, hint: 'Time to put the controller down before measuring drift.' },
              { key: 'GYRO_CALIBRATION_TIME', label: 'Calibration duration', min: 0.5, max: 60, fallback: runtime?.gyroCalibrationSeconds ?? 5, hint: 'Keep every motion controller still for this long.' },
            ].map(field => {
              const value = Number(readVirtualSetting(props.configText, field.key) ?? field.fallback)
              return <SummaryRow key={field.key} setting={field.key} label={field.label} hint={field.hint} disabled={disabled} value={`${value} s`}
                defaultLabel={origins.layer ? 'Use Default' : layerEntries(origins.base)[field.key] ? 'Use inherited' : 'Use Studio defaults'}
                onUseDefault={Object.prototype.hasOwnProperty.call(own, field.key) ? () => {
                  if ((origins.layer || layerEntries(origins.base)[field.key]) && origins.reset) origins.reset(field.key)
                  else props.setConfigText(previous => writeVirtualSetting(previous, field.key, ''))
                } : undefined}
                adjust={{ kind: 'number', value, min: field.min, max: field.max, step: 0.5, fineStep: 0.1, onChange: next => props.setConfigText(previous => writeVirtualSetting(previous, field.key, Number(next.toFixed(4)))) }} />
            })}
          </AdvancedDisclosure></SettingPrefix>
          {['JOYCON_GYRO_MASK', 'JOYCON_MOTION_MASK'].map((key, index) => <SummaryRow key={key} setting={key} label={index === 0 ? 'Paired Joy-Con gyro source' : 'Paired Joy-Con tilt source'} disabled={disabled}
            help="Select which half of a paired Joy-Con supplies motion. Has no effect on Steam Controller or DualSense. Tilt and gyro can use different halves."
            adjust={{ kind: 'choice', value: readVirtualSetting(props.configText, key, shiftPrefix) ?? (index === 0 ? 'IGNORE_LEFT' : 'IGNORE_RIGHT'), options: [{ value: 'IGNORE_LEFT', label: 'Right half' }, { value: 'IGNORE_RIGHT', label: 'Left half' }, { value: 'USE_BOTH', label: 'Both halves' }, { value: 'IGNORE_BOTH', label: 'Neither half' }], onChange: next => props.setConfigText(previous => writeVirtualSetting(previous, key, next, shiftPrefix)) }} />)}
        </>)}
    </div>
  )
}
