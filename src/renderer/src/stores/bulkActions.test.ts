import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaylistStore } from './playlistStore'
import { useLibraryStore, visibleTracks } from './libraryStore'
import { useFavoritesStore } from './favoritesStore'
import type { Track } from '@shared/types'

const tracks: Track[] = ['a', 'b', 'c'].map((id) => ({id, title:id, artist:'A', album:'B', sourceId:'vk', filePath:`https://example.com/${id}`, durationSec:1}))

describe('bulk actions', () => {
  beforeEach(() => {
    useLibraryStore.setState({tracks, hiddenIds:[]})
    useFavoritesStore.setState({ids:['a']})
    usePlaylistStore.setState({playlists:[{id:'p', name:'P', trackIds:['a','b','c'], createdAt:1}]})
  })
  it('removes by IDs without shifting the remaining playlist entries', () => {
    usePlaylistStore.getState().removeTracks('p', ['c','a'])
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['b'])
    expect(useLibraryStore.getState().tracks).toEqual(tracks)
  })
  it('adds in selection order and does not duplicate existing tracks', () => {
    usePlaylistStore.getState().addTracks('p', ['c','e','d','e'])
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['a','b','c','e','d'])
  })
  it('sets favorites uniformly for mixed selections', () => {
    useFavoritesStore.getState().setMany(['a','b'], true)
    expect(useFavoritesStore.getState().ids).toEqual(['a','b'])
    useFavoritesStore.getState().setMany(['b','c'], false)
    expect(useFavoritesStore.getState().ids).toEqual(['a'])
  })
  it('hides without deleting data, survives refresh, and supports undo', () => {
    useLibraryStore.getState().hideTracks(['a','c','a'])
    expect(visibleTracks(useLibraryStore.getState()).map(t=>t.id)).toEqual(['b'])
    useLibraryStore.getState().upsertTracks(tracks.map(t=>({...t,filePath:t.filePath+'?fresh'})))
    expect(visibleTracks(useLibraryStore.getState()).map(t=>t.id)).toEqual(['b'])
    useLibraryStore.getState().unhideTracks(['a','c'])
    expect(visibleTracks(useLibraryStore.getState())).toHaveLength(3)
  })
})
