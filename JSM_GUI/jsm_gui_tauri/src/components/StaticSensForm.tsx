import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'

type StaticSensFormProps = {
  sensitivity: SensitivityValues
  disabled?: boolean
  onChangeX: (value: string) => void
  onChangeY: (value: string) => void
}

// Static sensitivity, one row per axis. GYRO_SENS has no written description
// yet, so the rows show the missing-help line (Gyro.dc.html) instead of a
// borrowed one.
export function StaticSensForm({ sensitivity, disabled, onChangeX, onChangeY }: StaticSensFormProps) {
  const { t } = useTranslation()
  const axis = (which: string) => `${t('gyroPage.staticSensitivity')} (${which})`
  return (
    <>
      <NumberField setting="GYRO_SENS" label={axis(t('gyroPage.axisX'))} value={sensitivity.gyroSensX} onChange={onChangeX} min={0} max={30} step={0.1} disabled={disabled} />
      <NumberField setting="GYRO_SENS" label={axis(t('gyroPage.axisY'))} value={sensitivity.gyroSensY} onChange={onChangeY} min={0} max={30} step={0.1} disabled={disabled} />
    </>
  )
}
