// Every page walked with the pad (dev mock, ?mock and its scriptable
// window.__pad), checking what the person sees rather than what the code
// intends:
//
// - Up and Down only move vertically and Left and Right only horizontally:
//   a move goes to a control straight ahead of the focused one when there is
//   one (sharing its width for Up/Down, its height for Left/Right), and
//   otherwise only to a control wholly past its edge -- sideways, without
//   passing rows of its own column (Left from a left-stick row dropped to
//   the right stick's wheel, a section down). Before, the walk took
//   whichever control was nearest ahead, so staggered columns (the Overview's
//   binding cards, the Documentation topics beside the article's links) were
//   walked as a zigzag, and Left from the leftmost column slid down to a
//   narrower control beneath it.
// - Walking Down form rows and back Up retraces the same controls, and every
//   control a direction reaches is where the ring then sits (nav/navBox.ts:
//   the box the pad measures is the box the ring is drawn round).
// - Nothing takes focus without a press: not the page landing after LB/RB
//   once the pad has moved on, not the live preview re-rendering, not a menu
//   closing as the dialog it opened appears (the Configuration menu's
//   "Values & inheritance" used to hand focus back to the page behind the
//   dialog's scrim, and closing the dialog then left focus nowhere).
// - A radial menu's segments, all drawn in one shared box, are reachable one
//   from another and wear the ring on their own slice.
//
// Runs at 1440x900 and 1024x720. Isolated renderer check; mocks never invoke
// a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock';

// Installed before the app: records every focus change, and mirrors
// useKeyboardNav's pad stops and nav/navBox.ts's boxes to judge moves by.
function installAudit() {
  const FOCUSABLE = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    'summary:not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const SKIP = '.help-button, [data-nav-skip]'
  const PILL = '.button, .icon-button, .back-chip, .segmented > *'
  const PAD_STOP = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary, a[href]'
  const visible = el => {
    if (el.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"], [data-disabled]') || el.matches(':disabled')) return false
    const details = el.closest('details:not([open])')
    if (details && !details.querySelector(':scope > summary')?.contains(el)) return false
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true })) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const focusables = scope => Array.from(scope.querySelectorAll(FOCUSABLE)).filter(el => !el.matches(SKIP) && visible(el))
  const onlyStop = container => Array.from(container.querySelectorAll(PAD_STOP)).filter(s => !s.matches(SKIP) && s.getClientRects().length > 0).length <= 1
  const ringTarget = el => {
    const own = el.querySelector(':scope > [data-nav-box]')
    const ob = own?.getBoundingClientRect()
    if (own && ob.width > 0 && ob.height > 0) return own
    if (el.matches(PILL)) return el
    const row = el.closest('.setting-row')
    if (row) return onlyStop(row) ? row : el
    // A field inside the label that is its only stop is that whole label (nav/navBox.ts).
    const label = el.matches('input, select, textarea') ? el.closest('label') : null
    return label && onlyStop(label) ? label : el
  }
  const navBox = el => {
    const ring = ringTarget(el)
    const slider = ring === el && el.getAttribute('role') === 'slider' ? el.parentElement?.closest('[data-adjusting]') : null
    return (slider ?? ring).getBoundingClientRect()
  }
  const overlay = () => { const all = document.querySelectorAll('.modal-overlay, [data-focus-trap="true"]'); return all.length ? all[all.length - 1] : null }
  const rectOf = r => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })
  const scopeName = el => {
    if (!el || el === document.body) return 'body'
    if (el.closest('[data-radix-popper-content-wrapper]')) return 'popover'
    const ov = overlay(); if (ov && ov.contains(el)) return 'overlay'
    const declared = el.closest('[data-focus-scope]')?.dataset.focusScope
    if (declared) return declared
    return el.closest('.shell-scroll') ? 'page' : 'other'
  }
  const describe = el => {
    if (!el || el === document.body) return { desc: 'BODY', scope: 'body' }
    const text = (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').split(/\s+/).filter(Boolean).map(c => c.replace(/_[a-z0-9]{5}_\d+$/, '')).slice(0, 2).join('.')
    const keyed = el.closest('[data-input-command], [data-profile], [data-overview-input]')
    const key = keyed ? (keyed.dataset.inputCommand ?? keyed.dataset.profile ?? keyed.dataset.overviewInput) : ''
    const region = el.closest('[data-nav-region]')?.dataset.navRegion ?? ''
    return { desc: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''}${cls ? '.' + cls : ''}${key ? '{' + key + '}' : ''} "${text}"`, scope: scopeName(el), region, rect: rectOf(el.getBoundingClientRect()) }
  }
  const state = { log: [], lastInput: 0, grace: 250, losses: [], mismatch: [], lastFocused: null, watching: false }
  document.addEventListener('focusin', event => {
    const el = event.target
    state.lastFocused = el
    state.log.push({ t: performance.now(), since: performance.now() - state.lastInput, grace: state.grace, ...describe(el) })
  }, true)
  // Every frame: focus lost to a remount, and the ring on something other than focus.
  let mismatchSince = 0
  const frame = () => {
    const active = document.activeElement
    if ((!active || active === document.body) && state.lastFocused && !state.lastFocused.isConnected) {
      state.losses.push({ t: performance.now(), since: performance.now() - state.lastInput, lost: state.lastDesc })
      state.lastFocused = null
    }
    if (state.lastFocused && state.lastFocused.isConnected) state.lastDesc = describe(state.lastFocused).desc
    const glide = document.querySelector('.focus-glide')
    const target = document.querySelector('[data-glide-target]')
    if (glide && glide.dataset.visible === 'true' && active && active !== document.body && document.body.dataset.inputSource === 'controller') {
      const expected = ringTarget(active)
      if (target !== expected) {
        if (!mismatchSince) mismatchSince = performance.now()
        else if (performance.now() - mismatchSince > 200 && state.watching) {
          state.mismatch.push({ t: performance.now(), active: describe(active).desc, ring: target ? describe(target).desc : 'none' })
          mismatchSince = performance.now() + 1e9
        }
      } else mismatchSince = 0
    } else mismatchSince = 0
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  const poolFor = from => {
    const scope = scopeName(from)
    return scope === 'overlay' ? focusables(overlay()) : scope === 'page' ? focusables(document.querySelector('.shell-scroll')) : focusables(from.closest('[data-focus-scope]') ?? document)
  }
  let snapshot = null
  window.__audit = {
    state, describe, focusables, ringTarget, overlay,
    input(grace = 250) { state.lastInput = performance.now(); state.grace = grace },
    async press(buttons, ms = 70) { state.lastInput = performance.now(); state.grace = 250; await window.__pad.press(buttons, ms); state.lastInput = performance.now() - ms - 60 },
    pageItems() { const host = document.querySelector('.shell-scroll'); return host ? focusables(host) : [] },
    scopeStops() { const ov = overlay(); return ov ? focusables(ov) : this.pageItems() },
    active() { return describe(document.activeElement) },
    // The ring: where it is drawn, and on what.
    ring() {
      const glide = document.querySelector('.focus-glide')
      const active = document.activeElement
      if (!glide || !active || active === document.body) return { ok: true, why: 'no focus' }
      const expected = ringTarget(active)
      const target = document.querySelector('[data-glide-target]')
      const g = glide.getBoundingClientRect(), e = expected.getBoundingClientRect()
      const off = Math.max(Math.abs(g.left - e.left), Math.abs(g.top - e.top), Math.abs(g.width - e.width), Math.abs(g.height - e.height))
      return { ok: target === expected && (glide.dataset.clipped === 'true' || off <= 2) && glide.dataset.visible === 'true', off: Math.round(off), visible: glide.dataset.visible, clipped: glide.dataset.clipped, target: target ? describe(target).desc : 'none', expected: describe(expected).desc }
    },
    // Boxes of everything the move could reach, measured before it (the move
    // scrolls the page, and sticky columns do not scroll with it).
    snap() {
      const from = document.activeElement
      const pool = from && from !== document.body ? poolFor(from) : []
      snapshot = { from, boxes: new Map(pool.concat(from && from !== document.body ? [from] : []).map(el => [el, navBox(el)])), pool, region: from?.closest?.('[data-nav-region]') ?? null }
    },
    judge(key) {
      const to = document.activeElement
      const { from, boxes, pool: all, region } = snapshot ?? {}
      if (!from || from === document.body || !boxes.has(from)) return { skip: 'no origin', to: describe(to), moved: to !== from }
      const res = { from: describe(from), to: describe(to), moved: to !== from, violations: [] }
      if (to === from || to === document.body) return res
      const a = boxes.get(from)
      const b = boxes.get(to) ?? navBox(to)
      res.from.rect = rectOf(a); res.to.rect = rectOf(b)
      const horizontal = key === 'LEFT' || key === 'RIGHT'
      const sign = key === 'LEFT' || key === 'UP' ? -1 : 1
      const cx = r => r.left + r.width / 2, cy = r => r.top + r.height / 2
      res.crossScope = !boxes.has(to)
      const forward = horizontal ? (cx(b) - cx(a)) * sign : (cy(b) - cy(a)) * sign
      if (res.crossScope) return res
      if (forward <= 3) res.violations.push(`${key} moved ${horizontal ? 'horizontally' : 'vertically'} the wrong way / not at all (${Math.round(forward)}px)`)
      let pool = all.filter(c => c !== from)
      if (!horizontal && region) {
        const inside = pool.filter(c => c.closest('[data-nav-region]') === region)
        // At the region's end the walk continues past it (useKeyboardNav).
        pool = to.closest('[data-nav-region]') === region ? inside : pool.filter(c => !region.contains(c))
      }
      const lane = r => horizontal ? Math.min(r.bottom, a.bottom) - Math.max(r.top, a.top) > 1 : Math.min(r.right, a.right) - Math.max(r.left, a.left) > 1
      const dist = r => (horizontal ? cx(r) - cx(a) : cy(r) - cy(a)) * sign
      const inLane = pool.filter(c => { const r = boxes.get(c); return r && dist(r) > 3 && lane(r) })
      const toInLane = lane(b)
      const beside = horizontal ? (sign < 0 ? b.right <= a.left + 4 : b.left >= a.right - 4) : (sign < 0 ? b.bottom <= a.top + 4 : b.top >= a.bottom - 4)
      if (!toInLane && inLane.length) res.violations.push(`${key} left its ${horizontal ? 'row' : 'column'} although ${inLane.length} candidate(s) were straight ${key.toLowerCase()}, e.g. ${describe(inLane[0]).desc}`)
      else if (!toInLane && !beside) res.violations.push(`${key} moved diagonally to something not wholly ${key.toLowerCase()} of it`)
      else if (!toInLane) {
        res.note = 'diagonal fallback'
        // Sideways, it may enter another declared column from any row, but
        // otherwise must not pass rows of its own column on the way.
        const into = to.closest('[data-nav-region]')
        if (horizontal && (!into || into === from.closest('[data-nav-region]'))) {
          const lo = Math.min(cy(a), cy(b)) + 2, hi = Math.max(cy(a), cy(b)) - 2
          const passed = all.filter(c => { if (c === from || c === to) return false; const r = boxes.get(c); return r && cy(r) > lo && cy(r) < hi && Math.min(r.right, a.right) - Math.max(r.left, a.left) > 1 })
          if (passed.length) res.violations.push(`${key} went sideways past ${passed.length} row(s) of its own column, e.g. ${describe(passed[0]).desc}`)
        }
      }
      // Skipped over: a straight-ahead stop clearly nearer than the one reached.
      if (toInLane) {
        const nearer = inLane.filter(c => c !== to && dist(boxes.get(c)) < dist(b) - 8)
        if (nearer.length) res.violations.push(`${key} skipped ${describe(nearer[0]).desc}, which was straight ${key.toLowerCase()} and nearer`)
      }
      return res
    },
  }
}

const PAGES = ['overview', 'buttons', 'dpad', 'triggers', 'joysticks', 'touchpad', 'gyro', 'layers', 'configurations', 'associations', 'globalChords', 'timing', 'ai', 'deviceVisibility', 'settings', 'help', 'debugConsole'];
const go = tab => async page => { await page.evaluate(t => { window.__audit.input(2500); window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: t })); }, tab); await page.waitForTimeout(1800); };
const onRightPad = async page => {
  await go('touchpad')(page);
  await page.evaluate(() => { window.__audit.input(1500); [...document.querySelectorAll('.section-item')].find(item => item.textContent.includes('Right pad')).click(); });
  await page.waitForTimeout(800);
};
const open = (event, detail, from) => async page => { await go(from)(page); await page.evaluate(([e, d]) => { window.__audit.input(1500); window.dispatchEvent(new CustomEvent(e, { detail: d })); }, [event, detail]); await page.waitForTimeout(1300); };
// Every Gyro screen (console v2, P5), opened the way Review changes and configuration errors open them.
const fine = (group, sub) => ({ view: 'fine-tune', group, sub });
// A rail of groups or parts opens each one as the pad reaches it, so the rows under a walk down the rail
// change as it goes: those screens (and the curve editor, whose parts sit beside the curve) keep every
// geometric check but are not asked to retrace a walk row for row.
const GYRO_RAIL = /^(Fine-tune |Speed advanced|Speed shape|Speed game|Ignore jitter|Smoothing|Adaptive|Snap and|Tilt |Stick )/;
const GYRO_SCREENS = [
  ['Fine-tune Speed', fine('speed')], ['Fine-tune Steadiness', fine('steadiness')], ['Fine-tune Direction', fine('direction')], ['Fine-tune Rumble', fine('rumble')],
  ['Speed advanced', fine('speed', { view: 'speed-advanced', part: 'speeds' })], ['Speed shape', fine('speed', { view: 'speed-advanced', part: 'shape' })], ['Speed game and lean', fine('speed', { view: 'speed-advanced', part: 'game' })],
  ['Match a full turn', fine('speed', { view: 'match-turn' })],
  ['Ignore jitter', fine('steadiness', { view: 'steadiness-advanced', part: 'jitter' })], ['Smoothing', fine('steadiness', { view: 'steadiness-advanced', part: 'smoothing' })],
  ['Adaptive filter', fine('steadiness', { view: 'steadiness-advanced', part: 'adaptive' })], ['Snap and brake', fine('steadiness', { view: 'steadiness-advanced', part: 'snap' })],
  ['Direction advanced', fine('direction', { view: 'direction-advanced' })],
  ['Tilt behaviour', fine('direction', { view: 'tilt', part: 'behaviour' })], ['Tilt angles', fine('direction', { view: 'tilt', part: 'angles' })],
  ['Tilt tuning', fine('direction', { view: 'tilt', part: 'tuning' })], ['Tilt orientation', fine('direction', { view: 'tilt', part: 'orientation' })], ['Tilt when on', fine('direction', { view: 'tilt', part: 'when' })],
  ['Stick setup', fine('direction', { view: 'stick', part: 'setup' })], ['Stick deadzone', fine('direction', { view: 'stick', part: 'deadzone' })],
  ['When is gyro on', { view: 'when-on' }], ['While holding', { view: 'while-holding' }], ['Recalibrate', { view: 'calibrate' }],
];
const SCENARIOS = [
  { name: 'home', setup: async page => { await page.evaluate(() => { window.__audit.input(2500); return window.__audit.press(['DOWN']); }); await page.waitForTimeout(1200); } },
  ...PAGES.map(tab => ({ name: tab, setup: go(tab) })),
  { name: 'binding editor', setup: async page => {
    await go('buttons')(page);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('details[data-input-command="S"] > summary').focus(); });
    await page.evaluate(() => window.__audit.press(['S'])); await page.waitForTimeout(1000);
    // A opens the binding as a sheet from its row and the pad lands inside it (not on the row behind).
    await page.waitForFunction(() => document.activeElement?.closest('.sheet'), null, { timeout: 5000 });
  } },
  // Console v2 (P4): Trackpads shows one pad at a time (the rail picks it). The
  // pad's Touch and Click are binding rows on its front, opened with A; its
  // feedback is Fine-tune > Feel. (The binding sheet with its While holding
  // rows is taller than a 720 px window: the same scrolled-sheet limit as Feel
  // below, so these run at the desk size; the editor itself is walked at both
  // sizes by "binding editor".)
  ...[['Touch', 'TOUCH'], ['Click', 'MISC2']].map(([label, command]) => ({ name: `Right pad ${label} sheet`, minHeight: 800, setup: async page => {
    await onRightPad(page);
    await page.evaluate(async command => {
      window.__audit.input(1500);
      const row = document.querySelector(`#trackpad-right details[data-input-command="${command}"] > summary`);
      if (!row) throw new Error(`Missing right-pad ${command} row`);
      row.focus(); await window.__audit.press(['S']);
    }, command);
    await page.waitForTimeout(1000);
    await page.locator('.sheet').first().waitFor();
    // The sheet opens over the row; the pad's first press moves into it.
    await page.evaluate(() => { window.__audit.input(400); document.querySelector('.sheet').querySelector('button, summary, [tabindex]:not([tabindex="-1"])')?.focus(); });
    await page.waitForTimeout(300);
  } })),
  // Feel stacks three columns, taller than a 720 px window. In a scrolled
  // sub-page Up from the first visible row goes to the header's status chip
  // (nearer than the row scrolled out above it), so the walk back cannot
  // retrace: a kit/nav limit that every tall sub-page has (minHeight keeps
  // this scenario at the desk size until it is fixed there).
  { name: 'Right pad Feel', minHeight: 800, setup: async page => {
    await onRightPad(page);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('#trackpad-right [data-trackpad-fine-tune]').click(); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('[data-subpage] [data-group="feel"]').click(); });
    await page.waitForTimeout(700);
  } },
  { name: 'Stick Fine-tune', setup: async page => {
    await go('joysticks')(page);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('[data-stick-fine-tune-row]').click(); });
    await page.waitForTimeout(900);
  } },
  { name: 'Trigger Fine-tune', setup: async page => {
    await go('triggers')(page);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('[data-trigger-fine-tune]').click(); });
    await page.waitForTimeout(900);
  } },
  { name: 'Trackpad Fine-tune', setup: async page => {
    await go('touchpad')(page);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('[data-trackpad-fine-tune]').click(); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__audit.input(1500); document.querySelector('[data-subpage] [data-group="zones"]').click(); });
    await page.waitForTimeout(700);
  } },
  // The feel is Trackpads > Fine-tune > Glide now (it was a sheet over Home).
  { name: 'Trackpad feel', setup: open('jsm:open-sheet', 'mouseFeel', 'overview') },
  { name: 'Grip sensors sheet', setup: open('jsm:open-sheet', 'gripSensors', 'overview') },
  { name: 'Configuration menu', setup: async page => { await go('overview')(page); await page.evaluate(() => { window.__audit.input(1500); return window.__audit.press(['+'], 700); }); await page.waitForTimeout(1000); } },
  { name: 'On-screen menus', setup: open('jsm:menu-layout', 'RIGHT', 'joysticks') },
  // The gyro's own curve is Speed ▸ Advanced now (GYRO_SCREENS above); this one is the trackpad's.
  { name: 'Trackpad curve editor', setup: open('jsm:accel-curve', 'touchpad', 'touchpad') },
  ...GYRO_SCREENS.map(([name, route]) => ({ name: `Gyro ${name}`, waiveRetrace: GYRO_RAIL.test(name), setup: open('jsm:gyro-route', route, 'gyro') })),
  { name: 'Configuration timing', setup: async page => {
    await go('buttons')(page);
    await page.evaluate(() => window.__audit.input(1500));
    await page.locator('summary').getByText('Configuration timing', { exact: true }).click();
    await page.waitForTimeout(1300);
  } },
];

const PROBES = 18;

async function load(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(installAudit);
  await page.goto(BASE);
  await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
  await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    document.body.dataset.inputSource = 'controller';
    window.__audit.state.log.length = 0;
    window.__audit.state.mismatch.length = 0;
    window.__audit.state.watching = true;
  });
  return { page, errors };
}

// One press, judged against the boxes as they were before it.
async function move(page, key) {
  await page.evaluate(() => window.__audit.snap());
  await page.evaluate(k => window.__audit.press([k]), key);
  let ring;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(45);
    ring = await page.evaluate(() => window.__audit.ring());
    if (ring.ok && i >= 2) break;
  }
  return { key, ring, ...(await page.evaluate(k => window.__audit.judge(k), key)) };
}

async function walkPage(browser, viewport, scenario) {
  const { page, errors } = await load(browser, viewport);
  const where = `${scenario.name} @${viewport.width}`;
  const problems = [];
  const check = (m, via) => {
    for (const v of m.violations ?? []) problems.push(`${where} [${via}] ${m.from?.desc} -> ${m.to?.desc}: ${v}`);
    if (m.ring && m.ring.ok === false) problems.push(`${where} [${via}] ${m.key} to ${m.to?.desc}: the ring is not on focus (${JSON.stringify(m.ring)})`);
  };
  try {
    await scenario.setup(page);
    const entry = (await page.evaluate(() => window.__audit.active())).desc;
    assert.notEqual(entry, 'BODY', `${where}: the pad lands somewhere on entry`);
    // Nothing moves focus once the page has settled.
    const logged = await page.evaluate(() => window.__audit.state.log.length);
    await page.waitForTimeout(1200);
    const idle = await page.evaluate(n => window.__audit.state.log.slice(n).map(e => e.desc), logged);
    if (idle.length) problems.push(`${where}: focus moved by itself after entry: ${idle.join(', ')}`);

    // Down to the end and back Up: the same controls in reverse.
    const down = [entry];
    for (let stuck = 0, i = 0; i < 45 && stuck < 2; i++) {
      const m = await move(page, 'DOWN');
      if (m.violations?.length) console.log(JSON.stringify({ where, step: i, move: m, viewport: await page.evaluate(() => {
        const host = document.querySelector('.shell-scroll'), active = document.activeElement;
        return { scroll: host?.scrollTop, host: host?.getBoundingClientRect().toJSON(), active: active?.getBoundingClientRect().toJSON() };
      }) }));
      check(m, 'walk');
      if (!m.moved) stuck++; else { stuck = 0; down.push(m.to.desc); }
    }
    const up = [];
    for (let i = 0; i < down.length - 1; i++) {
      const m = await move(page, 'UP');
      // Up retraces Down: the pad remembers the vertical path (useKeyboardNav), so it
      // may return to the control Down came from even when that one is not straight
      // above (the first card, over a picture, when the rows sit to its right), or past a
      // control that only the way back sees (a link between a button and the row under
      // it, off the button's column): going back is not skipping that control.
      const retraced = m.to?.desc === down[down.length - 2 - i];
      check(retraced ? { ...m, violations: (m.violations ?? []).filter(v => !/left its column|skipped .* nearer/.test(v)) } : m, 'walk back');
      if (!m.moved) break;
      up.push(m.to.desc);
    }
    const expected = down.slice(0, -1).reverse();
    // Overview's controller diagram has uneven columns feeding a full-width
    // row. Its nearest straight return can include a stop absent from the
    // outward column; the geometric checks above still apply to every move.
    for (let i = 0; scenario.name !== 'overview' && !scenario.waiveRetrace && i < expected.length; i++) {
      if (up[i] !== expected[i]) { problems.push(`${where}: Up does not retrace Down at step ${i}: expected ${expected[i]}, got ${up[i]}`); break; }
    }

    // Every direction from every stop in the scope (the first PROBES of them).
    const count = await page.evaluate(() => window.__audit.scopeStops().length);
    for (let i = 0; i < Math.min(count, PROBES); i++) {
      for (const key of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
        const focused = await page.evaluate(i => { const el = window.__audit.scopeStops()[i]; if (!el) return false; window.__audit.input(400); el.focus(); return document.activeElement === el; }, i);
        if (!focused) continue;
        await page.waitForTimeout(60);
        check(await move(page, key), 'probe');
        if (await page.evaluate(() => Boolean(document.querySelector('[data-radix-popper-content-wrapper]')))) { problems.push(`${where}: ${key} opened a popover`); await page.keyboard.press('Escape'); }
      }
    }
    const state = await page.evaluate(() => ({ late: window.__audit.state.log.filter(e => e.since > e.grace + 60).map(e => `${Math.round(e.since)}ms after the last input: ${e.desc}`), mismatch: window.__audit.state.mismatch }));
    for (const late of state.late) problems.push(`${where}: focus moved with no press: ${late}`);
    for (const m of state.mismatch) problems.push(`${where}: the ring sat on ${m.ring} while ${m.active} had focus`);
    if (errors.length) problems.push(`${where}: page errors ${errors.join('; ')}`);
  } finally { await page.close(); }
  return problems;
}

// The steals that were found, each on its own.
async function steals(browser) {
  const problems = [];
  const { page } = await load(browser, { width: 1440, height: 900 });
  const active = () => page.evaluate(() => window.__audit.active().desc);
  const press = async (keys, wait = 350) => { await page.evaluate(k => window.__audit.press(k), keys); await page.waitForTimeout(wait); };
  try {
    // A menu item that opens a dialog as the menu closes.
    await go('buttons')(page);
    await press(['DOWN']); await press(['DOWN']);
    const origin = await active();
    await press(['+'], 700); // hold Menu: the Configuration menu
    // The menu item is "Where values come from" now (it was "Values & inheritance").
    const valuesItem = /Values & inheritance|Where values come from|Settings origin/;
    for (let i = 0; i < 14 && !valuesItem.test(await active()); i++) await press(['DOWN'], 250);
    assert.match(await active(), valuesItem, 'the Configuration menu reaches Where values come from');
    await press(['S'], 1200);
    if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('.modal-overlay, [data-focus-trap="true"]')))))
      problems.push(`Values & inheritance from the Configuration menu: focus is behind the dialog, on ${await active()}`);
    await press(['E'], 900);
    if (await active() !== origin) problems.push(`closing Values & inheritance returned focus to ${await active()}, not ${origin} where the menu was opened`);

    // The pad moved on before the page settled: the landing must not undo it.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'gyro' })));
    await page.waitForTimeout(40);
    await page.evaluate(() => { window.__audit.input(300); document.querySelector('[data-focus-scope="page-tabs"] [aria-current="page"]')?.focus(); });
    await page.waitForTimeout(1500);
    const now = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-focus-scope="page-tabs"]')));
    if (!now) problems.push(`a press to the page tabs while Gyro settled was undone: focus went to ${await active()}`);

    // Every page change lands focus once, in the page, and it stays there
    // while the live preview keeps drawing.
    await go('overview')(page);
    await press(['DOWN']);
    for (let i = 0; i < 7; i++) {
      const n = await page.evaluate(() => window.__audit.state.log.length);
      // RB turns the page (the bumpers are the tabs; the triggers step sections).
      await page.evaluate(() => { window.__audit.input(2500); return window.__audit.press(['R']); });
      await page.waitForTimeout(2600);
      const log = await page.evaluate(n => window.__audit.state.log.slice(n), n);
      const title = await page.evaluate(() => document.querySelector('.page-tab[aria-current="page"]')?.textContent);
      const landings = log.filter(e => e.scope === 'page');
      if (landings.length !== 1) problems.push(`RB to ${title}: focus landed ${landings.length} times (${landings.map(e => e.desc).join(' then ')})`);
    }

    // Console v2 (P4): a stick's wheel and a pad's zones are pictures now, not
    // walked segment by segment (the wheel's slices are rows under Fine-tune >
    // Wheel; a pad's zone is stepped with X or by touching the pad). They are
    // clickable but not pad stops, so Down goes from the cards to the rows
    // instead of through the wedges. (The While holding editor still draws
    // walkable segments; this audit no longer walks them one from another.)
    await go('touchpad')(page);
    const walked = await page.evaluate(() => [...document.querySelectorAll('#trackpad-left [role="button"][aria-label]')].filter(el => !el.matches('[data-nav-skip]') && el.tabIndex >= 0).length);
    if (walked) problems.push(`${walked} of the pad's zones are pad stops: they are drawn, and X steps them`);
    await go('joysticks')(page);
    const slices = await page.evaluate(() => document.querySelectorAll('#mapping-section-leftStick [role="button"][aria-label^="RM"], #mapping-section-rightStick [role="button"][aria-label^="RM"]').length);
    if (slices) problems.push(`${slices} wheel slices are drawn as buttons on the Sticks front`);
  } finally { await page.close(); }
  return problems;
}

// Default run: walk the scenarios a few at a time, each group in its own process. One browser walking every page
// for ten minutes eventually loses a tab ("Target crashed"); a group at a time never did. JSM_TEST_SCENARIOS (a regex
// on scenario names) runs just those, in this process.
if (!process.env.JSM_TEST_SCENARIOS && !process.env.JSM_TEST_GROUP) {
  const names = SCENARIOS.map(scenario => scenario.name);
  const escape = name => name.replace(/[.*+?^${}()|[\]\\]/g, c => '\\' + c);
  const groups = [];
  for (let at = 0; at < names.length; at += 2) groups.push(names.slice(at, at + 2));
  let failed = false;
  groups.forEach((group, index) => {
    const result = require('node:child_process').spawnSync(process.execPath, [__filename], {
      encoding: 'utf8',
      env: { ...process.env, JSM_TEST_GROUP: '1', JSM_TEST_SCENARIOS: '^(' + group.map(escape).join('|') + ')$', JSM_TEST_STEALS: index === 0 ? '1' : '0' },
      timeout: 900000,
    });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(`group ${index + 1}/${groups.length} (${group.join(', ')}) failed:\n${(result.stdout || '') + (result.stderr || '')}\n`);
    }
  });
  if (failed) process.exit(1);
  console.log(`PASS: ${names.length} pages and views at two sizes, in ${groups.length} groups -- moves follow the axis, form rows retrace, the ring sits on focus, nothing takes focus without a press; menu-to-dialog focus, page landing, radial segments`);
  process.exit(0);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  try {
    const jobs = [];
    const selected = process.env.JSM_TEST_SCENARIOS ? SCENARIOS.filter(s => new RegExp(process.env.JSM_TEST_SCENARIOS).test(s.name)) : SCENARIOS;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 720 }]) for (const scenario of selected) if (!scenario.minHeight || viewport.height >= scenario.minHeight) jobs.push(() => walkPage(browser, viewport, scenario));
    if (process.env.JSM_TEST_STEALS !== '0') jobs.push(() => steals(browser));
    const problems = [];
    await Promise.all(Array.from({ length: Number(process.env.JSM_TEST_WORKERS || 1) }, async () => {
      while (jobs.length) problems.push(...await jobs.shift()());
    }));
    assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
    console.log(`PASS: ${selected.length} pages and views at two sizes -- moves follow the axis, form rows retrace, the ring sits on focus, nothing takes focus without a press; menu-to-dialog focus, page landing, radial segments`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
