import { useTranslation } from 'react-i18next'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import { SectionActions } from '../SectionActions'
import { NumberField } from '../NumberField'
import { AccelCurveEditor } from '../AccelCurveEditor'
import { SensitivityGraph } from '../SensitivityGraph'
import graphStyles from '../Graph.module.css'
import {
  TOUCHPAD_ACCEL_DEFAULTS,
  inheritsCurveShape,
  normalizeAccelCurveLink,
  normalizeAccelCurveType,
  type AccelCurveLink,
  type AccelCurveShape,
} from '../../utils/accelCurve'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../../hooks/useTouchpadConfig'

type Props = {
  liveSpeed?: number
  values: TouchpadAccelValues
  /** The gyro's shape, so the preview can show what "use gyro's curve" means. */
  gyroShape?: AccelCurveShape
  accelCurveLink?: string
  onCurveChange: (value: string) => void
  onParamChange: (param: TouchpadAccelParamKey, value: string) => void
  onLinkChange: (value: AccelCurveLink) => void
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

// The trackpad mouse's acceleration curve: the same editor the gyro uses, with
// the trackpad's outputs (a gain at slow and at fast finger speeds) slotted in.
export function TouchpadAccelSection({
  liveSpeed,
  values,
  gyroShape,
  accelCurveLink,
  onCurveChange,
  onParamChange,
  onLinkChange,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled,
}: Props) {
  const { t } = useTranslation()
  const link = normalizeAccelCurveLink(accelCurveLink)
  const inherits = inheritsCurveShape('touchpad', link)
  const minGain = values.minGain ?? TOUCHPAD_ACCEL_DEFAULTS.minGain
  const maxGain = values.maxGain ?? TOUCHPAD_ACCEL_DEFAULTS.maxGain
  const minSpeed = values.minThreshold ?? TOUCHPAD_ACCEL_DEFAULTS.minThreshold
  const maxSpeed = values.maxThreshold ?? TOUCHPAD_ACCEL_DEFAULTS.maxThreshold
  const active = minGain !== maxGain || minGain !== 1

  // What the backend will actually evaluate: the trackpad's own shape, or the
  // gyro's shape stretched across the trackpad's speed range when inheriting.
  const previewShape: AccelCurveShape = inherits && gyroShape
    ? (() => {
        const gyroRange = (gyroShape.maxThreshold ?? 0) - (gyroShape.minThreshold ?? 0)
        const padRange = maxSpeed - minSpeed
        const scale = gyroRange > 0 ? padRange / gyroRange : 1
        return {
          curve: gyroShape.curve,
          minThreshold: minSpeed,
          maxThreshold: maxSpeed,
          naturalVHalf: gyroShape.naturalVHalf !== undefined ? gyroShape.naturalVHalf * scale : undefined,
          powerVRef: gyroShape.powerVRef !== undefined ? gyroShape.powerVRef / (scale || 1) : undefined,
          powerExponent: gyroShape.powerExponent,
          sigmoidMid: gyroShape.sigmoidMid !== undefined ? gyroShape.sigmoidMid * scale : undefined,
          sigmoidWidth: gyroShape.sigmoidWidth !== undefined ? gyroShape.sigmoidWidth * scale : undefined,
          jumpTau: gyroShape.jumpTau,
        }
      })()
    : { ...values, minThreshold: minSpeed, maxThreshold: maxSpeed }

  return (
    <>
      <KeymapSection
        className="tuning-group"
        title={t('touchpadAccel.title')}
        description={t('touchpadAccel.description')}
      >
        <AccelCurveEditor
          side="touchpad"
          values={values}
          inputUnit="px/s"
          inputMax={5000}
          defaults={TOUCHPAD_ACCEL_DEFAULTS}
          onCurveChange={onCurveChange}
          onMinThresholdChange={v => onParamChange('minThreshold', v)}
          onMaxThresholdChange={v => onParamChange('maxThreshold', v)}
          onNaturalVHalfChange={v => onParamChange('naturalVHalf', v)}
          onPowerVRefChange={v => onParamChange('powerVRef', v)}
          onPowerExponentChange={v => onParamChange('powerExponent', v)}
          onSigmoidMidChange={v => onParamChange('sigmoidMid', v)}
          onSigmoidWidthChange={v => onParamChange('sigmoidWidth', v)}
          onJumpTauChange={v => onParamChange('jumpTau', v)}
          link={accelCurveLink}
          onLinkChange={onLinkChange}
          disabled={applyDisabled}
          outputs={
            <div className="flex-inputs">
              <NumberField
                label="Min Sens"
                value={values.minGain}
                onChange={v => onParamChange('minGain', v)}
                min={0.1}
                max={5}
                step={0.05}
                coarseStep={0.25}
                unit="×"
                placeholder={String(TOUCHPAD_ACCEL_DEFAULTS.minGain)}
                hint={t('touchpadAccel.minGainHint')}
                disabled={applyDisabled}
              />
              <NumberField
                label="Max Sens"
                value={values.maxGain}
                onChange={v => onParamChange('maxGain', v)}
                min={0.1}
                max={5}
                step={0.05}
                coarseStep={0.25}
                unit="×"
                placeholder={String(TOUCHPAD_ACCEL_DEFAULTS.maxGain)}
                hint={t('touchpadAccel.maxGainHint')}
                disabled={applyDisabled}
              />
            </div>
          }
        />
        {!active && <p className="field-description">{t('touchpadAccel.inactiveNote')}</p>}
        <div className="editor-tools"><span>Sensitivity</span><span>· Normalized output velocity</span></div>
        <div className={graphStyles.graphPanel}>
          <SensitivityGraph
            minThreshold={previewShape.minThreshold}
            maxThreshold={previewShape.maxThreshold}
            minSensX={minGain}
            minSensY={minGain}
            maxSensX={maxGain}
            maxSensY={maxGain}
            curveType={normalizeAccelCurveType(previewShape.curve)}
            naturalVHalf={previewShape.naturalVHalf}
            powerVRef={previewShape.powerVRef}
            powerExponent={previewShape.powerExponent}
            sigmoidMid={previewShape.sigmoidMid}
            sigmoidWidth={previewShape.sigmoidWidth}
            jumpTau={previewShape.jumpTau}
            omega={liveSpeed ?? 0}
            xAxisLabel={t('touchpadAccel.axisSpeed')}
            yAxisLabel="Sensitivity (×)"
          />
        </div>
        <p>Finger Speed: <strong>{(liveSpeed ?? 0).toFixed(2)} px/s</strong></p>
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
