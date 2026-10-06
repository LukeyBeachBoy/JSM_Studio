// The JoyShockMapper commands a binding can run, as the action picker offers
// them and as a binding row reads once one is chosen. CALIBRATE_GYRO is the
// full calibration run: it waits for the controller to be put down, counts
// down and calibrates with the overlay HUD showing progress, and cancels if
// the controller moves -- the same run as Gyro's Recalibrate button and the
// default global configuration. Continuous start/finish remain useful independent actions
// for advanced calibration workflows and use their ordinary native commands.
import { playSoundLabel } from './controllerSounds'
import { parseCycleBinding } from './cycleBinding'
export const COMMAND_LABELS: Record<string, { label: string; describe: string }> = {
  OPEN_KEYBOARD: { label: 'Open keyboard', describe: 'Open or close the controller keyboard' },
  TOGGLE_MAPPING: { label: 'Pause / resume mapping', describe: 'Toggle controller mapping' },
  CALIBRATE_GYRO: {
    label: 'Calibrate gyro',
    describe: 'Put the controller down: the overlay counts down, calibrates and shows progress. Picking it up cancels the run.',
  },
  TURN_OFF_CONTROLLER: { label: 'Turn off controller', describe: 'Powers off a Steam Controller (2026).' },
  CALIBRATE_TRIGGERS: { label: 'Calibrate triggers', describe: 'Finds where a DualSense’s adaptive triggers start to resist.' },
  SET_MOTION_STICK_NEUTRAL: { label: 'Set tilt neutral', describe: 'Uses the controller’s current orientation as neutral for tilt input and steering.' },
  RECENTER_GYRO_DEFLECTION: { label: 'Recenter gyro deflection', describe: 'Captures a fresh relative angular neutral on every connected controller at its next poll. Keeps gravity-based motion neutral and raw sensor passthrough unchanged.' },
  RESTART_GYRO_CALIBRATION: { label: 'Start continuous gyro calibration', describe: 'Resets the drift estimate and starts calibrating every connected motion controller immediately. Keep them still. Continues until Finish continuous gyro calibration; no countdown.' },
  FINISH_GYRO_CALIBRATION: { label: 'Finish continuous gyro calibration', describe: 'Stops continuous calibration on every connected motion controller and saves their drift offsets. Pair with Start continuous gyro calibration.' },
}

/** A command's name, or undefined when the value is not one of these commands. */
export const commandLabel = (value: string) => {
  const cycle = parseCycleBinding(value)
  if (cycle) return `Cycle binding · ${cycle.length} steps`
  const sound = playSoundLabel(value)
  return sound ?? COMMAND_LABELS[value.trim().replace(/^"|"$/g, '').toUpperCase()]?.label
}


export function specialActionDescription(value: string): string {
  const descriptions: Record<string, string> = {
    GYRO_OFF: 'Overrides gyro off on this controller while active. Choose normal or toggle behavior in command settings; other controllers remain independent.',
    GYRO_ON: 'Overrides gyro on on this controller while active. Choose normal or toggle behavior in command settings. The newest local override wins.',
    GYRO_OFF_ALL: 'Disables gyro on every connected controller while this input is held.',
    GYRO_ON_ALL: 'Enables gyro on every connected controller while this input is held.',
    GYRO_INVERT: 'Reverses both horizontal and vertical gyro movement while held.',
    GYRO_INV_X: 'Reverses horizontal gyro movement while held.',
    GYRO_INV_Y: 'Reverses vertical gyro movement while held.',
    GYRO_TRACKBALL: 'Keeps gyro mouse movement gliding after rotation stops, while held.',
    GYRO_TRACK_X: 'Keeps horizontal gyro mouse movement gliding after rotation stops, while held.',
    GYRO_TRACK_Y: 'Keeps vertical gyro mouse movement gliding after rotation stops, while held.',
  }
  return descriptions[value] ?? 'Changes the controller behavior while this input is held.'
}
