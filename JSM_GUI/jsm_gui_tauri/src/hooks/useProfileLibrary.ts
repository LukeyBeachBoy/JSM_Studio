import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type NamedProfile } from '../platform/desktopBridge'
import { ensureHeaderLines, sanitizeImportedConfig } from '../utils/config'
import { parseConfigText, serializeConfig } from '../utils/configSerializer'
import { showToast } from '../utils/toast'
import { OperationCancelled, runLongOperation, throwIfCancelled } from '../components/LongOperation'
import { loadConfigBindingValue } from '../utils/loadConfigBinding'
import type { SteamConversion } from '../utils/steamLayout'

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
  const selectProfile = useCallback((profile: NamedProfile, discardPrevious = false) => {
    const previous = editor.current
    if (previous.currentLibraryProfile) {
      if (discardPrevious) drafts.current.delete(previous.currentLibraryProfile)
      else drafts.current.set(previous.currentLibraryProfile, previous.configText)
    }
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

  const handleLoadProfileFromLibrary = async (name: string, discardPrevious = false) => {
    const request = ++selection.current
    const profile = await desktopBridge.loadLibraryProfile(name)
    if (!profile) { report(t('messages.loadProfileFailed'), true); return null }
    if (request === selection.current) selectProfile({ ...profile, path: `profiles-library/${profile.name}.txt` }, discardPrevious)
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
  // Behind the progress dialog (System States 17f): each step says what it is
  // doing, and Cancel before the file is opened takes the new copy back out.
  const handleImportProfile = async (fileName: string, content: string) => {
    const baseName = fileName.replace(/\.[^/.]+$/, '')
    const sanitized = sanitizeImportedConfig(content)
    const lineCount = sanitized.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).length
    let created: string | null = null
    try {
      await runLongOperation(`Importing ${baseName}…`, async ({ progress, signal }) => {
        progress(0.1, 'Creating the configuration')
        const profile = await desktopBridge.createLibraryProfile(baseName)
        if (!profile) { report(t('messages.importProfileFailed'), true); return }
        created = profile.name
        throwIfCancelled(signal)
        progress(0.4, `Writing ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`)
        const result = await desktopBridge.saveLibraryProfile(profile.name, sanitized)
        if (!result) { report(t('messages.importProfileFailed'), true); return }
        throwIfCancelled(signal)
        progress(0.7, 'Updating the library')
        await refreshLibraryProfiles()
        throwIfCancelled(signal)
        progress(0.9, `Opening ${profile.name}`)
        await handleLoadProfileFromLibrary(profile.name)
        progress(1)
        report(t('messages.profileImported', { profileName: profile.name }))
      }, { cancellable: true })
    } catch (error) {
      if (!(error instanceof OperationCancelled)) throw error
      if (created) await desktopBridge.deleteLibraryProfile(created)
      await refreshLibraryProfiles()
      report(`Import of ${baseName} cancelled.`)
    }
  }
  // A Steam layout can become several configurations: one per action set, each
  // loading the others by name. The library picks the final names (it may add
  // a number to avoid a clash), so every file is created first and the
  // references are rewritten to the names it chose before anything is written.
  const handleImportSteamLayout = async (conversion: SteamConversion) => {
    const created: string[] = []
    try {
      await runLongOperation(`Importing ${conversion.title}…`, async ({ progress, signal }) => {
        const names = new Map<string, string>()
        for (const [index, set] of conversion.sets.entries()) {
          progress(0.1 + 0.3 * (index / conversion.sets.length), `Creating ${set.name}`)
          const profile = await desktopBridge.createLibraryProfile(set.name)
          if (!profile) { report(t('messages.importProfileFailed'), true); return }
          created.push(profile.name)
          names.set(set.name, profile.name)
          throwIfCancelled(signal)
        }
        for (const [index, set] of conversion.sets.entries()) {
          progress(0.4 + 0.3 * (index / conversion.sets.length), `Writing ${names.get(set.name)}`)
          let text = set.text
          for (const [planned, actual] of names) {
            if (planned !== actual) text = text.split(loadConfigBindingValue(planned)).join(loadConfigBindingValue(actual))
          }
          const result = await desktopBridge.saveLibraryProfile(names.get(set.name)!, serializeConfig(parseConfigText(ensureHeaderLines(text))))
          if (!result) { report(t('messages.importProfileFailed'), true); return }
          throwIfCancelled(signal)
        }
        progress(0.8, 'Updating the library')
        await refreshLibraryProfiles()
        throwIfCancelled(signal)
        const main = names.get(conversion.sets[0].name)!
        progress(0.9, `Opening ${main}`)
        await handleLoadProfileFromLibrary(main)
        progress(1)
        report(t('messages.profileImported', { profileName: main }))
      }, { cancellable: true })
    } catch (error) {
      if (!(error instanceof OperationCancelled)) throw error
      for (const name of created) await desktopBridge.deleteLibraryProfile(name)
      await refreshLibraryProfiles()
      report(`Import of ${conversion.title} cancelled.`)
    }
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
    handleCreateProfile, handleRenameProfile, handleDeleteLibraryProfile, handleImportProfile, handleImportSteamLayout, handleCopyActiveProfile,
  }
}
