import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { BatteryIndicator } from './BatteryIndicator'
import { BindingLabelLegend } from './BindingLabelLegend'
import { Card } from './Card'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { parseBindingLabels } from '../utils/bindingLabels'
import {
  ButtonsIcon,
  DPadIcon,
  GyroIcon,
  JoystickIcon,
  TrackpadIcon,
  TriggersIcon,
} from './NavIcons'
import statusStyles from './ControllerStatusPage.module.css'
import styles from './OverviewPage.module.css'

export type OverviewNavTarget = 'buttons' | 'dpad' | 'triggers' | 'joysticks' | 'touchpad' | 'gyro'

type OverviewPageProps = {
  devices?: TelemetryDevice[]
  onNavigate: (target: OverviewNavTarget) => void
  /** The active configuration, for the bound-input marks and action names. */
  configText?: string
}

// Replaces the per-page Visual/List toggle that used to live on every Controls
// page: the whole-controller diagram now lives here, once, and each
// individual page (Buttons, D-Pad, ...) is always the minimal list view.
// Matches Steam Input's own split between one visual Overview and plain
// per-category config pages.
const CATEGORIES: { target: OverviewNavTarget; icon: JSX.Element; titleKey: string; descKey: string }[] = [
  { target: 'buttons', icon: <ButtonsIcon />, titleKey: 'app.nav.buttons', descKey: 'overview.buttonsDesc' },
  { target: 'dpad', icon: <DPadIcon />, titleKey: 'app.nav.dpad', descKey: 'overview.dpadDesc' },
  { target: 'triggers', icon: <TriggersIcon />, titleKey: 'app.nav.triggers', descKey: 'overview.triggersDesc' },
  { target: 'joysticks', icon: <JoystickIcon />, titleKey: 'app.nav.joysticks', descKey: 'overview.joysticksDesc' },
  { target: 'touchpad', icon: <TrackpadIcon />, titleKey: 'app.nav.trackpads', descKey: 'overview.trackpadsDesc' },
  { target: 'gyro', icon: <GyroIcon />, titleKey: 'app.nav.gyro', descKey: 'overview.gyroDesc' },
]

export function OverviewPage({ devices, onNavigate, configText }: OverviewPageProps) {
  const { t } = useTranslation()
  const device = devices?.[0]
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null)

  const labels = useMemo(() => parseBindingLabels(configText ?? ''), [configText])
  const boundCommands = useMemo(() => {
    const bound = new Set<string>()
    ;(configText ?? '').split(/\r?\n/).forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const match = /^([A-Z0-9_+*,]+)\s*=/i.exec(trimmed)
      if (!match) return
      // A chorded or simultaneous line names more than one input; all of them
      // count as bound so the diagram marks each.
      match[1].split(/[,+*]/).forEach(part => {
        const key = part.trim().toUpperCase()
        if (key) bound.add(key)
      })
    })
    return bound
  }, [configText])

  return (
    <div className={styles.page}>
      <Card className={`${statusStyles.pageCard} ${statusStyles.visualPanel}`}>
        <div className={statusStyles.visualPanelHeader}>
          <div className={statusStyles.panelTitle}>{t('overview.diagramTitle')}</div>
          {device && <BatteryIndicator percent={device.batteryPercent} state={device.batteryState} />}
        </div>
        {device ? (
          <div className={styles.diagramRow}>
            <div className={styles.diagram}>
              <ControllerStatusSvg
                device={device}
                boundCommands={boundCommands}
                selectedCommand={hoveredCommand}
              />
            </div>
            <BindingLabelLegend labels={labels} device={device} onHoverCommand={setHoveredCommand} />
          </div>
        ) : (
          <p className={styles.noDevice}>{t('overview.noDevice')}</p>
        )}
      </Card>

      <div className={styles.grid}>
        {CATEGORIES.map(category => (
          <button
            key={category.target}
            type="button"
            className={styles.categoryCard}
            onClick={() => onNavigate(category.target)}
          >
            <span className={styles.categoryIcon}>{category.icon}</span>
            <span className={styles.categoryTitle}>{t(category.titleKey)}</span>
            <span className={styles.categoryDesc}>{t(category.descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
