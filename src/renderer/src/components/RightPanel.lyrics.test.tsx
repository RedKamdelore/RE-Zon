// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RightPanel from './RightPanel'
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
  useLyricsStore.setState({overrides:{}})
  useWorkspaceStore.setState({lyricDrafts:{}})
})
afterEach(() => {act(() => root.unmount());host.remove()})
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
