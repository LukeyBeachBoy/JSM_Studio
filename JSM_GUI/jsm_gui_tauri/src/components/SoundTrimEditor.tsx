import { useEffect, useRef, useState } from 'react'
import { desktopBridge, type SoundEntry } from '../platform/desktopBridge'
import { extractToneSequence } from '../utils/toneExtraction'
import { showToast } from '../utils/toast'
import { Dialog } from './ui/Dialog'
import { SoundPreviewVolume } from './SoundPreviewVolume'
import { OctaveNudge } from './OctaveNudge'

const bytesFromBase64 = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function SoundTrimEditor({ sound, previewGain, onPreviewGainChange, onClose, onSaved }: { sound: SoundEntry; previewGain: number; onPreviewGainChange: (gain: number) => void; onClose: () => void; onSaved: () => void }) {
  const [samples, setSamples] = useState<Float32Array | null>(null)
  const [rate, setRate] = useState(0)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [start, setStart] = useState(sound.trimStartMs ?? 0)
  const [end, setEnd] = useState(sound.trimEndMs ?? sound.durationMs)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [octaveNudge, setOctaveNudge] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const playback = useRef<{ context: AudioContext; source: AudioBufferSourceNode } | null>(null)
  const duration = buffer ? Math.round(buffer.duration * 1000) : sound.durationMs

  useEffect(() => {
    let cancelled = false
    void desktopBridge.soundLibraryReadAudio(sound.id).then(async base64 => {
      const data = bytesFromBase64(base64)
      const context = new OfflineAudioContext(1, 1, 44100)
      const decoded = await context.decodeAudioData(data.buffer as ArrayBuffer)
      if (cancelled) return
      const mono = new Float32Array(decoded.length)
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const source = decoded.getChannelData(channel)
        for (let i = 0; i < mono.length; i++) mono[i] += source[i] / decoded.numberOfChannels
      }
      setSamples(mono)
      setRate(decoded.sampleRate)
      setBuffer(decoded)
      if (!sound.trimEndMs) setEnd(Math.round(decoded.duration * 1000))
    }).catch(error => showToast(`Could not decode MP3: ${String(error)}`, 'error'))
    return () => { cancelled = true; playback.current?.source.stop(); void playback.current?.context.close(); playback.current = null }
  }, [sound.id, sound.trimEndMs])

  useEffect(() => {
    const node = canvas.current
    if (!node || !samples || !duration) return
    const context = node.getContext('2d')
    if (!context) return
    const width = node.width, height = node.height
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#15232c'
    context.fillRect(0, 0, width, height)
    const startX = Math.round(start / duration * width), endX = Math.round(end / duration * width)
    context.fillStyle = '#264856'
    context.fillRect(startX, 0, Math.max(0, endX - startX), height)
    context.strokeStyle = '#73c7d8'
    context.beginPath()
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x / width * samples.length)
      const to = Math.max(from + 1, Math.floor((x + 1) / width * samples.length))
      let peak = 0
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]))
      context.moveTo(x + 0.5, height / 2 - peak * height * 0.45)
      context.lineTo(x + 0.5, height / 2 + peak * height * 0.45)
    }
    context.stroke()
    context.fillStyle = '#fff'
    context.fillRect(startX - 2, 0, 4, height)
    context.fillRect(endX - 2, 0, 4, height)
  }, [samples, duration, start, end])

  const moveHandle = (clientX: number) => {
    const rect = canvas.current?.getBoundingClientRect()
    if (!rect || !duration) return
    const value = Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration)
    if (Math.abs(value - start) <= Math.abs(value - end)) setStart(Math.min(value, end - 40))
    else setEnd(Math.max(value, start + 40))
  }

  const play = async () => {
    if (!buffer || end <= start) return
    playback.current?.source.stop()
    if (playback.current) await playback.current.context.close()
    const context = new AudioContext()
    const source = context.createBufferSource()
    source.buffer = buffer
    const volume = context.createGain()
    volume.gain.value = Math.pow(10, previewGain / 20)
    source.connect(volume)
    volume.connect(context.destination)
    source.start(0, start / 1000, (end - start) / 1000)
    playback.current = { context, source }
    source.onended = () => { if (playback.current?.source === source) { playback.current = null; void context.close() } }
  }

  const save = async () => {
    if (!samples || end - start < 40) return
    setBusy(true)
    try {
      const tones = extractToneSequence(samples, rate, start, end, octaveNudge)
      if (!tones.some(tone => tone.frequencyHz > 0)) throw new Error('No clear melody was found in this selection. Try a louder or simpler part of the MP3.')
      await desktopBridge.soundLibrarySave(sound.id, sound.name, duration, start, end, tones)
      onSaved()
      showToast('Sound converted and saved.', 'success')
    } catch (error) { showToast(String(error), 'error') }
    finally { setBusy(false) }
  }

  const preview = async () => {
    if (!samples || end - start < 40) return
    setPreviewing(true)
    try {
      const tones = extractToneSequence(samples, rate, start, end, octaveNudge)
      if (!tones.some(tone => tone.frequencyHz > 0)) throw new Error('No clear melody was found in this selection. Try a louder or simpler part of the MP3.')
      const result = await desktopBridge.previewControllerTones(tones, previewGain)
      if (!result.success) showToast('No controller is connected to play the sound on.', 'error')
    } catch (error) { showToast(String(error), 'error') }
    finally { setPreviewing(false) }
  }

  return <Dialog title={`Trim ${sound.name}`} eyebrow="Controller sound" width={720} className="sound-dialog sound-trim-dialog" onClose={onClose}
    actions={<><button type="button" className="button button--secondary" onClick={() => void play()} disabled={!buffer}>Play selection on PC</button>
      <button type="button" className="button button--secondary" onClick={() => void preview()} disabled={!samples || previewing || busy || end - start < 40}>{previewing ? 'Converting preview…' : 'Preview on controller'}</button>
      <button type="button" className="button button--primary" onClick={() => void save()} disabled={!samples || busy || end - start < 40}>{busy ? 'Converting…' : 'Convert and save'}</button></>}>
    <p>The controller has no speaker: its haptic actuators play converted tones, so jingles and simple melodies work best while speech, chords and dense mixes become an approximation. The melody is moved by whole octaves into the range the actuators play clearly.</p>
    <canvas ref={canvas} width={640} height={150} style={{ width: '100%', height: 150, touchAction: 'none', cursor: 'ew-resize' }}
      aria-label="Sound waveform; drag the start or end marker" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); moveHandle(event.clientX) }}
      onPointerMove={event => { if (event.buttons) moveHandle(event.clientX) }} />
    <div className="sound-trim-fields">
      <label>Start (seconds) <input type="number" min={0} max={end / 1000 - 0.04} step={0.01} value={(start / 1000).toFixed(2)} onChange={event => setStart(Math.min(end - 40, Math.max(0, Math.round(Number(event.target.value) * 1000))))} /></label>
      <label>End (seconds) <input type="number" min={start / 1000 + 0.04} max={duration / 1000} step={0.01} value={(end / 1000).toFixed(2)} onChange={event => setEnd(Math.max(start + 40, Math.min(duration, Math.round(Number(event.target.value) * 1000))))} /></label>
    </div>
    <OctaveNudge value={octaveNudge} shift={0} onChange={setOctaveNudge} />
    <SoundPreviewVolume gain={previewGain} onChange={onPreviewGainChange} />
    <p className="prefs-note">{duration ? `${(end - start) / 1000}s selected · ${duration / 1000}s original` : 'Decoding MP3…'} · Pitch is judged after conversion, so preview on the controller to hear the placement.</p>
  </Dialog>
}
