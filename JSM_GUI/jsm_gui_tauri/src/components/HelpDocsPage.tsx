import { isValidElement, memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { useTranslation } from 'react-i18next'
import styles from './HelpDocsPage.module.css'
import readmeMarkdown from '../assets/docs/JoyShockMapper-README.md?raw'
import { desktopBridge } from '../platform/desktopBridge'
import type { PrimaryTab } from '../shell/pages'

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
  /** The Studio page this topic is about, and the link text to it. */
  page?: { tab: PrimaryTab; label: string }
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

Studio talks to the 2026 Steam Controller directly, so the buttons Steam Input would normally claim have JoyShockMapper names of their own.

- Quick access (…): \`MISC1\`
- Right grip and left grip: \`MISC5\` and \`MISC6\`
- Right pad click and left pad click: \`MISC2\` and \`MISC3\`
- L4 and L5: \`LSL\` and \`LSR\`
- R4 and R5: \`RSR\` and \`RSL\`
- Right pad grid and left pad grid: \`RT1\`…\`RT25\` and \`LT1\`…\`LT25\`

### Grips

The grips are touch sensors, not buttons: they report contact, and \`GRIP_SENSOR_RANGE\` and \`GRIP_FLICKER_GUARD\` set how firm a touch counts. A grip can stay held for a little longer after the hand lifts, with \`LEFT_GRIP_RELEASE_DELAY\` and \`RIGHT_GRIP_RELEASE_DELAY\` in milliseconds, which stops a brief lift from dropping gyro aim.

### Trackpads

Each pad is either a mouse (\`MOUSE\`) or a grid of regions (\`GRID_AND_STICK\`), never both at once. The mode can be modeshifted, so \`MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK\` turns the right pad into a menu while its click is held. \`GRID_SHAPE\` picks a grid, four-way or eight-way wedges, or a radial menu.

The pads are mounted at an angle (about 10.7 degrees, the right pad the other way). **Trackpad orientation** in Preferences turns each pad's reading so a swipe straight up the controller reads as straight up, for every configuration, for menus, the touch stick and the mouse alike, and for the touch Studio shows. The values are \`LEFT_TOUCHPAD_ROTATION\` and \`RIGHT_TOUCHPAD_ROTATION\`, in degrees, positive clockwise as you look at the controller; \`0\` keeps the pad as mounted.

### Gyro

The controller's firmware re-centres its gyro whenever it thinks it is lying still, and a slow, deliberate tilt can pass for still. Studio turns that off when the controller connects, so slow aim is not eaten; drift is then corrected by **Recalibrate gyro**, which cancels itself if the controller moves during the run. **Disable hardware calibration** in Preferences (\`DISABLE_HARDWARE_GYRO_CALIBRATION\`, on by default) switches the firmware's calibration back on if you would rather have it.

Each controller's last calibration is saved, so a controller that switches off, drops out of range, reconnects, or comes back after Studio restarts starts from it rather than from nothing.

### Light

The light is a colour LED. App settings provide a white default colour at 100% brightness. Each profile can override either value with \`LIGHT_BAR\` and \`LED_BRIGHTNESS\`; leaving one unset uses the app default. A button action can set either value on press, hold, or release. The button editor's command picker also offers **LED while held**: a command that lights the LED in its own colour and brightness while the input is down and returns to the profile value on release; its colour and brightness are set in the command's settings panel.

### Controller sounds

**Silence the controller's own sounds** in Preferences sets the controller's firmware jingle level to zero; switching it off restores the factory volume. This also silences the controller's lost-connection and low-battery cues.

The **Manage sounds** library accepts MIDI and MP3 files. The controller has no speaker: its haptic actuators play tones, so a sound is a single-voice melody. A MIDI file gives clean notes (pick the melody track; Studio recommends one); for an MP3, trim a clip and Studio follows its strongest pitch. Either way the voice is moved by whole octaves into the range where the actuators sing rather than buzz, and repeated notes are separated so they stay distinct. Jingles and simple melodies work best; speech, chords and dense mixes become approximations. Preview the converted result on the controller before choosing it for Connect, Shutdown or a **Play sound** binding. The original file stays in the library so you can trim it again.

**Play Sounds On** chooses the actuators: the controller's own tunes play on the two motors behind the grips, so that pair is the default and gives your sounds the same voice. The trackpads' actuators are thinner and quieter for the same notes.

### Quick access

The default global chord activates from Guide or Quick Access. Its regular command bindings open the keyboard, pause/resume mapping and calibrate gyro. Edit or remove its activation row in Global Chords, or clone its built-in configuration to create your own bindings. Reset default settings restores the default activation.
`

export const DOCS_TOPICS: DocsTopic[] = [
  { id: 'start', title: 'Getting started', sections: ['JoyShockMapper', 'Installation for Players', 'Quick Start', 'Commands'] },
  { id: 'buttons', title: 'Buttons and bindings', sections: ['Digital Inputs', 'Tap & Hold', 'Binding Modifiers', 'Simultaneous Press', 'Diagonal Press', 'Chorded Press', 'Double Press', 'Gyro Button'], page: { tab: 'buttons', label: 'Open Buttons' } },
  { id: 'triggers', title: 'Triggers', sections: ['Analog Triggers', 'Analog to digital', 'Full pull and modes', 'Adaptive Triggers'], page: { tab: 'triggers', label: 'Open Triggers' } },
  { id: 'gyro', title: 'Gyro', sections: ['Gyro Mouse Inputs', 'Real World Calibration', 'Prerequisites', 'Calculating the real world calibration in a 3D game', 'Calculating the real world calibration in a 2D game'], page: { tab: 'gyro', label: 'Open Gyro' } },
  { id: 'sticks', title: 'Flick stick', sections: ['Stick Configuration', 'Standard AIM mode', 'FLICK mode and variants', 'HYBRID_AIM mode', 'Other mouse modes', 'Digital modes', 'Motion Stick and lean bindings'], page: { tab: 'joysticks', label: 'Open Joysticks' } },
  { id: 'trackpads', title: 'Trackpads', sections: ['Touchpad', 'Touch Sticks'], page: { tab: 'touchpad', label: 'Open Trackpads' } },
  { id: 'layers', title: 'Layers and modeshifts', sections: ['Modeshifts'], page: { tab: 'layers', label: 'Open Layers' } },
  { id: 'virtual', title: 'Virtual controller', sections: ['ViGEm Virtual Controller', 'Xbox bindings', 'DS4 bindings', 'Virtual Controller Gyro'] },
  { id: 'commands', title: 'Commands reference', sections: ['Miscellaneous Commands', 'Configuration Files', 'OnStartup.txt', 'OnReset.txt', 'Autoload feature', 'Autoconnect feature'] },
  { id: 'steam', title: 'Steam Controller notes', sections: [], markdown: STEAM_CONTROLLER_NOTES, page: { tab: 'buttons', label: 'Open Buttons' } },
  { id: 'troubleshooting', title: 'Troubleshooting', sections: ['Troubleshooting', 'Known and Perceived Issues', 'Bluetooth connectivity'], page: { tab: 'deviceVisibility', label: 'Open Device visibility' } },
  { id: 'about', title: 'Credits and license', sections: ['Credits', 'Helpful Resources', 'License'] },
]

// "#### 3.2 FLICK mode" reads as "FLICK mode" once it is out of the README's
// numbered outline.
const withoutNumber = (title: string) => title.replace(/^\d+(\.\d+)*\.?\s+/, '')

export function buildTopics(markdown: string) {
  const sections = splitReadme(markdown)
  return DOCS_TOPICS.map(topic => {
    if (topic.markdown) return { ...topic, markdown: topic.markdown }
    const wanted = new Set(topic.sections.map(title => title.toLowerCase()))
    const parts = sections.filter(section => wanted.has(withoutNumber(section.title).toLowerCase()))
    return { ...topic, markdown: parts.map(part => part.body).join('\n') }
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
      scrollToTop()
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

  return (
    <div className={styles.docs}>
      {/* Two columns the pad walks separately (data-nav-region): Down through
          the topics used to zigzag into whichever link in the article sat a
          few pixels nearer than the next topic. Right and Left cross. */}
      <nav className={styles.topics} aria-label="Documentation topics" data-nav-region="topics">
        <label className={styles.searchField}>
          <span className={styles.srOnly}>{t('help.searchDocumentation')}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.25" /><path d="m9.2 9.2 3.3 3.3" /></svg>
          <input
            ref={searchInputRef}
            type="search"
            aria-label={t('help.searchDocumentation')}
            placeholder={t('help.searchPlaceholder')}
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && search) { event.preventDefault(); setSearch(''); return }
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (normalizedQuery) goToRelativeMatch(event.shiftKey ? -1 : 1)
            }}
          />
        </label>
        {normalizedQuery && (
          <div className={styles.findRow}>
            <span className={styles.findStatus} aria-live="polite">
              {matchCount > 0
                ? t('help.findStatusMatches', { current: activeMatchIndex + 1, total: matchCount })
                : t('help.findStatusNoMatches')}
            </span>
            <button type="button" className="icon-button" aria-label={t('common.previous')} title={t('common.previous')} onClick={() => goToRelativeMatch(-1)} disabled={matchCount === 0}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3.5-3.5 3.5 3.5" /></svg>
            </button>
            <button type="button" className="icon-button" aria-label={t('common.next')} title={t('common.next')} onClick={() => goToRelativeMatch(1)} disabled={matchCount === 0}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 5.5 3.5 3.5 3.5-3.5" /></svg>
            </button>
          </div>
        )}
        <div className={styles.topicList} role="tablist" aria-orientation="vertical">
          {topics.map(entry => {
            const count = topicMatches.get(entry.id) ?? 0
            const dim = Boolean(normalizedQuery) && count === 0
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === topic.id}
                className={styles.topic}
                data-dim={dim || undefined}
                onClick={() => { setActiveSlug(null); setTopicId(entry.id) }}
              >
                <span>{entry.title}</span>
                {normalizedQuery && count > 0 && <span className={styles.topicCount}>{count}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <article className={styles.article} aria-label={topic.title} data-nav-region="article">
        <span className={styles.eyebrow}>{topic.title}</span>
        <div ref={docsMarkdownRef} className={styles.docsMarkdown}>
          <TopicMarkdown key={topic.id} markdown={topic.markdown} onJump={onJump} />
        </div>
        {topic.page && onOpenPage && (
          <button type="button" className={styles.pageLink} onClick={() => onOpenPage(topic.page!.tab)}>
            {topic.page.label} ›
          </button>
        )}
      </article>
    </div>
  )
}
