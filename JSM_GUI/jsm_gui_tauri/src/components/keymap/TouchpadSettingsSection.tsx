import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'

type TouchpadCardConfig = {
  mode: string
  dualStageMode: string
  gridColumns: number
  gridRows: number
  sensitivity?: number
  onModeChange?: (value: string) => void
  onGridSizeChange?: (cols: number, rows: number) => void
  onSensitivityChange?: (value: string) => void
  onDualStageModeChange?: (value: string) => void
}

type TouchpadSettingsSectionProps = {
  /** Optional independent pad configurations. When supplied, the two cards are shown. */
  left?: TouchpadCardConfig
  right?: TouchpadCardConfig
  touchpadMode: string
  touchpadDualStageMode: string
  gridColumns: number
  gridRows: number
  onTouchpadModeChange?: (value: string) => void
  onGridSizeChange?: (cols: number, rows: number) => void
  touchpadSensitivity?: number
  onTouchpadSensitivityChange?: (value: string) => void
  onTouchpadDualStageModeChange?: (value: string) => void
  warnings?: string[]
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

function TouchpadCard({ config, title }: { config: TouchpadCardConfig; title: string }) {
  const { t } = useTranslation()
  const dualStageValues = ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R']
  return (
    <div className={styles.touchpadCard}>
      <h4>{title}</h4>
      <label>{t('keymap.mode')}<select className="app-select" value={config.mode} onChange={e => config.onModeChange?.(e.target.value)}>
        <option value="">{t('common.noneSelected')}</option><option value="GRID_AND_STICK">{t('keymap.gridAndStick')}</option><option value="MOUSE">{t('keymap.mouse')}</option><option value="PS_TOUCHPAD">{t('keymap.psTouchpad')}</option>
      </select></label>
      <label>{t('keymap.touchpadDualStageMode')}<select className="app-select" value={config.dualStageMode || 'NO_SKIP'} onChange={e => config.onDualStageModeChange?.(e.target.value)}>
        {dualStageValues.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      {config.mode === 'GRID_AND_STICK' && <div className={styles.gridSizeInputs}><label>{t('keymap.columns')}<input type="number" min={1} max={5} value={config.gridColumns} onChange={e => config.onGridSizeChange?.(Number(e.target.value) || 1, config.gridRows)} /></label><label>{t('keymap.rows')}<input type="number" min={1} max={5} value={config.gridRows} onChange={e => config.onGridSizeChange?.(config.gridColumns, Number(e.target.value) || 1)} /></label></div>}
      {config.mode === 'MOUSE' && <label>{t('keymap.touchpadSensitivity')}<input type="number" step="0.1" value={config.sensitivity ?? ''} onChange={e => config.onSensitivityChange?.(e.target.value)} /></label>}
    </div>
  )
}

export function TouchpadSettingsSection({ left, right, ...props }: TouchpadSettingsSectionProps) {
  const { touchpadMode, touchpadDualStageMode, gridColumns, gridRows, onTouchpadModeChange, onGridSizeChange, touchpadSensitivity, onTouchpadSensitivityChange, onTouchpadDualStageModeChange, warnings, hasPendingChanges, statusMessage, onApply, onCancel, applyDisabled } = props
  const { t } = useTranslation()
  const hasCustomDualStageMode = Boolean(
    touchpadDualStageMode &&
      !['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R'].includes(
        touchpadDualStageMode
      )
  )

  return (
    <>
      <KeymapSection title={t('keymap.touchpadSettingsTitle')} description={t('keymap.touchpadSettingsDescription')}>
        {left && right && <div className={styles.touchpadCards}>
          <TouchpadCard config={left} title={t('keymap.leftTouchpad', 'Left touchpad')} />
          <TouchpadCard config={right} title={t('keymap.rightTouchpad', 'Right touchpad')} />
        </div>}
        <div className={styles.touchpadSettings}>
          <label>
            {t('keymap.mode')}
            <select className="app-select" value={touchpadMode} onChange={(event) => onTouchpadModeChange?.(event.target.value)}>
              <option value="">{t('common.noneSelected')}</option>
              <option value="GRID_AND_STICK">{t('keymap.gridAndStick')}</option>
              <option value="MOUSE">{t('keymap.mouse')}</option>
              <option value="PS_TOUCHPAD">{t('keymap.psTouchpad')}</option>
            </select>
          </label>
          <label>
            {t('keymap.touchpadDualStageMode')}
            <select
              className="app-select"
              value={touchpadDualStageMode || 'NO_SKIP'}
              onChange={(event) => onTouchpadDualStageModeChange?.(event.target.value)}
            >
              {['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R'].map(mode => (
                <option key={mode} value={mode}>
                  {mode === 'NO_SKIP' ? t('common.defaultValue', { value: mode }) : mode}
                </option>
              ))}
              {hasCustomDualStageMode && (
                <option value={touchpadDualStageMode}>{t('keymap.currentRawValue', { value: touchpadDualStageMode })}</option>
              )}
            </select>
          </label>
          {touchpadMode === 'GRID_AND_STICK' && (
            <>
              <div className={styles.gridSizeInputs}>
                <label>
                  {t('keymap.columns')}
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={gridColumns}
                    onChange={(event) => onGridSizeChange?.(Number(event.target.value) || 1, gridRows)}
                  />
                </label>
                <label>
                  {t('keymap.rows')}
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={gridRows}
                    onChange={(event) => onGridSizeChange?.(gridColumns, Number(event.target.value) || 1)}
                  />
                </label>
              </div>
              <small className={styles.gridLimitHint}>{t('common.rowsColsCannotExceed')}</small>
            </>
          )}
          {touchpadMode === 'MOUSE' && (
            <label>
              {t('keymap.touchpadSensitivity')}
              <input
                type="number"
                step="0.1"
                value={touchpadSensitivity ?? ''}
                onChange={(event) => onTouchpadSensitivityChange?.(event.target.value)}
                placeholder={t('common.defaultPlaceholder')}
              />
            </label>
          )}
          {warnings && warnings.length > 0 && (
            <div className={styles.touchpadWarnings}>
              {warnings.map((warning, index) => (
                <div key={`${warning}-${index}`} className={styles.touchpadWarning}>
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      </KeymapSection>
      <SectionActions
        className={keymapStyles.keymapSectionActions}
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={onApply}
        onCancel={onCancel}
        applyDisabled={applyDisabled}
      />
    </>
  )
}
