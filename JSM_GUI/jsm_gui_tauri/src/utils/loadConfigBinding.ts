/**
 * Bindings that switch the configuration.
 *
 * JoyShockMapper treats a double-quoted binding value as a console command, and
 * a bare config path typed at the console loads that config -- so
 * `RSR,S = "profiles-library/Wardogs Menu.txt"` makes R4+A switch profiles.
 * That is the whole mechanism; there is no separate command for it.
 *
 * The token kind stays `console_command`, so nothing about how this is written
 * to a profile changes. This module only recognises the shape well enough for
 * the editor to offer a list of configurations instead of asking someone to
 * type a path, and to read one back as the configuration's name.
 */

export const PROFILE_LIBRARY_PREFIX = 'profiles-library/'

const PROFILE_SUFFIX = '.txt'

/** The value to write for a binding that loads `name`. */
export const loadConfigBindingValue = (name: string) =>
  `${PROFILE_LIBRARY_PREFIX}${name.trim()}${PROFILE_SUFFIX}`

/**
 * The configuration a command binding loads, or null if it is some other
 * command. Tolerates backslashes and a leading `./`, since a hand-written
 * profile may use either.
 */
export const loadConfigBindingName = (value: string): string | null => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized.toLowerCase().startsWith(PROFILE_LIBRARY_PREFIX)) return null
  const rest = normalized.slice(PROFILE_LIBRARY_PREFIX.length)
  if (!rest.toLowerCase().endsWith(PROFILE_SUFFIX)) return null
  const name = rest.slice(0, -PROFILE_SUFFIX.length)
  // A path with another directory in it is not a library configuration.
  return name && !name.includes('/') ? name : null
}

export const isLoadConfigBindingValue = (value: string) => loadConfigBindingName(value) !== null
