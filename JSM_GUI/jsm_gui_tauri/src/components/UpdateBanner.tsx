import { useState } from 'react'
import { shellBridge, useUpdateStatus } from '../platform/shellBridge'
import { focusPageStart } from './SystemNotices'
import styles from './Misc.module.css'

export function UpdateBanner() {
  const update = useUpdateStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'opening' | 'opened' | 'error'>('idle')
  const version = update?.latestVersion ?? ''
  if (!update?.available || dismissed === version) return null

  const openRelease = async () => {
    if (phase === 'opening') return
    setPhase('opening')
    try { await shellBridge.installUpdate(); setPhase('opened') }
    catch { setPhase('error') }
  }
  return (
    <div className={styles.updateBanner} role="status" data-phase={phase === 'idle' ? 'available' : phase}>
      <b>{phase === 'error' ? 'Could not open the release page' : 'Update available'}</b>
      <span className={styles.updateBannerDetail}>
        {phase === 'opened' ? 'Release page opened in your browser. JSM Evolved stays running.'
          : phase === 'error' ? 'Try again, or visit github.com/LukeyBeachBoy/JSM_Studio/releases'
          : `JSM Evolved ${version} · review the release before downloading`}
      </span>
      <span className={styles.updateBannerSpacer} />
      <button type="button" className={styles.updateBannerAction} disabled={phase === 'opening'} onClick={() => void openRelease()}>
        {phase === 'opening' ? 'Opening…' : phase === 'error' ? 'Try again' : 'View release'}
      </button>
      <button type="button" className={styles.updateBannerLater} onClick={() => { setDismissed(version); focusPageStart() }}>Later</button>
    </div>
  )
}
