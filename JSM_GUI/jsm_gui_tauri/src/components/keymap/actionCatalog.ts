export const mouseOptions = ['LMOUSE', 'MMOUSE', 'RMOUSE', 'BMOUSE', 'FMOUSE']
export const wheelOptions = ['SCROLLUP', 'SCROLLDOWN']
// Valid keyboard-output tokens that a physical key capture cannot produce, so
// without this quick-pick they are only reachable by typing the exact token.
export const systemKeyOptions = ['VOLUME_UP', 'VOLUME_DOWN', 'MUTE', 'SCREENSHOT', 'NEXT_TRACK', 'PREV_TRACK', 'PLAY_PAUSE']

/** The action picker's System & media category (binding card refresh 1f):
 *  every system key, in the order the category shows them, with its name and
 *  icon. Stop comes last: it is a media key the list above never had. */
export const systemKeyChoices: Array<{ token: string; labelKey: string; label: string; icon: string }> = [
  { token: 'VOLUME_UP', labelKey: 'keymap.systemVolumeUp', label: 'Volume up', icon: 'lucide:volume-2' },
  { token: 'VOLUME_DOWN', labelKey: 'keymap.systemVolumeDown', label: 'Volume down', icon: 'lucide:volume-1' },
  { token: 'MUTE', labelKey: 'keymap.systemMute', label: 'Mute', icon: 'lucide:volume-x' },
  { token: 'PLAY_PAUSE', labelKey: 'keymap.systemPlayPause', label: 'Play / Pause', icon: 'lucide:circle-play' },
  { token: 'NEXT_TRACK', labelKey: 'keymap.systemNextTrack', label: 'Next track', icon: 'lucide:skip-forward' },
  { token: 'PREV_TRACK', labelKey: 'keymap.systemPrevTrack', label: 'Previous track', icon: 'lucide:skip-back' },
  { token: 'SCREENSHOT', labelKey: 'keymap.systemPrintScreen', label: 'Print Screen', icon: 'lucide:scan' },
  { token: 'STOP_TRACK', labelKey: 'keymap.systemStop', label: 'Stop', icon: 'lucide:square' },
]
// Calibrate gyro first: the full run with the overlay (utils/commandLabels).
export const builtInCommandOptions = ['CALIBRATE_GYRO', 'TURN_OFF_CONTROLLER', 'CALIBRATE_TRIGGERS', 'RESTART_GYRO_CALIBRATION', 'FINISH_GYRO_CALIBRATION']
