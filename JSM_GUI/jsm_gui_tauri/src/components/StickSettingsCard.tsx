import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../constants/sticks'
import { NumberField } from './NumberField'
import styles from './Sticks.module.css'

type StickSettingsCardProps = {
  title: string
  innerValue: string
  outerValue: string
  defaultInner: string
  defaultOuter: string
  modeValue: string
  ringValue: string
  onModeChange: (value: string) => void
  onRingChange: (value: string) => void
  disabled?: boolean
  onInnerChange: (value: string) => void
  onOuterChange: (value: string) => void
  modeExtras?: ReactNode
  variant?: 'card' | 'inline'
}

export function StickSettingsCard({
  title,
  innerValue,
  outerValue,
  defaultInner,
  defaultOuter,
  modeValue,
  ringValue,
  onModeChange,
  onRingChange,
  disabled = false,
  onInnerChange,
  onOuterChange,
  modeExtras,
  variant = 'card',
}: StickSettingsCardProps) {
  const { t } = useTranslation()
  const selectableStickModes = STICK_MODE_VALUES.filter(mode => mode !== 'NO_MOUSE')

  return (
    <div className={`${styles.stickModeCard} ${variant === 'inline' ? styles.stickModeInline : ''}`} data-capture-ignore="true">
      <h3>{title}</h3>
      <label>
        {t('stickModes.stickMode')}
        <select className="app-select" value={modeValue} onChange={(event) => onModeChange(event.target.value)} disabled={disabled}>
          <option value="">{t('common.defaultValue', { value: formatStickModeLabel('NO_MOUSE', t) })}</option>
          {selectableStickModes.map(mode => (
            <option key={mode} value={mode}>
              {formatStickModeLabel(mode, t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('stickModes.ringMode')}
        <select className="app-select" value={ringValue} onChange={(event) => onRingChange(event.target.value)} disabled={disabled}>
          <option value="">{t('common.defaultValue', { value: t('stickModes.outer') })}</option>
          <option value="INNER">{t('stickModes.inner')}</option>
          <option value="OUTER">{t('stickModes.outer')}</option>
        </select>
      </label>
      <NumberField
        label={t('stickModes.innerDeadzone')}
        value={innerValue}
        onChange={onInnerChange}
        min={0}
        max={1}
        step={0.01}
        placeholder={defaultInner}
        hint={innerValue ? undefined : t('common.defaultValue', { value: defaultInner })}
        disabled={disabled}
      />
      <NumberField
        label={t('stickModes.outerDeadzone')}
        value={outerValue}
        onChange={onOuterChange}
        min={0}
        max={1}
        step={0.01}
        placeholder={defaultOuter}
        hint={outerValue ? undefined : t('common.defaultValue', { value: defaultOuter })}
        disabled={disabled}
      />
      {modeExtras && <div className={styles.stickModeExtras}>{modeExtras}</div>}
    </div>
  )
}
