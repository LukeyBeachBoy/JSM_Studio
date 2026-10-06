import { useEffect, useRef, useState } from 'react'
import { desktopBridge, type SoundEntry } from '../platform/desktopBridge'
import { controllerOctaveShift, midiToTones, parseMidi, preferredMidiTrack, synthesizeTones, type MidiSong } from '../utils/midiTones'
import { DEFAULT_SELECTION_MS, TONE_FILE_MAX_TOTAL_MS } from '../utils/toneArrangement'
import { showToast } from '../utils/toast'
import { Dialog } from './ui/Dialog'
import { AppSelect } from './ui/AppSelect'
import { SoundPreviewVolume } from './SoundPreviewVolume'
import { OctaveNudge } from './OctaveNudge'

const MIN_SELECTION_MS = 40

export function MidiTrimEditor({ sound, previewGain, onPreviewGainChange, onClose, onSaved }: {
  sound: SoundEntry; previewGain: number; onPreviewGainChange: (gain: number) => void; onClose: () => void; onSaved: () => void
}) {
  const [song, setSong] = useState<MidiSong | null>(null)
  const [trackId, setTrackId] = useState('')
  // The selection is a start and a length. Keeping the length rather than the
  // end means dragging the start past the song's end shortens the window only
  // while it is against the end, and it grows back on the way out; deriving
  // it from the end each time shrank it to nothing.
  const [start, setStart] = useState(0), [length, setLength] = useState(DEFAULT_SELECTION_MS)
  const [busy, setBusy] = useState(false), [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [octaveNudge, setOctaveNudge] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const playback = useRef<AudioContext | null>(null)
  const volume = useRef<GainNode | null>(null)
  const duration = song?.durationMs ?? 0
  const end = Math.min(duration, start + length)
  const track = song?.tracks.find(track => track.id === trackId)
  const recommendedTrack = song ? preferredMidiTrack(song) : undefined
  const autoShift = track ? controllerOctaveShift(track, start, end) : 0
  const octaveShift = autoShift + octaveNudge
  const tones = track ? midiToTones(track, start, end, octaveShift) : []
  const hasNotes = tones.some(tone => tone.frequencyHz > 0)
  const clampStart = (value: number) => Math.max(0, Math.min(Math.max(0, duration - MIN_SELECTION_MS), Math.round(value)))
  const clampLength = (value: number) => Math.max(MIN_SELECTION_MS, Math.min(TONE_FILE_MAX_TOTAL_MS, Math.round(value)))

  useEffect(() => {
    let cancelled = false
    void desktopBridge.soundLibraryReadAudio(sound.id).then(base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
      const parsed = parseMidi(bytes)
      if (cancelled) return
      const selected = parsed.tracks.find(track => track.id === sound.midiTrack) ?? preferredMidiTrack(parsed)
      const from = sound.trimStartMs ?? Math.floor(selected.notes[0].startMs)
      setSong(parsed); setTrackId(selected.id); setStart(from)
      setLength(sound.trimEndMs !== undefined && sound.trimStartMs !== undefined ? Math.max(MIN_SELECTION_MS, sound.trimEndMs - sound.trimStartMs) : DEFAULT_SELECTION_MS)
    }).catch(error => { if (!cancelled) setError(String(error)) })
    return () => { cancelled = true; if (playback.current) void playback.current.close(); playback.current = null }
  }, [sound.id, sound.midiTrack, sound.trimStartMs, sound.trimEndMs])

  useEffect(() => { if (volume.current) volume.current.gain.value = 10 ** (previewGain / 20) }, [previewGain])

  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d')
    if (!node || !ctx || !track) return
    const width = node.width, height = node.height
    const visible = track.notes.filter(note => note.endMs > start && note.startMs < end)
    const low = Math.min(48, ...visible.map(note => note.note)) - 2
    const high = Math.max(72, ...visible.map(note => note.note)) + 2
    const rowHeight = height / (high - low + 1)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#15232c'; ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#ffffff15'
    for (let step = 0; step <= 8; step++) { const x = step / 8 * width; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (const note of visible) {
      const x = Math.max(0, (note.startMs - start) / (end - start) * width)
      const right = Math.min(width, (note.endMs - start) / (end - start) * width)
      ctx.fillStyle = `rgba(115,199,216,${0.4 + note.velocity / 127 * 0.6})`
      ctx.fillRect(x, (high - note.note) * rowHeight, Math.max(1, right - x), Math.max(2, rowHeight - 1))
    }
  }, [track, start, end])

  const play = async () => {
    if (playback.current) { await playback.current.close(); playback.current = null; setPlaying(false); return }
    if (!hasNotes) return
    const context = new AudioContext()
    const samples = synthesizeTones(tones, context.sampleRate)
    const buffer = context.createBuffer(1, samples.length, context.sampleRate)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const source = context.createBufferSource(); source.buffer = buffer
    const gain = context.createGain(); gain.gain.value = 10 ** (previewGain / 20)
    source.connect(gain); gain.connect(context.destination)
    playback.current = context; volume.current = gain; setPlaying(true)
    source.onended = () => { if (playback.current === context) { playback.current = null; volume.current = null; setPlaying(false); void context.close() } }
    await context.resume(); source.start()
  }
  const preview = async () => {
    if (!hasNotes) return
    setBusy(true)
    try { const result = await desktopBridge.previewControllerTones(tones, previewGain); if (!result.success) showToast('No controller is connected to play the sound on.', 'error') }
    catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!song || !track || !hasNotes) return
    setBusy(true)
    try {
      await desktopBridge.soundLibrarySave(sound.id, sound.name, song.durationMs, start, end, tones, track.id)
      onSaved(); showToast('MIDI sound saved.', 'success')
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false) }
  }
  const seconds = (ms: number) => (ms / 1000).toFixed(2)
  return <Dialog title={`Trim ${sound.name}`} eyebrow="MIDI controller sound" width={720} className="sound-dialog sound-trim-dialog" onClose={onClose}
    actions={<><button type="button" className="button button--secondary" disabled={!hasNotes} onClick={() => void play().catch(error => showToast(String(error), 'error'))}>{playing ? 'Stop preview' : 'Play tones on PC'}</button>
      <button type="button" className="button button--secondary" disabled={!hasNotes || busy} onClick={() => void preview()}>Preview on controller</button>
      <button type="button" className="button button--primary" disabled={!hasNotes || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save sound'}</button></>}>
    <p>Choose the melody track. MIDI notes keep their pitch relationships, rhythm and relative loudness; Studio moves the whole voice by octaves into the controller's clearer range.</p>
    {error && <p role="alert">{error}</p>}
    {!song && !error && <p>Reading MIDI…</p>}
    {song && <>
      <label className="midi-track-field">Melody track
        <AppSelect aria-label="Melody track" value={trackId} onChange={event => {
          const next = song.tracks.find(track => track.id === event.target.value)!
          setTrackId(next.id)
          setStart(clampStart(Math.floor(next.notes[0].startMs)))
        }}>{song.tracks.map(track => <option key={track.id} value={track.id}>{track.name} · {track.notes.length} notes{track.id === recommendedTrack?.id ? ' · Recommended' : ''}</option>)}</AppSelect>
      </label>
      <canvas ref={canvas} width={640} height={150} className="midi-note-timeline" role="img" aria-label="MIDI notes in the selected time range" />
      <label className="midi-position-field">Selection position · {seconds(start)} s
        <input type="range" aria-label="Selection position" min={0} max={Math.max(0, duration - MIN_SELECTION_MS)} step={100} value={start} data-adjusting="true"
          onChange={event => setStart(clampStart(Number(event.target.value)))}
          onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setStart(clampStart(start + (event.key === 'ArrowRight' ? 100 : -100))) } }} />
      </label>
      <div className="sound-trim-fields">
        <label>Start (seconds) <input type="number" min={0} max={Math.max(0, duration - MIN_SELECTION_MS) / 1000} step={0.01} value={seconds(start)} onChange={event => setStart(clampStart(Number(event.target.value) * 1000))} /></label>
        <label>End (seconds) <input type="number" min={(start + MIN_SELECTION_MS) / 1000} max={duration / 1000} step={0.01} value={seconds(end)} onChange={event => setLength(clampLength(Number(event.target.value) * 1000 - start))} /></label>
      </div>
      <OctaveNudge value={octaveNudge} shift={autoShift} onChange={setOctaveNudge} />
      <p className="prefs-note">{seconds(end - start)} s selected · {seconds(duration)} s original. {octaveShift === 0 ? 'Pitch already sits in the controller range.' : `Controller tuning: ${octaveShift > 0 ? '+' : ''}${octaveShift} octave${Math.abs(octaveShift) === 1 ? '' : 's'}.`}</p>
      {/* Always in the layout, so the dialog keeps its height while the
          selection scrubs across a rest. */}
      <p className="midi-status" aria-live="polite">{hasNotes ? '' : 'No notes in this selection. Move the selection or choose another track.'}</p>
    </>}
    <SoundPreviewVolume gain={previewGain} onChange={onPreviewGainChange} />
    <p className="prefs-note">One note plays at a time. Chords use their highest note; drums, instrument timbres and pitch bends are omitted. Events shorter than 40 ms are folded into neighboring notes, and a note repeated at the same pitch gets a short rest before it so it is heard twice.</p>
  </Dialog>
}
