import { isValidElement, memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { useTranslation } from 'react-i18next'
import styles from './HelpDocsPage.module.css'
import readmeMarkdown from '../assets/docs/JoyShockMapper-README.md?raw'
import { desktopBridge } from '../platform/desktopBridge'
import type { PrimaryTab } from '../shell/pages'
import { useStepClaim } from '../shell/stepClaims'
import { requestValueEntry } from '../nav/textEntry'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'

const MANUAL_URL = 'https://github.com/Electronicks/JoyShockMapper/blob/master/README.md'

function slugifyBase(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9 _-]/g, '')
    .trim()
    // GitHub-style anchors effectively preserve repeated separators.
    .replace(/\s/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'section'
}

function createSlugger() {
  const counts = new Map<string, number>()
  return (value: string) => {
    const base = slugifyBase(value)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen}`
  }
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode }
    return flattenText(props.children)
  }
  return ''
}

function clearFindHighlights(container: HTMLElement) {
  const marks = Array.from(container.querySelectorAll<HTMLElement>('[data-jsm-docs-find-match="1"]'))
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
    parent.normalize()
  }
}

function collectFindMatches(container: HTMLElement, query: string, baseClassName: string) {
  const normalizedQuery = query.toLowerCase()
  if (!normalizedQuery) return []

  const textNodes: Text[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const textNode = node as Text
    const value = textNode.nodeValue ?? ''
    const parent = textNode.parentElement
    const skip =
      !value ||
      !parent ||
      parent.closest('[data-jsm-docs-find-match="1"]') !== null ||
      ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)
    if (!skip) {
      textNodes.push(textNode)
    }
    node = walker.nextNode()
  }

  const matches: HTMLElement[] = []

  for (const textNode of textNodes) {
    const source = textNode.nodeValue ?? ''
    const lower = source.toLowerCase()
    let searchIndex = 0
    let matchIndex = lower.indexOf(normalizedQuery, searchIndex)

    if (matchIndex < 0) continue

    const fragment = document.createDocumentFragment()
    while (matchIndex >= 0) {
      if (matchIndex > searchIndex) {
        fragment.appendChild(document.createTextNode(source.slice(searchIndex, matchIndex)))
      }

      const mark = document.createElement('mark')
      mark.dataset.jsmDocsFindMatch = '1'
      mark.className = baseClassName
      mark.textContent = source.slice(matchIndex, matchIndex + normalizedQuery.length)
      fragment.appendChild(mark)
      matches.push(mark)

      searchIndex = matchIndex + normalizedQuery.length
      matchIndex = lower.indexOf(normalizedQuery, searchIndex)
    }

    if (searchIndex < source.length) {
      fragment.appendChild(document.createTextNode(source.slice(searchIndex)))
    }

    textNode.parentNode?.replaceChild(fragment, textNode)
  }

  return matches
}

// ---------------------------------------------------------------------------
// Topics (Tuning and Studio Pages 16k): the JoyShockMapper README, cut at its
// ## and ### headings and gathered into the topics a player looks for, plus
// Studio's own notes. Headings inside code fences are comments, not sections.

type Section = { title: string; body: string }
export type DocsTopic = {
  id: string
  title: string
  sections: string[]
  /** The page this topic is about, and the link text to it (X). */
  page?: { tab: PrimaryTab; label: string }
  /** A second link ("Press timing ▸"). */
  also?: { tab: PrimaryTab; label: string }
  /** The authored guide, in plain words, read before the manual's sections. */
  guide?: string
  markdown?: string
}

export function splitReadme(markdown: string): Section[] {
  const sections: Section[] = []
  let current: Section = { title: '', body: '' }
  let fenced = false
  for (const line of markdown.split(/\r?\n/)) {
    // A fence line is the backticks and an info string; ```X``` is inline code.
    if (/^\s*(```|~~~)[^`]*$/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^(#{1,3})\s+(.+?)\s*#*$/.exec(line)
    if (heading) {
      sections.push(current)
      current = { title: heading[2].trim(), body: '' }
    }
    current.body += `${line}\n`
  }
  sections.push(current)
  return sections.filter(section => section.body.trim())
}

const STEAM_CONTROLLER_NOTES = `## Steam Controller notes

JSM Evolved talks to the 2026 Steam Controller directly, so the buttons Steam Input would normally claim have JoyShockMapper names of their own.

- Quick access (…): \`MISC1\`
- Right grip and left grip: \`MISC5\` and \`MISC6\`
- Right pad click and left pad click: \`MISC2\` and \`MISC3\`
- L4 and L5: \`LSL\` and \`LSR\`
- R4 and R5: \`RSR\` and \`RSL\`
- Right pad grid and left pad grid: \`RT1\`…\`RT25\` and \`LT1\`…\`LT25\`

### Grips

The grips are touch sensors, not buttons: they report contact, and \`GRIP_SENSOR_RANGE\` and \`GRIP_FLICKER_GUARD\` set how firm a touch counts. A grip can stay held for a little longer after the hand lifts, with \`LEFT_GRIP_RELEASE_DELAY\` and \`RIGHT_GRIP_RELEASE_DELAY\` in milliseconds, which stops a brief lift from dropping gyro aim.

### Trackpads

Each pad is either a mouse (\`MOUSE\`) or a grid of regions (\`GRID_AND_STICK\`), never both at once. It can change while a button is held, so \`MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK\` turns the right pad into a menu while its click is held. \`GRID_SHAPE\` picks a grid, four-way or eight-way wedges, or a radial menu.

The pads are mounted at an angle (about 10.7 degrees, the right pad the other way). **Settings ▸ Controller ▸ Trackpad rotation** turns each pad's reading so a swipe straight up the controller reads as straight up, for every configuration, for menus, the touch stick and the mouse alike, and for the touch the app shows. The values are \`LEFT_TOUCHPAD_ROTATION\` and \`RIGHT_TOUCHPAD_ROTATION\`, in degrees, positive clockwise as you look at the controller; \`0\` keeps the pad as mounted.

### Gyro

The controller's firmware re-centres its gyro whenever it thinks it is lying still, and a slow, deliberate tilt can pass for still. JSM turns that off when the controller connects, so slow aim is not eaten; drift is then corrected by **Recalibrate gyro**, which cancels itself if the controller moves during the run. **Stop the Steam Controller recalibrating its gyro** in Settings ▸ Controller (\`DISABLE_HARDWARE_GYRO_CALIBRATION\`, on by default) turned off, gives the firmware its calibration back if you would rather have it.

Each controller's last calibration is saved, so a controller that switches off, drops out of range, reconnects, or comes back after the app restarts starts from it rather than from nothing.

### Light

The light is a colour LED. App settings provide a white default colour at 100% brightness. Each profile can override either value with \`LIGHT_BAR\` and \`LED_BRIGHTNESS\`; leaving one unset uses the app default. A button action can set either value on press, hold, or release. The button editor's command picker also offers **LED while held**: a command that lights the LED in its own colour and brightness while the input is down and returns to the profile value on release; its colour and brightness are set in the command's settings panel.

### Controller sounds

**Silence its own jingles** in Settings ▸ Controller sets the controller's firmware jingle level to zero; switching it off restores the factory volume. This also silences the controller's lost-connection and low-battery cues.

**Your sounds** (Settings ▸ Controller ▸ Controller sounds, Y) accepts MIDI and MP3 files. The controller has no speaker: its haptic actuators play tones, so a sound is a single-voice melody. A MIDI file gives clean notes (pick the melody track; JSM suggests one); for an MP3, trim a clip and JSM follows its strongest pitch. Either way the voice is moved by whole octaves into the range where the actuators sing rather than buzz, and repeated notes are separated so they stay distinct. Jingles and simple melodies work best; speech, chords and dense mixes become approximations. Preview the converted result on the controller before choosing it for On connect, On turn off or a **Play sound** binding. The original file stays in the library so you can trim it again.

**Your sounds play on** chooses the actuators: the controller's own tunes play on the two motors behind the grips, so that pair is the default and gives your sounds the same voice. The trackpads' actuators are thinner and quieter for the same notes.

### Quick tools

Quick tools is the built-in Hold to swap: hold Steam or Quick access (···) and its buttons open the on-screen keyboard, pause mapping and calibrate the gyro. Change its buttons in Settings ▸ Hold to swap, or make your own copy to change what it does. Reset everything to defaults puts it back.
`

export const GUIDES: Record<string, string> = {
  start: `## Your first configuration

A configuration is everything one game needs: what each button sends, how the sticks, triggers, trackpads and gyro behave, and any modes. JSM Evolved keeps one per game in your library.

Start from **Home ▸ New for a game**: pick the game, pick how you play, try it, then change what you like. When the game comes to the front, its configuration goes live by itself (Library ▸ Launch with game).

While the app is in front, your controller drives the app instead of the game. Press **View** to come Home from anywhere and **☰** for Review changes, Undo and Save.`,
  buttons: `## Tap, hold and double-tap

One button can do three jobs: a quick tap sends one thing, a hold sends another, and two quick taps can send a third.

How long a hold is, and how quick a double-tap must be, are set once for everything in **Settings ▸ Press timing**.

If a tap feels late, that button also has a hold or a double-tap. JSM waits to see which you meant.

**Press together with…** sends something different when two buttons go down at once, and **Chords** make a button send something else while another one is held.`,
  triggers: `## Half and full press

Each trigger has two points: a **half press** partway down and a **full press** at the bottom. Give each its own action, or let the full press take over from the half press, like a camera's focus and shutter.

Adaptive triggers on a DualSense push back; set their feel on the Triggers tab.`,
  gyro: `## Aiming with gyro

Gyro turns the controller's movement into aim. Answer three questions on the Gyro tab: **when is it on**, **how fast**, and **does it feel right**.

**Match a full turn (360°)** makes one full turn of the controller one full turn in the game, so speed means the same in every game. **Ignore Windows pointer speed** stops Windows' own mouse setting changing it.`,
  sticks: `## Flick stick

Flick stick turns the right stick into a direction you point at. Flick it and your view snaps to face that way; keep turning the stick to keep turning.

It needs to know how far one full turn is. Set **Match a full turn (360°)** on Gyro first, and each flick lands where you point.`,
  trackpads: `## Trackpads

Each trackpad can be a mouse, a set of buttons in zones, a touch stick, or a menu. Pick the mode on the Trackpads tab, then the zones on the picture.

The pads are mounted at an angle; **Settings ▸ Controller ▸ Trackpad rotation ▸ Level** turns their readings so a swipe up reads as up.`,
  layers: `## Layers, chords and mode shifts

The names follow Steam Input.

A **layer** swaps a few bindings while it's on: vehicles, the map. Hold or tap a button to turn one on; the Layers tab lists what changes in each. When two layers are on, the last one turned on wins.

A **chord** is smaller: one button sends something else while another is held. Set it in a button's sheet ▸ Chords.

A **mode shift** changes how a stick, trackpad, trigger or gyro works while a button is held: the right stick flicks while LB is down. Set it on that input's page ▸ Mode shift.

**Hold to swap** is bigger: hold a button and a whole other configuration takes over until you let go (Settings ▸ Hold to swap).`,
  virtual: `## Virtual controller

Some games want a gamepad, not a keyboard and mouse. JSM can make a virtual Xbox or DualShock 4 that games see instead of your real controller (☰ ▸ Games see).

Hide the real controller from those games so they don't read both (Settings ▸ Hide the real controller).`,
  commands: `## Commands and files

Every configuration is a text file. Turn on **Settings ▸ Look & language ▸ Show config names** to see each setting's name beside its label, for editing a file by hand.

The Troubleshooting log takes commands too: type one with the on-screen keyboard and it goes to the mapper straight away.`,
  steam: `## Steam Controller

JSM Evolved talks to the Steam Controller directly, so its grips, back buttons and trackpad clicks are inputs of their own. Close Steam's own controller support for it, or Steam and JSM both react.`,
  troubleshooting: `## When something is wrong

Start in **Settings ▸ Troubleshooting log**: it shows what the mapper is doing. **Restart the mapper** loads the live configuration again; **Reconnect controllers** drops every controller for a moment and brings them back.

If a game reacts twice to one press, hide the real controller from it (**Settings ▸ Hide the real controller**). **Copy the log** puts the log on the clipboard for a bug report.`,
  about: `## Credits and licence

JSM Evolved is built on JoyShockMapper by Jibb Smart and Nicolas Lessard, under the MIT licence. **Settings ▸ About & credits** names the people and projects behind it.`,
}

export const DOCS_TOPICS: DocsTopic[] = [
  { id: 'start', title: 'Getting started', sections: ['JoyShockMapper', 'Installation for Players', 'Quick Start', 'Commands'], guide: GUIDES.start, page: { tab: 'overview', label: 'Open Layout' } },
  { id: 'buttons', title: 'Buttons and presses', sections: ['Digital Inputs', 'Tap & Hold', 'Binding Modifiers', 'Simultaneous Press', 'Diagonal Press', 'Chorded Press', 'Double Press', 'Gyro Button'], guide: GUIDES.buttons, page: { tab: 'buttons', label: 'Open Buttons' }, also: { tab: 'timing', label: 'Press timing' } },
  { id: 'triggers', title: 'Triggers', sections: ['Analog Triggers', 'Analog to digital', 'Full pull and modes', 'Adaptive Triggers'], guide: GUIDES.triggers, page: { tab: 'triggers', label: 'Open Triggers' } },
  { id: 'gyro', title: 'Gyro', sections: ['Gyro Mouse Inputs', 'Real World Calibration', 'Prerequisites', 'Calculating the real world calibration in a 3D game', 'Calculating the real world calibration in a 2D game'], guide: GUIDES.gyro, page: { tab: 'gyro', label: 'Open Gyro' } },
  { id: 'sticks', title: 'Sticks and flick stick', sections: ['Stick Configuration', 'Standard AIM mode', 'FLICK mode and variants', 'HYBRID_AIM mode', 'Other mouse modes', 'Digital modes', 'Motion Stick and lean bindings'], guide: GUIDES.sticks, page: { tab: 'joysticks', label: 'Open Sticks' }, also: { tab: 'gyro', label: 'Match a full turn (360°)' } },
  { id: 'trackpads', title: 'Trackpads', sections: ['Touchpad', 'Touch Sticks'], guide: GUIDES.trackpads, page: { tab: 'touchpad', label: 'Open Trackpads' } },
  { id: 'layers', title: 'Layers, chords and mode shifts', sections: ['Modeshifts'], guide: GUIDES.layers, page: { tab: 'layers', label: 'Open Layers' }, also: { tab: 'globalChords', label: 'Hold to swap' } },
  { id: 'virtual', title: 'Virtual controller', sections: ['ViGEm Virtual Controller', 'Xbox bindings', 'DS4 bindings', 'Virtual Controller Gyro'], guide: GUIDES.virtual, also: { tab: 'deviceVisibility', label: 'Hide the real controller' } },
  { id: 'commands', title: 'Commands and files', sections: ['Miscellaneous Commands', 'Configuration Files', 'OnStartup.txt', 'OnReset.txt', 'Autoload feature', 'Autoconnect feature'], guide: GUIDES.commands, page: { tab: 'debugConsole', label: 'Open the Troubleshooting log' } },
  { id: 'steam', title: 'Steam Controller notes', sections: [], guide: GUIDES.steam, markdown: STEAM_CONTROLLER_NOTES, page: { tab: 'buttons', label: 'Open Buttons' } },
  { id: 'troubleshooting', title: 'Troubleshooting', sections: ['Troubleshooting', 'Known and Perceived Issues', 'Bluetooth connectivity'], guide: GUIDES.troubleshooting, page: { tab: 'debugConsole', label: 'Open the Troubleshooting log' }, also: { tab: 'deviceVisibility', label: 'Hide the real controller' } },
  { id: 'about', title: 'Credits and licence', sections: ['Credits', 'Helpful Resources', 'License'], guide: GUIDES.about, page: { tab: 'credits', label: 'Open About & credits' } },
]

// "#### 3.2 FLICK mode" reads as "FLICK mode" once it is out of the README's
// numbered outline.
const withoutNumber = (title: string) => title.replace(/^\d+(\.\d+)*\.?\s+/, '')

export function buildTopics(markdown: string) {
  const sections = splitReadme(markdown)
  return DOCS_TOPICS.map(topic => {
    const guide = topic.guide ? topic.guide + '\n\n' : ''
    if (topic.markdown) return { ...topic, markdown: guide + topic.markdown }
    const wanted = new Set(topic.sections.map(title => title.toLowerCase()))
    const parts = sections.filter(section => wanted.has(withoutNumber(section.title).toLowerCase()))
    return { ...topic, markdown: guide + (parts.length ? '## From the JoyShockMapper manual\n\n' + parts.map(part => part.body).join('\n') : '') }
  })
}

// Counted on the text as it reads, so FLICK\_TIME in the source counts as the
// FLICK_TIME the find in the article sees.
const countMatches = (text: string, query: string) => {
  if (!query) return 0
  const haystack = text.replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, '$1').toLowerCase()
  const needle = query.toLowerCase()
  let count = 0
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + needle.length)) count++
  return count
}

// Which topic a setting from Y on a row, or a notice, is best read in: the one
// that mentions it most, with the connection help as a fallback.
function topicForSetting(topics: ReturnType<typeof buildTopics>, setting?: string) {
  if (!setting) return undefined
  if (setting === 'connecting') return 'troubleshooting'
  let best: { id: string; count: number } | undefined
  for (const topic of topics) {
    const count = countMatches(topic.markdown, setting)
    if (count > (best?.count ?? 0)) best = { id: topic.id, count }
  }
  return best?.id
}

const TopicMarkdown = memo(function TopicMarkdown({ markdown, onJump }: { markdown: string; onJump: (slug: string) => void }) {
  const slugger = createSlugger()
  const renderHeading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
    (({ children }: { children?: ReactNode }) => {
      const text = flattenText(children).trim()
      const id = slugger(text)
      const Shown = Tag === 'h1' || Tag === 'h2' ? 'h2' : Tag === 'h3' ? 'h3' : 'h4'
      return <Shown id={id} className={styles.heading}>{withoutNumber(text)}</Shown>
    }) as NonNullable<Components['h1']>
  const components: Components = {
    h1: renderHeading('h1'),
    h2: renderHeading('h2'),
    h3: renderHeading('h3'),
    h4: renderHeading('h4'),
    h5: renderHeading('h5'),
    h6: renderHeading('h6'),
    a: (({ href, children }: { href?: string; children?: ReactNode }) => {
      const isHashLink = typeof href === 'string' && href.startsWith('#')
      const isExternal = typeof href === 'string' && /^https?:\/\//i.test(href)
      if (isHashLink) {
        return <a href={href} onClick={event => { event.preventDefault(); if (href.slice(1)) onJump(href.slice(1)) }}>{children}</a>
      }
      if (isExternal) {
        return <a href={href} onClick={event => { event.preventDefault(); void desktopBridge.openExternal(href) }}>{children}</a>
      }
      return <a href={href}>{children}</a>
    }) as NonNullable<Components['a']>,
  }
  return <ReactMarkdown components={components}>{markdown}</ReactMarkdown>
})

export function HelpDocsPage({ onOpenPage, focusSetting }: { onOpenPage?: (tab: PrimaryTab) => void; focusSetting?: { setting?: string; at: number } }) {
  const { t } = useTranslation()
  const topics = useMemo(() => buildTopics(readmeMarkdown), [])
  const [topicId, setTopicId] = useState(() => topicForSetting(topics, focusSetting?.setting) ?? 'start')
  const [search, setSearch] = useState(() => (focusSetting?.setting && focusSetting.setting !== 'connecting' ? focusSetting.setting : ''))
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState(0)
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  // The topic list scrolls with the page on a short window (HelpDocsPage.module.css),
  // so walking down it with the pad must not snap the page back to the top on
  // every topic it lands on: that carried the focused topic out of view.
  const topicByFocus = useRef(false)
  const docsMarkdownRef = useRef<HTMLDivElement | null>(null)
  const findMatchesRef = useRef<HTMLElement[]>([])
  const activeMatchIndexRef = useRef(-1)
  const previousQueryRef = useRef('')
  const previousTopicRef = useRef('')
  const pendingSlug = useRef<string | null>(null)

  const topic = topics.find(entry => entry.id === topicId) ?? topics[0]
  const normalizedQuery = search.trim()
  const topicMatches = useMemo(
    () => new Map(topics.map(entry => [entry.id, countMatches(entry.markdown, normalizedQuery)])),
    [topics, normalizedQuery],
  )

  // A new Y press while the page is open moves to that setting's topic.
  useEffect(() => {
    if (!focusSetting?.setting) return
    const id = topicForSetting(topics, focusSetting.setting)
    if (id) setTopicId(id)
    if (focusSetting.setting !== 'connecting') setSearch(focusSetting.setting)
  }, [focusSetting, topics])

  // When the query is not in the open topic, open the first topic it is in.
  useEffect(() => {
    if (!normalizedQuery || (topicMatches.get(topicId) ?? 0) > 0) return
    const first = topics.find(entry => (topicMatches.get(entry.id) ?? 0) > 0)
    if (first) setTopicId(first.id)
  }, [normalizedQuery, topicMatches, topicId, topics])

  const scrollElementIntoView = useCallback((el: HTMLElement) => {
    const shellMain = document.querySelector<HTMLElement>('.shell-scroll')
    const extraGap = 96
    if (shellMain) {
      const shellRect = shellMain.getBoundingClientRect()
      const targetRect = el.getBoundingClientRect()
      const targetTop = shellMain.scrollTop + (targetRect.top - shellRect.top) - extraGap
      shellMain.scrollTo({ top: Math.max(0, targetTop), behavior: 'instant' })
      return
    }
    el.scrollIntoView({ block: 'center' })
  }, [])

  const scrollToTop = useCallback(() => {
    document.querySelector<HTMLElement>('.shell-scroll')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const setFindActiveMatch = useCallback(
    (index: number, shouldScroll: boolean) => {
      const matches = findMatchesRef.current
      if (matches.length === 0) {
        activeMatchIndexRef.current = -1
        setActiveMatchIndex(-1)
        return
      }
      const wrappedIndex = ((index % matches.length) + matches.length) % matches.length
      matches.forEach((match, i) => match.classList.toggle(styles.findMatchActive, i === wrappedIndex))
      activeMatchIndexRef.current = wrappedIndex
      setActiveMatchIndex(wrappedIndex)
      if (shouldScroll) {
        requestAnimationFrame(() => {
          const currentMatch = findMatchesRef.current[wrappedIndex]
          if (currentMatch) scrollElementIntoView(currentMatch)
        })
      }
    },
    [scrollElementIntoView],
  )

  const rebuildFindMatches = useCallback(
    (query: string, resetToFirst: boolean) => {
      const container = docsMarkdownRef.current
      if (!container) return
      clearFindHighlights(container)
      findMatchesRef.current = []
      if (!query) {
        setMatchCount(0)
        activeMatchIndexRef.current = -1
        setActiveMatchIndex(-1)
        return
      }
      const matches = collectFindMatches(container, query, styles.findMatch)
      findMatchesRef.current = matches
      setMatchCount(matches.length)
      if (matches.length === 0) {
        activeMatchIndexRef.current = -1
        setActiveMatchIndex(-1)
        return
      }
      const targetIndex = resetToFirst ? 0 : Math.min(activeMatchIndexRef.current, matches.length - 1)
      setFindActiveMatch(targetIndex < 0 ? 0 : targetIndex, resetToFirst)
    },
    [setFindActiveMatch],
  )

  // Find runs within the open article; the topic list counts the rest.
  const goToRelativeMatch = useCallback(
    (direction: number) => {
      const matches = findMatchesRef.current
      const current = activeMatchIndexRef.current
      const next = current + direction
      if (matches.length && next >= 0 && next < matches.length) {
        setFindActiveMatch(next, true)
        return
      }
      // Past either end, carry on in the next topic that has the query.
      const withMatches = topics.filter(entry => (topicMatches.get(entry.id) ?? 0) > 0)
      if (withMatches.length <= 1) {
        if (matches.length) setFindActiveMatch(next, true)
        return
      }
      const at = withMatches.findIndex(entry => entry.id === topicId)
      const target = withMatches[(at + direction + withMatches.length) % withMatches.length]
      previousQueryRef.current = ''
      if (docsMarkdownRef.current) clearFindHighlights(docsMarkdownRef.current)
      setTopicId(target.id)
    },
    [setFindActiveMatch, topics, topicMatches, topicId],
  )

  useLayoutEffect(() => {
    const trimmedQuery = search.trim()
    // A new query, or a topic opened to follow one, starts at its first match.
    const resetToFirst = trimmedQuery !== previousQueryRef.current || topicId !== previousTopicRef.current
    previousQueryRef.current = trimmedQuery
    previousTopicRef.current = topicId
    rebuildFindMatches(trimmedQuery, resetToFirst)
  }, [search, topicId, activeSlug, rebuildFindMatches])

  // A new topic opens at its top, or at the heading a link asked for.
  useEffect(() => {
    const slug = pendingSlug.current
    pendingSlug.current = null
    if (slug) {
      requestAnimationFrame(() => {
        const el = docsMarkdownRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(slug)}"]`)
        if (el) scrollElementIntoView(el)
      })
    } else if (!search.trim()) {
      if (topicByFocus.current) topicByFocus.current = false
      else scrollToTop()
    }
  }, [topicId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f'
      if (!isFindShortcut) return
      event.preventDefault()
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // README links point at its own anchors, which may be in another topic now.
  const jumpToSection = useCallback(
    (slug: string) => {
      // A README anchor with a stray % is not a crash, just a link that goes nowhere.
      let decoded = slug
      try { decoded = decodeURIComponent(slug) } catch { /* keep as written */ }
      const normalized = decoded.replace(/^#/, '').trim().toLowerCase()
      if (docsMarkdownRef.current) clearFindHighlights(docsMarkdownRef.current)
      setActiveSlug(normalized)
      const holder = topics.find(entry => {
        const slugger = createSlugger()
        return splitReadme(entry.markdown).some(section => slugger(section.title) === normalized)
      })
      if (holder && holder.id !== topicId) {
        pendingSlug.current = normalized
        setTopicId(holder.id)
        return
      }
      requestAnimationFrame(() => {
        const el = docsMarkdownRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(normalized)}"]`)
        if (el) scrollElementIntoView(el)
      })
    },
    [scrollElementIntoView, topics, topicId],
  )

  useEffect(() => {
    const container = docsMarkdownRef.current
    if (!container) return
    container.querySelectorAll<HTMLElement>(`.${styles.headingActive}`).forEach(el => el.classList.remove(styles.headingActive))
    if (!activeSlug) return
    container.querySelector<HTMLElement>(`[id="${CSS.escape(activeSlug)}"]`)?.classList.add(styles.headingActive)
  }, [activeSlug, topicId])

  const jumpRef = useRef(jumpToSection)
  jumpRef.current = jumpToSection
  const onJump = useCallback((slug: string) => jumpRef.current(slug), [])

  // LT/RT keep Settings category navigation; LB/RB step topics or matches.
  const host = useRef<HTMLDivElement | null>(null)
  const stepTopic = (direction: 1 | -1) => {
    const list = normalizedQuery ? topics.filter(entry => (topicMatches.get(entry.id) ?? 0) > 0) : topics
    if (!list.length) return
    const at = Math.max(0, list.findIndex(entry => entry.id === topicId))
    const next = list[Math.min(list.length - 1, Math.max(0, at + direction))]
    if (next.id === topicId) return
    setActiveSlug(null)
    setTopicId(next.id)
    requestAnimationFrame(() => host.current?.querySelector<HTMLElement>(`[data-topic="${next.id}"]`)?.focus({ preventScroll: true }))
  }
  useStepClaim('jsm:page-step', direction => { if (normalizedQuery) goToRelativeMatch(direction); else stepTopic(direction) })
  const askSearch = () => requestValueEntry({ title: 'Search the guides', eyebrow: 'Guides & reference', value: search, hint: 'Every guide and the manual, offline', onDone: value => setSearch(value) })
  const searchRef = useRef(askSearch)
  searchRef.current = askSearch
  useEffect(() => {
    const node = host.current
    if (!node) return
    const onPad = (event: Event) => {
      const button = (event as CustomEvent<PadEventDetail>).detail.button
      if (event.defaultPrevented) return
      if (button === 'Y') { event.preventDefault(); searchRef.current() }
      if (button === 'X') {
        event.preventDefault()
        if (search.trim()) setSearch('')
        else if (topic.page && onOpenPage) onOpenPage(topic.page.tab)
      }
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [search, topic, onOpenPage])
  const guidesWithMatches = topics.filter(entry => (topicMatches.get(entry.id) ?? 0) > 0).length
  const totalMatches = topics.reduce((sum, entry) => sum + (topicMatches.get(entry.id) ?? 0), 0)
  const xHint = normalizedQuery ? 'X:Clear search' : topic.page ? `X:${topic.page.label}` : ''
  const hints = (a: string) => [a, xHint, 'Y:Search', 'LT/RT:Category', `LB/RB:${normalizedQuery ? 'Match' : 'Topic'}`, 'B:Categories'].filter(Boolean).join(';')

  return (
    <div ref={host} className={styles.docs}
      // B inside the guides goes back to the categories, not Home.
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        const target = event.target as HTMLElement
        if (target.closest('input, textarea')) return
        event.preventDefault()
        event.stopPropagation()
        document.querySelector<HTMLElement>('.section-list .section-item[aria-current="true"]')?.focus()
      }}>
      <nav className={styles.topics} aria-label="Guides" data-nav-region="topics">
        <div className={styles.offline}><span className={styles.badge}>Works offline</span></div>
        <button type="button" className={styles.searchButton} onClick={askSearch} data-hints="A:Search;B:Categories" data-caption="Search the guides · every guide and the manual">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.25" /><path d="m9.2 9.2 3.3 3.3" /></svg>
          <span>{normalizedQuery ? `“${normalizedQuery}”` : 'Search the guides'}</span>
          <span className={styles.searchKey}>Y</span>
        </button>
        {/* Keyboard users can still type straight in (Ctrl+F). */}
        <label className={`${styles.searchField} ${styles.srOnly}`}>
          <span>{t('help.searchDocumentation')}</span>
          <input ref={searchInputRef} type="search" tabIndex={-1} aria-label={t('help.searchDocumentation')} value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && search) { event.preventDefault(); setSearch(''); return }
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (normalizedQuery) goToRelativeMatch(event.shiftKey ? -1 : 1)
            }} />
        </label>
        {normalizedQuery && (
          <div className={styles.findRow} data-guides-find="">
            <span className={styles.findStatus} aria-live="polite">
              {totalMatches > 0 ? `${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'} in ${guidesWithMatches} ${guidesWithMatches === 1 ? 'guide' : 'guides'} · ${matchCount ? `${activeMatchIndex + 1} of ${matchCount}` : '0'} here` : t('help.findStatusNoMatches')}
            </span>
            <span className={styles.findNote}>{guidesWithMatches} guides with matches</span>
          </div>
        )}
        <span className={styles.topicKeys} aria-hidden="true">LB · {normalizedQuery ? 'Match' : 'Topic'} · RB</span>
        <div className={styles.topicList} role="tablist" aria-orientation="vertical">
          {topics.map(entry => {
            const count = topicMatches.get(entry.id) ?? 0
            const dim = Boolean(normalizedQuery) && count === 0
            return (
              <button key={entry.id} type="button" role="tab" data-topic={entry.id} aria-selected={entry.id === topic.id} className={styles.topic} data-dim={dim || undefined}
                data-hints={hints('A:Read')} onFocus={() => { if (entry.id !== topicId) { topicByFocus.current = window.matchMedia('(max-height: 840px)').matches; setActiveSlug(null); setTopicId(entry.id) } }}
                onClick={() => { setActiveSlug(null); setTopicId(entry.id); requestAnimationFrame(() => host.current?.querySelector<HTMLElement>('[data-guide-article] a, [data-guide-article] [tabindex="0"]')?.focus()) }}>
                <span>{entry.title}</span>
                {normalizedQuery && count > 0 && <span className={styles.topicCount}>{count}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <article className={styles.article} aria-label={topic.title} data-nav-region="article" data-guide-article="" data-hints={hints('A:Read')}>
        <span className={styles.eyebrow}>{topic.title}</span>
        <div ref={docsMarkdownRef} className={styles.docsMarkdown}>
          <TopicMarkdown key={topic.id} markdown={topic.markdown} onJump={onJump} />
        </div>
        <div className={styles.links}>
          {topic.page && onOpenPage && (
            <button type="button" className={styles.pageLink} data-hints={hints(`A:${topic.page.label}`)} onClick={() => onOpenPage(topic.page!.tab)}>
              {topic.page.label} ▸
            </button>
          )}
          {topic.also && onOpenPage && (
            <button type="button" className={styles.pageLink} data-hints={hints(`A:Open ${topic.also.label}`)} onClick={() => onOpenPage(topic.also!.tab)}>
              {topic.also.label} ▸
            </button>
          )}
          <button type="button" className={styles.pageLink} data-hints={hints('A:Open in your browser')} onClick={() => void desktopBridge.openExternal(MANUAL_URL)}>
            Full manual online ↗
          </button>
        </div>
      </article>
    </div>
  )
}
