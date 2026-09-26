import { useEffect, useRef, useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import { focusPageStart } from './SystemNotices'
import styles from './Misc.module.css'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string }
  | { phase: 'installing'; version: string }
  | { phase: 'error'; version?: string }

// Update banner (System States 17h): one line under the tabs, left of where
// toasts stack. "Install and restart" downloads, then installs as soon as the
// download lands; the download's progress fills the banner meanwhile.
export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [progress, setProgress] = useState(0)
  // The version the listeners see; a state updater must stay pure, and
  // StrictMode runs it twice, which would start two installs.
  const versionRef = useRef('')

  useEffect(() => {
    const removeAvailable = desktopBridge.onUpdateAvailable((version) => {
      versionRef.current = version
      setUpdate({ phase: 'available', version })
      setDismissed(false)
    })
    const removeProgress = desktopBridge.onUpdateDownloadProgress((percent) => {
      setProgress(percent)
    })
    const removeDownloaded = desktopBridge.onUpdateDownloaded(() => {
      const version = versionRef.current
      setUpdate({ phase: 'installing', version })
      void desktopBridge.installUpdate().catch(error => {
        console.error('Failed to install JSM Studio update', error)
        setUpdate({ phase: 'error', version })
      })
    })
    const checkTimer = window.setTimeout(() => {
      void desktopBridge.checkForUpdates()
    }, 1500)
    return () => {
      window.clearTimeout(checkTimer)
      removeAvailable?.()
      removeProgress?.()
      removeDownloaded?.()
    }
  }, [])

  if (update.phase === 'idle' || dismissed) return null

  const version = 'version' in update ? update.version : undefined
  const install = (target: string) => {
    setProgress(0)
    setUpdate({ phase: 'downloading', version: target })
    void desktopBridge.downloadUpdate().catch(error => {
      console.error('Failed to download JSM Studio update', error)
      setUpdate({ phase: 'error', version: target })
    })
  }

  return (
    <div className={styles.updateBanner} role="status" data-phase={update.phase}>
      {update.phase === 'downloading' && (
        <span className={styles.updateBannerFill} style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }} aria-hidden="true" />
      )}
      <b>
        {update.phase === 'available' && 'Update available'}
        {update.phase === 'downloading' && 'Downloading update'}
        {update.phase === 'installing' && 'Installing update'}
        {update.phase === 'error' && 'The update did not install'}
      </b>
      <span className={styles.updateBannerDetail}>
        {update.phase === 'downloading'
          ? `JSM Studio ${version} · ${Math.round(progress)}%`
          : update.phase === 'installing'
            ? 'JSM Studio restarts on its own'
            : update.phase === 'error'
              ? 'Try again, or download it from the releases page'
              : `JSM Studio ${version}`}
      </span>
      <span className={styles.updateBannerSpacer} />
      {(update.phase === 'available' || (update.phase === 'error' && version)) && (
        <button type="button" className={styles.updateBannerAction} onClick={() => install(version!)}>
          {update.phase === 'error' ? 'Try again' : 'Install and restart'}
        </button>
      )}
      {(update.phase === 'available' || update.phase === 'error') && (
        <button type="button" className={styles.updateBannerLater} onClick={() => { setDismissed(true); focusPageStart() }}>Later</button>
      )}
    </div>
  )
}
