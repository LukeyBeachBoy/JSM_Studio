import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../constants/sticks'
import { NumberField } from './NumberField'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import styles from './Sticks.module.css'
import { AppSelect } from './ui/AppSelect'

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
  /** The selected mode's everyday settings, shown in the card body. */
  modeExtras?: ReactNode
  /** The selected mode's rare settings. The card places these inside its own
   *  Advanced disclosure so a stick card never shows two of them. */
  modeAdvancedExtras?: ReactNode
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
  modeAdvancedExtras,
  variant = 'card',
}: StickSettingsCardProps) {
  const { t } = useTranslation()
  const selectableStickModes = STICK_MODE_VALUES.filter(mode => mode !== 'NO_MOUSE')

  return (
    <div className={`${styles.stickModeCard} ${variant === 'inline' ? styles.stickModeInline : ''}`} data-capture-ignore="true">
      {title && <h3>{title}</h3>}
      <label>
        {t('stickModes.stickMode')}
        <AppSelect className="app-select" value={modeValue} onChange={(event) => onModeChange(event.target.value)} disabled={disabled}>
          <option value="">{t('common.defaultValue', { value: formatStickModeLabel('NO_MOUSE', t) })}</option>
          {selectableStickModes.map(mode => (
            <option key={mode} value={mode}>
              {formatStickModeLabel(mode, t)}
            </option>
          ))}
        </AppSelect>
      </label>
      {modeExtras && <div className={styles.stickModeExtras}>{modeExtras}</div>}
      {/* The card's one and only Advanced disclosure: the deadzones and ring
          mode it owns, plus whatever the selected mode handed up. */}
      <AdvancedDisclosure
        summary={`${t('stickModes.innerDeadzone')} ${innerValue || defaultInner} · ${t('stickModes.outerDeadzone')} ${outerValue || defaultOuter}`}
      >
        <div className={styles.deadzoneRow}>
          <NumberField
            label={t('stickModes.innerDeadzone')}
            value={innerValue}
            onChange={onInnerChange}
            min={0}
            max={1}
            step={0.01}
            placeholder={defaultInner}
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
            disabled={disabled}
          />
          <label>
            {t('stickModes.ringMode')}
            <AppSelect className="app-select" value={ringValue} onChange={(event) => onRingChange(event.target.value)} disabled={disabled}>
              <option value="">{t('common.defaultValue', { value: t('stickModes.outer') })}</option>
              <option value="INNER">{t('stickModes.inner')}</option>
              <option value="OUTER">{t('stickModes.outer')}</option>
            </AppSelect>
          </label>
        </div>
        {modeAdvancedExtras}
      </AdvancedDisclosure>
    </div>
  )
}
