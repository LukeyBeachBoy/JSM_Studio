import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'
import { AccelCurveEditor } from './AccelCurveEditor'
import { GYRO_ACCEL_DEFAULTS, type AccelCurveLink } from '../utils/accelCurve'

type AccelSensFormProps = {
  sensitivity: SensitivityValues
  disabled?: boolean
  onCurveChange: (value: string) => void
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
  accelCurveLink?: string
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
}

// The gyro's acceleration curve: the shared AccelCurveEditor with the gyro's
// own outputs (minimum and maximum sensitivity per axis) slotted in, labelled
// and described as Gyro.dc.html has them.
export function AccelSensForm({
  sensitivity,
  disabled,
  onCurveChange,
  onNaturalVHalfChange,
  onPowerVRefChange,
  onPowerExponentChange,
  onSigmoidMidChange,
  onSigmoidWidthChange,
  onJumpTauChange,
  onMinThresholdChange,
  onMaxThresholdChange,
  onMinSensXChange,
  onMinSensYChange,
  onMaxSensXChange,
  onMaxSensYChange,
  accelCurveLink,
  onAccelCurveLinkChange,
}: AccelSensFormProps) {
  const { t } = useTranslation()

  // The gyro keeps its curve type under `accelCurve`; the shared editor reads
  // `curve`. Every field of both shapes is optional, so handing over the raw
  // sensitivity object type-checks and then silently reads as LINEAR.
  const curveShape = { ...sensitivity, curve: sensitivity.accelCurve }
  const axis = (label: string, which: string) => `${label} (${which})`

  return (
    <AccelCurveEditor
      side="gyro"
      values={curveShape}
      inputUnit="°/s"
      inputMax={500}
      defaults={GYRO_ACCEL_DEFAULTS}
      disabled={disabled}
      onCurveChange={onCurveChange}
      onMinThresholdChange={onMinThresholdChange}
      onMaxThresholdChange={onMaxThresholdChange}
      onNaturalVHalfChange={onNaturalVHalfChange}
      onPowerVRefChange={onPowerVRefChange}
      onPowerExponentChange={onPowerExponentChange}
      onSigmoidMidChange={onSigmoidMidChange}
      onSigmoidWidthChange={onSigmoidWidthChange}
      onJumpTauChange={onJumpTauChange}
      link={accelCurveLink}
      onLinkChange={onAccelCurveLinkChange}
      thresholdLabels={{ min: t('gyroPage.minThreshold'), max: t('gyroPage.maxThreshold') }}
      thresholdHints={{ min: t('gyroPage.minThresholdDesc'), max: t('gyroPage.maxThresholdDesc') }}
      outputs={
        <>
          <NumberField setting="MIN_GYRO_SENS" label={axis(t('gyroPage.minSensitivity'), t('gyroPage.axisX'))} value={sensitivity.minSensX} onChange={onMinSensXChange} min={0} max={30} step={0.1} disabled={disabled} hint={t('gyroPage.minSensitivityDesc')} />
          <NumberField setting="MIN_GYRO_SENS" label={axis(t('gyroPage.minSensitivity'), t('gyroPage.axisY'))} value={sensitivity.minSensY} onChange={onMinSensYChange} min={0} max={30} step={0.1} disabled={disabled} hint={t('gyroPage.minSensitivityDesc')} />
          <NumberField setting="MAX_GYRO_SENS" label={axis(t('gyroPage.maxSensitivity'), t('gyroPage.axisX'))} value={sensitivity.maxSensX} onChange={onMaxSensXChange} min={0} max={30} step={0.1} disabled={disabled} hint={t('gyroPage.maxSensitivityDesc')} />
          <NumberField setting="MAX_GYRO_SENS" label={axis(t('gyroPage.maxSensitivity'), t('gyroPage.axisY'))} value={sensitivity.maxSensY} onChange={onMaxSensYChange} min={0} max={30} step={0.1} disabled={disabled} hint={t('gyroPage.maxSensitivityDesc')} />
        </>
      }
    />
  )
}
