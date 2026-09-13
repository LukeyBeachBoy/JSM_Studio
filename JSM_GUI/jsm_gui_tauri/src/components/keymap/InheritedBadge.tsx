import styles from './InheritedBadge.module.css'
import { includeDisplayName } from '../../utils/configIncludes'

type Props = {
  /** Runtime-relative path of the file this value came from. */
  source: string
  /** Opens the raw config editor, where the import line itself lives. */
  onOpenConfigEditor?: () => void
}

/**
 * Marks a control whose value this profile inherits from a file it imports.
 *
 * The value shown is live and correct -- it is what the mapper will use -- but
 * it is not in this profile's own text, so someone looking for it in the editor
 * needs to know where to look. Clicking opens the config editor, which is the
 * only place the import line is visible and editable.
 *
 * Changing the control is still allowed and does the sane thing: it writes the
 * new value into this profile, overriding the import.
 */
export function InheritedBadge({ source, onOpenConfigEditor }: Props) {
  const name = includeDisplayName(source)
  const title = onOpenConfigEditor
    ? `Inherited from ${name}. This profile imports that file and does not set this itself; changing it here writes an override into this profile. Click to open the config editor and see the import.`
    : `Inherited from ${name}. This profile imports that file and does not set this itself; changing it here writes an override into this profile.`
  return (
    <button
      type="button"
      className={styles.badge}
      title={title}
      aria-label={title}
      data-capture-ignore="true"
      disabled={!onOpenConfigEditor}
      onClick={event => {
        event.stopPropagation()
        onOpenConfigEditor?.()
      }}
    >
      <span className={styles.mark} aria-hidden="true">↳</span>
      <span className={styles.source}>{name}</span>
    </button>
  )
}
