import { it, expect, vi } from 'vitest'
import { usePlaylistStore, setPersistedBase, flushPersist } from './playlistStore'
import type { PersistedData } from '@shared/types'

it('persists manual order and keeps records at the boundaries', async () => {
  const saveData=vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window',{api:{saveData}})
  setPersistedBase({version:4,volume:.6} as PersistedData)
  usePlaylistStore.getState().init([{id:'p',name:'Order',trackIds:['a','b','c'],createdAt:1}])
  try {
    const move=usePlaylistStore.getState().moveTrack
    move('p','a',-1); move('p','c',1); move('p','missing',1)
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['a','b','c'])
    move('p','c',-1)
    await flushPersist()
    expect(saveData).toHaveBeenCalledWith(expect.objectContaining({volume:.6,playlists:[expect.objectContaining({trackIds:['a','c','b']})]}))
  } finally { setPersistedBase(null); vi.unstubAllGlobals() }
})
