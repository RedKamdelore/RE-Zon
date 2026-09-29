// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RightPanel, { LyricsPanel } from './RightPanel'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore } from '../stores/lyricsStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import type { Track } from '@shared/types'

let host: HTMLDivElement, root: Root
const track: Track = {id:'local:lyrics',sourceId:'local',title:'Song',artist:'Artist',album:'Album',durationSec:80,filePath:'song.mp3',lyrics:'[00:01]Первая\n[00:03]Вторая'}
beforeEach(() => {
  ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
  usePlayerStore.setState({queue:[track],order:[0],pos:0,currentSec:0,seek:vi.fn()})
  useLyricsStore.setState({overrides:{},offsets:{},automatic:{},reports:{}})
  useWorkspaceStore.setState({lyricDrafts:{}})
})
afterEach(() => {act(() => root.unmount());host.remove();delete (window as unknown as {api?: unknown}).api;vi.unstubAllGlobals()})
it('follows playback, seeks on a line click and lets the listener pause scrolling', () => {
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  expect(host.querySelector('.rp-lyrics-line.active')).toBeNull()
  act(() => usePlayerStore.setState({currentSec:1.5}))
  expect(host.querySelector('.rp-lyrics-line.active')?.textContent).toBe('Первая')
  act(() => host.querySelector('.rp-lyrics-timed')!.dispatchEvent(new WheelEvent('wheel',{bubbles:true})))
  expect(host.textContent).toContain('К текущей строке')
  act(() => host.querySelectorAll<HTMLButtonElement>('.rp-lyrics-line')[1].click())
  expect(usePlayerStore.getState().seek).toHaveBeenCalledWith(3)
})
it('preserves display of plain lyrics without timing', () => {
  useLyricsStore.setState({overrides:{[track.id]:'Обычный текст\nбез времени'}})
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  expect(host.querySelector('.rp-lyrics-text')?.textContent).toContain('без времени')
  expect(host.querySelector('.rp-lyrics-timed')).toBeNull()
})
it('shifts highlighting and seeking together for a track', () => {
  usePlayerStore.setState({currentSec:1.2})
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  expect(host.querySelector('.rp-lyrics-line.active')?.textContent).toBe('Первая')
  const later = Array.from(host.querySelectorAll<HTMLButtonElement>('.rp-lyrics-sync button')).find(button => button.textContent === 'Позже')!
  act(() => later.click())
  expect(host.querySelector('.rp-lyrics-line.active')).toBeNull()
  expect(host.querySelector('.rp-lyrics-sync output')?.textContent).toBe('+0.5 с')
  act(() => host.querySelector<HTMLButtonElement>('.rp-lyrics-line')!.click())
  expect(usePlayerStore.getState().seek).toHaveBeenCalledWith(1.5)
  act(() => Array.from(host.querySelectorAll<HTMLButtonElement>('.rp-lyrics-sync button')).find(button => button.textContent === 'Сбросить')!.click())
  expect(host.querySelector('.rp-lyrics-line.active')?.textContent).toBe('Первая')
})
it('shows the displayed text and the result from each lyrics source', () => {
  useLyricsStore.setState({reports:{[track.id]:{
    best:{text:'[00:02]Сеть',synced:true,source:'synclrc'},
    sources:[
      {source:'lrclib',status:'plain',result:{text:'Обычная строка',synced:false,source:'lrclib'}},
      {source:'lrcapi',status:'missing'},
      {source:'lrcmux',status:'error'},
      {source:'synclrc',status:'both',result:{text:'[00:02]Сеть',plainText:'Обычная сеть',synced:true,source:'synclrc'}},
    ],
  }}})
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  act(() => host.querySelector<HTMLButtonElement>('.rp-lyrics-options button')!.click())
  expect(host.querySelector('.rp-lyrics-options button')?.getAttribute('aria-expanded')).toBe('true')
  expect(host.querySelector('.rp-lyrics-current')?.textContent).toContain('Теги файла · синхронный')
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('LRCLIBЕсть обычный текст · 1 строка')
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('LrcAPIНе нашли')
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('LrcMuxОшибка при проверке')
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('SyncLRCЕсть оба текста · 1 строка с таймкодами')
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('Обычный: Обычная сеть')
})
it('checks every source when the menu opens', async () => {
  const lookupLyricsReport = vi.fn().mockResolvedValue({best:null,checkedAll:true,sources:[
    {source:'lrclib',status:'missing'}, {source:'lrcapi',status:'missing'},
    {source:'lrcmux',status:'missing'}, {source:'synclrc',status:'missing'},
  ]})
  Object.defineProperty(window,'api',{configurable:true,value:{lookupLyricsReport}})
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  await act(async () => {host.querySelector<HTMLButtonElement>('.rp-lyrics-options button')!.click()})
  expect(lookupLyricsReport).toHaveBeenCalledWith(expect.objectContaining({title:'Song',checkAll:true}))
  expect(host.querySelector('.rp-lyrics-sources')?.textContent).toContain('LRCLIBНе нашли')
})
it('closes the sources menu with Escape or an outside click', () => {
  act(() => root.render(<RightPanel panel="lyrics" onClose={()=>{}}/>))
  const trigger = host.querySelector<HTMLButtonElement>('.rp-lyrics-options button')!
  act(() => trigger.click())
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  act(() => window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector('.rp-lyrics-menu-popover')).toBeNull()
  act(() => trigger.click())
  act(() => document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})))
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})
it('keeps the first and last timed lines centered when the full-player pane resizes', () => {
  let resize: ResizeObserverCallback | undefined
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe() {}
    disconnect() {}
  })
  act(() => root.render(<div className="full-player-lyrics-body"><LyricsPanel /></div>))
  const container = host.querySelector<HTMLDivElement>('.rp-lyrics-timed')!
  const lines = host.querySelectorAll<HTMLButtonElement>('.rp-lyrics-line')
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(lines[0], 'clientHeight', { configurable: true, value: 40 })
  Object.defineProperty(lines[1], 'clientHeight', { configurable: true, value: 80 })
  act(() => resize?.([], {} as ResizeObserver))
  expect(container.style.getPropertyValue('--lyrics-leading-space')).toBe('130px')
  expect(container.style.getPropertyValue('--lyrics-trailing-space')).toBe('110px')

  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 420 })
  act(() => resize?.([], {} as ResizeObserver))
  expect(container.style.getPropertyValue('--lyrics-leading-space')).toBe('190px')
  expect(container.style.getPropertyValue('--lyrics-trailing-space')).toBe('170px')
})
