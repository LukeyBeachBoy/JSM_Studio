import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import {
  desktopBridge,
  type HidHideDevice,
  type HidHideStatus,
} from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { Card } from './Card'
import styles from './ControllerStatusPage.module.css'

const HIDHIDE_RELEASES_URL = 'https://github.com/nefarius/HidHide/releases/latest'

type HidHidePageProps = {
  telemetryDevices?: TelemetryDevice[]
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const getTelemetryMatchKey = (device: Pick<TelemetryDevice, 'vid' | 'pid'>) =>
  device.vid && device.pid ? `${device.vid}:${device.pid}` : null

const getHidHideMatchKey = (device: Pick<HidHideDevice, 'vendorId' | 'productId'>) =>
  device.vendorId && device.productId ? `${device.vendorId}:${device.productId}` : null

// Device visibility (HidHide). This used to live inline at the top of the
// Controller Status overview -- taking up prominent space on the screen you
// open most often, for a feature you touch rarely. Moved to its own page
// under a Settings section, mirroring Steam Input keeping controller hiding
// under its own Controllers settings rather than on the live status view.
export function HidHidePage({ telemetryDevices }: HidHidePageProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<HidHideStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const telemetryKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const device of telemetryDevices ?? []) {
      const key = getTelemetryMatchKey(device)
      if (key) {
        keys.add(key)
      }
    }
    return keys
  }, [telemetryDevices])

  const decoratedDevices = useMemo(() => {
    if (!status) {
      return []
    }
    return status.devices.map(device => {
      const matchKey = getHidHideMatchKey(device)
      const likelyCurrentController = matchKey
        ? telemetryKeys.has(matchKey)
        : device.likelyCurrentController
      return {
        ...device,
        likelyCurrentController,
      }
    })
  }, [status, telemetryKeys])

  const heuristicAmbiguous = useMemo(() => {
    const counts = new Map<string, number>()
    for (const device of decoratedDevices) {
      if (!device.likelyCurrentController) {
        continue
      }
      const matchKey = getHidHideMatchKey(device)
      if (!matchKey) {
        continue
      }
      counts.set(matchKey, (counts.get(matchKey) ?? 0) + 1)
    }
    return Array.from(counts.values()).some(count => count > 1)
  }, [decoratedDevices])

  const refreshStatus = async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true)
    }
    try {
      const nextStatus = await desktopBridge.getHidHideStatus()
      setStatus(nextStatus)
      setError(null)
    } catch (refreshError) {
      setError(getErrorMessage(refreshError))
    } finally {
      if (showSpinner) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  const runStatusAction = async (
    actionKey: string,
    action: () => Promise<HidHideStatus>,
    successMessage?: string,
  ) => {
    setBusyKey(actionKey)
    try {
      const nextStatus = await action()
      setStatus(nextStatus)
      setError(null)
      if (successMessage) {
        showToast(successMessage)
      }
    } catch (actionError) {
      const message = getErrorMessage(actionError)
      setError(message)
      showToast(t('messages.hidHideUpdateFailed', { error: message }), 'error')
    } finally {
      setBusyKey(null)
      setLoading(false)
    }
  }

  const handleToggleActive = () => {
    if (!status) {
      return
    }
    const nextActive = !status.active
    void runStatusAction(
      'hidhide:active',
      () => desktopBridge.setHidHideActive(nextActive),
      nextActive ? t('messages.hidHideEnabled') : t('messages.hidHideDisabled'),
    )
  }

  const handleRepairWhitelist = () => {
    void runStatusAction(
      'hidhide:whitelist',
      () => desktopBridge.syncHidHideWhitelist(),
      t('messages.hidHideWhitelistSynced'),
    )
  }

  const handleToggleDevice = (device: HidHideDevice) => {
    if (device.hidden && !device.managedByApp && !device.stale) {
      return
    }

    const nextHidden = device.stale ? false : !device.hidden
    const successMessage = nextHidden
      ? t('messages.hidHideDeviceHidden', { name: device.displayName })
      : t('messages.hidHideDeviceVisible', { name: device.displayName })

    void runStatusAction(
      `hidhide:${device.instanceId}`,
      () => desktopBridge.setHidHideDeviceHidden(device.instanceId, nextHidden),
      successMessage,
    )
  }

  const openInstallGuide = () => {
    void desktopBridge.openExternal(HIDHIDE_RELEASES_URL)
  }

  const handleInstallHidHide = () => {
    setBusyKey('hidhide:install')
    void desktopBridge.installBundledHidHide()
      .then(result => {
        setStatus(result.status)
        setError(null)
        showToast(
          result.status.installed
            ? t('messages.hidHideInstallCompleted')
            : t('messages.hidHideInstallNeedsRefresh'),
        )
        void refreshStatus(false)
      })
      .catch(installError => {
        const message = getErrorMessage(installError)
        setError(message)
        showToast(t('messages.hidHideUpdateFailed', { error: message }), 'error')
      })
      .finally(() => {
        setBusyKey(null)
        setLoading(false)
      })
  }

  const handleOpenHidHide = () => {
    setBusyKey('hidhide:open')
    void desktopBridge.openHidHideClient()
      .then(() => {
        setError(null)
        showToast(t('messages.hidHideClientOpened'))
      })
      .catch(openError => {
        const message = getErrorMessage(openError)
        setError(message)
        showToast(t('messages.hidHideOpenFailed', { error: message }), 'error')
      })
      .finally(() => {
        setBusyKey(null)
      })
  }

  const hasActionInFlight = busyKey !== null
  const hidHideControlsLocked = hasActionInFlight || status?.requiresElevation === true
  const hidHideInstallBusy = busyKey === 'hidhide:install'
  const hidHideOpenBusy = busyKey === 'hidhide:open'

  return (
    <div className={styles.page}>
      <Card className={`${styles.pageCard} ${styles.hidHideCard}`}>
        <div className={styles.hidHideHeader}>
          <div className={styles.hidHideTitleRow}>
            <div className={styles.hidHideHeading}>
              <h2>{t('controllerStatus.hidHideTitle')}</h2>
              {status && (
                <span className={styles.cardMetric}>
                  {status.installed
                    ? status.active
                      ? t('controllerStatus.hidHideActive')
                      : t('controllerStatus.hidHideInactive')
                    : t('controllerStatus.hidHideNotInstalled')}
                </span>
              )}
            </div>
          </div>
          <div className={styles.hidHideActions}>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void refreshStatus()}
              disabled={loading || hasActionInFlight}
            >
              {loading ? t('common.refreshing') : t('controllerStatus.hidHideRefresh')}
            </button>
            {status?.installed && (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleOpenHidHide}
                disabled={hasActionInFlight}
              >
                {hidHideOpenBusy ? t('common.refreshing') : t('controllerStatus.hidHideOpenClient')}
              </button>
            )}
            {status?.installed && (
              <button
                type="button"
                className={status.whitelistSynced ? 'secondary-btn' : 'primary-btn'}
                onClick={handleRepairWhitelist}
                disabled={hidHideControlsLocked}
              >
                {t('controllerStatus.hidHideRepairWhitelist')}
              </button>
            )}
            {status?.installed && (
              <button
                type="button"
                className={status.active ? 'secondary-btn' : 'primary-btn'}
                onClick={handleToggleActive}
                disabled={hidHideControlsLocked}
              >
                {status.active
                  ? t('controllerStatus.hidHideDisableHiding')
                  : t('controllerStatus.hidHideEnableHiding')}
              </button>
            )}
          </div>
        </div>

        {status?.installed && (
          <div className={styles.hidHideSummary}>
            <span
              className={`${styles.hidHideChip} ${
                status.whitelistSynced ? styles.hidHideChipPositive : styles.hidHideChipWarn
              }`}
            >
              {status.whitelistSynced
                ? t('controllerStatus.hidHideWhitelistReady')
                : t('controllerStatus.hidHideWhitelistNeedsRepair')}
            </span>
          </div>
        )}

        {error && (
          <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeError}`}>
            {t('controllerStatus.hidHideError', { error })}
          </div>
        )}

        {loading && !status ? (
          <div className={styles.emptyInline}>{t('common.refreshing')}</div>
        ) : !status ? null : !status.supported ? (
          <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeMuted}`}>
            {t('controllerStatus.hidHideUnsupported')}
          </div>
        ) : status.requiresElevation ? (
          <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeWarn}`}>
            <div className={styles.hidHideNoticeTitle}>{t('controllerStatus.hidHideElevationTitle')}</div>
            <p>{t('controllerStatus.hidHideElevationBody')}</p>
          </div>
        ) : !status.installed ? (
          <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeMuted}`}>
            <div className={styles.hidHideNoticeTitle}>{t('controllerStatus.hidHidePrerequisiteTitle')}</div>
            <p>{t('controllerStatus.hidHidePrerequisiteBody')}</p>
            <div className={styles.hidHideNoticeActions}>
              <button
                type="button"
                className="primary-btn"
                onClick={handleInstallHidHide}
                disabled={hidHideInstallBusy}
              >
                {hidHideInstallBusy ? t('common.refreshing') : t('controllerStatus.hidHideInstallButton')}
              </button>
              <button type="button" className="ghost-btn" onClick={openInstallGuide} disabled={hasActionInFlight}>
                {t('controllerStatus.hidHideDownloadButton')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {heuristicAmbiguous && (
              <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeWarn}`}>
                {t('controllerStatus.hidHideHeuristicWarning')}
              </div>
            )}

            {decoratedDevices.length === 0 ? (
              <div className={`${styles.hidHideNotice} ${styles.hidHideNoticeMuted}`}>
                {t('controllerStatus.hidHideNoDevices')}
              </div>
            ) : (
              <div className={styles.hidHideDeviceList}>
                {decoratedDevices.map(device => {
                  const actionBusy = busyKey === `hidhide:${device.instanceId}`
                  const actionDisabled = actionBusy || hidHideControlsLocked
                  const actionLabel = device.stale
                    ? t('controllerStatus.hidHideClearStale')
                    : device.hidden
                      ? t('controllerStatus.hidHideUnhideDevice')
                      : t('controllerStatus.hidHideHideDevice')

                  return (
                    <div key={device.instanceId} className={styles.hidHideDeviceRow}>
                      <div className={styles.hidHideDeviceMain}>
                        <div className={styles.hidHideDeviceTitleRow}>
                          <strong>{device.displayName}</strong>
                          <div className={styles.hidHideDeviceBadges}>
                            <span
                              className={`${styles.hidHidePill} ${
                                device.hidden ? styles.hidHidePillWarn : styles.hidHidePillMuted
                              }`}
                            >
                              {device.hidden
                                ? t('controllerStatus.hidHideHidden')
                                : t('controllerStatus.hidHideVisible')}
                            </span>
                            <span
                              className={`${styles.hidHidePill} ${
                                device.present ? styles.hidHidePillPositive : styles.hidHidePillMuted
                              }`}
                            >
                              {device.present
                                ? t('controllerStatus.hidHidePresent')
                                : t('controllerStatus.hidHideSavedOnly')}
                            </span>
                          </div>
                        </div>

                        {device.likelyCurrentController && (
                          <div className={styles.hidHideDeviceMeta}>
                            {t('controllerStatus.hidHideLikelyCurrent')}
                          </div>
                        )}
                      </div>

                      <div className={styles.hidHideDeviceActions}>
                        {device.hidden && !device.managedByApp && !device.stale ? (
                          <button type="button" className="ghost-btn" disabled>
                            {t('controllerStatus.hidHideHiddenExternally')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={device.hidden || device.stale ? 'secondary-btn' : 'primary-btn'}
                            onClick={() => handleToggleDevice(device)}
                            disabled={actionDisabled}
                          >
                            {actionBusy ? t('common.refreshing') : actionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
