// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TrackList from './TrackList'
import type { Track } from '@shared/types'
import { useLibraryStore } from '../stores/libraryStore'

let host: HTMLDivElement
let root: Root
const tracks: Track[] = ['C', 'A', 'B'].map(id => ({id, title:id, artist:'Artist',album:'Album',durationSec:1,sourceId:'vk',filePath:'https://example.com/a.mp3'}))
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  useLibraryStore.setState({tracks,hiddenIds:[],lastHiddenIds:[]})
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function click(node: Element, options: MouseEventInit = {}) {
  act(() => node.dispatchEvent(new MouseEvent('click',{bubbles:true,...options})))
}
function button(label: string): HTMLButtonElement {
  return [...host.querySelectorAll('button')].find(b=>b.textContent===label)!
}
it('Ctrl-click selects without playback and Shift uses the displayed sorted order', () => {
  const play=vi.fn()
  act(() => root.render(<TrackList tracks={tracks} onPlay={play} />))
  click(host.querySelector('.tl-sort')!) // A, B, C
  click(host.querySelectorAll('.tl-row')[0],{ctrlKey:true})
  click(host.querySelectorAll('.tl-row')[1],{shiftKey:true})
  expect(play).not.toHaveBeenCalled()
  expect([...host.querySelectorAll<HTMLInputElement>('input:checked')].map(x=>x.getAttribute('aria-label'))).toEqual(['Выбрать Artist — A','Выбрать Artist — B'])
  click(button('Убрать из библиотеки'))
  expect(useLibraryStore.getState().hiddenIds).toEqual(['A','B'])
})
it('Ctrl+A selects only the visible list and bulk removal passes IDs together', () => {
  const remove=vi.fn()
  act(() => root.render(<TrackList tracks={tracks.slice(1)} onRemoveTracks={remove} />))
  act(() => host.querySelector('.tl')!.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,ctrlKey:true,code:'KeyA'})))
  click(button('Убрать из плейлиста'))
  expect(remove).toHaveBeenCalledExactlyOnceWith(['A','B'])
})
