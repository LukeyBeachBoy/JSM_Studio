import { MenuPreview } from './MenuPreview'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ButtonDefinition } from '../../keymap/schema'
import { KeymapSection } from '../KeymapSection'
import keymapStyles from '../Keymap.module.css'
import styles from './Touchpad.module.css'
import { SectionActions } from '../SectionActions'
import {
  hitTestRegion,
  radialDividerStyle,
  radialHubStyle,
  radialLabelPosition,
  radialSegmentClip,
  type OverlayMenu,
} from '../../utils/overlayLayout'
import { resolveIcons, type IconData } from '../../utils/iconLibrary'

// Where a finger is on the pad right now, in the pad's own -1..1 space.
export type LivePadTouch = { x: number; y: number; touched: boolean }

type TouchpadGridSectionProps = {
  // Which pad this grid belongs to, so a two-pad controller can say so.
  menu?: OverlayMenu
  side?: 'left' | 'right' | 'shared'
  gridColumns: number
  gridCells: number
  livePad?: LivePadTouch | null
  renderButton: (button: ButtonDefinition, options?: { defaultOpen?: boolean }) => ReactNode
  touchpadButtons: ButtonDefinition[]
  selectedButton: ButtonDefinition | null
  selectedCommand: string | null
  onSelectButton: (command: string) => void
  isButtonBound?: (command: string) => boolean
  // What each region does, so the diagram reads as a layout rather than as a
  // set of numbered boxes. label is the human name for the action, binding is
  // what JoyShockMapper was told, extra counts further slots (hold, double).
  describeRegion?: (command: string) => { label?: string; binding: string; extra: number; icon?: string }
  /** RECTANGLE (rows x columns) or FOUR_WAY (cardinal wedges about the centre). */
  shape?: string
  /** Fraction of the pad, centre to edge, that presses nothing in FOUR_WAY. */
  deadzone?: number
  /** Real pad width/height from the driver, so the preview is the pad's shape. */
  padAspect?: number
  /** Overrides the heading and explainer -- a stick wheel is not a touchpad. */
  heading?: string
  explainer?: string
  hasPendingChanges: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  applyDisabled?: boolean
}

export function TouchpadGridSection({
  menu,
  side = 'shared',
  gridColumns,
  gridCells,
  livePad,
  renderButton,
  touchpadButtons,
  selectedButton,
  selectedCommand,
  onSelectButton,
  isButtonBound,
  describeRegion,
  shape = 'RECTANGLE',
  deadzone = 0,
  padAspect = 1,
  heading,
  explainer,
  hasPendingChanges,
  statusMessage,
  onApply,
  onCancel,
  applyDisabled,
}: TouchpadGridSectionProps) {
  const { t } = useTranslation()
  const selectedCommandUpper = selectedCommand?.toUpperCase() ?? ''
  const fourWay = shape === 'FOUR_WAY'
  const radial = shape === 'RADIAL'
  const gridRows = Math.max(1, Math.ceil(gridCells / Math.max(1, gridColumns)))

  // Icon sets are megabytes and load lazily, so resolve whatever this grid
  // references once rather than on every render.
  const [icons, setIcons] = useState<Record<string, IconData>>({})
  const iconNames = Array.from({ length: fourWay ? 4 : gridCells })
    .map((_, index) => describeRegion?.((touchpadButtons[index]?.command ?? '').toUpperCase())?.icon)
    .filter((name): name is string => Boolean(name))
    .join(',')
  useEffect(() => {
    if (!iconNames) return
    let cancelled = false
    resolveIcons(iconNames.split(','))
      .then(next => { if (!cancelled) setIcons(previous => ({ ...previous, ...next })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [iconNames])

  // Pad coordinates are -1..1 with +y downward, the same convention the live
  // preview uses. Clamped because a finger right on the rim can read slightly
  // outside, and a cell index off the end would light up nothing.
  const clamp01 = (v: number) => Math.min(0.999, Math.max(0, (v + 1) / 2))
  // Deliberately the SAME hit test the overlay uses, which is itself checked
  // against the real backend in tests/overlay_layout_regression.cjs. The editor
  // and the overlay highlighting different regions for one thumb position would
  // be its own bug, and this preview used to reimplement the maths by hand.
  const liveCellIndex = (() => {
    if (!livePad?.touched) return -1
    const count = fourWay ? 4 : gridCells
    return hitTestRegion(
      {
        shape: radial ? 'RADIAL' : fourWay ? 'FOUR_WAY' : 'RECTANGLE',
        columns: gridColumns,
        rows: gridRows,
        deadzone,
        regions: Array.from({ length: count }, () => ({ command: '', label: '', binding: '' })),
      } as OverlayMenu,
      livePad.x,
      livePad.y
    )
  })()

  // Wedges are drawn as four triangles meeting at the centre. clip-path on a
  // square keeps them real buttons -- focusable, clickable, and styled by the
  // same selected/bound/live rules as a rectangular cell.
  const WEDGE = [
    { clip: 'polygon(0% 0%, 100% 0%, 50% 50%)', label: 'keymap.regionUp', fallback: 'Up' },
    { clip: 'polygon(100% 0%, 100% 100%, 50% 50%)', label: 'keymap.regionRight', fallback: 'Right' },
    { clip: 'polygon(0% 100%, 100% 100%, 50% 50%)', label: 'keymap.regionDown', fallback: 'Down' },
    { clip: 'polygon(0% 0%, 0% 100%, 50% 50%)', label: 'keymap.regionLeft', fallback: 'Left' },
  ]

  return (
    <>
      <KeymapSection
        title={
          heading
            ?? (side === 'shared'
              ? t('keymap.touchpadGridTitle')
              : t(side === 'left' ? 'keymap.touchpadGridTitleLeft' : 'keymap.touchpadGridTitleRight'))
        }
        description={t('keymap.touchpadGridDescription')}
      >
        <p className={styles.touchpadHint}>
          {explainer ?? (fourWay
            ? t(
                'keymap.touchpadGridExplainerFourWay',
                'The pad works as a direction pad and as a stick at the same time. Touching a wedge presses whatever is bound to it, while sliding your thumb still drives the touch stick. The wedges are divided on the diagonals, so anywhere in the top quarter presses up. Click a wedge to bind it, and touch the pad to see where your finger lands.'
              )
            : t(
                'keymap.touchpadGridExplainer',
                'Grid and stick splits the pad into regions you can bind separately, and treats the pad as a stick at the same time. Touching a region presses whatever is bound to it, so it works like a set of buttons drawn on the pad, while sliding your thumb still drives the touch stick. Set the rows and columns above, click a region to bind it, and touch the pad to see where your finger lands.'
              ))}
        </p>
        {menu ? <><button type="button" className="secondary-btn" onClick={() => window.dispatchEvent(new CustomEvent('jsm:menu-layout', { detail: `${menu.pad}${menu.layer ? ':' + menu.layer : ''}` }))}>Appearance &amp; Position</button>
          <MenuPreview menu={menu} aspect={padAspect} selectedCommand={selectedCommand} onSelect={onSelectButton} /></> : <>
        <div className={styles.touchpadGridPreviewWrap} style={{ ['--pad-aspect' as string]: String(padAspect) } as CSSProperties}>
        <div
          className={`${styles.touchpadGridPreview} ${fourWay ? styles.touchpadGridPreviewWedges : ''} ${radial ? styles.touchpadGridPreviewRadial : ''}`}
          // Explicit equal rows, for the same reason the overlay needs them: an
          // `auto` row grows to fit an icon and stops matching the hit test.
          style={
            fourWay || radial
              ? undefined
              : {
                  gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                  gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                }
          }
        >
          {Array.from({ length: fourWay ? 4 : gridCells }).map((_, index) => {
            const rowIndex = Math.floor(index / gridColumns)
            const colIndex = index % gridColumns
            const button = touchpadButtons[index]
            const command = button?.command ?? `T${index + 1}`
            const commandUpper = command.toUpperCase()
            const isSelected = commandUpper === selectedCommandUpper
            const isBound = isButtonBound?.(commandUpper) ?? false
            const isLive = index === liveCellIndex
            const region = describeRegion?.(commandUpper)
            // The label names the action and the binding says what was actually
            // assigned; when only one exists it takes the headline on its own.
            // The region id stays as a small caption -- it is how the config
            // file and the editor below refer to this cell, so losing it would
            // break the link between the diagram and everything else.
            const headline = region?.label || region?.binding || ''
            const detail = region?.label && region.binding ? region.binding : ''
            const wedge = fourWay ? WEDGE[index] : null
            // A wedge names its direction; a rectangle names its row and column.
            const where = wedge
              ? t(wedge.label, wedge.fallback)
              : t('common.rowCol', { row: rowIndex + 1, col: colIndex + 1 })
            const art = region?.icon ? icons[region.icon] : undefined
            const body = (
              <>
                <small className={styles.touchpadGridCellId}>{wedge ? `${command} · ${where}` : command}</small>
                {/* The same icon the overlay will draw, so the editor is a
                    preview of the overlay rather than a different picture. */}
                {art && (
                  <svg
                    className={styles.touchpadGridCellIcon}
                    viewBox={`0 0 ${art.width} ${art.height}`}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: art.body }}
                  />
                )}
                {headline ? (
                  <span className={styles.touchpadGridCellAction}>{headline}</span>
                ) : (
                  <span className={styles.touchpadGridCellEmpty}>{t('keymap.unbound', 'Unbound')}</span>
                )}
                {detail && <small className={styles.touchpadGridCellBinding}>{detail}</small>}
                {region && region.extra > 0 && (
                  <small className={styles.touchpadGridCellMore}>
                    {t('keymap.plusMoreBindings', '+{{count}} more', { count: region.extra })}
                  </small>
                )}
              </>
            )
            return (
              <button
                type="button"
                className={`${styles.touchpadGridCell} ${wedge ? styles.touchpadGridCellWedge : ''} ${radial ? styles.touchpadGridCellSegment : ''} ${isSelected ? styles.touchpadGridCellSelected : ''} ${isBound ? styles.touchpadGridCellBound : ''} ${isLive ? styles.touchpadGridCellLive : ''}`}
                key={`cell-${index}`}
                aria-pressed={isSelected}
                onClick={() => onSelectButton(command)}
                title={where}
                style={
                  wedge
                    ? { clipPath: wedge.clip }
                    : radial
                      ? { clipPath: radialSegmentClip(index, gridCells, deadzone) }
                      : undefined
                }
              >
                {/* A segment's clip covers the whole box, so its text has to sit
                    inside its own slice or every label stacks in the middle. */}
                {radial ? (
                  <span
                    className={styles.touchpadGridCellSegmentLabel}
                    style={radialLabelPosition(index, gridCells, deadzone)}
                  >
                    {body}
                  </span>
                ) : (
                  body
                )}
              </button>
            )
          })}
          {/* The same boundary layer the overlay draws, from the same geometry,
              so the editor shows the wheel the player will actually see. */}
          {radial && (
            <div className={styles.touchpadGridSpokes} aria-hidden="true">
              {Array.from({ length: gridCells }).map((_, index) => (
                <span
                  key={`spoke-${index}`}
                  className={styles.touchpadGridSpoke}
                  style={radialDividerStyle(index, gridCells, deadzone)}
                />
              ))}
              <span className={styles.touchpadGridHub} style={radialHubStyle(deadzone)} />
            </div>
          )}
        </div>
        {livePad?.touched && (
          <span
            className={styles.touchpadGridDot}
            style={{ left: `${clamp01(livePad.x) * 100}%`, top: `${clamp01(livePad.y) * 100}%` }}
            aria-hidden="true"
          />
        )}
        </div>
        </>}
        {/* The selected region, on its own. It used to sit inside a panel
            whose header repeated the command, the row and column and the
            bound state -- all of which the card itself already shows -- so
            reaching the binding meant opening a section inside a section. */}
        {selectedButton && (
          <div className={styles.touchpadRegionEditor}>{renderButton(selectedButton, { defaultOpen: true })}</div>
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
