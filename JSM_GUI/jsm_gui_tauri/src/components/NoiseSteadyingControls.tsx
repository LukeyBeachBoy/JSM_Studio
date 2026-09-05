import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import { Card } from './Card'
import { SectionActions } from './SectionActions'
import { TelemetryBanner } from './TelemetryBanner'
import { NumberField } from './NumberField'
import telemetryStyles from './Telemetry.module.css'

type NoiseSteadyingControlsProps = {
  sensitivity: SensitivityValues
  isCalibrating: boolean
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  lockMessage?: string
  onCutoffSpeedChange: (value: string) => void
  onCutoffRecoveryChange: (value: string) => void
  onSmoothTimeChange: (value: string) => void
  onSmoothThresholdChange: (value: string) => void
  onSmoothingDecayChange: (value: string) => void
  onOneEuroFilterChange: (value: string) => void
  onOneEuroMinCutoffChange: (value: string) => void
  onOneEuroSpeedCoeffChange: (value: string) => void
  onAngleSnapChange: (value: string) => void
  onAngleSnapSmoothChange: (value: string) => void
  onDecelBrakeStrengthChange: (value: string) => void
  onDecelBrakeThresholdChange: (value: string) => void
  telemetry: {
    omega: string
    timestamp: string
    sampleHz?: string
  }
}

export function NoiseSteadyingControls({
  sensitivity,
  isCalibrating,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  lockMessage,
  onCutoffSpeedChange,
  onCutoffRecoveryChange,
  onSmoothTimeChange,
  onSmoothThresholdChange,
  onSmoothingDecayChange,
  onOneEuroFilterChange,
  onOneEuroMinCutoffChange,
  onOneEuroSpeedCoeffChange,
  onAngleSnapChange,
  onAngleSnapSmoothChange,
  onDecelBrakeStrengthChange,
  onDecelBrakeThresholdChange,
  telemetry,
}: NoiseSteadyingControlsProps) {
  const { t } = useTranslation()

  return (
    <Card className="control-panel" lockable locked={isCalibrating} lockMessage={lockMessage ?? t('messages.lockMessage')}>
      <div className="section-header">
        <h2 className="section-title">{t('noise.title')}</h2>
        <p className="section-caption compact">{t('noise.caption')}</p>
      </div>
      <div className={telemetryStyles.telemetryInline}>
        <TelemetryBanner {...telemetry} />
      </div>
      <div className="flex-inputs">
        <NumberField label={t('noise.deadzone')} value={sensitivity.cutoffSpeed} onChange={onCutoffSpeedChange} min={0} max={5} step={0.01} unit="°/s" />
        <NumberField label={t('noise.steadying')} value={sensitivity.cutoffRecovery} onChange={onCutoffRecoveryChange} min={0} max={5} step={0.01} unit="°/s" />
      </div>
      <div className="flex-inputs">
        <NumberField label={t('noise.smoothTime')} value={sensitivity.smoothTime} onChange={onSmoothTimeChange} min={0} max={0.03} step={0.001} unit="s" />
        <NumberField label={t('noise.smoothThreshold')} value={sensitivity.smoothThreshold} onChange={onSmoothThresholdChange} min={0} max={50} step={1} unit="°/s" />
      </div>
      <div className="flex-inputs">
        <label>
          {t('noise.smoothingDecay')}
          <select value={sensitivity.smoothingDecay ?? 'OFF'} onChange={(e) => onSmoothingDecayChange(e.target.value)}>
            <option value="OFF">{t('common.off')}</option>
            <option value="ON">{t('common.on')}</option>
          </select>
        </label>
        <label>
          {t('noise.oneEuroFilter')}
          <select value={sensitivity.oneEuroFilter ? 'ON' : 'OFF'} onChange={(e) => onOneEuroFilterChange(e.target.value)}>
            <option value="OFF">{t('common.off')}</option>
            <option value="ON">{t('common.on')}</option>
          </select>
        </label>
      </div>
      {sensitivity.oneEuroFilter && (
        <div className="flex-inputs">
          <NumberField label={t('noise.oneEuroMinCutoff')} value={sensitivity.oneEuroMinCutoff} onChange={onOneEuroMinCutoffChange} min={0} max={20} step={0.1} defaultValue={6} unit="Hz" />
          <NumberField label={t('noise.oneEuroSpeedCoeff')} value={sensitivity.oneEuroSpeedCoeff} onChange={onOneEuroSpeedCoeffChange} min={0} max={2} step={0.01} defaultValue={0.3} />
        </div>
      )}
      <div className="flex-inputs">
        <NumberField label={t('noise.angleSnapping')} value={sensitivity.angleSnap} onChange={onAngleSnapChange} min={0} max={45} step={0.1} unit="°" />
        <label>
          {t('noise.easeAngleSnapping')}
          <select className="app-select" value={sensitivity.angleSnapEase ?? 'OFF'} onChange={(e) => onAngleSnapSmoothChange(e.target.value)}>
            <option value="OFF">{t('common.off')}</option>
            <option value="ON">{t('common.on')}</option>
          </select>
        </label>
      </div>
      <div className="flex-inputs">
        <NumberField label={t('noise.decelBrakeStrength')} value={sensitivity.decelBrakeStrength} onChange={onDecelBrakeStrengthChange} min={0} max={1} step={0.01} />
        <NumberField label={t('noise.decelBrakeThreshold')} value={sensitivity.decelBrakeThreshold} onChange={onDecelBrakeThresholdChange} min={1} max={60} step={0.5} defaultValue={25} unit="°/s" />
      </div>
      <SectionActions
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={onApply}
        onCancel={onCancel}
        applyDisabled={isCalibrating}
        className="control-actions"
      />
    </Card>
  )
}
