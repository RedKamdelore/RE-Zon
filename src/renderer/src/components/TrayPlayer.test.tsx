// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import TrayPlayer from './TrayPlayer'
import type { TrayPlayerApi, TrayPlayerState } from '@shared/trayPlayer'

let host: HTMLDivElement, root: Root
let listener: (state: TrayPlayerState) => void
let api: TrayPlayerApi
const track: TrayPlayerState = { title: 'Song', artist: 'Artist', playing: true, currentSec: 12, durationSec: 180, hasTrack: true, volume: .65 }
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  api = { state: vi.fn().mockResolvedValue(track), onState: callback => { listener = callback; return vi.fn() }, command: vi.fn(), showMain: vi.fn(), hide: vi.fn() }
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!

it('sends playback, navigation and dismissal commands and restores muted volume', async () => {
  await act(async () => root.render(<TrayPlayer api={api}/>))
  for (const [label, command] of [['Пауза','toggle'],['Стоп','stop'],['Предыдущий трек','prev'],['Следующий трек','next']]) {
    act(() => button(label).click()); expect(api.command).toHaveBeenLastCalledWith(command)
  }
  for (const [label, command] of [['Текст','lyrics'],['Очередь','queue']]) {
    act(() => Array.from(host.querySelectorAll('button')).find(item => item.textContent === label)!.click())
    expect(api.command).toHaveBeenLastCalledWith(command)
  }
  act(() => button('Выключить звук').click()); expect(api.command).toHaveBeenLastCalledWith('volume:0')
  act(() => listener({...track,volume:0}))
  act(() => button('Включить звук').click()); expect(api.command).toHaveBeenLastCalledWith('volume:0.65')
  act(() => button('Закрыть плеер').click()); expect(api.hide).toHaveBeenCalledOnce()
  act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))); expect(api.hide).toHaveBeenCalledTimes(2)
})

it('does not overwrite a fresh event with an older initial snapshot', async () => {
  let resolve!: (state: TrayPlayerState) => void
  api.state = () => new Promise(done => { resolve = done })
  act(() => root.render(<TrayPlayer api={api}/>))
  act(() => listener({...track,title:'New song'}))
  await act(async () => resolve(track))
  expect(host.textContent).toContain('New song')
  expect(host.textContent).not.toContain('Song')
})

it('disables playback and seeking when the queue is empty', async () => {
  await act(async () => root.render(<TrayPlayer api={api}/>))
  act(() => listener({...track,hasTrack:false,playing:false,durationSec:0}))
  expect(button('Слушать').disabled).toBe(true)
  expect(button('Стоп').disabled).toBe(true)
  expect(host.querySelector<HTMLInputElement>('[aria-label="Позиция воспроизведения"]')!.disabled).toBe(true)
  expect(host.textContent).toContain('Выберите музыку')
})
