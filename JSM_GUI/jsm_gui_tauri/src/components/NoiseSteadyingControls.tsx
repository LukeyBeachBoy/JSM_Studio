import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { TelemetrySample } from '../hooks/useTelemetry'
import { TelemetryBanner } from './TelemetryBanner'
import { NumberField } from './NumberField'
import { CurvePreview } from './CurvePreview'
import { GyroSettingRow, OnOff, GyroDevicesSection, type GyroDevice } from './GyroBehaviorControls'
import telemetryStyles from './Telemetry.module.css'
import { SettingPrefix } from './SettingOrigin'

// The Noise & steadying, Dampening and Diagnostics sections of the Gyro page
// (Gyro.dc.html). Every row is the page's template: NumberField for numbers,
// GyroSettingRow with an Off / On control for switches.

export type GyroNoiseSectionProps = {
  sensitivity: SensitivityValues
  deflection?: boolean
  disabled?: boolean
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
}

export function GyroNoiseSection({
  sensitivity,
  deflection,
  disabled,
  onCutoffSpeedChange,
  onCutoffRecoveryChange,
  onSteadyingFloorChange,
  onSmoothTimeChange,
  onSmoothThresholdChange,
  onSmoothingDecayChange,
  onOneEuroFilterChange,
  onOneEuroMinCutoffChange,
  onOneEuroSpeedCoeffChange,
  onAngleSnapChange,
  onAngleSnapSmoothChange,
}: GyroNoiseSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <NumberField setting="GYRO_CUTOFF_SPEED" label={t('gyroPage.cutoffSpeed')} value={sensitivity.cutoffSpeed} onChange={onCutoffSpeedChange} min={0} max={360} step={0.01} defaultValue={0} unit="°/s" disabled={disabled} hint={t('gyroPage.cutoffSpeedDesc')} />
      <NumberField setting="GYRO_CUTOFF_RECOVERY" label={t('gyroPage.steadyingRegion')} value={sensitivity.cutoffRecovery} onChange={onCutoffRecoveryChange} min={0} max={360} step={0.01} defaultValue={0} unit="°/s" disabled={disabled} hint={`${t('gyroPage.cutoffRecoveryDesc')} Set it above the cutoff for a gradual recovery; otherwise the cutoff is a hard threshold.`} />
      {!deflection && <>
        <NumberField setting="GYRO_STEADYING_FLOOR" label={`${t('gyroPage.steadyingFloor')} X`} value={sensitivity.steadyingFloorX} onChange={value => onSteadyingFloorChange('X', value)} min={0} max={100} step={0.1} defaultValue={0} unit="RWS" disabled={disabled || (sensitivity.cutoffRecovery ?? 0) <= (sensitivity.cutoffSpeed ?? 0)} hint={t('gyroPage.steadyingFloorDesc')} />
        <NumberField setting="GYRO_STEADYING_FLOOR" label={`${t('gyroPage.steadyingFloor')} Y`} value={sensitivity.steadyingFloorY} onChange={value => onSteadyingFloorChange('Y', value)} min={0} max={100} step={0.1} defaultValue={0} unit="RWS" disabled={disabled || (sensitivity.cutoffRecovery ?? 0) <= (sensitivity.cutoffSpeed ?? 0)} hint={t('gyroPage.steadyingFloorDesc')} />
      </>}
      <NumberField setting="GYRO_SMOOTH_TIME" label={t('gyroPage.smoothTime')} value={sensitivity.smoothTime} onChange={onSmoothTimeChange} min={0} max={1} step={0.001} defaultValue={0.125} unit="s" disabled={disabled} hint={`${t('gyroPage.smoothTimeDesc')} Default: 0.125 s. The moving average holds at most 256 poll samples; speed-decay smoothing uses a continuous time constant.`} />
      <NumberField setting="GYRO_SMOOTH_THRESHOLD" label={t('gyroPage.smoothThreshold')} value={sensitivity.smoothThreshold} onChange={onSmoothThresholdChange} min={0} max={360} step={1} defaultValue={0} unit="°/s" disabled={disabled} hint={`${t('gyroPage.smoothThresholdDesc')} Zero disables this smoothing stage; One Euro filtering is independent.`} />
      <GyroSettingRow setting="GYRO_SMOOTHING_DECAY" label={t('gyroPage.smoothingDecay')} description={t('gyroPage.smoothingDecayDesc')} hints="A:Choose;Y:Help;B:Back"
        control={<OnOff ariaLabel={t('gyroPage.smoothingDecay')} value={(sensitivity.smoothingDecay ?? 'OFF').toUpperCase() === 'ON'} disabled={disabled} onChange={on => onSmoothingDecayChange(on ? 'ON' : 'OFF')} />} />
      <SettingPrefix prefix=""><GyroSettingRow setting="ONE_EURO_FILTER" label={t('gyroPage.oneEuroFilter')} description={`${t('gyroPage.oneEuroFilterDesc')} Filter enable applies to the whole configuration; its tuning can change while an input is held.`} hints="A:Choose;Y:Help;B:Back"
        control={<OnOff ariaLabel={t('gyroPage.oneEuroFilter')} value={Boolean(sensitivity.oneEuroFilter)} disabled={disabled} onChange={on => onOneEuroFilterChange(on ? 'ON' : 'OFF')} />} /></SettingPrefix>
      {sensitivity.oneEuroFilter && (
        <>
          <NumberField setting="ONE_EURO_MIN_CUTOFF" label={t('gyroPage.oneEuroMinCutoff')} value={sensitivity.oneEuroMinCutoff} onChange={onOneEuroMinCutoffChange} min={0} max={20} step={0.1} defaultValue={6} unit="Hz" disabled={disabled} hint={t('gyroPage.oneEuroMinCutoffDesc')} />
          <NumberField setting="ONE_EURO_SPEED_COEFF" label={t('gyroPage.oneEuroSpeedCoeff')} value={sensitivity.oneEuroSpeedCoeff} onChange={onOneEuroSpeedCoeffChange} min={0} max={2} step={0.01} defaultValue={0.3} disabled={disabled} hint={t('gyroPage.oneEuroSpeedCoeffDesc')} />
        </>
      )}
      {!deflection && <><NumberField setting="GYRO_ANGLE_SNAP" label={t('gyroPage.angleSnap')} value={sensitivity.angleSnap} onChange={onAngleSnapChange} min={0} max={45} step={0.1} unit="°" disabled={disabled} hint={t('gyroPage.angleSnapDesc')} />
      <GyroSettingRow setting="GYRO_ANGLE_SNAP_EASE" label={t('gyroPage.angleSnapEase')} description={t('gyroPage.angleSnapEaseDesc')} hints="A:Choose;Y:Help;B:Back"
        control={<OnOff ariaLabel={t('gyroPage.angleSnapEase')} value={(sensitivity.angleSnapEase ?? 'OFF').toUpperCase() === 'ON'} disabled={disabled} onChange={on => onAngleSnapSmoothChange(on ? 'ON' : 'OFF')} />} /></>}
    </>
  )
}

export type GyroDampeningSectionProps = {
  sensitivity: SensitivityValues
  deflection?: boolean
  disabled?: boolean
  onDecelBrakeStrengthChange: (value: string) => void
  onDecelBrakeThresholdChange: (value: string) => void
  onGyroClickDampenChange: (value: string) => void
}

export function GyroDampeningSection({
  sensitivity,
  deflection,
  disabled,
  onDecelBrakeStrengthChange,
  onDecelBrakeThresholdChange,
  onGyroClickDampenChange,
}: GyroDampeningSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      {!deflection && <><NumberField setting="DECEL_BRAKE_STRENGTH" label={t('gyroPage.decelBrakeStrength')} value={sensitivity.decelBrakeStrength} onChange={onDecelBrakeStrengthChange} min={0} max={1} step={0.01} disabled={disabled} hint={t('gyroPage.decelBrakeStrengthDesc')} />
      <NumberField setting="DECEL_BRAKE_THRESHOLD" label={t('gyroPage.decelBrakeThreshold')} value={sensitivity.decelBrakeThreshold} onChange={onDecelBrakeThresholdChange} min={1} max={60} step={0.5} defaultValue={25} unit="°/s" disabled={disabled} hint={t('gyroPage.decelBrakeThresholdDesc')} />
      {/* Not gyro noise as such -- the gyro is reporting a real movement. It
          just isn't one you meant, which is what the rest of this section is about. */}
      <NumberField setting="GYRO_CLICK_DAMPEN" label={t('gyroPage.clickDampen')} value={sensitivity.gyroClickDampen} onChange={onGyroClickDampenChange} min={0} max={1} step={0.05} coarseStep={0.25} disabled={disabled} hint={t('gyroPage.clickDampenDesc')} /></>}
    </>
  )
}

export type GyroDiagnosticsSectionProps = {
  sensitivity: SensitivityValues
  deflection?: boolean
  sample: TelemetrySample | null
  hasPendingChanges: boolean
  telemetry: {
    omega: string
    sensX: string
    sensY: string
    timestamp: string
    sampleHz?: string
  }
  devices?: GyroDevice[]
  ignoredDevices?: string[]
  disabled?: boolean
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
}

/** The live readouts, the sensitivity curve with the live turn on it, and the connected controllers. */
export function GyroDiagnosticsSection({ sensitivity, deflection, sample, hasPendingChanges, telemetry, devices, ignoredDevices, disabled, onToggleIgnoreDevice }: GyroDiagnosticsSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <GyroSettingRow label={t('gyroPage.telemetry')} description={t('telemetry.livePacketsStreaming')} hints="Y:Help;B:Back"
        control={<div className={telemetryStyles.telemetryInline}><TelemetryBanner omega={telemetry.omega} timestamp={telemetry.timestamp} sampleHz={telemetry.sampleHz} /></div>} />
      {!deflection && <GyroSettingRow label={t('gyroPage.curvePreview')} description={t('gyroPage.curvePreviewDesc')} hints="Y:Help;B:Back"
        control={<CurvePreview sensitivity={sensitivity} sample={sample} hasPendingChanges={hasPendingChanges} telemetry={telemetry} />} />}
      <GyroDevicesSection devices={devices} ignoredDevices={ignoredDevices} disabled={disabled} onToggleIgnoreDevice={onToggleIgnoreDevice} />
    </>
  )
}
