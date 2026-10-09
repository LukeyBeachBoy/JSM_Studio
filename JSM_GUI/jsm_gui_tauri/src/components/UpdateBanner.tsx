import { useEffect, useState } from 'react'
import { shellBridge, useUpdateStatus } from '../platform/shellBridge'
import { focusPageStart } from './SystemNotices'
import styles from './Misc.module.css'

// The update line under the header (System States 17h; console v2, D19): it
// shows when GitHub has a newer release than this app, from the status the
// Startup and About pages share. "Install and restart" downloads the
// release's installer (its progress fills the line), starts it, and closes
// the app so it can replace the files.
export function UpdateBanner() {
  const update = useUpdateStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'installing' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  useEffect(() => shellBridge.onUpdateProgress(percent => {
    setProgress(percent)
    if (percent >= 100) setPhase('installing')
  }), [])

  const version = update?.latestVersion ?? ''
  if (!update?.available || dismissed === version) return null

  const install = () => {
    setProgress(0)
    setPhase('downloading')
    void shellBridge.installUpdate().then(() => setPhase(current => current === 'downloading' ? 'installing' : current)).catch(error => {
      console.error('Failed to install the JSM Evolved update', error)
      setPhase('error')
    })
  }

  return (
    <div className={styles.updateBanner} role="status" data-phase={phase === 'idle' ? 'available' : phase}>
      {phase === 'downloading' && (
        <span className={styles.updateBannerFill} style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} aria-hidden="true" />
      )}
      <b>
        {phase === 'idle' && 'Update available'}
        {phase === 'downloading' && 'Downloading update'}
        {phase === 'installing' && 'Installing update'}
        {phase === 'error' && 'The update did not install'}
      </b>
      <span className={styles.updateBannerDetail}>
        {phase === 'downloading'
          ? `JSM Evolved ${version} · ${Math.round(progress)}%`
          : phase === 'installing'
            ? 'The installer takes over; JSM Evolved closes so it can update'
            : phase === 'error'
              ? 'Try again, or get it from the releases page'
              : `JSM Evolved ${version} · you have ${update.currentVersion}`}
      </span>
      <span className={styles.updateBannerSpacer} />
      {(phase === 'idle' || phase === 'error') && (
        <button type="button" className={styles.updateBannerAction} onClick={install}>
          {phase === 'error' ? 'Try again' : 'Install and restart'}
        </button>
      )}
      {(phase === 'idle' || phase === 'error') && (
        <button type="button" className={styles.updateBannerLater} onClick={() => { setDismissed(version); focusPageStart() }}>Later</button>
      )}
    </div>
  )
}
