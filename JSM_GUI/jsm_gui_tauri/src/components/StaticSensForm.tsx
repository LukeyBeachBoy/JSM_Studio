import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { NumberField } from './NumberField'

type StaticSensFormProps = {
  sensitivity: SensitivityValues
  disabled?: boolean
  onChangeX: (value: string) => void
  onChangeY: (value: string) => void
}

// Static sensitivity, one row per axis.
//
// GYRO_SENS writes MIN_GYRO_SENS and MAX_GYRO_SENS together. Unset, the
// mapper runs on those two -- its defaults are 0 and 1 with both thresholds
// at 0, which is the maximum at every speed -- so an empty row shows (and
// its slider sits at) the maximum the file or the mapper would use, rather
// than a blank box and a slider parked at zero.
export function StaticSensForm({ sensitivity, disabled, onChangeX, onChangeY }: StaticSensFormProps) {
  const { t } = useTranslation()
  const axis = (which: string) => `${t('gyroPage.staticSensitivity')} (${which})`
  const inheritedX = sensitivity.maxSensX ?? 1
  const inheritedY = sensitivity.maxSensY ?? sensitivity.maxSensX ?? 1
  const hint = t('gyroPage.staticSensitivityDesc')
  return (
    <>
      <NumberField setting="GYRO_SENS" label={axis(t('gyroPage.axisX'))} value={sensitivity.gyroSensX} onChange={onChangeX} min={0} max={30} step={0.1} defaultValue={inheritedX} hint={hint} disabled={disabled} />
      <NumberField setting="GYRO_SENS" label={axis(t('gyroPage.axisY'))} value={sensitivity.gyroSensY} onChange={onChangeY} min={0} max={30} step={0.1} defaultValue={inheritedY} hint={hint} disabled={disabled} />
    </>
  )
}
