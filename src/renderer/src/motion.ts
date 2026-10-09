import { flushSync } from 'react-dom'

type MotionKind = 'route' | 'settings' | 'player'
let activeTransition: ViewTransition | null = null

/** A short, scoped transition for discrete UI changes. Direct updates remain the fallback. */
export function animateViewChange(update: () => void, kind: MotionKind): void {
  if (typeof document === 'undefined' || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  activeTransition?.skipTransition()
  document.documentElement.dataset.motionKind = kind
  try {
    const transition = document.startViewTransition(() => flushSync(update))
    activeTransition = transition
    // Rapid navigation intentionally skips the previous animation. Chromium
    // rejects `ready` in that case, even though the UI update still succeeds.
    void transition.ready.catch(() => undefined)
    const clear = (): void => {
      if (activeTransition === transition) {
        activeTransition = null
        delete document.documentElement.dataset.motionKind
      }
    }
    void transition.finished.then(clear, clear)
  } catch {
    delete document.documentElement.dataset.motionKind
    update()
  }
}
