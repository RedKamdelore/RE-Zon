// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { handleHotkey, isTypingTarget, type HotkeyDeps } from './hotkeys'

function makeDeps(over: Partial<HotkeyDeps['player']> = {}): HotkeyDeps {
  return {
    player: {
      togglePlay: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      setVolume: vi.fn(),
      volume: 0.5,
      queue: [{ id: 'a' }, { id: 'b' }],
      order: [0, 1],
      pos: 0,
      ...over,
    },
    toggleFavorite: vi.fn(),
  }
}

function key(code: string, opts: Partial<KeyboardEvent> & { target?: EventTarget | null } = {}): KeyboardEvent {
  const { target, ...rest } = opts
  const e = new KeyboardEvent('keydown', { code, ctrlKey: false, ...rest })
  if (target !== undefined && target !== null) {
    Object.defineProperty(e, 'target', { value: target })
  }
  return e
}

describe('handleHotkey', () => {
  it('Space toggles play and is handled', () => {
    const d = makeDeps()
    expect(handleHotkey(key('Space'), d)).toBe(true)
    expect(d.player.togglePlay).toHaveBeenCalledTimes(1)
  })

  it('Space inside input/textarea/select/contenteditable is ignored', () => {
    const d = makeDeps()
    const input = document.createElement('input')
    expect(handleHotkey(key('Space', { target: input }), d)).toBe(false)
    const ta = document.createElement('textarea')
    expect(handleHotkey(key('Space', { target: ta }), d)).toBe(false)
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(handleHotkey(key('Space', { target: editable }), d)).toBe(false)
    expect(d.player.togglePlay).not.toHaveBeenCalled()
  })

  it('isTypingTarget: null-safe', () => {
    expect(isTypingTarget(null)).toBe(false)
  })

  it('Ctrl+Right/Left — next/prev', () => {
    const d = makeDeps()
    expect(handleHotkey(key('ArrowRight', { ctrlKey: true }), d)).toBe(true)
    expect(d.player.next).toHaveBeenCalledWith({ manual: true })
    expect(handleHotkey(key('ArrowLeft', { ctrlKey: true }), d)).toBe(true)
    expect(d.player.prev).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Up/Down — volume ±5% with clamping', () => {
    const d = makeDeps()
    expect(handleHotkey(key('ArrowUp', { ctrlKey: true }), d)).toBe(true)
    expect(d.player.setVolume).toHaveBeenCalledWith(0.55)
    expect(handleHotkey(key('ArrowDown', { ctrlKey: true }), d)).toBe(true)
    expect(d.player.setVolume).toHaveBeenCalledWith(0.45)

    const high = makeDeps({ volume: 0.99 })
    handleHotkey(key('ArrowUp', { ctrlKey: true }), high)
    expect(high.player.setVolume).toHaveBeenCalledWith(1)
    const low = makeDeps({ volume: 0.01 })
    handleHotkey(key('ArrowDown', { ctrlKey: true }), low)
    expect(low.player.setVolume).toHaveBeenCalledWith(0)
  })

  it('plain arrows without Ctrl are not handled', () => {
    const d = makeDeps()
    expect(handleHotkey(key('ArrowRight'), d)).toBe(false)
    expect(handleHotkey(key('ArrowUp'), d)).toBe(false)
    expect(d.player.next).not.toHaveBeenCalled()
  })

  it('Ctrl+L toggles favorite of the current track', () => {
    const d = makeDeps()
    expect(handleHotkey(key('KeyL', { ctrlKey: true }), d)).toBe(true)
    expect(d.toggleFavorite).toHaveBeenCalledWith('a')
    // pos 1 → второй трек
    const d2 = makeDeps({ pos: 1 })
    handleHotkey(key('KeyL', { ctrlKey: true }), d2)
    expect(d2.toggleFavorite).toHaveBeenCalledWith('b')
  })

  it('Ctrl+L with empty queue does nothing but is handled', () => {
    const d = makeDeps({ queue: [], order: [], pos: 0 })
    expect(handleHotkey(key('KeyL', { ctrlKey: true }), d)).toBe(true)
    expect(d.toggleFavorite).not.toHaveBeenCalled()
  })

  it('unrelated keys are not handled', () => {
    const d = makeDeps()
    expect(handleHotkey(key('KeyA'), d)).toBe(false)
    expect(handleHotkey(key('Escape'), d)).toBe(false)
  })
})
