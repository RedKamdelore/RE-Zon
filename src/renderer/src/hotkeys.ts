import { useEffect } from 'react'
import { usePlayerStore } from './stores/playerStore'
import { useFavoritesStore } from './stores/favoritesStore'

/** Цель события — поле ввода? (Space там должен печатать, а не паузить) */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return (
    el !== null &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  )
}

export interface HotkeyDeps {
  player: {
    togglePlay: () => void
    next: (opts?: { manual?: boolean }) => void
    prev: () => void
    setVolume: (v: number) => void
    volume: number
    queue: Array<{ id: string }>
    order: number[]
    pos: number
  }
  toggleFavorite: (id: string) => void
}

/**
 * Обрабатывает одно нажатие. Возвращает true, если нажатие обработано
 * (вызывающий может ожидать preventDefault). Чистая функция — тестируется.
 *
 * Space — play/pause; Ctrl+←/→ — prev/next; Ctrl+↑/↓ — громкость ±5%;
 * Ctrl+L — сердечко играющему треку.
 */
export function handleHotkey(e: KeyboardEvent, deps: HotkeyDeps): boolean {
  const mod = e.ctrlKey || e.metaKey
  const p = deps.player

  if (!mod && e.code === 'Space' && !isTypingTarget(e.target)) {
    p.togglePlay()
    return true
  }
  if (mod && e.code === 'ArrowRight') {
    p.next({ manual: true })
    return true
  }
  if (mod && e.code === 'ArrowLeft') {
    p.prev()
    return true
  }
  if (mod && e.code === 'ArrowUp') {
    p.setVolume(Math.min(1, p.volume + 0.05))
    return true
  }
  if (mod && e.code === 'ArrowDown') {
    p.setVolume(Math.max(0, p.volume - 0.05))
    return true
  }
  if (mod && (e.code === 'KeyL' || e.key === 'l' || e.key === 'л')) {
    const current = p.order.length > 0 ? p.queue[p.order[p.pos]] : undefined
    if (current) deps.toggleFavorite(current.id)
    return true
  }
  return false
}

/** Глобальные горячие клавиши (V3-4). См. handleHotkey. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const deps: HotkeyDeps = {
        player: usePlayerStore.getState(),
        toggleFavorite: (id: string) => useFavoritesStore.getState().toggle(id),
      }
      if (handleHotkey(e, deps)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
