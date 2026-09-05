import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerButtonOrder, controllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from './glyphs/InputGlyph'
import styles from './BindingLabelLegend.module.css'

type BindingLabelLegendProps = {
  labels: Record<string, string>
  device?: TelemetryDevice
  /** Highlights the matching control on the diagram while a row is hovered. */
  onHoverCommand?: (command: string | null) => void
}

// The named actions in this configuration, beside the live diagram: the input's
// glyph on the left, your name for it on the right, the way Steam Input lists a
// config's actions. Hovering a row lights up the control it belongs to.
export function BindingLabelLegend({ labels, device, onHoverCommand }: BindingLabelLegendProps) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(device?.type)

  const rows = useMemo(() => {
    const order = new Map(controllerButtonOrder().map((button, index) => [button.command.toUpperCase(), index]))
    return Object.entries(labels)
      .map(([command, label]) => ({ command, label }))
      .sort((left, right) => (order.get(left.command) ?? 999) - (order.get(right.command) ?? 999))
  }, [labels])

  if (rows.length === 0) return null

  return (
    <div className={styles.legend}>
      <div className={styles.title}>{t('overview.labelledActions')}</div>
      <ul className={styles.list}>
        {rows.map(row => (
          <li
            key={row.command}
            className={styles.row}
            onMouseEnter={() => onHoverCommand?.(row.command)}
            onMouseLeave={() => onHoverCommand?.(null)}
          >
            <span className={styles.glyph}>
              <InputGlyph command={row.command} family={family} size={16} />
            </span>
            <span className={styles.label}>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
