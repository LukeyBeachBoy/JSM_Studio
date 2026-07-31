import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge } from '../platform/desktopBridge'
import styles from './Misc.module.css'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading' }
  | { phase: 'error' }
  | { phase: 'ready' }

export function UpdateBanner() {
  const { t } = useTranslation()
  const [update, setUpdate] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const removeAvailable = desktopBridge.onUpdateAvailable((version) => {
      setUpdate({ phase: 'available', version })
      setDismissed(false)
    })
    const removeProgress = desktopBridge.onUpdateDownloadProgress((percent) => {
      setProgress(percent)
    })
    const removeDownloaded = desktopBridge.onUpdateDownloaded(() => {
      setUpdate({ phase: 'ready' })
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

  return (
    <div className={styles.updateBanner}>
      {update.phase === 'available' && (
        <>
          <span>{t('update.available', { version: update.version })}</span>
          <div className={styles.updateBannerActions}>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setUpdate({ phase: 'downloading' })
                void desktopBridge.downloadUpdate().catch(error => {
                  console.error('Failed to download JSM Studio update', error)
                  setUpdate({ phase: 'error' })
                })
              }}
            >
              {t('update.downloadNow')}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setDismissed(true)}>
              {t('common.later')}
            </button>
          </div>
        </>
      )}
      {update.phase === 'downloading' && <span>{t('update.downloading', { percent: progress })}</span>}
      {update.phase === 'error' && (
        <>
          <span>{t('update.failed')}</span>
          <button type="button" className="ghost-btn" onClick={() => setDismissed(true)}>
            {t('common.later')}
          </button>
        </>
      )}
      {update.phase === 'ready' && (
        <>
          <span>{t('update.ready')}</span>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              void desktopBridge.installUpdate().catch(error => {
                console.error('Failed to install JSM Studio update', error)
                setUpdate({ phase: 'error' })
              })
            }}
          >
            {t('update.restartNow')}
          </button>
        </>
      )}
    </div>
  )
}
