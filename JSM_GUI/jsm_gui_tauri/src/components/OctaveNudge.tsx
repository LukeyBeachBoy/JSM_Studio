// The automatic octave placement (toneArrangement.ts) is a rule of thumb: a
// MIDI channel that mixes melody and accompaniment, or a vocal with a strong
// second harmonic, can land one octave off. This nudges the whole voice by
// an octave either way, to be judged with "Preview on controller".
export function OctaveNudge({ value, shift, onChange }: { value: number; shift: number; onChange: (value: number) => void }) {
  const total = shift + value
  const options = [{ value: -1, label: 'Lower' }, { value: 0, label: 'Auto' }, { value: 1, label: 'Higher' }]
  return <div className="sound-octave-nudge">
    <span>Pitch</span>
    <div className="segmented" role="radiogroup" aria-label="Octave">
      {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
    <small>{total === 0 ? 'Original octave' : `${total > 0 ? '+' : ''}${total} octave${Math.abs(total) === 1 ? '' : 's'}`}{value !== 0 && shift !== 0 ? ` (auto ${shift > 0 ? '+' : ''}${shift})` : ''}</small>
  </div>
}
