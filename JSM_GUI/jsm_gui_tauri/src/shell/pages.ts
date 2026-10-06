import type { IconName } from '../components/icons/Icon'

// One page per physical control, the way Steam Input splits them up, instead of
// one page carrying every binding on the controller.
export type ControlTab = 'buttons' | 'dpad' | 'triggers' | 'joysticks'
export type StudioTab = 'configurations' | 'associations' | 'globalChords' | 'timing' | 'ai' | 'deviceVisibility' | 'appearance' | 'settings' | 'help' | 'credits' | 'debugConsole'
export type PrimaryTab = 'home' | 'overview' | ControlTab | 'touchpad' | 'virtualMenus' | 'gyro' | 'layers' | StudioTab

/**
 * Which strip of tabs a page lives in, and the eyebrow over its title. There
 * is no Tuning group any more (console refinement D2): each tuning surface
 * opens as a sheet beside what it tunes, and the global ones are Studio pages.
 */
export type PageGroup = 'home' | 'controls' | 'studio'

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

/** Home (2a): where the app opens, and where View returns from anywhere. */
export const HOME_PAGE: PageMeta = page('home', 'app.nav.home', 'Home', 'overview', 'home', 'This configuration, and the Studio tools that apply to every configuration.')

/** Page tabs, in LT/RT order. */
export const CONTROL_PAGES: PageMeta[] = [
  page('overview', 'app.nav.overview', 'Overview', 'overview', 'controls', 'Everything this configuration does, on the controller. Select an input to edit it.'),
  page('buttons', 'app.nav.buttons', 'Buttons', 'buttons', 'controls', 'Face buttons, bumpers, menu buttons, back paddles and grips.'),
  page('dpad', 'app.nav.dpad', 'D-Pad', 'dpad', 'controls', 'Four directions; diagonals appear when the mode sends them.'),
  page('triggers', 'app.nav.triggers', 'Triggers', 'triggers', 'controls', 'Soft and full pull for each trigger, and how the two combine.'),
  page('joysticks', 'app.nav.joysticks', 'Joysticks', 'joysticks', 'controls', 'Stick mode, deadzones and the bindings each mode sends.'),
  page('touchpad', 'app.nav.trackpads', 'Trackpads', 'trackpads', 'controls', 'Each pad has its own mode. Select a region on the preview to bind it.'),
  page('virtualMenus', 'app.nav.virtualMenus', 'Virtual menus', 'library', 'controls', 'Create wheels, grids and hotbars. Open them from any regular binding card.'),
  page('gyro', 'app.nav.gyro', 'Gyro', 'gyro', 'controls', 'How tilting the controller moves your aim, and when.'),
  page('layers', 'app.nav.layers', 'Layers', 'layers', 'controls', 'Layers stack in order; the last applied wins a conflict. Editing a layer never activates it.'),
]

export const STUDIO_PAGES: PageMeta[] = [
  page('configurations', 'app.nav.configurations', 'Configurations', 'library', 'studio', 'Every profile and template in your config folder, and which one is running.'),
  page('associations', 'app.nav.associations', 'Associations', 'associations', 'studio', 'Load a configuration automatically when an app comes to the front.'),
  page('globalChords', 'app.nav.globalChords', 'Global chords', 'chords', 'studio', 'Work in every configuration. Hold the chord to swap; release to return.'),
  page('timing', 'app.nav.timing', 'Press timing & polling', 'timing', 'studio', 'Shared by every configuration.'),
  page('ai', 'app.nav.aiAssistant', 'AI assistant', 'ai', 'studio', 'Describe what you want in plain words; review the change before it’s applied.'),
  page('deviceVisibility', 'app.nav.deviceVisibility', 'Device visibility', 'visibility', 'studio', 'Hide the physical controller from games so they only see the virtual one. Without this, some games read both and double your inputs.'),
  page('appearance', 'app.nav.appearance', 'Appearance', 'appearance', 'studio', 'Theme, language and the accent the app wears. The window and tray icons follow it.'),
  page('settings', 'app.nav.preferences', 'Preferences', 'preferences', 'studio', 'Startup and controller settings. Configuration settings live on each page.'),
  page('help', 'app.nav.documentation', 'Documentation', 'docs', 'studio', 'JoyShockMapper reference and JSM Evolved guides, offline.'),
  page('credits', 'app.nav.credits', 'Credits', 'source', 'studio', 'The people, projects and community that made JSM Evolved possible.'),
  page('debugConsole', 'app.nav.debugConsole', 'Debug console', 'debug', 'studio', 'The mapper’s live log, and a line to send it commands.'),
]

export const ALL_PAGES = [HOME_PAGE, ...CONTROL_PAGES, ...STUDIO_PAGES]
export const pageMeta = (tab: PrimaryTab): PageMeta => ALL_PAGES.find(item => item.tab === tab) ?? CONTROL_PAGES[0]
export const isStudioPage = (tab: PrimaryTab) => pageMeta(tab).group === 'studio'
export const isHomePage = (tab: PrimaryTab) => tab === 'home'

/** LT/RT walk the configuration pages or the Studio tabs; Home has no strip. */
export const pageOrder = (tab: PrimaryTab): PrimaryTab[] =>
  isHomePage(tab) ? [tab] : (isStudioPage(tab) ? STUDIO_PAGES : CONTROL_PAGES).map(item => item.tab)
