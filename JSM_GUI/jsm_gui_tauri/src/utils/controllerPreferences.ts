import type { ControllerPreferences, RuntimeMappingState } from '../platform/desktopBridge'

// The controller preferences as the Preferences page and the first-connect
// prompt send them: every field, filled from the runtime state with these
// defaults for what an older state file does not carry.
export const CONTROLLER_PREFERENCE_DEFAULTS: ControllerPreferences = {
  ledColor: '#ffffff', ledBrightness: 100,
  gyroCalibrationSeconds: 5, gyroCalibrationDelay: 0, connectSound: -1, shutdownSound: -1, soundGain: 0, disableHardwareGyroCalibration: true,
  leftPadRotation: 0, rightPadRotation: 0, bootSoundLevel: -1,
  firmwareSoundPromptDone: false, connectSoundFile: null, shutdownSoundFile: null,
  soundActuators: 'grips',
}

export const controllerPreferencesFromRuntime = (state: Partial<RuntimeMappingState> | null | undefined): ControllerPreferences => {
  const defaults = CONTROLLER_PREFERENCE_DEFAULTS
  return {
    ledColor: state?.ledColor ?? defaults.ledColor,
    ledBrightness: state?.ledBrightness ?? defaults.ledBrightness,
    gyroCalibrationSeconds: state?.gyroCalibrationSeconds ?? defaults.gyroCalibrationSeconds,
    gyroCalibrationDelay: state?.gyroCalibrationDelay ?? defaults.gyroCalibrationDelay,
    connectSound: state?.connectSound ?? defaults.connectSound,
    shutdownSound: state?.shutdownSound ?? defaults.shutdownSound,
    soundGain: state?.soundGain ?? defaults.soundGain,
    disableHardwareGyroCalibration: state?.disableHardwareGyroCalibration ?? defaults.disableHardwareGyroCalibration,
    leftPadRotation: state?.leftPadRotation ?? defaults.leftPadRotation,
    rightPadRotation: state?.rightPadRotation ?? defaults.rightPadRotation,
    bootSoundLevel: state?.bootSoundLevel ?? defaults.bootSoundLevel,
    firmwareSoundPromptDone: state?.firmwareSoundPromptDone ?? defaults.firmwareSoundPromptDone,
    connectSoundFile: state?.connectSoundFile ?? defaults.connectSoundFile,
    shutdownSoundFile: state?.shutdownSoundFile ?? defaults.shutdownSoundFile,
    soundActuators: state?.soundActuators ?? defaults.soundActuators,
  }
}
