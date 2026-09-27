// The JoyShockMapper commands a binding can run, as the action picker offers
// them and as a binding row reads once one is chosen. CALIBRATE_GYRO is the
// full calibration run: it waits for the controller to be put down, counts
// down and calibrates with the overlay HUD showing progress, and cancels if
// the controller moves -- the same run as Gyro's Recalibrate button and the
// reserved chord. The two older commands are its raw halves.
export const COMMAND_LABELS: Record<string, { label: string; describe: string }> = {
  CALIBRATE_GYRO: {
    label: 'Calibrate gyro',
    describe: 'Put the controller down: the overlay counts down, calibrates and shows progress. Picking it up cancels the run.',
  },
  TURN_OFF_CONTROLLER: { label: 'Turn off controller', describe: 'Powers off a Steam Controller (2026).' },
  CALIBRATE_TRIGGERS: { label: 'Calibrate triggers', describe: 'Finds where a DualSense’s adaptive triggers start to resist.' },
  RESTART_GYRO_CALIBRATION: { label: 'Start gyro calibration (raw)', describe: 'Starts calibrating at once, with no countdown or overlay. Pair with Finish.' },
  FINISH_GYRO_CALIBRATION: { label: 'Finish gyro calibration (raw)', describe: 'Ends a calibration started with Start (raw).' },
}

/** A command's name, or undefined when the value is not one of these commands. */
export const commandLabel = (value: string) => COMMAND_LABELS[value.trim().replace(/^"|"$/g, '').toUpperCase()]?.label
