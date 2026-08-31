import { describe, it, expect } from 'vitest'
import { createPlaylist, renamePlaylist, addTrack, removeTrack } from './playlists'

describe('playlists', () => {
  it('creates playlist with unique id and empty tracks', () => {
    const p = createPlaylist([], 'Мой плейлист')
    expect(p.name).toBe('Мой плейлист')
    expect(p.trackIds).toEqual([])
    expect(p.id).toBeTruthy()
  })

  it('renames', () => {
    const p = createPlaylist([], 'a')
    expect(renamePlaylist(p, 'b').name).toBe('b')
  })

  it('addTrack appends, deduplicates', () => {
    let p = createPlaylist([], 'a')
    p = addTrack(p, 't1')
    p = addTrack(p, 't1')
    p = addTrack(p, 't2')
    expect(p.trackIds).toEqual(['t1', 't2'])
  })

  it('removeTrack removes by index', () => {
    let p = createPlaylist([], 'a')
    p = addTrack(p, 't1'); p = addTrack(p, 't2'); p = addTrack(p, 't3')
    expect(removeTrack(p, 1).trackIds).toEqual(['t1', 't3'])
  })
})
