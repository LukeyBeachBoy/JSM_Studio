import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'
import { AccelCurveEditor } from './AccelCurveEditor'
import { GYRO_ACCEL_DEFAULTS, type AccelCurveLink } from '../utils/accelCurve'

type AccelSensFormProps = {
  sensitivity: SensitivityValues
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
  onRollContributionChange: (value: string) => void
  accelCurveLink?: string
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
}

// The gyro's acceleration curve: the shared AccelCurveEditor with the gyro's
// own outputs (min/max sensitivity per axis) slotted in.
export function AccelSensForm({
  sensitivity,
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
  onRollContributionChange,
  accelCurveLink,
  onAccelCurveLinkChange,
}: AccelSensFormProps) {
  const { t } = useTranslation()
  const showRollContribution = sensitivity.gyroSpace?.trim().toUpperCase() === 'YAW_PLUS_ROLL'

  return (
    <AccelCurveEditor
      side="gyro"
      values={sensitivity}
      inputUnit="°/s"
      inputMax={500}
      defaults={GYRO_ACCEL_DEFAULTS}
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
      outputs={
        <>
          <div className="flex-inputs">
            <NumberField label={t('sensitivity.minSensX')} value={sensitivity.minSensX} onChange={onMinSensXChange} min={0} max={30} step={0.1} />
            <NumberField label={t('sensitivity.minSensY')} value={sensitivity.minSensY} onChange={onMinSensYChange} min={0} max={30} step={0.1} />
            <NumberField label={t('sensitivity.maxSensX')} value={sensitivity.maxSensX} onChange={onMaxSensXChange} min={0} max={30} step={0.1} />
            <NumberField label={t('sensitivity.maxSensY')} value={sensitivity.maxSensY} onChange={onMaxSensYChange} min={0} max={30} step={0.1} />
          </div>
          {showRollContribution && (
            <div className="flex-inputs">
              <NumberField
                label={t('sensitivity.rollContribution')}
                value={sensitivity.rollContribution}
                onChange={onRollContributionChange}
                min={-100}
                max={100}
                step={1}
                unit="%"
              />
            </div>
          )}
        </>
      }
    />
  )
}
