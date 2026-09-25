import type { IconName } from '../components/icons/Icon'

// One page per physical control, the way Steam Input splits them up, instead of
// one page carrying every binding on the controller.
export type ControlTab = 'buttons' | 'dpad' | 'triggers' | 'joysticks'
export type TuningTab = 'sensors' | 'gripSensors' | 'menuLayout' | 'timing' | 'ai'
export type StudioTab = 'configurations' | 'associations' | 'globalChords' | 'deviceVisibility' | 'debugConsole' | 'settings' | 'help'
export type PrimaryTab = 'overview' | ControlTab | 'touchpad' | 'gyro' | 'layers' | TuningTab | StudioTab

/** Which strip of tabs a page lives in, and the eyebrow over its title. */
export type PageGroup = 'controls' | 'tuning' | 'studio'

export type PageMeta = {
  tab: PrimaryTab
  labelKey: string
  label: string
  icon: IconName
  group: PageGroup
  /** The one-line purpose under the page title (HANDOFF.md, "Copy deck"). */
  purpose: string
}

const page = (tab: PrimaryTab, labelKey: string, label: string, icon: IconName, group: PageGroup, purpose: string): PageMeta =>
  ({ tab, labelKey, label, icon, group, purpose })

/** Page tabs, in LT/RT order. Tuning pages sit behind the Tuning tab's menu. */
export const CONTROL_PAGES: PageMeta[] = [
  page('overview', 'app.nav.overview', 'Overview', 'overview', 'controls', 'Everything this configuration does, on the controller. Select an input to edit it.'),
  page('buttons', 'app.nav.buttons', 'Buttons', 'buttons', 'controls', 'Face buttons, bumpers, menu buttons, back paddles and grips.'),
  page('dpad', 'app.nav.dpad', 'D-Pad', 'dpad', 'controls', 'Four directions; diagonals appear when the mode sends them.'),
  page('triggers', 'app.nav.triggers', 'Triggers', 'triggers', 'controls', 'Soft and full pull for each trigger, and how the two combine.'),
  page('joysticks', 'app.nav.joysticks', 'Joysticks', 'joysticks', 'controls', 'Stick mode, deadzones and the bindings each mode sends.'),
  page('touchpad', 'app.nav.trackpads', 'Trackpads', 'trackpads', 'controls', 'Each pad has its own mode, click, touch and regions. Select a region on the preview to bind it.'),
  page('gyro', 'app.nav.gyro', 'Gyro', 'gyro', 'controls', 'How tilting the controller moves your aim, and when.'),
  page('layers', 'app.nav.layers', 'Layers', 'layers', 'controls', 'Layers stack in order; the last applied wins a conflict. Editing a layer never activates it.'),
]

export const TUNING_PAGES: PageMeta[] = [
  page('gripSensors', 'app.nav.gripSensors', 'Grip sensors', 'grips', 'tuning', 'Capacitive grips on the back. Live contact, bindings and sensitivity.'),
  page('sensors', 'app.nav.sensors', 'Trackpad tuning', 'padTuning', 'tuning', 'How both pads feel as a mouse: smoothing, press, glide, haptics and acceleration.'),
  page('menuLayout', 'app.nav.menuLayout', 'Menu layout', 'menuLayout', 'tuning', 'How pad and stick menus look in game. The preview is drawn by the overlay’s own renderer.'),
  page('timing', 'app.nav.timing', 'Press timing & polling', 'timing', 'tuning', 'How long holds and taps take, and how often JSM reads the controller.'),
  page('ai', 'app.nav.aiAssistant', 'AI assistant', 'ai', 'tuning', 'Describe what you want in plain words; review the change before it’s applied.'),
]

export const STUDIO_PAGES: PageMeta[] = [
  page('configurations', 'app.nav.configurations', 'Configurations', 'library', 'studio', 'Every profile and template in your config folder, and which one is running.'),
  page('associations', 'app.nav.associations', 'Associations', 'associations', 'studio', 'Load a configuration automatically when an app comes to the front.'),
  page('globalChords', 'app.nav.globalChords', 'Global chords', 'chords', 'studio', 'Work in every configuration. Hold the chord to swap; release to return.'),
  page('deviceVisibility', 'app.nav.deviceVisibility', 'Device visibility', 'visibility', 'studio', 'Hide the physical controller from games so they only see the virtual one. Without this, some games read both and double your inputs.'),
  page('debugConsole', 'app.nav.debugConsole', 'Debug console', 'debug', 'studio', 'The mapper’s live log, and a line to send it commands.'),
  page('settings', 'app.nav.preferences', 'Preferences', 'preferences', 'studio', 'App-wide settings. Configuration settings live on each page.'),
  page('help', 'app.nav.documentation', 'Documentation', 'docs', 'studio', 'JoyShockMapper reference and Studio guides, offline.'),
]

export const ALL_PAGES = [...CONTROL_PAGES, ...TUNING_PAGES, ...STUDIO_PAGES]
export const pageMeta = (tab: PrimaryTab): PageMeta => ALL_PAGES.find(item => item.tab === tab) ?? CONTROL_PAGES[0]
export const isStudioPage = (tab: PrimaryTab) => pageMeta(tab).group === 'studio'
export const isTuningPage = (tab: PrimaryTab) => pageMeta(tab).group === 'tuning'

/** LT/RT walk the configuration pages (tuning included) or the Studio tabs. */
export const pageOrder = (tab: PrimaryTab): PrimaryTab[] =>
  (isStudioPage(tab) ? STUDIO_PAGES : [...CONTROL_PAGES, ...TUNING_PAGES]).map(item => item.tab)
