import type { UpdateState } from '../shared/updates'

export function triggerAutomaticUpdateCheck(controller: {getState: () => UpdateState; check: () => Promise<unknown>}): void {
  const state = controller.getState()
  if (state.autoCheck && state.feedUrl && !['available','downloaded','installing','checking','downloading'].includes(state.phase)) void controller.check()
}

export function startAutomaticUpdateChecks(controller: {getState: () => UpdateState; check: () => Promise<unknown>}, startupDelayMs = 1500): () => void {
  const startup = setTimeout(() => triggerAutomaticUpdateCheck(controller), startupDelayMs)
  const daily = setInterval(() => triggerAutomaticUpdateCheck(controller), 24 * 60 * 60 * 1000)
  startup.unref?.(); daily.unref?.()
  return () => { clearTimeout(startup); clearInterval(daily) }
}
