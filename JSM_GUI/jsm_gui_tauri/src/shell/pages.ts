import type { IconName } from '../components/icons/Icon'

// One page per physical control, the way Steam Input splits them up, instead of
// one page carrying every binding on the controller.
export type ControlTab = 'buttons' | 'dpad' | 'triggers' | 'joysticks'
export type StudioTab = 'configurations' | 'bases' | 'associations' | 'globalChords' | 'timing' | 'ai' | 'deviceVisibility' | 'appearance' | 'settings' | 'startup' | 'help' | 'credits' | 'debugConsole'
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
  /** Studio pages belong to one of two places (console v2, V6): the Library
   *  (tabs on LB/RB) or Settings (categories in the rail on LT/RT). */
  hub?: StudioHub
}

export type StudioHub = 'library' | 'settings'

const page = (tab: PrimaryTab, labelKey: string, label: string, icon: IconName, group: PageGroup, purpose: string, hub?: StudioHub): PageMeta =>
  ({ tab, labelKey, label, icon, group, purpose, hub })

/** Home (2a): where the app opens, and where View returns from anywhere. */
export const HOME_PAGE: PageMeta = page('home', 'app.nav.home', 'Home', 'overview', 'home', 'This configuration, and the Studio tools that apply to every configuration.')

/** Page tabs, in LB/RB order (console v2, V5): Layout · Buttons · Sticks ·
 *  Triggers · Trackpads · Gyro · Menus · Modes. The ids stay as they were so
 *  routes, events and tests keep working; only the names changed. D-Pad is a
 *  section of Buttons now, not a tab (DPAD_PAGE below keeps its route). */
export const CONTROL_PAGES: PageMeta[] = [
  page('overview', 'app.nav.overview', 'Layout', 'overview', 'controls', 'Everything this configuration does, on the controller. Select an input to change it.'),
  page('buttons', 'app.nav.buttons', 'Buttons', 'buttons', 'controls', 'Face buttons, bumpers, menu buttons, D-pad, back buttons and grips.'),
  page('joysticks', 'app.nav.joysticks', 'Sticks', 'joysticks', 'controls', 'What each stick is for, and how it feels.'),
  page('triggers', 'app.nav.triggers', 'Triggers', 'triggers', 'controls', 'Half and full press for each trigger, and how the two combine.'),
  page('touchpad', 'app.nav.trackpads', 'Trackpads', 'trackpads', 'controls', 'Each pad has its own mode. Select a zone on the picture to bind it.'),
  page('gyro', 'app.nav.gyro', 'Gyro', 'gyro', 'controls', 'How tilting the controller moves your aim, and when.'),
  page('virtualMenus', 'app.nav.virtualMenus', 'Menus', 'library', 'controls', 'Wheels, grids and hotbars that put many actions on one button.'),
  page('layers', 'app.nav.layers', 'Layers', 'layers', 'controls', 'Swap a few bindings while a layer is on.'),
]

/** The old D-Pad tab: still routable (events, deep links), shown as Buttons. */
export const DPAD_PAGE: PageMeta = page('dpad', 'app.nav.dpad', 'D-Pad', 'dpad', 'controls', 'Four directions; diagonals appear when the mode sends them.')

/** The Library (console v2, V6): your games' configurations, and which game
 *  launches which. Tabs on LB/RB. */
export const LIBRARY_PAGES: PageMeta[] = [
  page('configurations', 'app.nav.configurations', 'Games', 'library', 'studio', 'Every configuration and base in your config folder, and which one is live.', 'library'),
  page('bases', 'app.nav.bases', 'Bases', 'inherited', 'studio', 'Shared settings games are built on. Change a base and every game on it follows.', 'library'),
  page('associations', 'app.nav.associations', 'Launch with game', 'associations', 'studio', 'Make a configuration live by itself when its game comes to the front.', 'library'),
]

/** Settings (console v2, V6): everything shared by every configuration, as
 *  categories in the rail (LT/RT). Guides, the log and credits sit last. */
export const SETTINGS_PAGES: PageMeta[] = [
  page('settings', 'app.nav.preferences', 'Controller', 'preferences', 'studio', 'How the controller drives this app, its keyboard, calibration, light, sounds and pads.', 'settings'),
  page('globalChords', 'app.nav.globalChords', 'Hold to swap', 'chords', 'studio', 'Hold a button, or a few together, to swap in another whole configuration. Let go to come back.', 'settings'),
  page('timing', 'app.nav.timing', 'Press timing', 'timing', 'studio', 'How long a hold is, how quick a double-tap is. Shared by every configuration, saved as you change it.', 'settings'),
  page('deviceVisibility', 'app.nav.deviceVisibility', 'Hide the real controller', 'visibility', 'studio', 'Games see only what JSM sends, so nothing reacts twice.', 'settings'),
  page('appearance', 'app.nav.appearance', 'Look & language', 'appearance', 'studio', 'Move across a choice to see it before you pick it.', 'settings'),
  page('startup', 'app.nav.startup', 'Startup', 'apply', 'studio', 'What happens when Windows starts, and keeping JSM Evolved up to date.', 'settings'),
  page('ai', 'app.nav.aiAssistant', 'Assistant', 'ai', 'studio', 'Choose how the assistant connects. You only do this once.', 'settings'),
  page('help', 'app.nav.documentation', 'Guides & reference', 'docs', 'studio', 'Plain-language guides and the full reference. Works offline.', 'settings'),
  page('debugConsole', 'app.nav.debugConsole', 'Troubleshooting log', 'debug', 'studio', 'The mapper’s live log, a line to send it commands, and the fixes for when something is wrong.', 'settings'),
  page('credits', 'app.nav.credits', 'About & credits', 'source', 'studio', 'The people, projects and community that made JSM Evolved possible.', 'settings'),
]

/** Where the Settings rail draws its divider: Guides, the log and credits sit
 *  apart from the settings themselves (Settings.dc.html). */
export const SETTINGS_REFERENCE_START: StudioTab = 'help'

export const STUDIO_PAGES: PageMeta[] = [...LIBRARY_PAGES, ...SETTINGS_PAGES]

export const ALL_PAGES = [HOME_PAGE, ...CONTROL_PAGES, DPAD_PAGE, ...STUDIO_PAGES]
export const pageMeta = (tab: PrimaryTab): PageMeta => ALL_PAGES.find(item => item.tab === tab) ?? CONTROL_PAGES[0]
export const isStudioPage = (tab: PrimaryTab) => pageMeta(tab).group === 'studio'
export const studioHub = (tab: PrimaryTab): StudioHub | undefined => pageMeta(tab).hub
export const HUB_TITLE: Record<StudioHub, string> = { library: 'Library', settings: 'Settings' }
export const isHomePage = (tab: PrimaryTab) => tab === 'home'

/** LB/RB walk the configuration pages or the Library tabs. Home has no strip,
 *  and Settings has none either: its categories are the rail, stepped by
 *  LT/RT only, so LB/RB do nothing there (console v2, V1/V6). */
export const pageOrder = (tab: PrimaryTab): PrimaryTab[] =>
  isHomePage(tab) || studioHub(tab) === 'settings' ? [tab] : (studioHub(tab) === 'library' ? LIBRARY_PAGES : CONTROL_PAGES).map(item => item.tab)

/** The order a page change slides in: the strip, or the Settings rail. */
export const slideOrder = (tab: PrimaryTab): PrimaryTab[] =>
  studioHub(tab) === 'settings' ? SETTINGS_PAGES.map(item => item.tab) : pageOrder(tab)

/** What LT/RT step on a page, as the footer and the rail name them (console v2
 *  Kit: "Section", "Category", "Mode", "Topic"). */
export const stepLabel = (tab: PrimaryTab): string =>
  studioHub(tab) === 'settings' ? (tab === 'help' ? 'Topic' : 'Category') : tab === 'overview' ? 'Layer' : 'Section'
