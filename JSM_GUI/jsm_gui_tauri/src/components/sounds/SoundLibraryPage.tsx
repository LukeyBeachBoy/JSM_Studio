import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SubPage, OpenRow, SegmentedRow, ValueRow } from '../ui/console'
import { Sheet } from '../ui/Sheet'
import { desktopBridge, type SoundEntry } from '../../platform/desktopBridge'
import { useSoundLibrary } from '../../hooks/useSoundLibrary'
import { refreshPreferences } from '../../platform/preferenceStore'
import { useControllerPreferences } from '../ControllerPreferences'
import { BUILT_IN_SOUNDS, SOUND_GAIN_MIN_DB } from '../../utils/controllerSounds'
import { controllerOctaveShift, isMidi, midiToTones, parseMidi, preferredMidiTrack, synthesizeTones, type MidiSong } from '../../utils/midiTones'
import { DEFAULT_SELECTION_MS, TONE_FILE_MAX_TOTAL_MS } from '../../utils/toneArrangement'
import { extractToneSequence } from '../../utils/toneExtraction'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { requestValueEntry } from '../../nav/textEntry'
import { showToast } from '../../utils/toast'
import { SoundPreviewVolume } from '../SoundPreviewVolume'
import { Icon } from '../icons/Icon'
import styles from './Sounds.module.css'

// The sound library (console v2, SoundLibrary.dc.html): every sound on a rail
// (LT/RT), the open one's editor beside it, all on the pad -- ◂ ▸ move the
// marker, A switches start and end, holding ◂ ▸ (or Shift) is the 0.01 s step,
// X plays it on the controller, ☰ saves it, Y renames or deletes. MP3 and MIDI
// share the editor; MIDI adds the track and a scrub of the whole selection.

const MIN_SELECTION_MS = 40
const seconds = (ms: number) => (ms / 1000).toFixed(2)
const base64FromFile = async (file: File) => {
  const data = new Uint8Array(await file.arrayBuffer())
  if (isMidi(data)) parseMidi(data)
  else if (/\.midi?$/i.test(file.name)) throw new Error('This file is not a Standard MIDI file.')
  let binary = ''
  for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768))
  return btoa(binary)
}
const statusOf = (entry: SoundEntry) => `${entry.sourceFormat === 'midi' ? 'MIDI' : 'MP3'} · ${entry.ready ? `${(((entry.trimEndMs ?? 0) - (entry.trimStartMs ?? 0)) / 1000).toFixed(1)} s · ready` : 'needs trimming'}`

type Props = {
  onClose: () => void
  /** Where it was opened from: "Light & sounds", or Settings ▸ Controller. */
  crumbRoot?: string
  trail?: string[]
  onOpenSettings?: () => void
}

export function SoundLibraryPage({ onClose, crumbRoot, trail, onOpenSettings }: Props) {
  const { sounds, refresh } = useSoundLibrary()
  const { prefs, update } = useControllerPreferences()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [previewGain, setPreviewGain] = useState(0)
  const [more, setMore] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [choosing, setChoosing] = useState<null | 'connect' | 'shutdown'>(null)
  const input = useRef<HTMLInputElement>(null)
  const rail = useRef<HTMLElement>(null)
  const sound = sounds.find(entry => entry.id === selected) ?? sounds[0]
  const load = () => void refresh().catch(error => showToast(String(error), 'error'))
  const root = crumbRoot ?? (trail ? trail[0] : 'Settings')
  const rest = crumbRoot ? trail ?? [] : (trail ?? ['Controller']).slice(1)

  const add = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) { showToast('Sound files must be 25 MB or smaller.', 'error'); return }
    setBusy(true)
    try {
      const name = file.name.replace(/\.(mp3|mid|midi)$/i, '').trim().slice(0, 60)
      const entry = await desktopBridge.soundLibraryImport(name, await base64FromFile(file))
      await refresh()
      setSelected(entry.id)
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const rename = (entry: SoundEntry) => requestValueEntry({
    title: `Rename ${entry.name}`, eyebrow: 'Sound library · Rename', value: entry.name, hint: 'Up to 60 characters. Shown wherever the sound is chosen.',
    onDone: async value => {
      const name = value.trim().slice(0, 60)
      if (!name || name === entry.name) return
      try { await desktopBridge.soundLibraryRename(entry.id, name); load() } catch (error) { showToast(String(error), 'error') }
    },
  })
  const remove = async (entry: SoundEntry) => {
    try { await desktopBridge.soundLibraryDelete(entry.id); setDeleting(false); setMore(false); setSelected(null); load(); void refreshPreferences() }
    catch (error) { showToast(String(error), 'error') }
  }
  const step = (by: -1 | 1) => {
    if (!sounds.length) return
    const index = Math.max(0, sounds.findIndex(entry => entry.id === sound?.id))
    const next = sounds[Math.min(sounds.length - 1, Math.max(0, index + by))]
    setSelected(next.id)
    requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(`[data-sound-id="${CSS.escape(next.id)}"]`)?.focus({ preventScroll: true }))
  }
  // Y on a sound in the rail: its More (rename, delete).
  useEffect(() => {
    const node = rail.current
    if (!node) return
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button !== 'Y') return
      const id = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-sound-id]')?.dataset.soundId
      if (!id) return
      event.preventDefault(); setSelected(id); setMore(true)
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])
  const names = new Map(sounds.map(entry => [entry.id, entry.name]))
  const plays = (index: number, file: string | null) => file ? names.get(file) ?? 'Your sound' : index >= 0 ? `${BUILT_IN_SOUNDS[index] ?? `Tune ${index}`} · built in` : 'Nothing'

  return (
    <SubPage open onClose={onClose} crumbRoot={root} trail={rest} title="Sound library" badge="For every configuration" stepLabel="Sound" onStep={step}
      where={`Sound library${sound ? ` · ${sound.name} · Trim` : ''}`}>
      <input ref={input} type="file" accept=".mp3,.mid,.midi,audio/mpeg,audio/midi,audio/x-midi" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void add(file) }} />
      <div className={styles.page}>
        <nav ref={rail} className={styles.rail} aria-label="Your controller sounds">
          <span className={styles.railKeys} aria-hidden="true"><span className={styles.key}>LT</span>Sound<span className={styles.key}>RT</span></span>
          {sounds.map(entry => <button key={entry.id} type="button" className={`${styles.snd} sound-library-entry`} data-sound-id={entry.id} aria-current={sound?.id === entry.id ? 'true' : undefined}
            data-hints="A:Edit;Y:More;LT/RT:Sound;B:Back" data-caption={`${entry.name} · ${statusOf(entry)}`}
            onClick={() => setSelected(entry.id)} onFocus={() => setSelected(entry.id)}>
            <span className={styles.thumb} data-ready={entry.ready ? 'true' : undefined} aria-hidden="true"><Icon name={entry.ready ? 'haptic' : 'warning'} size={18} /></span>
            <span className={styles.sndText}><b>{entry.name}</b><small data-ready={entry.ready ? 'true' : undefined}>{statusOf(entry)}</small></span>
          </button>)}
          {!sounds.length && <p className={styles.note}>No sounds added yet. Add a short MIDI tune for clean notes, or an MP3 to take a melody from.</p>}
          <button type="button" className={`${styles.snd} ${styles.add}`} aria-label="Add MP3 or MIDI" data-hints="A:Choose a file;B:Back" disabled={busy} onClick={() => input.current?.click()}>
            <span className={styles.thumb} aria-hidden="true"><Icon name="add" size={18} /></span>
            <span className={styles.sndText}><b>{busy ? 'Importing…' : 'Add MP3 or MIDI'}</b><small>Up to 25 MB</small></span>
          </button>
          <span className={styles.eyebrow}>The controller plays</span>
          <button type="button" className={styles.cs} data-hints="A:Choose;B:Back" onClick={() => setChoosing('connect')}><small>When it connects</small><b>● {plays(prefs.connectSound, prefs.connectSoundFile)}</b></button>
          <button type="button" className={styles.cs} data-hints="A:Choose;B:Back" onClick={() => setChoosing('shutdown')}><small>Before it turns off</small><b>● {plays(prefs.shutdownSound, prefs.shutdownSoundFile)}</b></button>
          <p className={styles.note}>Its own power-on jingle still plays first. {onOpenSettings ? <button type="button" className={styles.link} data-hints="A:Open Settings;B:Back" onClick={onOpenSettings}>Settings ▸ Controller</button> : 'Settings ▸ Controller'}</p>
        </nav>
        <section className={styles.main} aria-label={sound?.name ?? 'Sound'}>
          {sound ? <SoundEditor key={sound.id} sound={sound} previewGain={previewGain} onPreviewGain={setPreviewGain} onSaved={load} onMore={() => setMore(true)}
            intensity={prefs.soundGain} actuators={prefs.soundActuators} onOpenSettings={onOpenSettings} />
            : <div className={styles.empty}><h2>Your controller sounds</h2><p>The controller has no speaker: its motors play converted tones, so jingles and simple tunes work best. Add MP3 or MIDI to start.</p></div>}
        </section>
      </div>
      {more && sound && <Sheet open onClose={() => { setMore(false); setDeleting(false) }} eyebrow="Sound library" title={sound.name} hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Close' }]}>
        <div className={styles.sheetRows}>
          {!deleting ? <>
            <OpenRow label="Rename" hint="Opens the keyboard" value={sound.name} onOpen={() => rename(sound)} hints="A:Rename;B:Close" />
            <OpenRow label={`Delete ${sound.name}`} hint="Bindings to it will no longer play it" onOpen={() => setDeleting(true)} hints="A:Delete…;B:Close" />
          </> : <div className={styles.deletePanel} role="alertdialog" aria-label={`Delete ${sound.name}?`}>
            <b>Delete {sound.name}?</b><p>Bindings to this sound will no longer play it. This cannot be undone.</p>
            <button type="button" className={styles.keep} data-autofocus="" data-hints="A:Keep it;B:Close" onClick={() => setDeleting(false)}><b>Keep it</b><small>Nothing changes.</small></button>
            <button type="button" className={styles.deleteButton} data-hints="A:Delete sound;B:Close" onClick={() => void remove(sound)}>Delete sound</button>
          </div>}
        </div>
      </Sheet>}
      {choosing && <SubPage open onClose={() => setChoosing(null)} crumbRoot={root} trail={[...rest, 'Sound library']} title={choosing === 'connect' ? 'When it connects' : 'Before it turns off'} backLabel="Back to the library">
        <div className={styles.choices} role="radiogroup" aria-label={choosing === 'connect' ? 'Connect Sound' : 'Shutdown Sound'}>
          {[{ key: '-1', label: 'Nothing', sound: -1, file: null as string | null },
            ...BUILT_IN_SOUNDS.map((name, index) => ({ key: String(index), label: name, sound: index, file: null as string | null })),
            ...sounds.filter(entry => entry.ready).map(entry => ({ key: `file:${entry.id}`, label: entry.name, sound: choosing === 'connect' ? prefs.connectSound : prefs.shutdownSound, file: entry.id as string | null }))].map(choice => {
            const current = choosing === 'connect' ? (prefs.connectSoundFile ? `file:${prefs.connectSoundFile}` : String(prefs.connectSound)) : (prefs.shutdownSoundFile ? `file:${prefs.shutdownSoundFile}` : String(prefs.shutdownSound))
            return <button key={choice.key} type="button" role="radio" aria-checked={choice.key === current} className={styles.choice} data-autofocus={choice.key === current ? '' : undefined}
              data-hints={choice.key === '-1' ? 'A:Choose;B:Back' : 'A:Choose;X:Hear it;B:Back'} data-pad-keys="X"
              onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && choice.key !== '-1') { event.preventDefault(); void desktopBridge.playControllerSound(choice.sound, prefs.soundGain, choice.file ?? undefined).catch(() => {}) } }}
              onClick={() => { update(choosing === 'connect' ? { connectSound: choice.sound, connectSoundFile: choice.file } : { shutdownSound: choice.sound, shutdownSoundFile: choice.file }); setChoosing(null) }}>
              <b>{choice.label}</b>{choice.file ? <small>Your sound</small> : choice.key !== '-1' ? <small>Built in</small> : null}{choice.key === current && <span className={styles.chosen}>Chosen</span>}
            </button>
          })}
        </div>
      </SubPage>}
    </SubPage>
  )
}

type EditorProps = {
  sound: SoundEntry
  previewGain: number
  onPreviewGain: (gain: number) => void
  onSaved: () => void
  onMore: () => void
  intensity: number
  actuators: string
  onOpenSettings?: () => void
}

/** One sound's editor: MP3 or MIDI, trimmed on the pad. */
function SoundEditor({ sound, previewGain, onPreviewGain, onSaved, onMore, intensity, actuators, onOpenSettings }: EditorProps) {
  const midi = sound.sourceFormat === 'midi'
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [rate, setRate] = useState(0)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [song, setSong] = useState<MidiSong | null>(null)
  const [trackId, setTrackId] = useState('')
  const [start, setStart] = useState(sound.trimStartMs ?? 0)
  const [end, setEnd] = useState(sound.trimEndMs ?? 0)
  const [active, setActive] = useState<'start' | 'end'>('start')
  const [octave, setOctave] = useState(0)
  const [error, setError] = useState('')
  const [playingPc, setPlayingPc] = useState(false)
  const [onController, setOnController] = useState(false)
  const [saving, setSaving] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const trim = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const playback = useRef<AudioContext | null>(null)
  const duration = midi ? song?.durationMs ?? 0 : buffer ? Math.round(buffer.duration * 1000) : sound.durationMs
  const track = song?.tracks.find(item => item.id === trackId)
  const recommended = song ? preferredMidiTrack(song) : undefined
  const autoShift = midi && track ? controllerOctaveShift(track, start, end) : 0
  const midiTones = useMemo(() => midi && track && end > start ? midiToTones(track, start, end, autoShift + octave) : [], [midi, track, start, end, autoShift, octave])
  const hasNotes = midi ? midiTones.some(tone => tone.frequencyHz > 0) : !!samples && end - start >= MIN_SELECTION_MS

  useEffect(() => {
    let cancelled = false
    void desktopBridge.soundLibraryReadAudio(sound.id).then(async base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
      if (midi) {
        const parsed = parseMidi(bytes)
        if (cancelled) return
        const chosen = parsed.tracks.find(item => item.id === sound.midiTrack) ?? preferredMidiTrack(parsed)
        const from = sound.trimStartMs ?? Math.floor(chosen.notes[0]?.startMs ?? 0)
        setSong(parsed); setTrackId(chosen.id); setStart(from)
        setEnd(Math.min(parsed.durationMs, sound.trimEndMs ?? from + DEFAULT_SELECTION_MS))
        return
      }
      const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer as ArrayBuffer)
      if (cancelled) return
      const mono = new Float32Array(decoded.length)
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) { const data = decoded.getChannelData(channel); for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels }
      setSamples(mono); setRate(decoded.sampleRate); setBuffer(decoded)
      if (!sound.trimEndMs) setEnd(Math.round(decoded.duration * 1000))
    }).catch(problem => { if (!cancelled) setError(midi ? String(problem) : `Could not decode the MP3: ${String(problem)}`) })
    return () => { cancelled = true; if (playback.current) void playback.current.close(); playback.current = null }
  }, [sound.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The canvas cannot use CSS variables, so it reads the theme's accent when it
  // paints, and repaints when the theme or accent on <html> changes.
  const [themeKey, setThemeKey] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeKey(key => key + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent', 'data-theme'] })
    const scheme = window.matchMedia('(prefers-color-scheme: dark)'), onScheme = () => setThemeKey(key => key + 1)
    scheme.addEventListener('change', onScheme)
    return () => { observer.disconnect(); scheme.removeEventListener('change', onScheme) }
  }, [])

  // The timeline: notes (MIDI) or the waveform (MP3), the kept part lit, its markers.
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d')
    if (!node || !ctx || !duration) return
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3e9fd8'
    const width = node.width, height = node.height, axis = height - 28
    const view = { from: 0, to: Math.max(duration, 1) }
    const x = (ms: number) => (ms - view.from) / (view.to - view.from) * width
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0f151b'; ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = accent; ctx.globalAlpha = .12; ctx.fillRect(x(start), 0, Math.max(0, x(end) - x(start)), axis); ctx.globalAlpha = 1
    if (midi && track) {
      const low = Math.min(48, ...track.notes.map(note => note.note)) - 2, high = Math.max(72, ...track.notes.map(note => note.note)) + 2
      const row = (axis - 16) / (high - low + 1)
      for (const note of track.notes) {
        const inside = note.endMs > start && note.startMs < end
        ctx.fillStyle = inside ? accent : '#3a444f'
        ctx.beginPath(); ctx.roundRect(x(note.startMs), 8 + (high - note.note) * row, Math.max(3, x(note.endMs) - x(note.startMs)), Math.max(4, row - 1), 3); ctx.fill()
      }
    } else if (samples) {
      for (let px = 0; px < width; px++) {
        const a = Math.floor(px / width * samples.length), b = Math.max(a + 1, Math.floor((px + 1) / width * samples.length))
        let peak = 0
        for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(samples[i]))
        const ms = view.from + px / width * (view.to - view.from)
        ctx.fillStyle = ms >= start && ms <= end ? accent : '#3a444f'
        ctx.fillRect(px, axis / 2 - peak * axis * .45, 1, Math.max(1, peak * axis * .9))
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(0, axis + .5); ctx.lineTo(width, axis + .5); ctx.stroke()
    ctx.fillStyle = '#808c99'; ctx.font = '12px Geist Mono, monospace'
    const tick = duration > 20000 ? 5000 : 1000
    for (let ms = 0; ms <= duration; ms += tick) { ctx.fillRect(x(ms), axis, 1, 6); ctx.fillText(`${ms / 1000}${ms === 0 ? ' s' : ''}`, Math.min(width - 24, x(ms) + 3), axis + 20) }
    for (const [ms, which] of [[start, 'start'], [end, 'end']] as const) {
      ctx.fillStyle = which === active ? '#e8eef4' : '#aebbc8'
      ctx.fillRect(x(ms) - 1.5, 0, 3, axis)
      ctx.beginPath(); ctx.roundRect(x(ms) - 7, axis / 2 - 14, 14, 28, 4); ctx.fill()
    }
  }, [duration, start, end, active, midi, track, samples, themeKey])

  // The length a scrub keeps: sliding the selection against the song's end
  // shortens it only while it is there, and it grows back on the way out.
  const span = useRef<number | null>(null)
  const clampMove = (which: 'start' | 'end', value: number) => {
    span.current = null
    if (which === 'start') setStart(Math.max(0, Math.min(end - MIN_SELECTION_MS, Math.round(value))))
    else setEnd(Math.min(duration, Math.max(start + MIN_SELECTION_MS, Math.min(start + TONE_FILE_MAX_TOTAL_MS, Math.round(value)))))
  }
  const onTrimKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation()
      const by = (event.shiftKey || event.repeat ? 10 : 100) * (event.key === 'ArrowRight' ? 1 : -1)
      clampMove(active, (active === 'start' ? start : end) + by)
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(which => which === 'start' ? 'end' : 'start') }
  }
  // The mouse: press near a marker to take it, drag to move it (the pad and keyboard use ◂ ▸ above).
  const grabbed = useRef<'start' | 'end' | null>(null)
  const msAt = (event: { clientX: number; currentTarget: HTMLCanvasElement }) => {
    const box = event.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (event.clientX - box.left) / Math.max(1, box.width) * duration))
  }
  const onTimelineDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!duration) return
    const at = msAt(event)
    const which = Math.abs(at - start) <= Math.abs(at - end) ? 'start' : 'end'
    grabbed.current = which; setActive(which); clampMove(which, at)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onTimelineMove = (event: PointerEvent<HTMLCanvasElement>) => { if (grabbed.current) clampMove(grabbed.current, msAt(event)) }
  const onTimelineUp = () => { grabbed.current = null }
  const stepTrack = (by: 1 | -1) => {
    if (!song) return
    const next = song.tracks[(trackIndex + by + song.tracks.length) % song.tracks.length]
    setTrackId(next.id); moveWindow(Math.floor(next.notes[0]?.startMs ?? 0))
  }
  const moveWindow = (to: number) => {
    const length = span.current ?? end - start
    span.current = length
    const from = Math.max(0, Math.min(Math.max(0, duration - MIN_SELECTION_MS), Math.round(to)))
    setStart(from); setEnd(Math.min(duration, from + length))
  }
  const tones = () => {
    if (midi) return midiTones
    if (!samples) return []
    return extractToneSequence(samples, rate, start, end, octave)
  }
  const playPc = async () => {
    if (playback.current) { await playback.current.close(); playback.current = null; setPlayingPc(false); return }
    const context = new AudioContext()
    const source = context.createBufferSource()
    if (midi) {
      const data = synthesizeTones(midiTones, context.sampleRate)
      const synth = context.createBuffer(1, data.length, context.sampleRate)
      synth.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
      source.buffer = synth
    } else if (buffer) source.buffer = buffer
    else return
    const gain = context.createGain(); gain.gain.value = 10 ** (previewGain / 20)
    source.connect(gain); gain.connect(context.destination)
    playback.current = context; setPlayingPc(true)
    source.onended = () => { if (playback.current === context) { playback.current = null; setPlayingPc(false); void context.close() } }
    await context.resume()
    if (midi) source.start(); else source.start(0, start / 1000, (end - start) / 1000)
  }
  const preview = async () => {
    if (!hasNotes || onController) return
    setOnController(true)
    try {
      const list = tones()
      if (!list.some(tone => tone.frequencyHz > 0)) throw new Error(midi ? 'No notes in this selection. Move the selection or choose another track.' : 'No clear melody was found in this selection. Try a louder or simpler part of the MP3.')
      const result = await desktopBridge.previewControllerTones(list, previewGain)
      if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
      else await new Promise(resolve => setTimeout(resolve, Math.min(8000, list.reduce((sum, tone) => sum + tone.durationMs, 0))))
    } catch (problem) { showToast(String(problem), 'error') }
    finally { setOnController(false) }
  }
  const save = async () => {
    if (!hasNotes || saving) return
    setSaving(true)
    try {
      const list = tones()
      if (!list.some(tone => tone.frequencyHz > 0)) throw new Error(midi ? 'No notes in this selection.' : 'No clear melody was found in this selection. Try a louder or simpler part of the MP3.')
      await desktopBridge.soundLibrarySave(sound.id, sound.name, duration, start, end, list, midi ? track?.id : undefined)
      onSaved(); showToast(midi ? 'MIDI sound saved.' : 'Sound converted and saved.', 'success')
    } catch (problem) { showToast(String(problem), 'error') }
    finally { setSaving(false) }
  }
  const setGain = async (gain: number) => {
    try { await desktopBridge.soundLibrarySetGain(sound.id, gain); onSaved() } catch (problem) { showToast(String(problem), 'error') }
  }

  // The editor opens on Trim, unless the pad is already walking the rail.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    if (!active || active === document.body || active.getAttribute('aria-label') === 'Add MP3 or MIDI') requestAnimationFrame(() => trim.current?.focus({ preventScroll: true }))
  }, [])
  // X plays on the controller, ☰ saves, Y is More (rename, delete).
  const latest = useRef({ preview, save, onMore })
  latest.current = { preview, save, onMore }
  useEffect(() => {
    const node = page.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (button === 'X') { event.preventDefault(); void latest.current.preview() }
      else if (button === 'MENU') { event.preventDefault(); void latest.current.save() }
      else if (button === 'Y') { event.preventDefault(); latest.current.onMore() }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const trackIndex = song ? song.tracks.findIndex(item => item.id === trackId) : -1
  const shiftWords = (shift: number) => shift === 0 ? 'Already in the controller’s range' : `Auto moved it ${shift > 0 ? 'up' : 'down'} ${Math.abs(shift)} octave${Math.abs(shift) === 1 ? '' : 's'}`
  const intensityWord = intensity <= -18 ? 'Quiet' : intensity <= -12 ? 'Soft' : intensity <= -6 ? 'Medium' : 'Full'
  const hints = 'A:Start · end;X:Preview on controller;Y:More;MENU:Save sound;LT/RT:Sound;B:Back'
  return (
    <div ref={page} className={styles.editor}>
      <header className={styles.head}>
        <div><h1>{sound.name}</h1><p>{midi ? <>From MIDI{song ? <> · melody track {trackIndex + 1} of {song.tracks.length}</> : ''}</> : 'From MP3 · one melody taken from the recording'}</p></div>
        {midi && song && <div className={styles.track} tabIndex={0} role="slider" aria-label="Melody track" aria-valuemin={1} aria-valuemax={song.tracks.length} aria-valuenow={trackIndex + 1}
          aria-valuetext={`${trackIndex + 1} · ${track?.name ?? ''}`} data-arrows="horizontal" data-hints={`MOVE:Track;${hints}`}
          data-caption={`Track · ${track?.name ?? ''} · ${track?.notes.length ?? 0} notes${track?.id === recommended?.id ? ' · Recommended' : ''}`}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault(); event.stopPropagation()
            const next = song.tracks[(trackIndex + (event.key === 'ArrowRight' ? 1 : -1) + song.tracks.length) % song.tracks.length]
            setTrackId(next.id); moveWindow(Math.floor(next.notes[0]?.startMs ?? 0))
          }}>
          Track <button type="button" tabIndex={-1} data-nav-skip aria-label="Previous track" className={styles.trackArrow} onClick={() => stepTrack(-1)}>◂</button> <b>{trackIndex + 1} · {track?.name}</b> <button type="button" tabIndex={-1} data-nav-skip aria-label="Next track" className={styles.trackArrow} onClick={() => stepTrack(1)}>▸</button>{track?.id === recommended?.id && <small>Recommended</small>}
        </div>}
      </header>
      {error && <p role="alert" className={styles.alert}>{error}</p>}
      <div className={styles.timeline}>
        <canvas ref={canvas} width={960} height={230} className={midi ? 'midi-note-timeline' : undefined} style={{ cursor: 'ew-resize', touchAction: 'none' }} onPointerDown={onTimelineDown} onPointerMove={onTimelineMove} onPointerUp={onTimelineUp} onPointerCancel={onTimelineUp} role="img" aria-label={midi ? 'MIDI notes, the kept part lit' : 'Sound waveform, the kept part lit'} />
        <p><span>{midi ? 'One note at a time, moved into the range the grips play clearly' : 'The melody is moved by octaves into the range the grips play clearly'}</span>{onController && <span className={styles.playing}>● playing on controller</span>}</p>
      </div>
      <div ref={trim} className={styles.trim} tabIndex={0} role="group" aria-label="Trim" data-arrows="horizontal" data-autofocus="" data-hints={hints}
        data-caption={`Trim · ◂ ▸ moves the ${active} marker · A switches to the ${active === 'start' ? 'end' : 'start'} · hold ◂ ▸ for 0.01 s steps`} onKeyDown={onTrimKey}>
        <div className={styles.trimValues}>
          <b>Trim</b>
          <span data-active={active === 'start' ? 'true' : undefined} onClick={() => setActive('start')}>Start <output aria-label="Start (seconds)">{seconds(start)} s</output></span>
          <span data-active={active === 'end' ? 'true' : undefined} onClick={() => setActive('end')}>End <output aria-label="End (seconds)">{seconds(end)} s</output></span>
          <span className={styles.keeps}>Keeps {((end - start) / 1000).toFixed(1)} s</span>
        </div>
        <p>◂ ▸ moves the {active} marker · A switches to the {active === 'start' ? 'end' : 'start'} · hold ◂ ▸ for 0.01 s steps</p>
      </div>
      {midi && song && <ValueRow label="Move the selection" hint="Slides start and end together along the song" value={Math.round(start / 100) / 10} min={0} max={Math.max(0, (duration - MIN_SELECTION_MS) / 1000)} step={0.1}
        format={value => `${value.toFixed(1)} s`} onChange={value => moveWindow(value * 1000)} data={{ 'data-selection-position': '' }} />}
      {midi && song && !hasNotes && <p className="midi-status" role="status">No notes in this selection. Move the selection or choose another track.</p>}
      <div className={styles.tiles}>
        <SegmentedRow label="Pitch" hint={midi ? shiftWords(autoShift + octave) : 'Judged after conversion: preview it on the controller'} value={String(octave)}
          options={[{ value: '-1', label: 'Lower', caption: 'One octave lower than Auto' }, { value: '0', label: 'Auto', caption: midi ? shiftWords(autoShift) : 'Moved by whole octaves into the clear range' }, { value: '1', label: 'Higher', caption: 'One octave higher than Auto' }]}
          onChange={value => setOctave(Number(value))} onReset={octave ? () => setOctave(0) : undefined} />
        <ValueRow label="Volume on a button" hero value={sound.defaultGainDb ?? 0} min={SOUND_GAIN_MIN_DB} max={0} step={1} format={value => `${value} dB`}
          caption="As recorded. Each button that plays it can go down to −30 dB; this is where a new one starts." onChange={value => void setGain(value)} onReset={() => void setGain(0)} data={{ 'data-sound-volume': '' }} />
      </div>
      <SoundPreviewVolume gain={previewGain} onChange={onPreviewGain} />
      <div className={styles.actions}>
        <button type="button" className={styles.action} disabled={!hasNotes && !buffer} data-hints="A:Play;B:Back" onClick={() => void playPc().catch(problem => showToast(String(problem), 'error'))}>
          {playingPc ? 'Stop preview' : midi ? 'Play tones on PC' : 'Play selection on PC'}</button>
        <button type="button" className={styles.action} disabled={!hasNotes || onController} data-hints="A:Preview;B:Back" onClick={() => void preview()}><span className={styles.key}>X</span>Preview on controller</button>
        <button type="button" className={`${styles.action} ${styles.primary}`} disabled={!hasNotes || saving} data-hints="A:Save;B:Back" onClick={() => void save()}><span className={styles.key}>☰</span>{saving ? 'Saving…' : midi ? 'Save sound' : 'Convert and save'}</button>
      </div>
      <p className={styles.strip}>Sound intensity <b>{intensityWord}</b> <span aria-hidden="true">|</span> Plays on <b>{actuators === 'pads' ? 'Trackpads' : actuators === 'both' ? 'Grips and trackpads' : 'Grip motors'}</b>
        {onOpenSettings && <button type="button" className={styles.link} data-hints="A:Open Settings;B:Back" onClick={onOpenSettings}>Settings ▸ Controller</button>}</p>
    </div>
  )
}
