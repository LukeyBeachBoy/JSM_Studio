/** The stick clicks, which InputGlyph draws with their name on the cap. */
export const STICK_CLICKS: Record<string, 'L' | 'R'> = { L3: 'L', R3: 'R' }

/**
 * The name a glyph prints on itself, where a row would otherwise repeat it in
 * text beside the glyph. Only the stick clicks, so far.
 */
export const glyphPrintedName = (command: string): string | undefined => {
  const side = STICK_CLICKS[command.toUpperCase()]
  return side && `${side}3`
}
