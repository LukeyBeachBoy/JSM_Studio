import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'

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
}

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
}: AccelSensFormProps) {
  const { t } = useTranslation()

  const curveValue = (sensitivity.accelCurve ?? 'LINEAR').toUpperCase()
  const isNatural = curveValue === 'NATURAL'
  const isPower = curveValue === 'POWER'
  const isSigmoid = curveValue === 'SIGMOID'
  const isJump = curveValue === 'JUMP'
  const showRollContribution = sensitivity.gyroSpace?.trim().toUpperCase() === 'YAW_PLUS_ROLL'
  const degPerSec = t('sensitivity.degPerSecondPlaceholder')

  return (
    <>
      <div className="flex-inputs">
        <label>
          {t('sensitivity.accelerationCurveLabel')}
          <select className="app-select" value={curveValue} onChange={(e) => onCurveChange(e.target.value)}>
            <option value="LINEAR">{t('sensitivity.curves.linear')}</option>
            <option value="NATURAL">{t('sensitivity.curves.natural')}</option>
            <option value="POWER">{t('sensitivity.curves.power')}</option>
            <option value="SIGMOID">{t('sensitivity.curves.sigmoid')}</option>
            <option value="QUADRATIC">{t('sensitivity.curves.quadratic')}</option>
            <option value="JUMP">{t('sensitivity.curves.jump')}</option>
          </select>
        </label>
      </div>
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
      <div className="flex-inputs">
        <NumberField
          label={t('sensitivity.minThreshold')}
          value={sensitivity.minThreshold}
          onChange={onMinThresholdChange}
          min={0}
          max={500}
          step={1}
          unit="°/s"
        />
        {isNatural ? (
          <NumberField
            label={t('sensitivity.naturalMidpoint')}
            value={sensitivity.naturalVHalf}
            onChange={onNaturalVHalfChange}
            min={1}
            max={500}
            step={1}
            placeholder={degPerSec}
            unit="°/s"
          />
        ) : isSigmoid ? (
          <>
            <NumberField
              label={t('sensitivity.sigmoidMidpoint')}
              value={sensitivity.sigmoidMid}
              onChange={onSigmoidMidChange}
              min={0}
              max={1000}
              step={1}
              placeholder={degPerSec}
              unit="°/s"
            />
            <NumberField
              label={t('sensitivity.sigmoidWidth')}
              value={sensitivity.sigmoidWidth}
              onChange={onSigmoidWidthChange}
              min={0.1}
              max={500}
              step={0.1}
            />
          </>
        ) : isJump ? (
          <>
            <NumberField label={t('sensitivity.jumpTau')} value={sensitivity.jumpTau} onChange={onJumpTauChange} min={0} max={500} step={0.1} />
            <NumberField
              label={t('sensitivity.maxThresholdJumpPoint')}
              value={sensitivity.maxThreshold}
              onChange={onMaxThresholdChange}
              min={0}
              max={500}
              step={1}
              unit="°/s"
            />
          </>
        ) : isPower ? (
          <>
            <NumberField
              label={t('sensitivity.powerVRef')}
              value={sensitivity.powerVRef}
              onChange={onPowerVRefChange}
              min={1}
              max={1000}
              step={1}
              placeholder={degPerSec}
              unit="°/s"
            />
            <NumberField
              label={t('sensitivity.powerExponent')}
              value={sensitivity.powerExponent}
              onChange={onPowerExponentChange}
              min={0.1}
              max={5}
              step={0.1}
            />
          </>
        ) : (
          <NumberField
            label={t('sensitivity.maxThreshold')}
            value={sensitivity.maxThreshold}
            onChange={onMaxThresholdChange}
            min={0}
            max={500}
            step={1}
            unit="°/s"
          />
        )}
      </div>
    </>
  )
}
