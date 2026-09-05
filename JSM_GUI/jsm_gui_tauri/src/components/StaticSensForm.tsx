import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'

type StaticSensFormProps = {
  sensitivity: SensitivityValues
  onChangeX: (value: string) => void
  onChangeY: (value: string) => void
  onRollContributionChange: (value: string) => void
}

export function StaticSensForm({ sensitivity, onChangeX, onChangeY, onRollContributionChange }: StaticSensFormProps) {
  const { t } = useTranslation()
  const showRollContribution = sensitivity.gyroSpace?.trim().toUpperCase() === 'YAW_PLUS_ROLL'

  return (
    <>
      <div className="flex-inputs">
        <NumberField label={t('sensitivity.staticSensX')} value={sensitivity.gyroSensX} onChange={onChangeX} min={0} max={30} step={0.1} />
        <NumberField label={t('sensitivity.staticSensY')} value={sensitivity.gyroSensY} onChange={onChangeY} min={0} max={30} step={0.1} />
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
  )
}
