import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NumberField } from './NumberField'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import {
  ACCEL_CURVE_TYPES,
  inheritsCurveShape,
  normalizeAccelCurveLink,
  normalizeAccelCurveType,
  type AccelCurveLink,
  type AccelCurveShape,
} from '../utils/accelCurve'

export type AccelCurveEditorProps = {
  /** Which input this editor belongs to; decides the wording and which link options inherit. */
  side: 'gyro' | 'touchpad'
  values: AccelCurveShape
  /** Unit of the input speed axis: '°/s' for gyro, 'px/s' for trackpad. */
  inputUnit: string
  /** Slider ceiling for speed-domain fields. */
  inputMax: number
  /** Placeholders showing backend defaults for the shape parameters. */
  defaults: Partial<Record<Exclude<keyof AccelCurveShape, 'curve'>, number>>
  onCurveChange: (value: string) => void
  onMinThresholdChange: (value: string) => void
  onMaxThresholdChange: (value: string) => void
  onNaturalVHalfChange: (value: string) => void
  onPowerVRefChange: (value: string) => void
  onPowerExponentChange: (value: string) => void
  onSigmoidMidChange: (value: string) => void
  onSigmoidWidthChange: (value: string) => void
  onJumpTauChange: (value: string) => void
  /** ACCEL_CURVE_LINK -- shared between both sides, so either editor can set it. */
  link?: string
  onLinkChange?: (value: AccelCurveLink) => void
  /** The output rows (gyro sens X/Y, trackpad min/max gain). Rendered above the thresholds. */
  outputs?: ReactNode
  disabled?: boolean
}

// One editor for both acceleration curves. The *shape* (curve type and its
// parameters) is what can be shared: when this side inherits the other's, the
// shape controls fold away and only the speed range and outputs stay, since
// those are always this side's own.
export function AccelCurveEditor({
  side,
  values,
  inputUnit,
  inputMax,
  defaults,
  onCurveChange,
  onMinThresholdChange,
  onMaxThresholdChange,
  onNaturalVHalfChange,
  onPowerVRefChange,
  onPowerExponentChange,
  onSigmoidMidChange,
  onSigmoidWidthChange,
  onJumpTauChange,
  link,
  onLinkChange,
  outputs,
  disabled,
}: AccelCurveEditorProps) {
  const { t } = useTranslation()
  const activeLink = normalizeAccelCurveLink(link)
  const inherits = inheritsCurveShape(side, activeLink)
  const curve = normalizeAccelCurveType(values.curve)
  const otherName = side === 'gyro' ? t('accelCurve.touchpad') : t('accelCurve.gyro')
  const speedStep = inputMax >= 1000 ? 10 : 1
  const coarse = inputMax >= 1000 ? 100 : 10

  const linkOptions: Array<{ value: AccelCurveLink; label: string }> =
    side === 'gyro'
      ? [
          { value: 'NONE', label: t('accelCurve.linkOwn') },
          { value: 'GYRO_USES_TOUCHPAD', label: t('accelCurve.linkGyroUsesTouchpad') },
          { value: 'TOUCHPAD_USES_GYRO', label: t('accelCurve.linkTouchpadUsesGyro') },
        ]
      : [
          { value: 'NONE', label: t('accelCurve.linkOwn') },
          { value: 'TOUCHPAD_USES_GYRO', label: t('accelCurve.linkTouchpadUsesGyro') },
          { value: 'GYRO_USES_TOUCHPAD', label: t('accelCurve.linkGyroUsesTouchpad') },
        ]

  const shapeParams = inherits ? null : (
    <>
      {curve === 'NATURAL' && (
        <NumberField
          label={t('sensitivity.naturalMidpoint')}
          value={values.naturalVHalf}
          onChange={onNaturalVHalfChange}
          min={1}
          max={inputMax}
          step={speedStep}
          coarseStep={coarse}
          unit={inputUnit}
          placeholder={defaults.naturalVHalf !== undefined ? String(defaults.naturalVHalf) : undefined}
          disabled={disabled}
        />
      )}
      {curve === 'POWER' && (
        <>
          <NumberField
            label={t('sensitivity.powerVRef')}
            value={values.powerVRef}
            onChange={onPowerVRefChange}
            min={0.0001}
            max={1}
            step={0.001}
            coarseStep={0.01}
            placeholder={defaults.powerVRef !== undefined ? String(defaults.powerVRef) : undefined}
            disabled={disabled}
          />
          <NumberField
            label={t('sensitivity.powerExponent')}
            value={values.powerExponent}
            onChange={onPowerExponentChange}
            min={0.05}
            max={3}
            step={0.05}
            coarseStep={0.25}
            placeholder={defaults.powerExponent !== undefined ? String(defaults.powerExponent) : undefined}
            disabled={disabled}
          />
        </>
      )}
      {curve === 'SIGMOID' && (
        <>
          <NumberField
            label={t('sensitivity.sigmoidMidpoint')}
            value={values.sigmoidMid}
            onChange={onSigmoidMidChange}
            min={0}
            max={inputMax}
            step={speedStep}
            coarseStep={coarse}
            unit={inputUnit}
            placeholder={defaults.sigmoidMid !== undefined ? String(defaults.sigmoidMid) : undefined}
            disabled={disabled}
          />
          <NumberField
            label={t('sensitivity.sigmoidWidth')}
            value={values.sigmoidWidth}
            onChange={onSigmoidWidthChange}
            min={0.1}
            max={inputMax}
            step={speedStep === 1 ? 0.1 : speedStep}
            coarseStep={coarse}
            unit={inputUnit}
            placeholder={defaults.sigmoidWidth !== undefined ? String(defaults.sigmoidWidth) : undefined}
            disabled={disabled}
          />
        </>
      )}
      {curve === 'JUMP' && (
        <NumberField
          label={t('sensitivity.jumpTau')}
          value={values.jumpTau}
          onChange={onJumpTauChange}
          min={0.05}
          max={20}
          step={0.05}
          coarseStep={0.5}
          placeholder={defaults.jumpTau !== undefined ? String(defaults.jumpTau) : undefined}
          disabled={disabled}
        />
      )}
    </>
  )

  return (
    <div className="accel-curve-editor">
      {onLinkChange && (
        <div className="flex-inputs">
          <label>
            {t('accelCurve.linkLabel')}
            <p className="field-description">{t('accelCurve.linkHint')}</p>
            <select className="app-select" value={activeLink} onChange={event => onLinkChange(event.target.value as AccelCurveLink)} disabled={disabled}>
              {linkOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {inherits ? (
        <p className="field-description">{t('accelCurve.inheritingNote', { other: otherName })}</p>
      ) : (
        <div className="flex-inputs">
          <label>
            {t('sensitivity.accelerationCurveLabel')}
            <select className="app-select" value={curve} onChange={event => onCurveChange(event.target.value)} disabled={disabled}>
              {ACCEL_CURVE_TYPES.map(type => (
                <option key={type} value={type}>
                  {t(`sensitivity.curves.${type.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {outputs}

      <div className="flex-inputs">
        <NumberField
          label={t('accelCurve.minSpeed')}
          value={values.minThreshold}
          onChange={onMinThresholdChange}
          min={0}
          max={inputMax}
          step={speedStep}
          coarseStep={coarse}
          unit={inputUnit}
          placeholder={defaults.minThreshold !== undefined ? String(defaults.minThreshold) : undefined}
          hint={t('accelCurve.minSpeedHint')}
          disabled={disabled}
        />
        <NumberField
          label={t('accelCurve.maxSpeed')}
          value={values.maxThreshold}
          onChange={onMaxThresholdChange}
          min={0}
          max={inputMax}
          step={speedStep}
          coarseStep={coarse}
          unit={inputUnit}
          placeholder={defaults.maxThreshold !== undefined ? String(defaults.maxThreshold) : undefined}
          hint={t('accelCurve.maxSpeedHint')}
          disabled={disabled}
        />
      </div>

      {shapeParams && curve !== 'LINEAR' && curve !== 'QUADRATIC' && (
        <AdvancedDisclosure label={t('accelCurve.shapeParams')} defaultOpen>
          <div className="flex-inputs">{shapeParams}</div>
        </AdvancedDisclosure>
      )}
    </div>
  )
}
