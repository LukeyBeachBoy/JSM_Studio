import { useState, type ReactNode } from 'react'
import { Sheet } from '../ui/Sheet'
import { OpenRow } from '../ui/console'
import { scopedConfig, replaceScope } from '../../utils/configScopes'
import { showToast } from '../../utils/toast'
import { GYRO_TUNING_KEYS } from '../../utils/gyroSettingsScope'
import { useGyro, PadActions } from './GyroContext'
import styles from './Gyro.module.css'

// Y on the Gyro screens opens "More…": the things that don't belong to any one
// setting (console v2: "Y always opens a menu of the rest"). Copy and paste the
// whole gyro tuning between configurations (was the Gyro page header's Copy /
// Paste tuning), the other screens, and While holding… for gyro. A row that
// answers Y itself (a value's Use Default, the first question's Pick button)
// claims it first.

export type MoreEntry = { id: string; label: string; hint?: string; value?: ReactNode; onSelect: () => void; unavailable?: string }

/** The clipboard and the base editor's own entries, for the screens that offer them. */
export function useGyroMoreEntries(extra: MoreEntry[] = []): MoreEntry[] {
  const gyro = useGyro()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ format: 'jsm-tuning-v1', kind: 'gyro', text: scopedConfig(gyro.rootText, GYRO_TUNING_KEYS) }))
      showToast('Copied gyro tuning')
    } catch { showToast('Clipboard access failed.', 'error') }
  }
  const paste = async () => {
    try {
      const data = JSON.parse(await navigator.clipboard.readText())
      if (data.format !== 'jsm-tuning-v1' || data.kind !== 'gyro' || typeof data.text !== 'string' || data.text.length > 100000) throw new Error()
      const filtered = scopedConfig(data.text, GYRO_TUNING_KEYS)
      if (filtered !== data.text) throw new Error()
      gyro.setRootText(previous => replaceScope(previous, filtered, GYRO_TUNING_KEYS))
      showToast('Pasted gyro tuning. Save and apply when ready.')
    } catch { showToast('Copy gyro tuning from another configuration first.', 'error') }
  }
  return [
    ...extra,
    { id: 'copy', label: 'Copy gyro tuning', hint: 'Every gyro and tilt setting, to paste into another configuration', onSelect: () => void copy() },
    { id: 'paste', label: 'Paste gyro tuning', hint: 'Replaces this configuration’s gyro settings; undo before saving if it’s wrong', onSelect: () => void paste(), unavailable: gyro.locked },
  ]
}

/** Y opens the menu from anywhere inside; X is the screen's own Try it. */
export function GyroMore({ entries, eyebrow, children, x, className }: { entries: MoreEntry[]; eyebrow: string; children: ReactNode; x?: () => void; className?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <PadActions x={x} y={() => setOpen(true)} className={className}>{children}</PadActions>
    <Sheet open={open} onClose={() => setOpen(false)} eyebrow={eyebrow} title="More" width={520} hints={[{ button: 'A', label: 'Open' }, { button: 'B', label: 'Close' }]}>
      <div className={styles.moreList} data-gyro-more="">
        {entries.map(entry => (
          <OpenRow key={entry.id} label={entry.label} hint={entry.hint} value={entry.value} disabled={entry.unavailable} data={{ 'data-more-item': entry.id }}
            onOpen={() => { setOpen(false); requestAnimationFrame(entry.onSelect) }} />
        ))}
      </div>
    </Sheet>
  </>
}
