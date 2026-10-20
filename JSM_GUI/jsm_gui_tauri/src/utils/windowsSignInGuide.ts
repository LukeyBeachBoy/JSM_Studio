const INPUTS = new Set(['S', 'E', 'W', 'N', 'UP', 'RIGHT', 'DOWN', 'LEFT', 'L', 'R', 'L3', 'R3', '+', '-', 'HOME', 'ZL', 'ZR', 'MISC2', 'MISC3', 'LSL', 'LSR', 'RSR', 'RSL'])

/** Match the native sign-in parser: includes, macros and unknown values do not run. */
export function windowsSignInBindings(profile: string) {
  const bindings = new Map<string, string>()
  for (const line of profile.split(/\r?\n/)) {
    const text = line.split('#', 1)[0]
    const equal = text.indexOf('=')
    if (equal < 0) continue
    const input = text.slice(0, equal).trim(), value = text.slice(equal + 1).trim()
    if (!INPUTS.has(input)) continue
    if (/^(\d|ENTER|BACKSPACE|ESC)$/.test(value)) bindings.set(input, value)
    else bindings.delete(input)
  }
  return bindings
}

/** A static reference only. No live input, typed digits, or PIN ever enters it. */
export function windowsSignInGuide(profile: string, frontArt: string) {
  const bindings = windowsSignInBindings(profile)
  const label = (input: string) => ({ ENTER: 'Enter', BACKSPACE: 'Erase', ESC: 'Esc' }[bindings.get(input) ?? ''] ?? bindings.get(input) ?? '—')
  const marker = (input: string, physical: string, x: number, y: number, radius = 29) => {
    const value = label(input)
    return `<g transform="translate(${x} ${y})" data-input="${input}" aria-label="${physical}: ${value}">
      <circle r="${radius}" fill="#9cebd6" stroke="#101a22" stroke-width="4"/>
      <text y="-9" text-anchor="middle" fill="#264b47" font-size="11" font-weight="700">${physical}</text>
      <text y="15" text-anchor="middle" fill="#0a2825" font-size="${value.length > 2 ? 19 : 29}" font-weight="750">${value}</text>
    </g>`
  }
  const controls = (inputs: string[]) => {
    const names: Record<string, string> = { '+': 'Menu', '-': 'View', ZL: 'Left trigger', ZR: 'Right trigger', MISC2: 'Right pad click', MISC3: 'Left pad click', HOME: 'Steam' }
    return inputs.map((input, index) => `<g transform="translate(1180 ${290 + index * 44})" data-input="${input}" aria-label="${names[input]}: ${label(input)}">
      <text fill="#e3ebef" font-size="19">${names[input]}</text>
      <text x="356" text-anchor="end" fill="#9cebd6" font-size="19" font-weight="700">${bindings.get(input) === 'BACKSPACE' ? 'Backspace' : label(input)}</text>
    </g>`).join('')
  }
  // Existing controller artwork, recolored as a neutral outline under the keys.
  const artwork = frontArt.replace(/<svg\b[^>]*>/, '<g>').replace(/<\/svg>\s*$/, '</g>').replace(/fill="black"/g, 'fill="#687e8e"')
  const buttons = [
    marker('N', 'Y', 864, 93), marker('E', 'B', 922, 146), marker('S', 'A', 864, 200), marker('W', 'X', 806, 146),
    marker('UP', '↑', 252, 99, 25), marker('RIGHT', '→', 298, 145, 25), marker('DOWN', '↓', 252, 191, 25), marker('LEFT', '←', 206, 145, 25),
    marker('L', 'LB', 268, 22), marker('R', 'RB', 851, 22),
    marker('L3', 'L3', 412, 219, 32), marker('R3', 'R3', 700, 219, 32),
    marker('-', 'View', 382, 77, 35), marker('+', 'Menu', 730, 77, 35), marker('HOME', 'Steam', 557, 147, 35),
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 960" role="img" aria-labelledby="sign-in-title sign-in-desc" font-family="Segoe UI, Arial, sans-serif">
    <title id="sign-in-title">Windows sign-in controller reference</title>
    <desc id="sign-in-desc">Digits are printed on their controller buttons. Use the buttons directly, without holding Quick Access. Hold Quick Access and tap Y, then release both, to turn the controller off.</desc>
    <rect width="1600" height="960" rx="24" fill="#101a22"/>
    <text x="64" y="86" fill="#f2f6f8" font-size="48" font-weight="700">Windows sign-in</text>
    <text x="64" y="130" fill="#b1c4cf" font-size="24">Press directly · No Quick Access hold · Release between digits</text>
    <g transform="translate(110 215) scale(.82)">${artwork}${buttons}
      <circle cx="556" cy="409" r="20" fill="#233c49" stroke="#9cebd6" stroke-width="2"/>
      <text x="556" y="415" text-anchor="middle" fill="#9cebd6" font-size="21">•••</text>
      <text x="556" y="458" text-anchor="middle" fill="#b1c4cf" font-size="18">Quick Access</text>
    </g>
    <path d="M1134 200v570" stroke="#2c4351" stroke-width="2"/>
    <text x="1180" y="235" fill="#b1c4cf" font-size="18">OTHER CONTROLS</text>
    ${controls(['+', 'ZR', 'MISC2', '-', 'ZL', 'MISC3', 'HOME'])}
    <text x="1180" y="690" fill="#b1c4cf" font-size="18">Rear buttons</text>
    <text x="1180" y="724" fill="#e3ebef" font-size="20">L4 = ${label('LSL')} · R4 = ${label('RSR')}</text>
    <text x="1180" y="758" fill="#e3ebef" font-size="20">L5 = ${label('LSR')} · R5 = ${label('RSL')}</text>
    <rect x="64" y="852" width="1472" height="72" rx="16" fill="#203943"/>
    <text x="88" y="897" fill="#9cebd6" font-size="22" font-weight="700">Controller off</text>
    <text x="298" y="897" fill="#f2f6f8" font-size="23">Hold Quick Access + tap Y → release both</text>
    <text x="1490" y="897" text-anchor="end" fill="#b1c4cf" font-size="20">Steam wakes it again</text>
  </svg>`
}

/** Leave the middle clear for Windows' account picture and PIN field. */
export function windowsSignInBackground(profile: string) {
  const bindings = windowsSignInBindings(profile)
  const value = (input: string) => bindings.get(input) ?? '—'
  const key = (input: string, name: string, x: number, y: number) => `<g transform="translate(${x} ${y})">
    <circle r="42" fill="#9cebd6"/>
    <text y="-11" text-anchor="middle" fill="#264b47" font-size="15" font-weight="700">${name}</text>
    <text y="20" text-anchor="middle" fill="#0a2825" font-size="${value(input).length > 1 ? 17 : 36}" font-weight="750">${value(input)}</text>
  </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" font-family="Segoe UI, Arial, sans-serif">
    <rect width="1920" height="1080" fill="#101a22"/>
    <g fill="#192b35"><rect x="48" y="180" width="480" height="824" rx="24"/><rect x="1392" y="180" width="480" height="824" rx="24"/></g>
    <text x="88" y="244" fill="#f2f6f8" font-size="32" font-weight="700">PIN buttons</text>
    <text x="88" y="282" fill="#b1c4cf" font-size="21">Press directly · Release to repeat</text>
    ${key('N', 'Y', 288, 353)}${key('W', 'X', 188, 441)}${key('E', 'B', 388, 441)}${key('S', 'A', 288, 529)}
    <text x="88" y="619" fill="#b1c4cf" font-size="21">D-pad</text>
    ${key('UP', '↑', 288, 684)}${key('LEFT', '←', 188, 772)}${key('RIGHT', '→', 388, 772)}${key('DOWN', '↓', 288, 860)}
    <text x="88" y="964" fill="#e3ebef" font-size="25">LB = ${value('L')} · RB = ${value('R')}</text>
    <text x="1432" y="244" fill="#f2f6f8" font-size="32" font-weight="700">Windows sign-in</text>
    <text x="1432" y="325" fill="#9cebd6" font-size="25" font-weight="700">Menu = ${value('+')}</text>
    <text x="1432" y="368" fill="#b1c4cf" font-size="22">Right trigger = ${value('ZR')}</text>
    <text x="1432" y="456" fill="#9cebd6" font-size="25" font-weight="700">View = ${value('-')}</text>
    <text x="1432" y="499" fill="#b1c4cf" font-size="22">Left trigger = ${value('ZL')}</text>
    <path d="M1432 566h400" stroke="#36505e"/>
    <text x="1432" y="641" fill="#f2f6f8" font-size="29" font-weight="700">Controller off</text>
    <text x="1432" y="697" fill="#9cebd6" font-size="24">Hold Quick Access</text>
    <text x="1432" y="739" fill="#9cebd6" font-size="24">+ tap Y</text>
    <text x="1432" y="790" fill="#e3ebef" font-size="22">Then release both buttons</text>
    <text x="1432" y="930" fill="#b1c4cf" font-size="22">Steam wakes it again</text>
  </svg>`
}
