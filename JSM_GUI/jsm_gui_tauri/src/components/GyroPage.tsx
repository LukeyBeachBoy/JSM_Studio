import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SummaryRow } from './ui/SummaryRow'
import { Sheet } from './ui/Sheet'
import { SettingOrigins } from './SettingOrigin'
import { layerEntries } from '../utils/layers'
import { SensitivityValues } from '../utils/keymap'
import type { GyroActivationMode } from '../utils/gyroActivation'
import type { AccelCurveLink } from '../utils/accelCurve'
import { TelemetrySample } from '../hooks/useTelemetry'
import {
  GyroCalibrationSection,
  GyroGeneralSection,
  GyroOrientationSection,
  type GyroDevice,
} from './GyroBehaviorControls'
import { GyroSensitivitySection } from './SensitivityControls'
import { GyroDampeningSection, GyroDiagnosticsSection, GyroNoiseSection } from './NoiseSteadyingControls'
import styles from './GyroPage.module.css'

// The Gyro page (Gyro.dc.html, console refinement 1d): the essentials as
// rows -- general, calibration, sensitivity -- then Fine tuning, one summary
// row per group that opens a sheet: Steadying, Orientation, Dampening and
// Diagnostics. Each section carries an id and data-section, which is how the
// shell's section list (LB/RB) discovers them; the page keeps no list of its
// own. Saving is the title bar's state button, not a button per section.

type FineSheet = 'noise' | 'orientation' | 'dampening' | 'diagnostics'

const FINE_KEYS: Record<Exclude<FineSheet, 'diagnostics'>, string[]> = {
  noise: ['ONE_EURO_FILTER', 'ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF', 'GYRO_ANGLE_SNAP', 'GYRO_ANGLE_SNAP_EASE'],
  orientation: ['GYRO_SPACE', 'GYRO_AXIS_X', 'GYRO_AXIS_Y', 'ROLL_CONTRIBUTION'],
  dampening: ['GYRO_CUTOFF_SPEED', 'GYRO_CUTOFF_RECOVERY', 'GYRO_SMOOTH_TIME', 'GYRO_SMOOTH_THRESHOLD', 'GYRO_SMOOTHING_DECAY', 'DECEL_BRAKE_STRENGTH', 'DECEL_BRAKE_THRESHOLD', 'GYRO_CLICK_DAMPEN'],
}

const FINE_TEXT: Record<FineSheet, { title: string; description: string }> = {
  noise: { title: 'Steadying', description: 'Filters small, unintended movement so aim holds still.' },
  orientation: { title: 'Orientation', description: 'Which way tilting moves the aim, and how roll counts.' },
  dampening: { title: 'Dampening', description: 'Slows or ignores slow drift and the jolt of a button press.' },
  diagnostics: { title: 'Diagnostics', description: 'What the gyro reads right now, and which devices it reads.' },
}

export type GyroPageProps = {
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
  const { t } = useTranslation()
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
  const s = props.sensitivity
  const fineSummary: Record<FineSheet, string> = {
    noise: [s.oneEuroFilter ? 'Filter on' : 'Filter off', s.angleSnap ? `Snap ${s.angleSnap}°` : 'Snap off'].join(' · '),
    orientation: [s.gyroSpace ? s.gyroSpace.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Local space',
      s.gyroAxisX && s.gyroAxisX.toUpperCase() !== 'STANDARD' ? 'X inverted' : '', s.gyroAxisY && s.gyroAxisY.toUpperCase() !== 'STANDARD' ? 'Y inverted' : ''].filter(Boolean).join(' · '),
    dampening: [s.smoothTime ? `Smoothing ${s.smoothTime} s` : '', s.cutoffSpeed ? `Cutoff ${s.cutoffSpeed} °/s` : '', s.gyroClickDampen ? `Click ${Math.round(s.gyroClickDampen * 100)}%` : ''].filter(Boolean).join(' · ') || 'Default',
    diagnostics: 'Live readings and devices',
  }
  const fineSheet = (key: FineSheet, body: React.ReactNode) => (
    <Sheet open={sheet === key} onClose={() => setSheet(null)} eyebrow="Gyro · Fine tuning" title={FINE_TEXT[key].title} description={FINE_TEXT[key].description}
      hints={[{ button: 'A', label: 'Adjust' }, { button: 'Y', label: 'Use Default' }, { button: 'B', label: 'Close' }]}>
      <div className="sheet-embed">{body}</div>
    </Sheet>
  )

  const section = (key: 'general' | 'calibration' | 'sensitivity' | 'fine', body: React.ReactNode) => {
    const label = key === 'fine' ? t('gyroPage.sections.fine', 'Fine tuning') : t(`gyroPage.sections.${key}`)
    return (
      <section id={`gyro-${key}`} className={`page-section ${styles.section}`} data-section={label} aria-label={label}>
        <h2 className={styles.heading}>{label}</h2>
        {body}
      </section>
    )
  }

  return (
    <div className={`${styles.page} ${disabled ? styles.locked : ''}`.trim()} aria-disabled={disabled || undefined}>
      {disabled && <p className={styles.lockNote} role="status">{lockMessage ?? t('gyroPage.locked')}</p>}
      {section('general',
        <GyroGeneralSection
          sensitivity={props.sensitivity}
          gyroActivationMode={props.gyroActivationMode}
          gyroActivationButton={props.gyroActivationButton}
          touchpadMode={props.touchpadMode}
          touchpadGridCells={props.touchpadGridCells}
          touchpadGridCommands={props.touchpadGridCommands}
          devices={props.devices}
          disabled={disabled}
          onGyroActivationModeChange={props.onGyroActivationModeChange}
          onGyroActivationButtonChange={props.onGyroActivationButtonChange}
          onGyroOutputChange={props.onGyroOutputChange}
          counterOsMouseSpeed={props.counterOsMouseSpeed}
          onCounterOsMouseSpeedChange={props.onCounterOsMouseSpeedChange}
        />)}
      {section('calibration',
        <GyroCalibrationSection
          sensitivity={props.sensitivity}
          disabled={disabled}
          onInGameSensChange={props.onInGameSensChange}
          onRealWorldCalibrationChange={props.onRealWorldCalibrationChange}
          onOpenCalibration={props.onOpenCalibration}
          onOpenRwcGuide={props.onOpenRwcGuide}
        />)}
      {section('sensitivity',
        <GyroSensitivitySection
          sensitivity={props.sensitivity}
          modeshiftSensitivity={props.modeshiftSensitivity}
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
        {(['noise', 'orientation', 'dampening', 'diagnostics'] as const).map(key => (
          <SummaryRow key={key} size="tile" label={FINE_TEXT[key].title} hint={fineSummary[key]} value={key === 'diagnostics' ? '' : changed(FINE_KEYS[key])}
            onActivate={() => setSheet(key)} />
        ))}
      </>)}
      {fineSheet('noise', <GyroNoiseSection
          sensitivity={props.sensitivity}
          disabled={disabled}
          onOneEuroFilterChange={props.onOneEuroFilterChange}
          onOneEuroMinCutoffChange={props.onOneEuroMinCutoffChange}
          onOneEuroSpeedCoeffChange={props.onOneEuroSpeedCoeffChange}
          onAngleSnapChange={props.onAngleSnapChange}
          onAngleSnapSmoothChange={props.onAngleSnapSmoothChange}
        />)}
      {fineSheet('orientation', <GyroOrientationSection
          sensitivity={props.sensitivity}
          sensitivityPrefix={shiftPrefix}
          disabled={disabled}
          onGyroSpaceChange={props.onGyroSpaceChange}
          onGyroAxisXChange={props.onGyroAxisXChange}
          onGyroAxisYChange={props.onGyroAxisYChange}
          onRollContributionChange={props.onRollContributionChange}
        />)}
      {fineSheet('dampening', <GyroDampeningSection
          sensitivity={props.sensitivity}
          disabled={disabled}
          onCutoffSpeedChange={props.onCutoffSpeedChange}
          onCutoffRecoveryChange={props.onCutoffRecoveryChange}
          onSmoothTimeChange={props.onSmoothTimeChange}
          onSmoothThresholdChange={props.onSmoothThresholdChange}
          onSmoothingDecayChange={props.onSmoothingDecayChange}
          onDecelBrakeStrengthChange={props.onDecelBrakeStrengthChange}
          onDecelBrakeThresholdChange={props.onDecelBrakeThresholdChange}
          onGyroClickDampenChange={props.onGyroClickDampenChange}
        />)}
      {fineSheet('diagnostics', <GyroDiagnosticsSection
          sensitivity={props.sensitivity}
          sample={props.sample}
          hasPendingChanges={hasPendingChanges}
          telemetry={props.telemetry}
          devices={props.devices}
          ignoredDevices={props.ignoredDevices}
          disabled={disabled}
          onToggleIgnoreDevice={props.onToggleIgnoreDevice}
        />)}
    </div>
  )
}
