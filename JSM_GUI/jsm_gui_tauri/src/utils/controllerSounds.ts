// What a controller sound is called, and how a PLAY_SOUND binding spells it
// (docs/plans/controller-sounds-library.md). Shared by the Preferences pickers,
// the action picker and the binding descriptions so one name shows everywhere.

// Steam's own names for the Steam Controller's built-in tunes, in script order
// (SettingController_HapticSound_0..13). Script 12 is also what Steam's
// "Identify Controller" ping plays.
export const BUILT_IN_SOUNDS = [
  'Warm and Happy', 'Invader', 'Controller Confirmed', 'Victory!', 'Rise and Shine', 'Shorty',
  'Warm Boot', 'Next Level', 'Shake It Off', 'Access Denied', 'Deactivate', 'Discovery', 'Triumph', 'The Mann',
]

/** The id in `sounds/<id>/`, as Rust validates it before touching the disk. */
export const SOUND_ID_PATTERN = /^snd-[0-9]+-[0-9a-f]{4}$/

/** The relative path the mapper resolves against JSM_DIRECTORY. */
export const soundFilePath = (id: string) => `sounds/${id}/tones.txt`

/** The softest a binding can play a sound, in dB; 0 is as recorded. */
export const SOUND_GAIN_MIN_DB = -30

/**
 * The console command a binding runs: a built-in index or a library path,
 * with the gain after it when it is not "as recorded" (0 dB), so a binding
 * that never set one keeps the spelling it had.
 */
export const playSoundToken = (sound: number | string, requested?: number) => {
  const target = typeof sound === 'number' ? `${sound}` : soundFilePath(sound)
  // A library sound bound with no level of its own starts at its "Volume on a
  // button" (console v2, D15); a binding's own level always wins.
  const gain = requested === undefined && typeof sound === 'string' ? libraryGains.get(sound) : requested
  const level = gain !== undefined && Number.isFinite(gain) && Math.round(gain) !== 0 ? ` ${Math.round(gain)}` : ''
  return `PLAY_SOUND ${target}${level}`
}

/** The command's sound, spelled the way playSoundToken takes it. */
export const playSoundTarget = (sound: PlaySound): number | string | null =>
  'builtIn' in sound ? sound.builtIn : 'id' in sound ? sound.id : null

export type PlaySound = ({ builtIn: number } | { id: string } | { path: string }) & {
  /** dB, only when the command spells one; 0 = as recorded. */
  gain?: number
}

/**
 * Reads `PLAY_SOUND <0..13> [gain]` or `PLAY_SOUND <path> [gain]`, quoted or
 * not, as the mapper does. Null for anything else.
 */
export const parsePlaySound = (value: string): PlaySound | null => {
  const match = /^"?\s*PLAY_SOUND\s+(\S+)(?:\s+(-?\d+))?\s*"?$/i.exec(value.trim())
  if (!match) return null
  const target = match[1]
  const gain = match[2] !== undefined ? { gain: Number(match[2]) } : {}
  if (/^\d+$/.test(target)) {
    const index = Number(target)
    return index < BUILT_IN_SOUNDS.length ? { builtIn: index, ...gain } : null
  }
  const library = /^sounds\/(snd-[0-9]+-[0-9a-f]{4})\/tones\.txt$/i.exec(target)
  return library ? { id: library[1], ...gain } : { path: target, ...gain }
}

// Library names, remembered from the last listing (hooks/useSoundLibrary) so a
// binding row can say "Play sound · Victory riff" without asking the disk.
const libraryNames = new Map<string, string>()
const libraryGains = new Map<string, number>()
export const rememberSoundNames = (entries: { id: string; name: string; defaultGainDb?: number }[]) => {
  libraryNames.clear()
  libraryGains.clear()
  for (const entry of entries) {
    libraryNames.set(entry.id, entry.name)
    if (entry.defaultGainDb !== undefined) libraryGains.set(entry.id, entry.defaultGainDb)
  }
}
export const librarySoundName = (id: string) => libraryNames.get(id)

/** "Play sound · <name>", or null when the value is not a PLAY_SOUND command. */
export const playSoundLabel = (value: string): string | null => {
  const sound = parsePlaySound(value)
  if (!sound) return null
  const name = 'builtIn' in sound ? BUILT_IN_SOUNDS[sound.builtIn]
    : 'id' in sound ? librarySoundName(sound.id) ?? 'your sound'
    : sound.path
  return `Play sound · ${name}`
}
