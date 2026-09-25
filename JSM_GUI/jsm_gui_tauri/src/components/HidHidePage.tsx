import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import {
  desktopBridge,
  type HidHideDevice,
  type HidHideStatus,
} from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { runLongOperation } from './LongOperation'
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
    const onFocus = () => { void refreshStatus(false) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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
    // The installer reports no progress and cannot be stopped part way.
    void runLongOperation('Installing HidHide…', () => desktopBridge.installBundledHidHide(), { detail: 'Windows may ask for permission' })
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

  const connected = decoratedDevices.filter(device => device.present && !device.hidden && !device.stale)
  const hidden = decoratedDevices.filter(device => device.hidden || device.stale || !device.present)

  const deviceRow = (device: (typeof decoratedDevices)[number]) => {
    const actionBusy = busyKey === `hidhide:${device.instanceId}`
    const actionDisabled = actionBusy || hidHideControlsLocked
    const external = device.hidden && !device.managedByApp && !device.stale
    const actionLabel = device.stale
      ? t('controllerStatus.hidHideClearStale')
      : device.hidden ? t('controllerStatus.hidHideUnhideDevice') : 'Hide from games'
    const sub = device.stale
      ? 'No longer connected · an old entry'
      : !device.present
        ? 'Not connected · stays hidden when it returns'
        : device.hidden
          ? !status?.active
            ? 'Set to hide · filtering is off'
            // Inverse mode hides only from the applications on HidHide's list.
            : status.inverse ? 'Hidden from listed applications' : 'Hidden from games · JSM still reads it'
          : device.partiallyHidden
            ? t('controllerStatus.hidHidePartiallyHidden')
            : `Visible to games${device.likelyCurrentController ? ' · JSM reads it directly' : ''}`
    return (
      <div key={device.instanceId} className={styles.deviceRow} data-hidden={device.hidden || undefined}>
        <span className={styles.deviceDot} data-state={device.hidden ? 'hidden' : device.present ? 'visible' : 'away'} aria-hidden="true" />
        <span className={styles.deviceText}>
          <span className={styles.deviceName}>{device.displayName}</span>
          <span className={styles.deviceSub}>{sub}</span>
        </span>
        {external
          ? <span className={styles.deviceNote} title={t('controllerStatus.hidHideHiddenExternallyHint')}>{t('controllerStatus.hidHideHiddenExternally')}</span>
          : <button type="button" className={`button ${device.hidden || device.stale ? 'button--secondary' : 'button--primary'}`} onClick={() => handleToggleDevice(device)} disabled={actionDisabled}>
              {actionBusy ? t('common.refreshing') : actionLabel}
            </button>}
      </div>
    )
  }

  // Device visibility (Tuning and Studio Pages 16h): what games can see, as
  // Connected and Hidden, one action each; the driver's own tools sit under
  // Advanced.
  return (
    <div className={styles.page}>
      {status?.installed && !status.requiresElevation && (
        <label className={styles.filterSwitch}>
          <input type="checkbox" checked={status.active} disabled={hidHideControlsLocked} onChange={handleToggleActive} />
          <span>
            <span>Hide controllers from games</span>
            <small>{status.active ? 'On: games see only what JSM sends, and the virtual controller.' : 'Off: every controller below is visible to games, whatever it is set to.'}</small>
          </span>
        </label>
      )}

      {error && <div className={styles.errorNote} role="alert">{t('controllerStatus.hidHideError', { error })}</div>}

      {loading && !status ? (
        <p className={styles.note}>{t('common.refreshing')}</p>
      ) : !status ? null : !status.supported ? (
        <p className={styles.notice}>{t('controllerStatus.hidHideUnsupported')}</p>
      ) : status.requiresElevation ? (
        <div className={`${styles.notice} ${styles.noticeWarn}`}>
          <b>{t('controllerStatus.hidHideElevationTitle')}</b>
          <p>{t('controllerStatus.hidHideElevationBody')}</p>
        </div>
      ) : !status.installed ? (
        <div className={styles.notice}>
          <b>{t('controllerStatus.hidHidePrerequisiteTitle')}</b>
          <p>{t('controllerStatus.hidHidePrerequisiteBody')}</p>
          <div className={styles.noticeActions}>
            <button type="button" className="button button--primary" onClick={handleInstallHidHide} disabled={hidHideInstallBusy}>
              {hidHideInstallBusy ? t('common.refreshing') : t('controllerStatus.hidHideInstallButton')}
            </button>
            <button type="button" className="button button--tertiary" onClick={openInstallGuide} disabled={hasActionInFlight}>
              {t('controllerStatus.hidHideDownloadButton')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {heuristicAmbiguous && <p className={`${styles.notice} ${styles.noticeWarn}`}>{t('controllerStatus.hidHideHeuristicWarning')}</p>}
          {/* Both change what "hidden" means, so they are said up front. */}
          {status.active && status.inverse && <p className={styles.notice}>{t('controllerStatus.hidHideInverseHint')}</p>}
          {status.active && status.steamAllowed && <p className={`${styles.notice} ${styles.noticeWarn}`}>{t('controllerStatus.hidHideSteamAllowed')}</p>}
          <span className={styles.eyebrow}>Connected</span>
          {connected.length ? <div className={styles.rows}>{connected.map(deviceRow)}</div>
            : <p className={styles.note}>{decoratedDevices.length ? 'Every connected controller is hidden.' : t('controllerStatus.hidHideNoDevices')}</p>}
          {hidden.length > 0 && <>
            <span className={styles.eyebrow}>Hidden</span>
            <div className={styles.rows}>{hidden.map(deviceRow)}</div>
          </>}
        </>
      )}

      {status?.installed && (
        <AdvancedDisclosure summary="Driver tools, the allow-list, how it works">
          <p className={styles.note}>HidHide is the Windows driver that filters access to controllers. Connected means Windows detects the device, not that games can see it. Partially hidden means some of a device’s interfaces are hidden and others are not. Filtering must be on for hiding to take effect.</p>
          {!status.requiresElevation && <>
            <p className={styles.note}>{t('controllerStatus.hidHideReconnectHint')}</p>
          </>}
          <div className={styles.toolRow}>
            <span className={`${styles.chip} ${status.whitelistSynced ? styles.chipOk : styles.chipWarn}`}>
              {status.whitelistSynced ? t('controllerStatus.hidHideWhitelistReady') : t('controllerStatus.hidHideWhitelistNeedsRepair')}
            </span>
            <button type="button" className={`button ${status.whitelistSynced ? 'button--tertiary' : 'button--secondary'}`} onClick={handleRepairWhitelist} disabled={hidHideControlsLocked}>
              {t('controllerStatus.hidHideRepairWhitelist')}
            </button>
            <button type="button" className="button button--tertiary" onClick={handleOpenHidHide} disabled={hasActionInFlight}>
              {hidHideOpenBusy ? t('common.refreshing') : t('controllerStatus.hidHideOpenClient')}
            </button>
            <button type="button" className="button button--tertiary" onClick={() => void refreshStatus()} disabled={loading || hasActionInFlight}>
              {loading ? t('common.refreshing') : t('controllerStatus.hidHideRefresh')}
            </button>
          </div>
        </AdvancedDisclosure>
      )}
    </div>
  )
}
