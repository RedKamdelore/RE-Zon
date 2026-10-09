import {beforeEach,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({data:{} as any,handlers:new Map<string,Function>(),auth:vi.fn(),importVk:vi.fn(),clear:vi.fn(),refresh:vi.fn()}))
vi.mock('electron',()=>({ipcMain:{handle:(name:string,fn:Function)=>state.handlers.set(name,fn)},session:{fromPartition:()=>({cookies:{get:async()=>[{name:'remixsid',domain:'.vk.ru',value:'test-session'}]},clearStorageData:state.clear})}}))
vi.mock('./persistence',()=>({loadData:()=>state.data,saveData:(data:unknown)=>{state.data=data}}))
vi.mock('./authWindow',()=>({openAuthWindow:state.auth}))
vi.mock('./vkBrowser',()=>({prepareVkSession:vi.fn(),importVkBrowser:state.importVk}))
vi.mock('./spotify',()=>({spRefresh:state.refresh,spAuthUrl:()=> 'https://example.com/login',spPkceChallenge:()=> 'challenge',spPkceVerifier:()=> 'verifier',matchSpotifyCallback:vi.fn(),spExchange:async()=>({accessToken:'new-token',refreshToken:'new-refresh'})}))
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
const call=(name:string,...args:unknown[])=>state.handlers.get('accounts:'+name)!({},...args)
beforeEach(async()=>{
 vi.resetModules();vi.clearAllMocks();state.handlers.clear()
 state.clear.mockResolvedValue(undefined);state.auth.mockResolvedValue(true);state.importVk.mockResolvedValue([])
 state.data={connections:{},serviceAccounts:{'vk:test':{id:'vk:test',service:'vk',label:'Original',partition:'persist:test',token:'web-session',connectedAt:1,autoRefresh:true}},accountLibraries:{},importSources:{}}
 const {registerAccountIpc}=await import('./accounts');registerAccountIpc(()=>({} as any))
})
it('does not resurrect an account disconnected while its login window is open',async()=>{
 const auth=deferred<boolean>();state.auth.mockReturnValueOnce(auth.promise)
 const pending=call('connect','vk','Original','vk:test')
 await call('disconnect','vk:test');auth.resolve(true)
 expect((await pending).ok).toBe(false)
 expect(state.data.serviceAccounts['vk:test']).toBeUndefined()
})
it('rejects an old import after reconnect and imports again with the new session',async()=>{
 const old=deferred<any[]>();state.importVk.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{extId:'new',title:'New',artist:'A'}])
 const importing=call('import','vk:test')
 expect((await call('connect','vk','Original','vk:test')).ok).toBe(true)
 const fresh=call('import','vk:test')
 old.resolve([{extId:'old',title:'Old',artist:'A'}])
 expect((await importing).ok).toBe(false)
 expect((await fresh).library.all[0].extId).toBe('new')
 expect(state.data.accountLibraries['vk:test'].all[0].extId).toBe('new')
})
it('deduplicates imports within the same account session',async()=>{
 const work=deferred<any[]>();state.importVk.mockReturnValueOnce(work.promise)
 const a=call('import','vk:test'),b=call('import','vk:test');work.resolve([])
 expect((await a).ok).toBe(true);expect((await b).ok).toBe(true)
 expect(state.importVk).toHaveBeenCalledTimes(1)
})
it('preserves account settings changed while login is pending',async()=>{
 const auth=deferred<boolean>();state.auth.mockReturnValueOnce(auth.promise)
 const pending=call('connect','vk','Original','vk:test')
 call('update','vk:test',{label:'Renamed',autoRefresh:false});auth.resolve(true)
 const result=await pending
 expect(result.account).toMatchObject({label:'Renamed',autoRefresh:false})
})
it('does not write refreshed Spotify credentials after disconnect',async()=>{
 state.data.serviceAccounts={'spotify:test':{id:'spotify:test',service:'spotify',label:'S',partition:'persist:s',token:'old',refreshToken:'refresh',clientId:'client',connectedAt:1,autoRefresh:true}}
 const tokens=deferred<any>();state.refresh.mockReturnValueOnce(tokens.promise)
 const pending=call('import','spotify:test');await call('disconnect','spotify:test')
 tokens.resolve({accessToken:'stale',refreshToken:'stale-refresh'})
 expect((await pending).ok).toBe(false)
 expect(state.data.serviceAccounts['spotify:test']).toBeUndefined()
})
it('blocks a second login without releasing the first login guard',async()=>{
 const auth=deferred<boolean>();state.auth.mockReturnValueOnce(auth.promise)
 const first=call('connect','vk','Original','vk:test')
 expect((await call('connect','vk','Original','vk:test')).ok).toBe(false)
 expect((await call('import','vk:test')).ok).toBe(false)
 auth.resolve(true);expect((await first).ok).toBe(true)
})

it('does not overwrite fresh credentials with an older refresh response',async()=>{
 state.data.serviceAccounts={'spotify:test':{id:'spotify:test',service:'spotify',label:'S',partition:'persist:s',token:'old',refreshToken:'refresh',clientId:'client',connectedAt:1,autoRefresh:true}}
 const tokens=deferred<any>();state.refresh.mockReturnValueOnce(tokens.promise)
 const importing=call('import','spotify:test')
 state.auth.mockResolvedValueOnce({code:'code'})
 expect((await call('connect','spotify','S','spotify:test')).ok).toBe(true)
 tokens.resolve({accessToken:'stale',refreshToken:'stale-refresh'})
 expect((await importing).ok).toBe(false)
 expect(state.data.serviceAccounts['spotify:test'].token).toBe('new-token')
 expect(state.data.accountLibraries['spotify:test']).toBeUndefined()
})
