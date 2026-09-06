export const normalizePreviewInput = (command: string) => ({ GRIP_L: 'MISC6', GRIP_R: 'MISC5', LPAD: 'LEFT_PAD', RPAD: 'RIGHT_PAD' }[command] ?? command)
export function inputPage(command: string): 'buttons' | 'dpad' | 'triggers' | 'joysticks' | 'touchpad' {
  if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(command)) return 'dpad'
  if (/^Z[LR]F?$/.test(command)) return 'triggers'
  if (/^[LR](3|UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(command)) return 'joysticks'
  if (/^(LEFT_PAD|RIGHT_PAD|TOUCH|CAPTURE|T(UP|DOWN|LEFT|RIGHT|RING)|[LR]?T[0-9]+)$/.test(command)) return 'touchpad'
  return 'buttons'
}
