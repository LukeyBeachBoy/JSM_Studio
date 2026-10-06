import { useTranslation } from 'react-i18next'
import type { KeymapControlsProps } from './KeymapControls'
import { NumberField } from './NumberField'
import { AppSelect } from './ui/AppSelect'
import { useSettingKey } from './SettingOrigin'
import { STICK_AIM_DEFAULTS } from '../keymap/schema'
import stickStyles from './Sticks.module.css'

type StickSettingsPart = 'primary' | 'advanced'

type StickAimSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickAimSettings']>
  handlers: NonNullable<KeymapControlsProps['stickAimHandlers']>
  disabled?: boolean
  part: StickSettingsPart
}

export const StickAimSettings = ({ values, handlers, disabled, part }: StickAimSettingsProps) => {
  const { t } = useTranslation()
  const sensXValue = values.displaySensX
  const sensYValue = values.displaySensY
  const powerValue = values.power ?? ''
  const accelRateValue = values.accelerationRate ?? ''
  const accelCapValue = values.accelerationCap ?? ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  if (part === 'primary') {
    return (
      <div className={stickStyles.stickAimSettings} data-capture-ignore="true">
        <small>{t('keymap.stickSharedTuning', 'Aim and flick tuning is shared by physical sticks and touch sticks. In a modeshift, it applies while its trigger is active.')}</small>
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="STICK_SENS"
            label={t('keymap.stickSensitivityHorizontal')}
            hint={t('keymap.stickSensitivityHorizontalHint', 'Horizontal camera turn speed at full stick tilt.')}
            value={sensXValue}
            onChange={handlers.onSensXChange}
            min={0}
            max={1200}
            step={1}
            coarseStep={30}
            unit="°/s"
            defaultValue={Number(STICK_AIM_DEFAULTS.sens)}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.sens)}
            disabled={disabled}
          />
          <NumberField setting="STICK_SENS"
            label={t('keymap.stickSensitivityVertical')}
            hint={t('keymap.stickSensitivityVerticalHint', 'Vertical camera turn speed at full stick tilt.')}
            value={sensYValue}
            onChange={handlers.onSensYChange}
            min={0}
            max={1200}
            step={1}
            coarseStep={30}
            unit="°/s"
            defaultValue={Number(STICK_AIM_DEFAULTS.sens)}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.sens)}
            disabled={disabled}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={stickStyles.stickAimSettings} data-capture-ignore="true">
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="STICK_POWER"
            label={t('keymap.stickPower')}
            value={powerValue}
            onChange={handlers.onPowerChange}
            min={0.1}
            max={6}
            step={0.1}
            coarseStep={0.5}
            defaultValue={Number(STICK_AIM_DEFAULTS.power)}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.power)}
            disabled={disabled}
          />
          <NumberField setting="STICK_ACCELERATION_RATE"
            label={t('keymap.accelerationRate')}
            value={accelRateValue}
            onChange={handlers.onAccelerationRateChange}
            min={0}
            max={50}
            step={0.1}
            coarseStep={1}
            defaultValue={Number(STICK_AIM_DEFAULTS.accelerationRate)}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.accelerationRate)}
            disabled={disabled}
          />
          <NumberField setting="STICK_ACCELERATION_CAP"
            label={t('keymap.accelerationCap')}
            value={accelCapValue}
            onChange={handlers.onAccelerationCapChange}
            min={0}
            max={1000000}
            step={1}
            coarseStep={100}
            defaultValue={Number(STICK_AIM_DEFAULTS.accelerationCap)}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.accelerationCap)}
            disabled={disabled}
          />
        </div>
    </div>
  )
}

type StickFlickSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickFlickSettings']>
  handlers: NonNullable<KeymapControlsProps['stickFlickHandlers']>
  disabled?: boolean
  part: StickSettingsPart
}

export const StickFlickSettings = ({ values, handlers, disabled, part }: StickFlickSettingsProps) => {
  const { t } = useTranslation()
  const shifted = useSettingKey('FLICK_SNAP_MODE')?.includes(',')
  const snapMode = values.snapMode || ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  if (part === 'primary') {
    return (
      <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
        <small>{t('keymap.stickSharedTuning', 'Aim and flick tuning is shared by physical sticks and touch sticks. In a modeshift, it applies while its trigger is active.')}</small>
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="FLICK_TIME"
            label={t('keymap.flickTime')}
            value={values.flickTime}
            onChange={handlers.onFlickTimeChange}
            min={0}
            max={1}
            step={0.01}
            unit="s"
            defaultValue={0.1}
            placeholder={formatDefault('0.1')}
            disabled={disabled}
          />
          <label>
            {t('keymap.snapMode')}
            <AppSelect setting="FLICK_SNAP_MODE" className="app-select" value={snapMode} onChange={(event) => handlers.onSnapModeChange(event.target.value)} disabled={disabled}>
              <option value="">{shifted ? t('keymap.useNormalValue', 'Use normal value') : t('common.defaultValue', { value: t('common.off', 'Off') })}</option>
              <option value="NONE">{t('common.off', 'Off')}</option>
              <option value="4">{t('keymap.snapToFour')}</option>
              <option value="8">{t('keymap.snapToEight')}</option>
            </AppSelect>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="FLICK_TIME_EXPONENT"
            label={t('keymap.flickTimeExponent')}
            value={values.flickTimeExponent}
            onChange={handlers.onFlickTimeExponentChange}
            min={0}
            max={2}
            step={0.1}
            defaultValue={0.0}
            placeholder={formatDefault('0.0')}
            disabled={disabled}
          />
          <NumberField setting="FLICK_SNAP_STRENGTH"
            label={t('keymap.snapStrength')}
            hint={t('keymap.snapStrengthHint', 'Applies when snap mode is set to four or eight directions.')}
            value={values.snapStrength}
            onChange={handlers.onSnapStrengthChange}
            min={0}
            max={1}
            step={0.01}
            coarseStep={0.05}
            defaultValue={1.0}
            placeholder={formatDefault('1.0')}
            disabled={disabled}
          />
          <NumberField setting="FLICK_DEADZONE_ANGLE"
            label={t('keymap.forwardDeadzoneAngle')}
            value={values.deadzoneAngle}
            onChange={handlers.onDeadzoneAngleChange}
            min={0}
            max={180}
            step={1}
            coarseStep={5}
            unit="°"
            defaultValue={0}
            placeholder={formatDefault('0')}
            disabled={disabled}
          />
        </div>
    </div>
  )
}

