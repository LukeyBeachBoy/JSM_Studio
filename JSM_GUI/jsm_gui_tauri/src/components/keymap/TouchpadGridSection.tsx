import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getButtonDescription, type ButtonDefinition } from '../../keymap/schema'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'

// Where a finger is on the pad right now, in the pad's own -1..1 space.
export type LivePadTouch = { x: number; y: number; touched: boolean }

type TouchpadGridSectionProps = {
  gridColumns: number
  gridCells: number
  livePad?: LivePadTouch | null
  renderButton: (button: ButtonDefinition) => ReactNode
  touchpadButtons: ButtonDefinition[]
  selectedButton: ButtonDefinition | null
  selectedCommand: string | null
  onSelectButton: (command: string) => void
  isButtonBound?: (command: string) => boolean
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export function TouchpadGridSection({
  gridColumns,
  gridCells,
  livePad,
  renderButton,
  touchpadButtons,
  selectedButton,
  selectedCommand,
  onSelectButton,
  isButtonBound,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled,
}: TouchpadGridSectionProps) {
  const { t } = useTranslation()
  const selectedCommandUpper = selectedCommand?.toUpperCase() ?? ''
  const gridRows = Math.max(1, Math.ceil(gridCells / Math.max(1, gridColumns)))

  // Pad coordinates are -1..1 with +y downward, the same convention the live
  // preview uses. Clamped because a finger right on the rim can read slightly
  // outside, and a cell index off the end would light up nothing.
  const clamp01 = (v: number) => Math.min(0.999, Math.max(0, (v + 1) / 2))
  const liveCellIndex = (() => {
    if (!livePad?.touched) return -1
    const col = Math.floor(clamp01(livePad.x) * gridColumns)
    const row = Math.floor(clamp01(livePad.y) * gridRows)
    const index = row * gridColumns + col
    return index < gridCells ? index : -1
  })()

  return (
    <>
      <KeymapSection title={t('keymap.touchpadGridTitle')} description={t('keymap.touchpadGridDescription')}>
        <p className={styles.touchpadHint}>
          {t(
            'keymap.touchpadGridExplainer',
            'Grid and stick splits the pad into regions you can bind separately, and treats the pad as a stick at the same time. Touching a region presses whatever is bound to it, so it works like a set of buttons drawn on the pad, while sliding your thumb still drives the touch stick. Set the rows and columns above, click a region to bind it, and touch the pad to see where your finger lands.'
          )}
        </p>
        <div className={styles.touchpadGridPreviewWrap}>
        <div className={styles.touchpadGridPreview} style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}>
          {Array.from({ length: gridCells }).map((_, index) => {
            const rowIndex = Math.floor(index / gridColumns)
            const colIndex = index % gridColumns
            const button = touchpadButtons[index]
            const command = button?.command ?? `T${index + 1}`
            const commandUpper = command.toUpperCase()
            const isSelected = commandUpper === selectedCommandUpper
            const isBound = isButtonBound?.(commandUpper) ?? false
            const isLive = index === liveCellIndex
            return (
              <button
                type="button"
                className={`${styles.touchpadGridCell} ${isSelected ? styles.touchpadGridCellSelected : ''} ${isBound ? styles.touchpadGridCellBound : ''} ${isLive ? styles.touchpadGridCellLive : ''}`}
                key={`cell-${index}`}
                aria-pressed={isSelected}
                onClick={() => onSelectButton(command)}
              >
                <span>{command}</span>
                <small>{t('common.rowCol', { row: rowIndex + 1, col: colIndex + 1 })}</small>
              </button>
            )
          })}
        </div>
        {livePad?.touched && (
          <span
            className={styles.touchpadGridDot}
            style={{ left: `${clamp01(livePad.x) * 100}%`, top: `${clamp01(livePad.y) * 100}%` }}
            aria-hidden="true"
          />
        )}
        </div>
        {selectedButton && (
          <div className={styles.touchpadRegionEditor}>
            <div className={styles.touchpadRegionHeader}>
              <div>
                <span>{t('keymap.selectedTouchpadRegion')}</span>
                <strong>{selectedButton.command}</strong>
                <p>{getButtonDescription(selectedButton, t)}</p>
              </div>
              {isButtonBound?.(selectedButton.command) && (
                <span className={styles.touchpadRegionBound}>{t('keymap.bound')}</span>
              )}
            </div>
            {renderButton(selectedButton)}
          </div>
        )}
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
