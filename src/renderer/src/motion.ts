import { flushSync } from 'react-dom'

type MotionKind = 'route' | 'settings' | 'player'
let activeTransition: ViewTransition | null = null
let activeAnimation: Animation | null = null

function commitPanelChange(update: () => void, kind: MotionKind): void {
  activeAnimation?.cancel()
  activeAnimation = null
  flushSync(update)
  const selector = kind === 'settings' ? '.settings-content' : '.full-player-lyrics-body,.full-player-queue,.full-player-eq,.full-player-art-stage'
  const panel = document.querySelector<HTMLElement>(selector)
  if (!panel?.animate) return
  const animation = panel.animate([{ opacity: .35, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.75,.25,1)' })
  activeAnimation = animation
  const clear = () => { if (activeAnimation === animation) activeAnimation = null }
  void animation.finished.then(clear, clear)
}

/** A short, scoped transition for discrete UI changes. Direct updates remain the fallback. */
export function animateViewChange(update: () => void, kind: MotionKind): void {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    activeAnimation?.cancel()
    update()
    return
  }
  if (activeTransition) {
    const previous = activeTransition
    previous.skipTransition()
    // Apply rapid clicks after the captured update, in input order. A second
    // capture here would stack snapshots while the first screen is still leaving.
    const apply = () => kind === 'route' ? flushSync(update) : commitPanelChange(update, kind)
    void previous.updateCallbackDone.then(apply, apply)
    return
  }
  // Keep the tabs, cover, background and transport live during internal switches.
  // Only the changed pane enters; no frozen root snapshot sits over the controls.
  if (kind !== 'route') { commitPanelChange(update, kind); return }
  activeAnimation?.cancel()
  if (!document.startViewTransition) { update(); return }
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
