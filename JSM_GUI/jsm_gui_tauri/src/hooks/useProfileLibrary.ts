import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type NamedProfile } from '../platform/desktopBridge'
import { ensureHeaderLines, sanitizeImportedConfig } from '../utils/config'
import { parseConfigText, serializeConfig } from '../utils/configSerializer'
import { showToast } from '../utils/toast'

type Options = { textOverride?: string; profileNameOverride?: string; profilePathOverride?: string; normalize?: boolean }
type Params = {
  configText: string
  resetConfigHistory: (text: string) => void
  setConfigText: (text: string) => void
  setAppliedConfig: (text: string) => void
  setStatusMessage: (text: string | null) => void
  resetPendingSensitivityChanges: () => void
}

// The editor baseline is the saved file. Only Apply changes the runtime.
export function useProfileLibrary({ resetConfigHistory, configText, setConfigText, setAppliedConfig, setStatusMessage, resetPendingSensitivityChanges }: Params) {
  const { t } = useTranslation()
  const [libraryProfiles, setLibraryProfiles] = useState<string[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [editedLibraryNames, setEditedLibraryNames] = useState<Record<string, string>>({})
  const [currentLibraryProfile, setCurrentLibraryProfile] = useState<string | null>(null)
  const [activeProfilePath, setActiveProfilePath] = useState('')
  const [runtimeConfig, setRuntimeConfig] = useState<string | null>(null)
  const [appliedProfileName, setAppliedProfileName] = useState<string | null>(null)
  const drafts = useRef(new Map<string, string>())
  const selection = useRef(0)
  const editor = useRef({ configText, currentLibraryProfile })
  editor.current = { configText, currentLibraryProfile }

  const report = (message: string, error = false) => {
    setStatusMessage(message)
    showToast(message, error ? 'error' : undefined)
  }
  // Shared by the on-demand refresh and the watcher push, so a pushed list lands
  // exactly like a fetched one -- in particular it keeps a rename the user is
  // halfway through typing instead of snapping the field back to the name on disk.
  const applyLibraryProfileList = useCallback((names: string[]) => {
    setLibraryProfiles(names)
    setEditedLibraryNames(prev => Object.fromEntries(names.map(name => [name, prev[name] ?? name])))
    return names
  }, [])
  const refreshLibraryProfiles = useCallback(async () => {
    setIsLibraryLoading(true)
    try {
      return applyLibraryProfileList(await desktopBridge.listLibraryProfiles())
    } finally { setIsLibraryLoading(false) }
  }, [applyLibraryProfileList])
  // Profiles that appear without the app's help: a .txt copied into the folder
  // by hand, one deleted outside the app, or a sync client.
  useEffect(() => desktopBridge.onLibraryProfilesChanged(applyLibraryProfileList), [applyLibraryProfileList])
  const selectProfile = useCallback((profile: NamedProfile) => {
    const previous = editor.current
    if (previous.currentLibraryProfile) drafts.current.set(previous.currentLibraryProfile, previous.configText)
    resetPendingSensitivityChanges()
    setCurrentLibraryProfile(profile.name)
    setActiveProfilePath(profile.path)
    resetConfigHistory(drafts.current.get(profile.name) ?? profile.content)
    setAppliedConfig(profile.content)
  }, [resetPendingSensitivityChanges, setAppliedConfig, resetConfigHistory])
  useEffect(() => {
    const request = selection.current
    void refreshLibraryProfiles()
    void desktopBridge.getActiveProfile().then(profile => {
      if (!profile) return
      setAppliedProfileName(profile.name)
      if (selection.current === request) selectProfile(profile)
    })
  }, [refreshLibraryProfiles, selectProfile])

  const handleLoadProfileFromLibrary = async (name: string) => {
    const request = ++selection.current
    const profile = await desktopBridge.loadLibraryProfile(name)
    if (!profile) { report(t('messages.loadProfileFailed'), true); return null }
    if (request === selection.current) selectProfile({ ...profile, path: `profiles-library/${profile.name}.txt` })
    return profile.content
  }
  const finishSave = (name: string | null, text: string, source: string) => {
    if (name && drafts.current.get(name) === source) drafts.current.delete(name)
    // A slow disk write must not replace a different profile selected meanwhile,
    // or erase additional edits made while the save was in flight.
    if (editor.current.currentLibraryProfile !== name) return
    if (editor.current.configText === source) setConfigText(text)
    setAppliedConfig(text)
  }
  const saveConfig = async (options?: Options) => {
    const text = serializeConfig(parseConfigText(ensureHeaderLines(options?.textOverride ?? configText)))
    const name = options?.profileNameOverride ?? currentLibraryProfile
    if (!name) { report(t('messages.saveProfileNoTarget'), true); return false }
    const result = await desktopBridge.saveLibraryProfile(name, text)
    if (!result) { report(t('messages.saveProfileFailed'), true); return false }
    finishSave(name, text, options?.textOverride ?? configText)
    report(t('messages.profileSaved', { profileName: result.name }))
    return true
  }
  const applyConfig = async (options?: Options) => {
    const text = serializeConfig(parseConfigText(ensureHeaderLines(options?.textOverride ?? configText)))
    try {
      const profileName = options?.profileNameOverride ?? currentLibraryProfile
      // Apply the configuration being edited, by name. Falling back to
      // activeProfilePath alone let a stale or empty path apply -- and keep
      // the runtime pointed at -- whichever profile was active before, which
      // is why the runtime kept reporting the previous configuration.
      const path =
        options?.profilePathOverride ||
        (profileName ? `profiles-library/${profileName}.txt` : activeProfilePath)
      await desktopBridge.applyProfile(path, text)
      if (path) setActiveProfilePath(path)
      setRuntimeConfig(text)
      setAppliedProfileName(profileName)
      report(t('messages.profileApplied', { profileName: profileName ?? t('app.profileSummary.unsavedProfile') }))
    } catch (error) {
      // The backend's own message named the failing path; swallowing it left
      // "Failed to apply keymap." as the only clue that Apply was rejecting
      // every write outright.
      const reason = error instanceof Error ? error.message : String(error ?? '')
      report(reason ? `${t('messages.applyKeymapFailed')} ${reason}` : t('messages.applyKeymapFailed'), true)
    }
  }
  const handleCreateProfile = async () => {
    const request = ++selection.current
    const profile = await desktopBridge.createLibraryProfile()
    if (!profile) { report(t('messages.createProfileFailed'), true); return }
    if (selection.current === request) selectProfile(profile)
    await refreshLibraryProfiles()
  }
  const handleRenameProfile = async (name: string) => {
    let result: Awaited<ReturnType<typeof desktopBridge.renameLibraryProfile>>
    try {
      result = await desktopBridge.renameLibraryProfile(name, editedLibraryNames[name] ?? name)
    } catch (error) {
      report(`${t('messages.renameProfileFailed')} ${String(error)}`.trim(), true)
      return
    }
    if (!result) { report(t('messages.renameProfileFailed'), true); return }
    const draft = drafts.current.get(name)
    if (draft !== undefined) { drafts.current.delete(name); drafts.current.set(result.name, draft) }
    if (editor.current.currentLibraryProfile === name) {
      setCurrentLibraryProfile(result.name)
      setActiveProfilePath(result.path)
    }
    if (appliedProfileName === name) setAppliedProfileName(result.name)
    await refreshLibraryProfiles()
    report(t('messages.profileRenamed', { name: result.name }))
  }
  const handleDeleteLibraryProfile = async (name: string) => {
    const result = await desktopBridge.deleteLibraryProfile(name)
    if (!result.success) { report(t('messages.deleteProfileInUse'), true); return }
    drafts.current.delete(name)
    const names = await refreshLibraryProfiles()
    if (name === editor.current.currentLibraryProfile) {
      // Do not preserve the deleted editor as a draft.
      editor.current.currentLibraryProfile = null
      if (names[0]) await handleLoadProfileFromLibrary(names[0])
      else { setCurrentLibraryProfile(null); setConfigText(''); setAppliedConfig(''); setActiveProfilePath('') }
    }
    report(t('messages.profileDeleted', { profileName: name }))
  }
  const handleImportProfile = async (fileName: string, content: string) => {
    const profile = await desktopBridge.createLibraryProfile(fileName.replace(/\.[^/.]+$/, ''))
    if (!profile) { report(t('messages.importProfileFailed'), true); return }
    const result = await desktopBridge.saveLibraryProfile(profile.name, sanitizeImportedConfig(content))
    if (!result) { report(t('messages.importProfileFailed'), true); return }
    await refreshLibraryProfiles()
    await handleLoadProfileFromLibrary(profile.name)
    report(t('messages.profileImported', { profileName: profile.name }))
  }
  const handleCopyActiveProfile = async () => {
    const profile = await desktopBridge.copyActiveProfile()
    if (profile) { ++selection.current; selectProfile(profile); await refreshLibraryProfiles(); report(t('messages.profileCopied', { profileName: profile.name })) }
    else report(t('messages.copyProfileFailed'), true)
    return profile
  }
  return {
    libraryProfiles, isLibraryLoading, editedLibraryNames, currentLibraryProfile, activeProfilePath,
    appliedProfileName, runtimeConfig, refreshLibraryProfiles, applyConfig, saveConfig, handleLoadProfileFromLibrary,
    handleLibraryProfileNameChange: (name: string, value: string) => setEditedLibraryNames(prev => ({ ...prev, [name]: value })),
    handleCreateProfile, handleRenameProfile, handleDeleteLibraryProfile, handleImportProfile, handleCopyActiveProfile,
  }
}
