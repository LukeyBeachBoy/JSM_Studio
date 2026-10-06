import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { describeBinding, explainBinding } from '../utils/bindingDescription'
import { radialDividerStyle, radialHubStyle, radialLabelPosition, radialSegmentClip, type OverlayMenu } from '../utils/overlayLayout'
import type { IconData } from '../utils/iconLibrary'
import styles from './Overlay.module.css'
const WEDGES = [
  { clip: 'polygon(0% 0%, 100% 0%, 50% 50%)', name: 'Up' },
  { clip: 'polygon(100% 0%, 100% 100%, 50% 50%)', name: 'Right' },
  { clip: 'polygon(0% 100%, 100% 100%, 50% 50%)', name: 'Down' },
  { clip: 'polygon(0% 0%, 0% 100%, 50% 50%)', name: 'Left' },
]
type Props = {
  menu: OverlayMenu
  icons: Record<string, IconData>
  onRegionRef?: (index: number, element: HTMLDivElement | null) => void
  onDotRef?: (element: HTMLDivElement | null) => void
  onSelect?: (command: string) => void
  selectedCommand?: string | null
  managedFocus?: boolean
}
export function MenuDrawing({ menu, icons, onRegionRef, onDotRef, onSelect, selectedCommand, managedFocus }: Props) {
 const { t } = useTranslation()
 return (
        <div
          className={`${styles.pad} ${menu.displayAspect && menu.displayAspect > 1 ? styles.hotbar : ''} ${menu.shape === 'FOUR_WAY' ? styles.wedges : ''} ${menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY' ? styles.radial : ''}`}
          // Separate variables let menu names and output bindings scale
          // independently; the window is already sized to the pad's aspect.
          style={{
            // Rows MUST be explicit equal fractions. Left to `auto` they size to
            // content, so one region with an icon grew taller and pushed the
            // boundary down into the next row -- while the hit test still split
            // the pad evenly. The overlay then showed a touch inside one action
            // while the pad fired the one below it.
            // A wheel and a four-way pad both stack every region in ONE cell and
            // let clip-path cut them apart, so neither may be given column and
            // row tracks: four tracks made each segment a quarter-width sliver
            // and clipped the wheel out of a box that was not the wheel.
            ...(menu.shape === 'FOUR_WAY' || menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY'
              ? {}
              : {
                  gridTemplateColumns: `repeat(${menu.columns}, 1fr)`,
                  gridTemplateRows: `repeat(${Math.max(1, Math.ceil(menu.regions.length / Math.max(1, menu.columns)))}, 1fr)`,
                }),
            '--overlay-font': `${menu.placement.fontSize}px`,
            '--overlay-label-font': `${menu.placement.labelFontSize ?? menu.placement.fontSize}px`,
            '--overlay-output-font': `${menu.placement.outputFontSize ?? menu.placement.fontSize}px`,
          } as CSSProperties}
        >
          {[...menu.regions, ...(menu.centerRegion ? [menu.centerRegion] : [])].map((region, index) => {
            const center = index === menu.regions.length
            const wedge = menu.shape === 'FOUR_WAY' ? WEDGES[index] : null
            const radial = !center && (menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY')
            const segments = menu.regions.length
            // With labels hidden the key takes the headline rather than leaving
            // the region blank, and vice versa -- turning one off should never
            // produce an unreadable menu.
            const art = region.icon && menu.placement.showIcons !== false ? icons[region.icon] : undefined
            const outputLabel = describeBinding(region.binding, t)
            const content = (
              <>
                {art && (
                  // Inline SVG: the data is already in memory, so there is no
                  // request and nothing to fail at the moment of a touch.
                  <svg
                    className={styles.icon}
                    viewBox={`0 0 ${art.width} ${art.height}`}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: art.body }}
                  />
                )}
                {menu.placement.showLabels && (region.label || !menu.placement.showKeys) && (
                  <span className={styles.label}>{region.label || outputLabel || '—'}</span>
                )}
                {menu.placement.showKeys && region.binding && (
                  <span className={styles.binding}>
                    {outputLabel}
                  </span>
                )}
              </>
            )
            return (
              <div
                key={region.command}
                ref={el => onRegionRef?.(index, el)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? managedFocus ? -1 : 0 : undefined}
                data-nav-skip={managedFocus ? '' : undefined}
                aria-label={onSelect ? `${region.command}: ${region.label || region.binding || 'Unbound'}` : undefined}
                onClick={() => onSelect?.(region.command)}
                onKeyDown={event => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(region.command) } }}
                className={`${styles.region} ${wedge ? styles.wedge : ''} ${radial ? styles.segment : ''} ${center ? styles.center : ''}`}
                style={
                  center
                    ? { width: `${menu.deadzone * 100}%`, height: `${menu.deadzone * 100}%` }
                    : wedge
                    ? { clipPath: wedge.clip }
                    : radial
                      ? { clipPath: radialSegmentClip(index, segments, menu.deadzone) }
                      : undefined
                }
                title={region.binding ? explainBinding(region.binding, t) : undefined}
                data-selected={selectedCommand === region.command ? "true" : "false"}
                data-bound={region.label || region.binding ? 'true' : 'false'}
              >
                {/* A segment's clip covers the whole box, so its text has to be
                    placed inside its own slice rather than centred in the box --
                    otherwise every label stacks in the middle of the wheel. */}
                {radial ? (
                  // data-nav-box: every segment's box is the whole wheel, so the
                  // pad measures a segment by its label, which sits in its slice.
                  <span
                    className={styles.segmentLabel}
                    style={radialLabelPosition(index, segments, menu.deadzone)}
                    data-nav-box={onSelect ? '' : undefined}
                  >
                    {content}
                  </span>
                ) : wedge ? (
                  // The wedge pushes this block to its own side of the pad; the
                  // block centres its icon, label and key on each other. Two
                  // jobs, so two elements: done on one, the left and right
                  // wedges had to align their contents to an edge to get the
                  // block off centre, which also edge-aligned the icon and key
                  // against the label instead of stacking them centred the way
                  // up and down do.
                  <span className={styles.wedgeContent} data-nav-box={onSelect ? '' : undefined}>{content}</span>
                ) : (
                  content
                )}
              </div>
            )
          })}
          {/* Boundaries, on a layer of their own above the segments. Without them
              the wheel reads as one grey ring until something is selected --
              and see radialDividerStyle for why they cannot be borders on the
              segments themselves. */}
          {(menu.shape === 'RADIAL' || menu.shape === 'EIGHT_WAY') && (
            <div className={styles.spokes} aria-hidden="true">
              {menu.regions.map((region, index) => (
                <span
                  key={`spoke-${region.command}`}
                  className={styles.spoke}
                  style={radialDividerStyle(index, menu.regions.length, menu.deadzone)}
                />
              ))}
              <span className={styles.hub} style={radialHubStyle(menu.deadzone)} />
            </div>
          )}
          {/* Where your thumb is. Only the live overlay has a thumb to show,
              and it moves this imperatively through the ref -- so with no ref
              there is nobody to move it, and the editor preview was left with
              a permanent green blob parked in its top-left corner. */}
          {/* The two-step trail (Overlay.dc.html) follows the dot by CSS
              transition alone, so it costs the dot itself no latency. */}
          {onDotRef && <><div className={styles.trail} data-trail="2" aria-hidden="true" /><div className={styles.trail} data-trail="1" aria-hidden="true" /></>}
          {onDotRef && <div className={styles.dot} ref={onDotRef} />}
          {menu.requiresClick && <div className={styles.hint}>click to confirm</div>}
        </div>
 )
}
