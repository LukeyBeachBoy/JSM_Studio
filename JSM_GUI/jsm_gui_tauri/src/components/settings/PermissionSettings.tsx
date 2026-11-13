import { useEffect, useState } from 'react'
import { permissionBridge, type PermissionStatus } from '../../platform/permissionBridge'
import { showToast } from '../../utils/toast'
import { Dialog } from '../ui/Dialog'
import { OpenRow } from '../ui/console'
import { SettingsNote, SettingsSection, SwitchRow } from './SettingsKit'

export function PermissionSettings({ hasPendingChanges = false }: { hasPendingChanges?: boolean }) {
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [confirmSignIn, setConfirmSignIn] = useState(false)
  useEffect(() => {
    let active = true
    void permissionBridge.status().then(value => { if (active) setStatus(value) }).catch(error => { if (active) showToast(String(error), 'error') })
    return () => { active = false }
  }, [])
  const restart = async () => {
    if (hasPendingChanges || busy) return
    setBusy(true)
    try { await permissionBridge.restart() } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false); setConfirm(false) }
  }
  const saveSignIn = async (enabled: boolean) => {
    if (!status || busy) return
    setBusy(true)
    try {
      setStatus(await permissionBridge.setWindowsSignIn(enabled))
      setConfirmSignIn(false)
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false) }
  }
  return <><SettingsSection title="Administrator access" note={status?.elevated ? 'This session is running as administrator' : 'Normal access is recommended'}>
    <SettingsNote>Most games work with normal access. Changing HidHide settings or sending input to a game running as administrator may need approval. Driver installation has its own Windows prompt.</SettingsNote>
    <SwitchRow label="Request admin on launch" hint="Off by default. A fresh manual launch asks Windows for permission; starting with Windows stays normal."
      on={status?.requestAdminOnLaunch ?? null} pending={busy}
      onChange={async requestAdminOnLaunch => {
        if (!status) return
        setBusy(true)
        try { setStatus(await permissionBridge.save({ requestAdminOnLaunch, introductionSeen: status.introductionSeen })) }
        catch (error) { showToast(String(error), 'error') } finally { setBusy(false) }
      }} />
    {status?.legacyStartupTask && <SettingsNote>An older version created an administrator startup task. Restart as administrator once to migrate it to normal startup for this Windows account.</SettingsNote>}
    <OpenRow label="Restart as administrator" hint="Windows asks for approval. Mapping pauses briefly during the restart."
      disabled={!status ? 'Loading permission settings…' : status.elevated ? 'Already running as administrator' : hasPendingChanges ? 'Save or discard your configuration changes before restarting' : busy ? 'Waiting for Windows…' : undefined}
      onOpen={() => setConfirm(true)} />
    {status?.elevated && <SettingsNote>To return to normal access, turn off Request admin on launch, quit from the tray, then open JSM Evolved normally.</SettingsNote>}
    {confirm && <Dialog className="permission-dialog" title="Restart with administrator access?" width={560} onClose={() => { if (!busy) setConfirm(false) }}
      actions={<><button className="button button--secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button className="button button--primary" disabled={busy || hasPendingChanges} onClick={() => void restart()}>Restart and ask Windows</button></>}>
      <p>Use this for HidHide setup or games that need elevated input. Windows will ask you to approve the restart. If you cancel that prompt, this session keeps running.</p>
      <p>Use the same Windows account. Entering a different administrator account opens that account’s separate profiles and settings.</p>
    </Dialog>}
  </SettingsSection>
  <SettingsSection title="Windows sign-in" note="Optional · off by default">
    <SwitchRow label="Controller input on the Windows lock screen"
      hint="Requires FakerInput and JSM Evolved running in your account. Installing the driver does not enable this."
      on={status?.windowsSignInEnabled ?? null} pending={busy}
      onChange={enabled => { if (!status || busy) return; if (enabled) setConfirmSignIn(true); else void saveSignIn(false) }} />
    <SettingsNote>Use the Windows Sign-in configuration in Library to review the button reference. Enter your PIN yourself; it is never saved. Turning this off stops sign-in input and its power-off shortcut within a moment, without restarting.</SettingsNote>
    {confirmSignIn && <Dialog className="permission-dialog" title="Allow controller input on the lock screen?" width={600}
      onClose={() => { if (!busy) setConfirmSignIn(false) }}
      actions={<><button className="button button--secondary" disabled={busy} onClick={() => setConfirmSignIn(false)}>Cancel</button><button className="button button--primary" disabled={busy} onClick={() => void saveSignIn(true)}>Enable Windows sign-in input</button></>}>
      <p>While Windows is locked, your controller can send digits, Enter, Backspace and Escape through FakerInput. On a supported Steam Controller, Quick Access + Y can also turn the controller off after release.</p>
      <p>This does not store your PIN or sign you in automatically. Anyone holding the controller can press these buttons. It requires the optional FakerInput driver, which is installed separately.</p>
      <p>You can turn this off at any time in <strong>Settings → Startup → Windows sign-in</strong>. Ordinary game mapping does not require it.</p>
    </Dialog>}
  </SettingsSection></>
}

export function PermissionIntroduction({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void permissionBridge.status().then(value => { if (active) setStatus(value) }).catch(error => { if (active) showToast(`Could not load permission preferences: ${String(error)}`, 'error') })
    return () => { active = false }
  }, [])
  const finish = async (openSettings: boolean) => {
    if (!status || busy) return
    setBusy(true)
    try {
      setStatus(await permissionBridge.save({ requestAdminOnLaunch: status.requestAdminOnLaunch, introductionSeen: true }))
      if (openSettings) onOpenSettings()
    } catch (error) { showToast(String(error), 'error') } finally { setBusy(false) }
  }
  if (!status || status.introductionSeen) return null
  return <Dialog className="permission-dialog" title="Welcome to JSM Evolved" width={600} onClose={() => void finish(false)}
    actions={<><button type="button" className="button button--primary" data-autofocus="" disabled={busy} onClick={() => void finish(false)}>Get started</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => void finish(true)}>Startup settings</button></>}>
    <ol style={{ margin: 0, padding: '0 24px 16px 48px', display: 'grid', gap: 16 }}>
      <li><strong>Connect your controller.</strong> Keep it nearby while you set up.</li>
      <li><strong>Pick a game.</strong> Choose New for a game on Home or import a layout.</li>
      <li><strong>Try it.</strong> See what each button sends, then change anything you like.</li>
    </ol>
    <p>Normal Windows access works for most games. Administrator access, optional drivers and lock-screen input are explained in <strong>Settings → Startup</strong>.</p>
    {status.elevated && <p>This session was opened as administrator. Quit from the tray and reopen normally to use normal access.</p>}
  </Dialog>
}
