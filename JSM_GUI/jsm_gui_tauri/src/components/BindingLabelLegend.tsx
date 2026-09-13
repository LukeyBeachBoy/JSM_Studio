import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerButtonLabel, controllerButtonOrder, controllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from './glyphs/InputGlyph'
import styles from './BindingLabelLegend.module.css'

type BindingLabelLegendProps = {
  labels: Record<string, string>
  onSelectCommand?: (command: string) => void
  device?: TelemetryDevice
  /** Highlights the matching control on the diagram while a row is hovered. */
  onHoverCommand?: (command: string | null) => void
}

// The named actions in this configuration, beside the live diagram: the input's
// glyph on the left, your name for it on the right, the way Steam Input lists a
// config's actions. Hovering a row lights up the control it belongs to.
export function BindingLabelLegend({ labels, device, onHoverCommand, onSelectCommand }: BindingLabelLegendProps) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(device?.type)

  const rows = useMemo(() => {
    const definitions = controllerButtonOrder()
    const order = new Map(definitions.map((button, index) => [button.command.toUpperCase(), index]))
    const byCommand = new Map(definitions.map(button => [button.command.toUpperCase(), button]))
    return Object.entries(labels)
      .map(([command, label]) => {
        const definition = byCommand.get(command)
        return { command, label, name: definition ? controllerButtonLabel(definition, family) : command }
      })
      .sort((left, right) => Number(left.label === 'Unbound') - Number(right.label === 'Unbound') || (order.get(left.command) ?? 999) - (order.get(right.command) ?? 999))
  }, [family, labels])

  if (rows.length === 0) return null

  return (
    <div className={styles.legend}>
      <div className={styles.title}>{t('overview.actualBindings')}</div>
      <ul className={styles.list}>
        {rows.map(row => (
          <li
            key={row.command}
            className={styles.row}
            role={onSelectCommand ? 'button' : undefined}
            tabIndex={onSelectCommand ? 0 : undefined}
            onClick={() => onSelectCommand?.(row.command)}
            onFocus={() => onHoverCommand?.(row.command)}
            onBlur={() => onHoverCommand?.(null)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCommand?.(row.command) } }}
            onMouseEnter={() => onHoverCommand?.(row.command)}
            onMouseLeave={() => onHoverCommand?.(null)}
          >
            <span className={styles.glyph}>
              <InputGlyph command={row.command} family={family} size={16} />
            </span>
            <span className={styles.command}>{row.name}</span>
            <span className={styles.label} title={row.label}>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
