import { useRef, useState } from 'react'
import { desktopBridge, type SoundEntry } from '../platform/desktopBridge'
import { useSoundLibrary } from '../hooks/useSoundLibrary'
import { showToast } from '../utils/toast'
import { refreshPreferences } from '../platform/preferenceStore'
import { Dialog } from './ui/Dialog'
import { SoundTrimEditor } from './SoundTrimEditor'
import { MidiTrimEditor } from './MidiTrimEditor'
import { isMidi, parseMidi } from '../utils/midiTones'
import { SoundPreviewVolume } from './SoundPreviewVolume'

const base64FromFile = async (file: File) => {
  const data = new Uint8Array(await file.arrayBuffer())
  if (isMidi(data)) parseMidi(data)
  else if (/\.midi?$/i.test(file.name)) throw new Error('This file is not a Standard MIDI file.')
  let binary = ''
  for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768))
  return btoa(binary)
}

export function SoundLibraryDialog({ onClose }: { onClose: () => void }) {
  const { sounds, refresh } = useSoundLibrary()
  const [editing, setEditing] = useState<SoundEntry | null>(null)
  const [renaming, setRenaming] = useState<SoundEntry | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleting, setDeleting] = useState<SoundEntry | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewGain, setPreviewGain] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const load = () => void refresh().catch(error => showToast(String(error), 'error'))

  const add = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) { showToast('Sound files must be 25 MB or smaller.', 'error'); return }
    setBusy(true)
    try {
      const name = file.name.replace(/\.(mp3|mid|midi)$/i, '').trim().slice(0, 60)
      const entry = await desktopBridge.soundLibraryImport(name, await base64FromFile(file))
      load()
      setEditing(entry)
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }

  const rename = async () => {
    if (!renaming) return
    const name = renameDraft.trim()
    if (!name || name === renaming.name) { setRenaming(null); return }
    setActionBusy(true)
    try { await desktopBridge.soundLibraryRename(renaming.id, name); setRenaming(null); load() }
    catch (error) { showToast(String(error), 'error') }
    finally { setActionBusy(false) }
  }
  const remove = async () => {
    if (!deleting) return
    setActionBusy(true)
    try { await desktopBridge.soundLibraryDelete(deleting.id); setDeleting(null); load(); void refreshPreferences() }
    catch (error) { showToast(String(error), 'error') }
    finally { setActionBusy(false) }
  }
  const preview = async (entry: SoundEntry) => {
    try {
      const result = await desktopBridge.playControllerSound(0, previewGain, entry.id)
      if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
    } catch (error) { showToast(String(error), 'error') }
  }

  return <>
    <Dialog title="Your controller sounds" eyebrow="Sound library" width={760} className="sound-dialog" onClose={onClose}
      actions={<button type="button" className="button button--primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Importing…' : 'Add MP3 or MIDI'}</button>}>
      <input ref={input} type="file" accept=".mp3,.mid,.midi,audio/mpeg,audio/midi,audio/x-midi" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void add(file) }} />
      <p className="prefs-note">Add MIDI for clean musical notes, or MP3 to extract a melody. Choose a short section for the controller to play.</p>
      {sounds.some(entry => entry.ready) && <SoundPreviewVolume gain={previewGain} onChange={setPreviewGain} />}
      {sounds.length === 0 && <p>No sounds added yet.</p>}
      {sounds.map(entry => <div className="sound-library-entry" key={entry.id}>
        <span className="sound-library-entry__name"><strong>{entry.name}</strong><small>{entry.ready ? `${((entry.trimEndMs ?? 0) - (entry.trimStartMs ?? 0)) / 1000}s · ${entry.noteCount ?? 0} tones` : 'Needs trimming'}</small></span>
        <div className="sound-library-entry__actions">
          <button type="button" className="button button--secondary" onClick={() => setEditing(entry)}>{entry.ready ? 'Trim again' : 'Trim'}</button>
          <button type="button" className="button button--secondary" onClick={() => { setRenameDraft(entry.name); setRenaming(entry) }}>Rename</button>
          <button type="button" className="button button--secondary" disabled={!entry.ready} onClick={() => void preview(entry)}>Preview on controller</button>
          <button type="button" className="button button--danger" onClick={() => setDeleting(entry)}>Delete</button>
        </div>
      </div>)}
    </Dialog>
    {renaming && <Dialog title="Rename sound" eyebrow="Sound library" width={440} className="sound-dialog" onClose={() => { if (!actionBusy) setRenaming(null) }}
      actions={<><button type="button" className="button button--secondary" data-modal-close disabled={actionBusy} onClick={() => setRenaming(null)}>Cancel</button>
        <button type="button" className="button button--primary" disabled={actionBusy || !renameDraft.trim()} onClick={() => void rename()}>{actionBusy ? 'Saving…' : 'Save name'}</button></>}>
      <div className="sound-rename-field">
        <label htmlFor="sound-rename-name">Sound name</label>
        <input id="sound-rename-name" className="text-field" autoFocus maxLength={60} value={renameDraft} disabled={actionBusy}
          onChange={event => setRenameDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && renameDraft.trim() && !actionBusy) { event.preventDefault(); void rename() } }} />
      </div>
    </Dialog>}
    {deleting && <Dialog title={`Delete ${deleting.name}?`} eyebrow="Sound library" width={440} className="sound-dialog" onClose={() => { if (!actionBusy) setDeleting(null) }}
      actions={<><button type="button" className="button button--secondary" data-modal-close disabled={actionBusy} onClick={() => setDeleting(null)}>Cancel</button>
        <button type="button" className="button button--danger-solid" disabled={actionBusy} onClick={() => void remove()}>{actionBusy ? 'Deleting…' : 'Delete sound'}</button></>}>
      <p>Bindings to this sound will no longer play it. This cannot be undone.</p>
    </Dialog>}
    {editing && (editing.sourceFormat === 'midi'
      ? <MidiTrimEditor sound={editing} previewGain={previewGain} onPreviewGainChange={setPreviewGain} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      : <SoundTrimEditor sound={editing} previewGain={previewGain} onPreviewGainChange={setPreviewGain} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />)}
  </>
}
