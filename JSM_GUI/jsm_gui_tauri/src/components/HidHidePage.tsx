import { useEffect, useMemo, useRef, useState } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { desktopBridge, type HidHideDevice, type HidHideStatus } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'
import { getVirtualControllerType, type VirtualControllerType } from '../utils/virtualController'
import { runLongOperation } from './LongOperation'
import { OpenRow, SubPage } from './ui/console'
import { SettingsNote, SettingsSection, StatusStrip, SwitchRow, usePadButton } from './settings/SettingsKit'
import styles from './settings/Settings.module.css'

// Settings ▸ Hide the real controller (console v2, SettingsHide.dc.html and
// SettingsHideSetup): games see only what JSM sends, so nothing reacts twice.
// A status strip and the master switch; each controller as a card with its
// art and one action; the apps HidHide still lets see them; the driver's
// details under Advanced. Without HidHide (or without administrator rights),
// a three-step setup instead. Y: Refresh, open HidHide…

const HIDHIDE_RELEASES_URL = 'https://github.com/nefarius/HidHide/releases/latest'

const ART = import.meta.glob('../assets/controllers/*-front.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const artFor = (device: HidHideDevice) => {
  const name = `${device.displayName} ${device.product}`.toLowerCase()
  const key = /steam|28de/.test(name) || device.vendorId === 0x28de ? 'steam'
    : /dualsense edge/.test(name) ? 'dualsense-edge' : /dualsense|0ce6/.test(name) || device.vendorId === 0x054c && device.productId === 0x0ce6 ? 'dualsense'
      : /dualshock|ds4/.test(name) || device.vendorId === 0x054c ? 'dualshock-4'
        : /elite/.test(name) ? 'xbox-elite-2' : /switch|pro controller/.test(name) || device.vendorId === 0x057e ? 'switch-pro'
          : /8bitdo/.test(name) ? '8bitdo-ultimate-2' : 'xbox-series'
  return ART[`../assets/controllers/${key}-front.svg`] ?? ''
}

const VIRTUAL_NAME: Record<VirtualControllerType, string | null> = { XBOX: 'Virtual Xbox controller', DS4: 'Virtual DualShock 4 controller', NONE: null }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const telemetryKey = (device: Pick<TelemetryDevice, 'vid' | 'pid'>) => device.vid && device.pid ? `${device.vid}:${device.pid}` : null
const hidHideKey = (device: Pick<HidHideDevice, 'vendorId' | 'productId'>) => device.vendorId && device.productId ? `${device.vendorId}:${device.productId}` : null

type HidHidePageProps = {
  telemetryDevices?: TelemetryDevice[]
  /** The live configuration's virtual output; read from it when not given. */
  virtualOutput?: VirtualControllerType
}

export function HidHidePage({ telemetryDevices, virtualOutput }: HidHidePageProps) {
  const [status, setStatus] = useState<HidHideStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [appliedOutput, setAppliedOutput] = useState<VirtualControllerType>('NONE')
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (virtualOutput !== undefined) return
    let disposed = false
    void desktopBridge.getActiveProfile().then(profile => { if (!disposed && profile) setAppliedOutput(getVirtualControllerType(profile.content)) }).catch(() => {})
    return () => { disposed = true }
  }, [virtualOutput])
  const virtualName = VIRTUAL_NAME[virtualOutput ?? appliedOutput]

  const telemetryKeys = useMemo(() => new Set((telemetryDevices ?? []).map(telemetryKey).filter(Boolean) as string[]), [telemetryDevices])
  const devices = useMemo(() => (status?.devices ?? []).map(device => {
    const key = hidHideKey(device)
    return { ...device, likelyCurrentController: key ? telemetryKeys.has(key) : device.likelyCurrentController }
  }), [status, telemetryKeys])
  const ambiguous = useMemo(() => {
    const counts = new Map<string, number>()
    for (const device of devices) { const key = hidHideKey(device); if (device.likelyCurrentController && key) counts.set(key, (counts.get(key) ?? 0) + 1) }
    return [...counts.values()].some(count => count > 1)
  }, [devices])

  const refresh = async (spinner = true) => {
    if (spinner) setLoading(true)
    try { setStatus(await desktopBridge.getHidHideStatus()); setError(null) }
    catch (refreshError) { setError(errorText(refreshError)) }
    finally { if (spinner) setLoading(false) }
  }
  useEffect(() => {
    void refresh()
    const onFocus = () => { void refresh(false) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const run = async (key: string, action: () => Promise<HidHideStatus>, success?: string) => {
    setBusyKey(key)
    try {
      setStatus(await action())
      setError(null)
      if (success) showToast(success)
    } catch (actionError) {
      setError(errorText(actionError))
      showToast(`HidHide didn't take the change: ${errorText(actionError)}`, 'error')
    } finally {
      setBusyKey(null)
      setLoading(false)
    }
  }
  const toggleDevice = (device: HidHideDevice) => {
    if (device.hidden && !device.managedByApp && !device.stale) return
    const hide = device.stale ? false : !device.hidden
    setChanged(device.instanceId)
    void run(`device:${device.instanceId}`, () => desktopBridge.setHidHideDeviceHidden(device.instanceId, hide),
      device.stale ? `Cleared the old entry for ${device.displayName}.` : hide ? `${device.displayName} is hidden from games.` : `Games can see ${device.displayName} again.`)
  }
  const install = () => {
    setBusyKey('install')
    void runLongOperation('Installing HidHide…', () => desktopBridge.installBundledHidHide(), { detail: 'Windows asks for permission' })
      .then(result => {
        setStatus(result.status)
        showToast(result.status.installed ? 'HidHide is installed.' : 'The installer closed. Restart Windows if it asked to, then check again.')
        void refresh(false)
      })
      .catch(installError => { setError(errorText(installError)); showToast(`HidHide didn't install: ${errorText(installError)}`, 'error') })
      .finally(() => { setBusyKey(null); setLoading(false) })
  }
  const openHidHide = () => {
    setBusyKey('open')
    void desktopBridge.openHidHideClient().catch(openError => showToast(`Couldn't open HidHide: ${errorText(openError)}`, 'error')).finally(() => setBusyKey(null))
  }
  // Y: Refresh, open HidHide…; on the setup steps Y checks again.
  const ready = Boolean(status?.supported && status.installed && !status.requiresElevation)
  usePadButton('Y', () => { if (ready) setMenuOpen(true); else void refresh() }, host)

  const locked = busyKey !== null || status?.requiresElevation === true

  // ---- Setup: three steps, once.
  if (status && (!status.installed || status.requiresElevation)) {
    const step = !status.installed ? 1 : 2
    return (
      <div ref={host} className={styles.mainColumn} style={{ maxWidth: 980 }} data-hidhide-setup={step}>
        <SettingsNote>Three steps, once. Then games see only what JSM sends, so nothing reacts twice.</SettingsNote>
        <ol className={styles.cards} style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Setup">
          {[
            { n: 1, title: 'Install HidHide', sub: step === 1 ? 'Now' : 'Done' },
            { n: 2, title: 'Open as administrator', sub: 'Reopen JSM Evolved as administrator, then check again.' },
            { n: 3, title: 'Choose what games see', sub: 'Hide each real controller with one press' },
          ].map(item => (
            <li key={item.n} className={styles.card} data-current={item.n === step ? 'true' : undefined} style={{ cursor: 'default', opacity: item.n < step ? .6 : 1 }}>
              <span className={styles.tag} data-tone={item.n === step ? 'accent' : item.n < step ? 'ok' : undefined}>{item.n}</span>
              <span className={styles.cardText}><b className={styles.cardTitle}>{item.title}</b><span className={styles.cardSub}>{item.sub}</span></span>
            </li>
          ))}
        </ol>
        {step === 1 ? (
          <SettingsSection title="Install HidHide" note="The small Windows driver that does the hiding">
            <SettingsNote>A copy comes with JSM Evolved, so there’s nothing to download. Windows asks for permission. Restart if it asks to, then come back here.</SettingsNote>
            <OpenRow label="Install the included copy" hint="Windows asks for permission" onOpen={install} disabled={busyKey === 'install' ? 'Installing…' : undefined} hints="A:Install;Y:Check again;B:Home" />
            <OpenRow label="Official site ↗" hint="HidHide's releases on GitHub" onOpen={() => void desktopBridge.openExternal(HIDHIDE_RELEASES_URL)} hints="A:Open;Y:Check again;B:Home" />
          </SettingsSection>
        ) : (
          <SettingsSection title="Open as administrator" note="HidHide only answers an app running as administrator">
            <SettingsNote>Close JSM Evolved from the tray, open it again with “Run as administrator”, then check again. Starting with Windows from Settings ▸ Startup does this for you.</SettingsNote>
            <OpenRow label="Check again" hint="After reopening as administrator" onOpen={() => void refresh()} hints="A:Check again;B:Home" />
          </SettingsSection>
        )}
        {error && <p role="alert" className={styles.note}>{error}</p>}
      </div>
    )
  }
  if (status && !status.supported) {
    return <div ref={host} className={styles.mainColumn}><SettingsNote>Hiding the real controller works in the Windows app only.</SettingsNote></div>
  }

  const active = Boolean(status?.active)
  const appList = status?.appList ?? []
  const external = devices.filter(device => device.hidden && !device.managedByApp && !device.stale)
  const stale = devices.filter(device => device.stale)
  const deviceSub = (device: (typeof devices)[number]) => device.stale ? 'No longer connected; still set to hide'
    : !device.present ? (device.hidden ? 'Not connected · stays hidden when it’s back' : 'Not connected')
      : device.hidden ? (!active ? 'Set to hide · hiding is off' : status?.inverse ? 'Hidden from the apps on HidHide’s list' : 'Hidden from games · JSM still reads it')
        : device.partiallyHidden ? 'Partly hidden: some games may still see it'
          : 'Visible to games'
  const action = (device: HidHideDevice) => device.stale ? 'Clear old entry' : device.hidden && !device.managedByApp ? 'Hidden by another app' : device.hidden ? 'Show to games' : 'Hide from games'

  return (
    <div ref={host} className={styles.mainColumn} style={{ maxWidth: 980 }} aria-busy={(loading && !status) || undefined}>
      <StatusStrip items={[
        { label: active ? 'Hiding is on' : 'Hiding is off', tone: active ? 'ok' : 'off' },
        { label: status?.installed ? 'HidHide installed' : 'Checking HidHide…', tone: status?.installed ? 'ok' : 'off' },
        { label: 'JSM still reads them', tone: status?.whitelistSynced ? 'ok' : 'warn' },
        { label: status?.whitelistSynced ? 'App list ready' : 'App list needs repair', tone: status?.whitelistSynced ? 'ok' : 'warn' },
      ]} />
      <SwitchRow label="Hide from games" hint={active ? 'Games see only what JSM sends, and the virtual controller' : 'Every controller below is visible to games, whatever it is set to'}
        on={status ? active : null} pending={busyKey === 'active'} disabled={locked ? undefined : undefined}
        onChange={next => void run('active', () => desktopBridge.setHidHideActive(next), next ? 'Hiding is on.' : 'Hiding is off.')} />

      <SettingsSection title="Controllers">
        <div className={styles.list}>
          {devices.length === 0 && !loading && <SettingsNote>No game controllers were found.</SettingsNote>}
          {devices.map(device => {
            const busy = busyKey === `device:${device.instanceId}`
            const externallyHidden = device.hidden && !device.managedByApp && !device.stale
            return (
              <div key={device.instanceId}>
                <button type="button" className={styles.card} data-hidhide-device={device.instanceId} aria-disabled={externallyHidden ? 'true' : undefined}
                  data-reason={externallyHidden ? 'Something else hid it. Change it in HidHide’s own app (Y).' : undefined}
                  data-hints={externallyHidden ? 'Y:Refresh, open HidHide…;B:Home' : `A:${action(device)};Y:Refresh, open HidHide…;B:Home`}
                  onClick={() => { if (!busy && !locked) toggleDevice(device) }}>
                  <span className={styles.cardArt} aria-hidden="true" dangerouslySetInnerHTML={{ __html: artFor(device) }} />
                  <span className={styles.cardText}>
                    <b className={styles.cardTitle}>{device.displayName}</b>
                    <span className={styles.cardSub}>{deviceSub(device)}{device.likelyCurrentController && !device.hidden ? ' · the one you’re holding' : ''}</span>
                    {changed === device.instanceId && <span className={styles.cardSub} role="status">After a change, reconnect it or restart Steam so it lets go.</span>}
                  </span>
                  <span className={styles.cardAction}>{busy ? 'Working…' : action(device)}</span>
                </button>
              </div>
            )
          })}
          {virtualName && (
            <div className={styles.card} style={{ cursor: 'default' }}>
              <span className={styles.cardArt} aria-hidden="true">JSM</span>
              <span className={styles.cardText}><b className={styles.cardTitle}>{virtualName}</b><span className={styles.cardSub}>Made by JSM · games are meant to see it</span></span>
              <span className={styles.tag}>Virtual</span>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={status?.inverse ? 'Apps they are hidden from' : 'Apps that can still see them'}>
        <div className={styles.list}>
          {appList.length === 0 && <SettingsNote>{status?.whitelistSynced ? 'Only JSM.' : 'JSM isn’t on HidHide’s list yet. Advanced repairs it.'}</SettingsNote>}
          {appList.map(app => (
            <div key={app.path} className={styles.card} style={{ cursor: 'default' }} data-hidhide-app={app.name}>
              <span className={styles.cardText}>
                <b className={styles.cardTitle}>{app.name.replace(/\.exe$/i, '')}</b>
                <span className={styles.cardSub}>{app.addedForYou
                  ? `${/joyshock/i.test(app.name) ? 'Reads them' : /jsm|evolved/i.test(app.name) ? 'Live view' : 'Part of JSM'} · added for you`
                  : app.steam ? 'Can see them too, so games may react twice. Change it in HidHide.' : 'Added in HidHide · can see them'}</span>
              </span>
              {app.steam && <span className={styles.tag} data-tone="warn">Steam</span>}
            </div>
          ))}
        </div>
      </SettingsSection>

      {(status?.inverse || ambiguous || external.length > 0 || stale.length > 0) && (
        <SettingsSection title="If something here looks different">
          {status?.inverse && <div className={styles.card} style={{ cursor: 'default' }}><span className={styles.cardText}><b className={styles.cardTitle}>HidHide blocks only listed apps</b><span className={styles.cardSub}>It’s set the other way round: “hidden” means hidden from the apps on its list. JSM keeps to that.</span></span></div>}
          {ambiguous && <div className={styles.card} style={{ cursor: 'default' }}><span className={styles.cardText}><b className={styles.cardTitle}>Two of the same controller</b><span className={styles.cardSub}>Which one you’re holding is a best guess.</span></span></div>}
          {external.map(device => <button key={device.instanceId} type="button" className={styles.card} data-hints="A:Open HidHide;B:Home" onClick={openHidHide}><span className={styles.cardText}><b className={styles.cardTitle}>Hidden by another app</b><span className={styles.cardSub}>{device.displayName}: something else hid it. Change it in HidHide’s app.</span></span><span className={styles.cardAction}>Open HidHide</span></button>)}
          {stale.map(device => <button key={device.instanceId} type="button" className={styles.card} data-hints="A:Clear old entry;B:Home" onClick={() => toggleDevice(device)}><span className={styles.cardText}><b className={styles.cardTitle}>Old entry · {device.displayName}</b><span className={styles.cardSub}>No longer connected; still set to hide</span></span><span className={styles.cardAction}>Clear old entry</span></button>)}
        </SettingsSection>
      )}

      <OpenRow label="Advanced" hint="Device paths, repair the app list, open HidHide" onOpen={() => setAdvanced(true)} hints="A:Open;Y:Refresh, open HidHide…;B:Home" />
      {error && <p role="alert" className={styles.note}>{error}</p>}

      <SubPage open={advanced} onClose={() => setAdvanced(false)} crumbRoot="Settings" trail={['Hide the real controller']} title="Advanced" backLabel="Back">
        <div className={styles.mainColumn} style={{ maxWidth: 980 }}>
          <SettingsNote>HidHide is the Windows driver that filters which apps can see a controller. Connected means Windows detects it, not that games can see it. Partly hidden means some of its interfaces are hidden and others are not. Hiding has to be on to take effect.</SettingsNote>
          <OpenRow label={status?.whitelistSynced ? 'App list ready' : 'Repair the app list'} hint="Puts JoyShockMapper and JSM Evolved on HidHide’s list so they can still read the controllers"
            onOpen={() => void run('whitelist', () => desktopBridge.syncHidHideWhitelist(), 'The app list is repaired.')} disabled={locked ? 'Working…' : undefined} hints="A:Repair;B:Back" />
          <OpenRow label="Open HidHide" hint="Its own app, for anything not here" onOpen={openHidHide} hints="A:Open;B:Back" />
          <OpenRow label="Refresh" hint="Read the driver again" onOpen={() => void refresh()} hints="A:Refresh;B:Back" />
          <SettingsSection title="Device paths">
            <dl className={styles.list} aria-label="Device interface paths">
              {devices.map(device => <div key={device.instanceId}><dt className={styles.cardTitle}>{device.displayName}</dt><dd className={`${styles.cardSub} ${styles.mono}`} style={{ margin: 0 }}>{device.instanceId}</dd></div>)}
            </dl>
          </SettingsSection>
        </div>
      </SubPage>

      <SubPage open={menuOpen} onClose={() => setMenuOpen(false)} crumbRoot="Settings" trail={['Hide the real controller']} title="More" backLabel="Back">
        <div className={styles.mainColumn} style={{ maxWidth: 640 }}>
          <OpenRow label="Refresh" hint="Read the driver again" onOpen={() => { setMenuOpen(false); void refresh() }} hints="A:Refresh;B:Back" />
          <OpenRow label="Open HidHide" hint="Its own app" onOpen={() => { setMenuOpen(false); openHidHide() }} hints="A:Open;B:Back" />
          <OpenRow label="Advanced" hint="Device paths, repair the app list" onOpen={() => { setMenuOpen(false); setAdvanced(true) }} hints="A:Open;B:Back" />
        </div>
      </SubPage>
    </div>
  )
}
