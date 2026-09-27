// The lane rows' bookkeeping (binding card refresh 2f), kept pure for the
// tests: which row an add produced, and where a row sits among its lane's.

/** The id an add produced: the first one that was not there before it. */
export const freshId = (before: ReadonlySet<string>, after: readonly string[]) => after.find(id => !before.has(id)) ?? null

/** The row's position among its lane's rows, for finding its successor. */
export const rowIndex = (lane: ParentNode, row: Element) => [...lane.querySelectorAll('[data-kind]')].indexOf(row)
