export function settingHelp(label: string): string | undefined {
 const name = label.toLowerCase()
 if (/real.world.*calibration/.test(name)) return 'Matches physical controller rotation to in-game camera rotation. Calibrate it for the game first so a sensitivity of 1 represents matching turns; use the calibration guide to measure it.'
 if (/in.game.*sens/.test(name)) return 'Enter the mouse sensitivity used inside the game. Together with Real World Calibration, this keeps gyro sensitivity expressed in meaningful rotation ratios.'
 if (/gyro.*sens|minimum sens|maximum sens|slow sensitivity|fast sensitivity/.test(name)) return 'Controls how far the camera turns for a physical gyro turn. Use lower sensitivity for precise aiming and higher sensitivity for faster turns. Calibrate the game before comparing values.'
 // Noise and steadying. These come before the generic rules below, which would
 // otherwise answer "deadzone" and "cutoff" with the wrong thing entirely.
 if (/deadzone.*°\/s|deadzone \(deg/.test(name)) return 'Gyro rotation slower than this produces no output at all, which is what silences the controller\u2019s resting noise. Set it just above what the gyro reports when the controller is sitting still: higher also removes slow deliberate aiming.'
 if (/steadying/.test(name)) return 'The speed at which full output returns. Between the deadzone and this value output is faded in rather than switched on, so leaving the deadzone is a ramp instead of a step. It must be above the deadzone to do anything.'
 if (/smooth threshold/.test(name)) return 'Rotation below this speed is smoothed; above it passes through untouched, with a blend between the two. Set it so resting jitter is smoothed while a real turn stays immediate.'
 if (/smoothing|smooth time/.test(name)) return 'Length of the smoothing window. Increasing it steadies slow aiming but adds delay, and it only applies below the smooth threshold. Start low and increase only enough to address visible jitter.'
 if (/speed coeff/.test(name)) return 'How quickly the One Euro filter stops smoothing as you speed up. Higher reacts sooner to fast motion, so there is less lag on a flick and less smoothing during one.'
 if (/cutoff|min cut/.test(name)) return 'Controls the filter response. A higher cutoff retains faster changes and reduces filtering delay; a lower cutoff smooths more strongly.'
 if (/angle snap/.test(name)) return 'Pulls aim onto the nearest horizontal or vertical when it is within this angle of one, so a nearly level sweep comes out level. 0 disables it.'
 if (/decel brake strength/.test(name)) return 'How much gyro output is held back while you are slowing a turn down, which is what takes the overshoot off the end of a flick. 0 is off; 1 silences the gyro completely at full braking.'
 if (/decel brake threshold/.test(name)) return 'How sharply you have to slow down before braking starts, with full braking at about three and a half times that rate. Lower engages more eagerly. Braking only applies while the gyro is turning between 2 and 60 °/s, so it never touches a resting controller or a full-speed turn.'
 if (/press damping|click dampen/.test(name)) return 'Suppresses the gyro kick from pressing the trackpad, so a click does not nudge your aim. Raise it if firing by pad click pulls the camera.'
 if (/deadzone/.test(name)) return 'Defines the region of input travel that is ignored. Increase only enough to prevent unwanted activation while the input rests.'
 if (/calibration/.test(name)) return 'Measures a reference used to interpret controller input. Follow the calibration instructions and keep the controller still when measuring its resting state.'
 return undefined
}
