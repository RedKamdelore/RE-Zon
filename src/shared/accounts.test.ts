import { describe,expect,it } from 'vitest'
import {migrateAccounts,accountView,accountTrackId,type ServiceAccount} from './accounts'

describe('multiple service accounts',()=>{
  it('migrates the existing VK partition and preserves legacy track IDs',()=>{
    const old={vk:{token:'web-session',connectedAt:1,playlistName:'VK: Мои аудио'}}
    const accounts=migrateAccounts(old)
    expect(accounts['vk:default'].partition).toBe('persist:vk')
    expect(accounts['vk:default'].playlistName).toBe('VK: Мои аудио')
    expect(accountTrackId('vk','vk:default','1_2')).toBe('vk:1_2')
  })
  it('does not overwrite an existing account on repeated migration',()=>{
    const accounts=migrateAccounts({vk:{token:'old',connectedAt:1}})
    accounts['vk:default'].label='Мой аккаунт'
    expect(migrateAccounts({vk:{token:'stale',connectedAt:2}},accounts)).toEqual(accounts)
  })
  it('separates the same song in different accounts',()=>{
    expect(accountTrackId('vk','vk:first','1_2')).not.toBe(accountTrackId('vk','vk:second','1_2'))
  })
  it('does not include credentials or partitions in account status',()=>{
    const account:ServiceAccount={id:'a',service:'spotify',label:'A',partition:'persist:a',autoRefresh:true,token:'secret',refreshToken:'refresh',clientId:'client',connectedAt:1}
    expect(accountView(account)).toEqual({id:'a',service:'spotify',label:'A',autoRefresh:true,connectedAt:1,userId:undefined})
  })
})
