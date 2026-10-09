import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet } from '../ui/Sheet'
import { Icon, type IconName } from '../icons/Icon'
import type { BuiltinBase } from '../../utils/presetBases'
import styles from './Library.module.css'

// The Library's side sheets (console v2: LibraryActions): Y "More" on a
// configuration or base, with the delete confirmation inside it (focus starts
// on Keep it, and B is Keep it), and the base picker behind Change base.

export type MoreItem = {
  key: string
  icon: IconName
  label: string
  /** The right-hand note: "A copy, opened to edit", "FPS base". */
  note?: string
  danger?: boolean
  unavailable?: string
  run: () => void
}

type MoreSheetProps = {
  open: boolean
  onClose: () => void
  eyebrow: string
  title: string
  file?: string
  items: MoreItem[]
  /** Delete, when the item allows it: the confirmation's sentence. */
  remove?: { label: string; body: ReactNode; run: () => void }
  /** Opens straight on the confirmation. */
  confirming?: boolean
  onWhere?: (where: string | null) => void
}

export function MoreSheet({ open, onClose, eyebrow, title, file, items, remove, confirming: startConfirming = false, onWhere }: MoreSheetProps) {
  const [confirming, setConfirming] = useState(startConfirming)
  const keepRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  // Keep it (or B) goes back to the menu, on Delete.
  useEffect(() => {
    if (wasConfirming.current && !confirming) window.requestAnimationFrame(() => deleteRef.current?.focus())
    wasConfirming.current = confirming
  }, [confirming])
  useEffect(() => { if (open) setConfirming(startConfirming) }, [open, startConfirming])
  useEffect(() => {
    if (!confirming) return
    onWhere?.('Delete')
    window.requestAnimationFrame(() => keepRef.current?.focus())
    return () => onWhere?.(null)
  }, [confirming, onWhere])
  const close = () => { if (confirming) { setConfirming(false); return } onClose() }
  return (
    <Sheet open={open} onClose={close} eyebrow={eyebrow} title={title} description={file ? <span className={styles.mono}>{file}</span> : undefined} width={520}
      hints={confirming ? [{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Keep it' }] : [{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Back' }]}>
      {!confirming && items.map(item => (
        <button key={item.key} type="button" className={styles.menuRow} data-danger={item.danger || undefined}
          aria-disabled={item.unavailable ? 'true' : undefined} data-reason={item.unavailable}
          data-hints={item.unavailable ? 'B:Back' : `A:${item.label};B:Back`}
          data-caption={item.unavailable ? `${item.label} · ${item.unavailable}` : item.note ? `${item.label} · ${item.note}` : undefined}
          onClick={() => { if (!item.unavailable) item.run() }}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
          <span>{item.unavailable ?? item.note ?? ''}</span>
        </button>
      ))}
      {!confirming && remove && <>
        <div className={styles.menuRule} />
        <button ref={deleteRef} type="button" className={styles.menuRow} data-danger="true" data-hints="A:Delete…;B:Back" onClick={() => setConfirming(true)}>
          <Icon name="remove" size={20} /><span>Delete</span><span>To the recycle bin</span>
        </button>
      </>}
      {confirming && remove && (
        <div className={styles.confirm} role="alertdialog" aria-label={`Delete ${title}?`}>
          <h4><Icon name="remove" size={20} />Delete {title}?</h4>
          <p>{remove.body}</p>
          <button ref={keepRef} type="button" className={styles.keep} data-autofocus="" data-hints="A:Keep it;B:Keep it" onClick={() => setConfirming(false)}>
            <b>Keep it</b><small>Nothing changes.</small>
          </button>
          <button type="button" className={styles.destroy} data-hints={`A:${remove.label};B:Keep it`} onClick={() => { setConfirming(false); remove.run() }}>
            <Icon name="remove" size={20} />{remove.label}
          </button>
        </div>
      )}
    </Sheet>
  )
}

type BasePickerProps = {
  open: boolean
  onClose: () => void
  name: string
  /** The base it's built on now (a runtime-relative path), or null. */
  current: string | null
  builtin: BuiltinBase[]
  /** The library's own bases, by name. */
  userBases: string[]
  /** Bases that would make a loop with this configuration. */
  loops?: (path: string) => boolean
  onPick: (path: string | null) => void
}

export function BasePickerSheet({ open, onClose, name, current, builtin, userBases, loops, onPick }: BasePickerProps) {
  const row = (path: string | null, label: string, note?: string) => {
    const checked = (current ?? '').toLowerCase() === (path ?? '').toLowerCase()
    const loop = path && loops?.(path)
    return (
      <button key={path ?? 'none'} type="button" role="menuitemradio" aria-checked={checked} className={styles.pickRow}
        aria-disabled={loop ? 'true' : undefined} data-reason={loop ? `${label} builds on ${name}, so this would make a loop` : undefined}
        data-autofocus={checked ? '' : undefined} data-hints={loop ? 'B:Back' : 'A:Build on this;B:Back'}
        onClick={() => { if (!loop) onPick(path) }}>
        <span>{label}</span><span>{loop ? 'Would make a loop' : checked ? 'Now' : note ?? ''}</span>
      </button>
    )
  }
  // One entry per shipped preset variant, by its file so the variants differ.
  return (
    <Sheet open={open} onClose={onClose} eyebrow={`Library · ${name}`} title="Change base"
      description="What it's built on. Anything it leaves alone comes from the base; what it sets wins."
      hints={[{ button: 'A', label: 'Build on this' }, { button: 'B', label: 'Back' }]} width={560}>
      {row(null, 'Nothing', 'Every setting is its own')}
      {userBases.length > 0 && <p className={styles.eyebrow} style={{ marginTop: 12 }}>Your bases</p>}
      {userBases.map(base => row(`profiles-library/${base}.txt`, base))}
      <p className={styles.eyebrow} style={{ marginTop: 12 }}>Built in</p>
      {builtin.map(base => row(base.relativePath, `${base.title}${base.fileName.includes(' - ') ? ` (${base.fileName.replace(/^.* - /, '').replace(/\.txt$/, '')})` : ''}`, base.blurb))}
    </Sheet>
  )
}
