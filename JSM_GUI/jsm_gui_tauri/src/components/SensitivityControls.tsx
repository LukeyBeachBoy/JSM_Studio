import { SettingPrefix } from './SettingOrigin'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { StaticSensForm } from './StaticSensForm'
import { SensitivityValues } from '../utils/keymap'
import {
  GYRO_ACCEL_DEFAULTS,
  GYRO_OUTPUT_DEFAULTS,
  accelCurveSettleSpeed,
  inheritsCurveShape,
  normalizeAccelCurveLink,
  normalizeAccelCurveType,
  type AccelCurveLink,
  type AccelCurveParams,
} from '../utils/accelCurve'
import { GyroSettingRow, Segmented, SelectPill } from './GyroBehaviorControls'
import { InputGlyph } from './glyphs/InputGlyph'
import { CurveSparkline } from './CurvePlot'
import type { SelectOption } from './ui/Select'

// The gyro's own curve as the mapper evaluates it, unset values at their defaults.
const sparkParams = (s: SensitivityValues): AccelCurveParams => ({
  curveType: normalizeAccelCurveType(s.accelCurve),
  minSens: s.minSensX ?? GYRO_OUTPUT_DEFAULTS.minSens,
  maxSens: s.maxSensX ?? GYRO_OUTPUT_DEFAULTS.maxSens,
  minThreshold: s.minThreshold ?? GYRO_OUTPUT_DEFAULTS.minThreshold,
  maxThreshold: s.maxThreshold ?? GYRO_OUTPUT_DEFAULTS.maxThreshold,
  naturalVHalf: s.naturalVHalf ?? GYRO_ACCEL_DEFAULTS.naturalVHalf,
  powerVRef: s.powerVRef ?? GYRO_ACCEL_DEFAULTS.powerVRef,
  powerExponent: s.powerExponent ?? GYRO_ACCEL_DEFAULTS.powerExponent,
  sigmoidMid: s.sigmoidMid ?? GYRO_ACCEL_DEFAULTS.sigmoidMid,
  sigmoidWidth: s.sigmoidWidth ?? GYRO_ACCEL_DEFAULTS.sigmoidWidth,
  jumpTau: s.jumpTau ?? GYRO_ACCEL_DEFAULTS.jumpTau,
  steadying: { cutoff: s.cutoffSpeed ?? 0, recovery: s.cutoffRecovery ?? 0, floor: s.steadyingFloorX ?? 0, enabled: (s.steadyingFloorX ?? 0) > 0 || (s.steadyingFloorY ?? 0) > 0 },
})
const sparkRange = (s: SensitivityValues) => Math.max(20, accelCurveSettleSpeed(sparkParams(s)) * 1.25)

export type GyroSensitivitySectionProps = {
  hideScope?: boolean
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
export function GyroScopeControls({ devices, sensitivityView, modeshiftButton, touchpadMode, touchpadGridCells, disabled, onModeshiftButtonChange, onSensitivityViewChange, deflection }: Pick<GyroSensitivitySectionProps, 'devices' | 'sensitivityView' | 'modeshiftButton' | 'touchpadMode' | 'touchpadGridCells' | 'disabled' | 'onModeshiftButtonChange' | 'onSensitivityViewChange'> & { deflection?: boolean }) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(devices?.[0]?.type)
  const isTouchpadGridActive = touchpadMode === 'GRID_AND_STICK'
  const modeshiftOptions = useMemo<SelectOption[]>(() => {
    const options = buildModifierOptions(isTouchpadGridActive, isTouchpadGridActive ? touchpadGridCells : 0).map(option => {
      const [label, hint] = resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)
      return { value: option.value, label, hint, disabled: option.disabled, icon: <InputGlyph command={option.value} family={family} size={20} /> }
    })
    return [{ value: 'NONE', label: t('common.noModeShift') }, ...options]
  }, [isTouchpadGridActive, t, touchpadGridCells, family])
  const modeshiftName = modeshiftButton ? modeshiftOptions.find(option => option.value === modeshiftButton)?.label ?? modeshiftButton : ''
  return <>
    <GyroSettingRow label={deflection ? 'Held settings' : t('gyroPage.shiftInput')} description={deflection ? 'Choose the input whose gyro overrides you want to edit.' : t('gyroPage.shiftInputDesc')} hints="A:Open;Y:Help;B:Back"
      value={<SelectPill ariaLabel={deflection ? 'Held settings' : t('gyroPage.shiftInput')} value={modeshiftButton ?? 'NONE'} options={modeshiftOptions} disabled={disabled}
        onChange={next => onModeshiftButtonChange(next === 'NONE' ? '' : next)} />} />
    {modeshiftButton && <GyroSettingRow label={t('gyroPage.shiftView')} description={t('gyroPage.shiftViewDesc', { input: modeshiftName })} hints="A:Choose;Y:Help;B:Back"
      control={<Segmented<'base' | 'modeshift'> ariaLabel={t('gyroPage.shiftView')} value={sensitivityView} disabled={disabled} onChange={onSensitivityViewChange}
        options={[{ value: 'base', label: t('gyroPage.shiftViewBase') }, { value: 'modeshift', label: t('gyroPage.shiftViewShifted') }]} />} />}
  </>
}

export function GyroSensitivitySection({
  hideScope,
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
  onStaticSensXChange,
  onStaticSensYChange,
  modeshiftButton,
  onModeshiftButtonChange,
  accelCurveLink,
}: GyroSensitivitySectionProps) {
  const { t } = useTranslation()
  const shifted = sensitivityView === 'modeshift' && Boolean(modeshiftButton)
  const displaySensitivity = shifted && modeshiftSensitivity ? modeshiftSensitivity : sensitivity


  return (
    <SettingPrefix prefix={shifted && modeshiftButton ? modeshiftButton + ',' : ''}>
      <GyroSettingRow label={t('gyroPage.sensitivityMode')} description={t('gyroPage.sensitivityModeDesc')} hints="A:Choose;Y:Help;B:Back"
        control={
          <Segmented<'static' | 'accel'> ariaLabel={t('gyroPage.sensitivityMode')} value={mode} disabled={disabled} onChange={onModeChange}
            options={[{ value: 'static', label: t('gyroPage.modeStatic') }, { value: 'accel', label: t('gyroPage.modeAccel') }]} />
        } />
      {!hideScope && <GyroScopeControls {...{ devices, sensitivityView, modeshiftButton, touchpadMode, touchpadGridCells, disabled, onModeshiftButtonChange, onSensitivityViewChange }} />}
      {mode === 'static' ? (
        <StaticSensForm
          sensitivity={displaySensitivity}
          disabled={disabled}
          onChangeX={onStaticSensXChange}
          onChangeY={onStaticSensYChange}
        />
      ) : (<>
        <GyroSettingRow label={t('curveView.entryLabel', 'Curve editor')} hints="A:Open;Y:Help;B:Back"
          description={t('curveView.entryDesc', 'The curve full size, with your live turning speed on it, while you shape it. Drag its points or adjust the rows beside it.')}
          value={
            <span className="curve-entry">
              {!inheritsCurveShape('gyro', normalizeAccelCurveLink(accelCurveLink)) && <CurveSparkline params={sparkParams(displaySensitivity)} xMax={sparkRange(displaySensitivity)} />}
              <button type="button" className="button button--secondary" disabled={disabled}
                onClick={() => window.dispatchEvent(new CustomEvent('jsm:accel-curve', { detail: 'gyro' }))}>
                {t('curveView.entryButton', 'Open curve editor')}
              </button>
            </span>
          } />
      </>)}
    </SettingPrefix>
  )
}
