import { forwardRef, type ReactNode } from 'react'
import { useGameArt, monogram, nameHue } from './gameArt'
import { AppIconImage } from '../AppIconImage'
import { Icon } from '../icons/Icon'
import styles from './Library.module.css'

// One cover on the Library shelf (console v2: Library): Steam's capsule art for
// the game when there is any (found by app id, or by the folder the associated
// executable sits in), otherwise a flat generated cover -- the name's initials
// on a hue of its own, the game's icon in the corner. Never a glow or a
// gradient (STYLE-FLAT.md).

type Props = {
  name: string
  sub?: ReactNode
  live?: 'live' | 'older' | null
  steamAppId?: string | null
  exePath?: string | null
  /** The fallback configuration: a desktop instead of art. */
  desktop?: boolean
  compact?: boolean
  current?: boolean
  hints?: string
  caption?: string
  onClick: () => void
  onFocus?: () => void
  onDoubleClick?: () => void
  data?: Record<`data-${string}`, string | undefined>
}

export const LibraryCover = forwardRef<HTMLButtonElement, Props>(function LibraryCover(
  { name, sub, live, steamAppId, exePath, desktop, compact, current, hints, caption, onClick, onFocus, onDoubleClick, data }, ref) {
  const art = useGameArt({ steamAppId, exePath }, compact ? ['header', 'capsule'] : ['capsule', 'header'])
  const hue = nameHue(name)
  return (
    <button ref={ref} type="button" className={styles.cover} data-art={art.url ? 'true' : undefined} aria-current={current ? 'true' : undefined}
      aria-label={[name, live === 'live' ? 'Live' : live === 'older' ? 'Live, older version' : null, typeof sub === 'string' ? sub : null].filter(Boolean).join(' · ')}
      data-hints={hints} data-caption={caption} onClick={onClick} onFocus={onFocus} onDoubleClick={onDoubleClick} {...data}
      style={art.url ? undefined : { background: desktop ? undefined : `hsl(${hue} 28% 20%)` }}>
      {art.url
        ? <img className={styles.coverArt} src={art.url} alt="" draggable={false} />
        : (
          <span className={styles.generated} aria-hidden="true">
            {desktop
              ? <Icon name="overview" size={compact ? 26 : 34} />
              : <span className={styles.monogram} style={{ color: `hsl(${hue} 55% 68%)` }}>{monogram(name)}</span>}
            {exePath && !desktop && <span className={styles.coverIcon}><AppIconImage exePath={exePath} size={compact ? 22 : 30} fallback={null} /></span>}
          </span>
        )}
      <span className={styles.coverText}>
        {live === 'live' && <span className={styles.livePill}>Live</span>}
        {live === 'older' && <span className={styles.olderPill}>Live · older</span>}
        <span className={styles.coverName}>{name}</span>
        {sub && <span className={styles.coverSub}>{sub}</span>}
      </span>
    </button>
  )
})
