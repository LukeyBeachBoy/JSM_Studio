import { useTranslation } from 'react-i18next'
import styles from './Telemetry.module.css'

type TelemetryBannerProps = {
  omega: string
  timestamp: string
  sampleHz?: string
}

/** The live gyro readouts as stat tiles: speed, timestamp and, when known, sample rate. */
export function TelemetryBanner({ omega, timestamp, sampleHz }: TelemetryBannerProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.telemetryReadouts} role="group" aria-label={t('gyroPage.telemetry')}>
      <div className={styles.telemetryNode}>
        <span className={styles.telemetryLabel}>{t('gyroPage.gyroSpeed')}</span>
        <strong className={styles.telemetryValue}><span className={styles.telemetryDot} aria-hidden="true" />{omega} °/s</strong>
      </div>
      <div className={styles.telemetryNode}>
        <span className={styles.telemetryLabel}>{t('gyroPage.timestamp')}</span>
        <strong className={styles.telemetryValue}>{timestamp}</strong>
      </div>
      {sampleHz !== undefined && (
        <div className={styles.telemetryNode}>
          <span className={styles.telemetryLabel}>{t('gyroPage.sampleRate')}</span>
          <strong className={styles.telemetryValue}>{sampleHz} Hz</strong>
        </div>
      )}
    </div>
  )
}
