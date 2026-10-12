// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { animateViewChange } from './motion'

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })))
afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.motionKind; vi.restoreAllMocks() })

it('updates directly when motion is reduced', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const start = vi.fn()
  document.startViewTransition = start
  const update = vi.fn()
  animateViewChange(update, 'route')
  expect(update).toHaveBeenCalledOnce()
  expect(start).not.toHaveBeenCalled()
})

it('keeps rapid clicks in order without capturing overlapping transitions', async () => {
  let finish!: () => void, capturedUpdate!: () => void, completeUpdate!: () => void
  const events: number[] = []
  const updateCallbackDone = new Promise<void>(resolve => { completeUpdate = resolve })
  const transition = { ready: Promise.resolve(), updateCallbackDone, finished: new Promise<void>(resolve => { finish = resolve }), skipTransition: vi.fn() } as unknown as ViewTransition
  const start = vi.fn((update: () => void) => { capturedUpdate = update; return transition })
  document.startViewTransition = start as unknown as typeof document.startViewTransition
  animateViewChange(() => events.push(1), 'route')
  animateViewChange(() => events.push(2), 'player')
  animateViewChange(() => events.push(3), 'player')
  expect(start).toHaveBeenCalledOnce()
  expect(events).toEqual([])
  capturedUpdate(); completeUpdate()
  await updateCallbackDone
  expect(events).toEqual([1, 2, 3])
  finish(); await transition.finished
  expect(document.documentElement.dataset.motionKind).toBeUndefined()
})

it('animates only the changing panel and cancels its previous motion', async () => {
  const pane = document.createElement('div'); pane.className = 'full-player-queue'; document.body.append(pane)
  let finishFirst!: () => void, finishSecond!: () => void
  const first = { cancel: vi.fn(() => finishFirst()), finished: new Promise<void>(resolve => { finishFirst = resolve }) }
  const second = { cancel: vi.fn(), finished: new Promise<void>(resolve => { finishSecond = resolve }) }
  const animate = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
  pane.animate = animate
  const start = vi.fn(); document.startViewTransition = start
  const update = vi.fn()
  animateViewChange(update, 'player')
  animateViewChange(update, 'player')
  expect(start).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledTimes(2)
  expect(first.cancel).toHaveBeenCalledOnce()
  expect(animate).toHaveBeenCalledTimes(2)
  finishSecond(); await second.finished
  pane.remove()
})
