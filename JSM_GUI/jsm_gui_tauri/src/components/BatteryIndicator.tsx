import { useTranslation } from 'react-i18next'
import { BatteryIcon } from './NavIcons'
import styles from './BatteryIndicator.module.css'

type BatteryIndicatorProps = {
  percent?: number
  state?: number
}

// SDL_PowerState: -1 error, 0 unknown, 1 on battery, 2 no battery (wired),
// 3 charging, 4 charged. Mirrored as raw ints across the wire (C++ ->
// UDP JSON -> Tauri, untyped the whole way) rather than a shared enum, so the
// meaning has to be spelled out here instead of referenced from a type.
const STATE_UNKNOWN = 0
const STATE_NO_BATTERY = 2
const STATE_CHARGING = 3
const STATE_CHARGED = 4

export function BatteryIndicator({ percent, state }: BatteryIndicatorProps) {
  const { t } = useTranslation()

  // No battery to report (wired-only device) or the driver simply doesn't
  // know -- showing "0%" here would read as "dead", which is misleading for
  // both those cases, so show nothing rather than guess.
  if (percent === undefined || percent < 0 || state === undefined || state <= STATE_UNKNOWN || state === STATE_NO_BATTERY) {
    return null
  }

  const charging = state === STATE_CHARGING
  const label = charging
    ? t('controllerStatus.batteryCharging', { percent })
    : state === STATE_CHARGED
      ? t('controllerStatus.batteryCharged')
      : t('controllerStatus.batteryPercent', { percent })

  return (
    <span className={styles.battery} title={label}>
      <BatteryIcon fillFraction={percent / 100} charging={charging} />
      {label}
    </span>
  )
}
