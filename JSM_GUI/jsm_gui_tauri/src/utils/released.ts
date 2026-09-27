// "While released": a modeshift or layer action whose input is written "!X"
// applies while X is NOT held -- a layer held while you let go of a grip,
// rather than while you squeeze it. The mapper reads `!MISC5,W = X` as a
// modeshift that holds while MISC5 is up (JoyShockMapper InvertedChords.cpp);
// Studio's layer worker reads `# @layer-action !MISC5 = hold <id>` the same
// way (services/global_chords.rs layer_pressed).

export const isReleasedInput = (input: string) => input.trim().startsWith('!')

/** The physical input behind "!X" (or X itself). */
export const heldInput = (input: string) => input.trim().replace(/^!/, '')

/** The same input, held (false) or released (true). */
export const withRelease = (input: string, released: boolean) => (released ? `!${heldInput(input)}` : heldInput(input))
