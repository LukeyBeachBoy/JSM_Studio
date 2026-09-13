import type { CSSProperties } from 'react'
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
}
export function MenuDrawing({ menu, icons, onRegionRef, onDotRef, onSelect, selectedCommand }: Props) {
 return (
        <div
          className={`${styles.pad} ${menu.shape === 'FOUR_WAY' ? styles.wedges : ''} ${menu.shape === 'RADIAL' ? styles.radial : ''}`}
          // One variable so labels and keys scale together; the window is
          // already sized to the pad's aspect, so the pad just fills it.
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
            ...(menu.shape === 'FOUR_WAY' || menu.shape === 'RADIAL'
              ? {}
              : {
                  gridTemplateColumns: `repeat(${menu.columns}, 1fr)`,
                  gridTemplateRows: `repeat(${Math.max(1, Math.ceil(menu.regions.length / Math.max(1, menu.columns)))}, 1fr)`,
                }),
            '--overlay-font': `${menu.placement.fontSize}px`,
          } as CSSProperties}
        >
          {menu.regions.map((region, index) => {
            const wedge = menu.shape === 'FOUR_WAY' ? WEDGES[index] : null
            const radial = menu.shape === 'RADIAL'
            const segments = menu.regions.length
            // With labels hidden the key takes the headline rather than leaving
            // the region blank, and vice versa -- turning one off should never
            // produce an unreadable menu.
            const art = region.icon ? icons[region.icon] : undefined
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
                  <span className={styles.label}>{region.label || region.binding || '—'}</span>
                )}
                {menu.placement.showKeys && region.binding && (
                  <span className={menu.placement.showLabels && region.label ? styles.binding : styles.label}>
                    {region.binding}
                  </span>
                )}
              </>
            )
            return (
              <div
                key={region.command}
                ref={el => onRegionRef?.(index, el)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={onSelect ? `${region.command}: ${region.label || region.binding || 'Unbound'}` : undefined}
                onClick={() => onSelect?.(region.command)}
                onKeyDown={event => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(region.command) } }}
                className={`${styles.region} ${wedge ? styles.wedge : ''} ${radial ? styles.segment : ''}`}
                style={
                  wedge
                    ? { clipPath: wedge.clip }
                    : radial
                      ? { clipPath: radialSegmentClip(index, segments, menu.deadzone) }
                      : undefined
                }
                data-selected={selectedCommand === region.command ? "true" : "false"}
                data-bound={region.label || region.binding ? 'true' : 'false'}
              >
                {/* A segment's clip covers the whole box, so its text has to be
                    placed inside its own slice rather than centred in the box --
                    otherwise every label stacks in the middle of the wheel. */}
                {radial ? (
                  <span
                    className={styles.segmentLabel}
                    style={radialLabelPosition(index, segments, menu.deadzone)}
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
                  <span className={styles.wedgeContent}>{content}</span>
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
          {menu.shape === 'RADIAL' && (
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
          {onDotRef && <div className={styles.dot} ref={onDotRef} />}
          {menu.requiresClick && <div className={styles.hint}>click to confirm</div>}
        </div>
 )
}
