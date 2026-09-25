import {it,expect,vi} from 'vitest'
import {setPersistedBase,persistPatch,flushPersist} from './playlistStore'
import type {PersistedData} from '@shared/types'
it('retries failed writes without overwriting newer changes',async()=>{
 const save=vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined)
 vi.stubGlobal('window',{api:{saveData:save}})
 setPersistedBase({version:4,volume:1} as PersistedData)
 try {
  persistPatch({volume:.5});await expect(flushPersist()).rejects.toThrow('disk')
  persistPatch({volume:.7,favoriteIds:['saved']});await flushPersist()
  expect(save.mock.calls[1][0]).toMatchObject({volume:.7,favoriteIds:['saved']})
 }finally{setPersistedBase(null);vi.unstubAllGlobals()}
})
