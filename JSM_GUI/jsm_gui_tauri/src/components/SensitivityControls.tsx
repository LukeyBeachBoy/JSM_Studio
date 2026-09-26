import { SettingPrefix } from './SettingOrigin'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { StaticSensForm } from './StaticSensForm'
import { AccelSensForm } from './AccelSensForm'
import { SensitivityValues } from '../utils/keymap'
import type { AccelCurveLink } from '../utils/accelCurve'
import { GyroSettingRow, Segmented, SelectPill } from './GyroBehaviorControls'
import { InputGlyph } from './glyphs/InputGlyph'
import type { SelectOption } from './ui/Select'

export type GyroSensitivitySectionProps = {
  sensitivity: SensitivityValues
  modeshiftSensitivity?: SensitivityValues
  disabled?: boolean
  mode: 'static' | 'accel'
  sensitivityView: 'base' | 'modeshift'
  touchpadMode: string
  touchpadGridCells: number
  devices?: { type: number }[]
  onModeChange: (mode: 'static' | 'accel') => void
  onSensitivityViewChange: (view: 'base' | 'modeshift') => void
  onAccelCurveChange: (value: string) => void
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
  onStaticSensXChange: (value: string) => void
  onStaticSensYChange: (value: string) => void
  modeshiftButton: string | null
  onModeshiftButtonChange: (value: string) => void
  accelCurveLink?: string
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
}

// The Sensitivity section (Gyro.dc.html): the mode is a row with a segmented
// control rather than a view switch, the shift input a select pill, and the
// values follow as rows of the same template.
export function GyroSensitivitySection({
  sensitivity,
  modeshiftSensitivity,
  disabled,
  mode,
  sensitivityView,
  touchpadMode,
  touchpadGridCells,
  devices,
  onModeChange,
  onSensitivityViewChange,
  onAccelCurveChange,
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
  onStaticSensXChange,
  onStaticSensYChange,
  modeshiftButton,
  onModeshiftButtonChange,
  accelCurveLink,
  onAccelCurveLinkChange,
}: GyroSensitivitySectionProps) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(devices?.[0]?.type)
  const shifted = sensitivityView === 'modeshift' && Boolean(modeshiftButton)
  const displaySensitivity = shifted && modeshiftSensitivity ? modeshiftSensitivity : sensitivity

  const isTouchpadGridActive = touchpadMode === 'GRID_AND_STICK'
  const modeshiftOptions = useMemo<SelectOption[]>(() => {
    const options = buildModifierOptions(isTouchpadGridActive, isTouchpadGridActive ? touchpadGridCells : 0).map(option => {
      const [label, hint] = resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)
      return { value: option.value, label, hint, disabled: option.disabled, icon: <InputGlyph command={option.value} family={family} size={20} /> }
    })
    return [{ value: 'NONE', label: t('common.noModeShift') }, ...options]
  }, [isTouchpadGridActive, t, touchpadGridCells, family])
  const modeshiftName = modeshiftButton ? modeshiftOptions.find(option => option.value === modeshiftButton)?.label ?? modeshiftButton : ''

  return (
    <SettingPrefix prefix={shifted && modeshiftButton ? modeshiftButton + ',' : ''}>
      <GyroSettingRow label={t('gyroPage.sensitivityMode')} description={t('gyroPage.sensitivityModeDesc')} hints="A:Choose;Y:Help;B:Back"
        control={
          <Segmented<'static' | 'accel'> ariaLabel={t('gyroPage.sensitivityMode')} value={mode} disabled={disabled} onChange={onModeChange}
            options={[{ value: 'static', label: t('gyroPage.modeStatic') }, { value: 'accel', label: t('gyroPage.modeAccel') }]} />
        } />
      <GyroSettingRow label={t('gyroPage.shiftInput')} description={t('gyroPage.shiftInputDesc')} hints="A:Open;Y:Help;B:Back"
        value={<SelectPill ariaLabel={t('gyroPage.shiftInput')} value={modeshiftButton ?? 'NONE'} options={modeshiftOptions} disabled={disabled}
          onChange={next => onModeshiftButtonChange(next === 'NONE' ? '' : next)} />} />
      {modeshiftButton && (
        <GyroSettingRow label={t('gyroPage.shiftView')} description={t('gyroPage.shiftViewDesc', { input: modeshiftName })} hints="A:Choose;Y:Help;B:Back"
          control={
            <Segmented<'base' | 'modeshift'> ariaLabel={t('gyroPage.shiftView')} value={sensitivityView} disabled={disabled} onChange={onSensitivityViewChange}
              options={[{ value: 'base', label: t('gyroPage.shiftViewBase') }, { value: 'modeshift', label: t('gyroPage.shiftViewShifted') }]} />
          } />
      )}
      {mode === 'static' ? (
        <StaticSensForm
          sensitivity={displaySensitivity}
          disabled={disabled}
          onChangeX={onStaticSensXChange}
          onChangeY={onStaticSensYChange}
        />
      ) : (
        <AccelSensForm
          sensitivity={displaySensitivity}
          disabled={disabled}
          onCurveChange={onAccelCurveChange}
          onNaturalVHalfChange={onNaturalVHalfChange}
          onPowerVRefChange={onPowerVRefChange}
          onPowerExponentChange={onPowerExponentChange}
          onSigmoidMidChange={onSigmoidMidChange}
          onSigmoidWidthChange={onSigmoidWidthChange}
          onJumpTauChange={onJumpTauChange}
          onMinThresholdChange={onMinThresholdChange}
          onMaxThresholdChange={onMaxThresholdChange}
          onMinSensXChange={onMinSensXChange}
          onMinSensYChange={onMinSensYChange}
          onMaxSensXChange={onMaxSensXChange}
          onMaxSensYChange={onMaxSensYChange}
          accelCurveLink={accelCurveLink}
          onAccelCurveLinkChange={onAccelCurveLinkChange}
        />
      )}
    </SettingPrefix>
  )
}
