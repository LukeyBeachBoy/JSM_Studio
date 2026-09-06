import { useTranslation } from 'react-i18next'
import { TelemetrySample } from '../hooks/useTelemetry'
import { SensitivityValues } from '../utils/keymap'
import graphStyles from './Graph.module.css'
import { SensitivityGraph } from './SensitivityGraph'
import { GYRO_ACCEL_DEFAULTS } from '../utils/accelCurve'

type CurvePreviewProps = {
  sensitivity: SensitivityValues
  sample: TelemetrySample | null
  hasPendingChanges: boolean
  telemetry: {
    omega: string
    sensX: string
    sensY: string
    timestamp: string
  }
}

// A configuration that names a curve without pinning its shape settings is
// still valid -- JoyShockMapper fills them in from its own defaults -- so the
// preview falls back to the same numbers instead of refusing to draw.
export function CurvePreview({ sensitivity, sample, hasPendingChanges, telemetry }: CurvePreviewProps) {
  const { t } = useTranslation()
  const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined)
  const curveType = (sensitivity.accelCurve ?? 'LINEAR').toUpperCase() as
    | 'LINEAR'
    | 'NATURAL'
    | 'POWER'
    | 'QUADRATIC'
    | 'SIGMOID'
    | 'JUMP'

  return (
    <div className={graphStyles.graphPanel}>
      <div className={graphStyles.graphLegend}>
        <span>
          <span className={`${graphStyles.legendDot} ${graphStyles.legendDotSensitivity}`} /> {t('curvePreview.sensitivity')}
        </span>
        <span>
          <span className={`${graphStyles.legendDot} ${graphStyles.legendDotVelocity}`} />{' '}
          {t('curvePreview.normalizedOutputVelocity')}
        </span>
      </div>
      <SensitivityGraph
        minThreshold={sensitivity.minThreshold ?? 0}
        maxThreshold={sensitivity.maxThreshold ?? 0}
        minSensX={sensitivity.minSensX}
        minSensY={sensitivity.minSensY}
        maxSensX={sensitivity.maxSensX}
        maxSensY={sensitivity.maxSensY}
        curveType={curveType}
        naturalVHalf={sensitivity.naturalVHalf ?? GYRO_ACCEL_DEFAULTS.naturalVHalf}
        powerVRef={sensitivity.powerVRef ?? GYRO_ACCEL_DEFAULTS.powerVRef}
        powerExponent={sensitivity.powerExponent ?? GYRO_ACCEL_DEFAULTS.powerExponent}
        sigmoidMid={sensitivity.sigmoidMid ?? GYRO_ACCEL_DEFAULTS.sigmoidMid}
        sigmoidWidth={sensitivity.sigmoidWidth ?? GYRO_ACCEL_DEFAULTS.sigmoidWidth}
        jumpTau={sensitivity.jumpTau ?? GYRO_ACCEL_DEFAULTS.jumpTau}
        normalized={asNumber(sample?.t)}
        currentSensX={asNumber(sample?.sensX)}
        omega={asNumber(sample?.omega)}
        disableLiveDot={hasPendingChanges}
      />
      <div className={graphStyles.graphLiveReadout}>
        <span>
          {t('curvePreview.gyroSpeed')}: <strong>{telemetry.omega} deg/s</strong>
        </span>
        <span>
          {t('curvePreview.activeSensitivity')}: <strong>{telemetry.sensX}/{telemetry.sensY}</strong>
        </span>
      </div>
    </div>
  )
}
