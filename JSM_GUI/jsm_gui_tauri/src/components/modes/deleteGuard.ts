import { useEffect, useRef, type KeyboardEvent } from 'react'

// The inline "Delete X?" strip (ModeChanges, MenuDetails) keeps the pad on its
// two buttons while the question is open: Up and Left are Keep it, Down and
// Right are Delete, and leaving it any other way -- a click elsewhere, focus
// moving on to another row or the title bar -- counts as Keep it. Before this
// Up walked out to the status chip with the question still pending.

export function useDeleteGuard(deleting: boolean, keep: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(keep)
  latest.current = keep
  const was = useRef(false)
  useEffect(() => {
    if (!deleting) {
      // Keep it (or B): the pad lands back on the "Delete…" row that asked.
      if (was.current) requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>('[data-subpage] [data-delete-row]')?.focus() })
      was.current = false
      return
    }
    was.current = true
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-keep]')?.focus())
    const outside = (target: EventTarget | null) => target instanceof Node && target !== document.body && !!ref.current && !ref.current.contains(target)
    const onPointer = (event: PointerEvent) => { if (outside(event.target)) latest.current() }
    const onFocus = (event: FocusEvent) => { if (outside(event.target)) latest.current() }
    window.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('focusin', onFocus)
    }
  }, [deleting])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = event.currentTarget
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); panel.querySelector<HTMLElement>('[data-keep]')?.focus() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); panel.querySelector<HTMLElement>('[data-delete]')?.focus() }
  }
  return { ref, onKeyDown }
}
