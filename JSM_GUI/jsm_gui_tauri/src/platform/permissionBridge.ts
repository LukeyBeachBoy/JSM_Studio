export type PermissionStatus = {
  elevated: boolean
  legacyStartupTask: boolean
  requestAdminOnLaunch: boolean
  introductionSeen: boolean
  windowsSignInEnabled: boolean
}
export type PermissionPreferences = Pick<PermissionStatus, 'requestAdminOnLaunch' | 'introductionSeen'>

const isDesktop = () => '__TAURI_INTERNALS__' in window
const key = 'jsm-permissions-preview'
const preview = (): PermissionStatus => {
  const defaults: PermissionStatus = { elevated: false, legacyStartupTask: false, requestAdminOnLaunch: false, windowsSignInEnabled: false, introductionSeen: !new URLSearchParams(location.search).has('onboarding') }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return defaults }
}
export const permissionBridge = {
  async status(): Promise<PermissionStatus> {
    if (!isDesktop()) return preview()
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('permission_status')
  },
  async save(preferences: PermissionPreferences): Promise<PermissionStatus> {
    if (!isDesktop()) { localStorage.setItem(key, JSON.stringify({ ...preview(), ...preferences })); return preview() }
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('save_permission_preferences', { preferences })
  },
  async setWindowsSignIn(enabled: boolean): Promise<PermissionStatus> {
    if (!isDesktop()) { localStorage.setItem(key, JSON.stringify({ ...preview(), windowsSignInEnabled: enabled })); return preview() }
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('set_windows_sign_in_enabled', { enabled })
  },
  async restart(): Promise<void> {
    if (!isDesktop()) throw new Error('Administrator restart is available in the Windows app.')
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('restart_as_administrator')
  },
}
