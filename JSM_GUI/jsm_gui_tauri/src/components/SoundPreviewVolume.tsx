export function SoundPreviewVolume({ gain, onChange }: { gain: number; onChange: (gain: number) => void }) {
  return <label className="sound-preview-volume">
    <span>Preview volume</span>
    <input type="range" min={-18} max={6} step={3} value={gain} onChange={event => onChange(Number(event.target.value))} />
    <output>{gain > 0 ? `+${gain}` : gain} dB</output>
  </label>
}
