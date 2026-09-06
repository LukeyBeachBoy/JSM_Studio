import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { BatteryIndicator } from './BatteryIndicator'
import { BindingLabelLegend } from './BindingLabelLegend'
import { Card } from './Card'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, PADDLE_BUTTONS, MINI_BUTTONS, MISC_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, TOUCH_BUTTONS } from '../keymap/schema'
import { controllerSupportsInput } from '../utils/controllerStatus'
import { getButtonBindingRows, getKeymapValue } from '../utils/keymap'
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
  onSelectCommand?: (command: string) => void
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

export function OverviewPage({ devices, onNavigate, configText, onSelectCommand }: OverviewPageProps) {
  const { t } = useTranslation()
  const device = devices?.[0]
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null)

  const labels = useMemo(() => {
    const text = configText ?? ''
    const names = parseBindingLabels(text)
    const result: Record<string, string> = {}
    for (const button of [...FACE_BUTTONS, ...DPAD_BUTTONS, ...BUMPER_BUTTONS, ...TRIGGER_BUTTONS, ...CENTER_BUTTONS, ...PADDLE_BUTTONS, ...MINI_BUTTONS, ...MISC_BUTTONS, ...LEFT_STICK_BUTTONS, ...RIGHT_STICK_BUTTONS, ...TOUCH_BUTTONS]) {
      const rows = getButtonBindingRows(text, button.command)
      const outputs = rows.filter(row => row.binding).map(row => row.binding)
      if (outputs.length || controllerSupportsInput(device, button.command)) result[button.command] = [names[button.command], outputs.join(' / ') || 'Unbound'].filter(Boolean).join(' · ')
    }
    const gridInputs = new Set(Array.from(text.matchAll(/^\s*(?:[^=\n]+[, +])?([LR]?T\d+)\s*=/gm), match => match[1]))
    for (const command of gridInputs) {
      const outputs = getButtonBindingRows(text, command).filter(row => row.binding).map(row => row.binding)
      result[command] = [names[command], outputs.join(' / ') || 'Unbound'].filter(Boolean).join(' · ')
    }
    for (const [command, key] of [['L3', 'LEFT_STICK_MODE'], ['R3', 'RIGHT_STICK_MODE'], ['LEFT_PAD', 'LEFT_TOUCHPAD_MODE'], ['RIGHT_PAD', 'RIGHT_TOUCHPAD_MODE']] as const) {
      if (command.endsWith('PAD') && device && ![4, 5, 24].includes(device.type)) continue
      const mode = getKeymapValue(text, key) || (command.endsWith('PAD') ? getKeymapValue(text, 'TOUCHPAD_MODE') : '')
      if (mode) result[command] = `${mode.replace(/_/g, ' ')}${result[command] && result[command] !== 'Unbound' ? ` / ${result[command]}` : ''}`
    }
    return result
  }, [configText, device])
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
                bindingLabels={labels}
                selectedCommand={hoveredCommand}
                onSelectCommand={onSelectCommand}
              />
            </div>
            <BindingLabelLegend labels={labels} device={device} onHoverCommand={setHoveredCommand} onSelectCommand={onSelectCommand} />
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
