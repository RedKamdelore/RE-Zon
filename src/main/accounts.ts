import { ipcMain, session, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { loadData, saveData } from './persistence'
import { ACCOUNT_SERVICES, SERVICE_NAMES, accountView, migrateAccounts, type ServiceAccount, type AccountLibrary } from '../shared/accounts'
import type { ServiceId } from '../shared/connections'
import { openAuthWindow } from './authWindow'
import { prepareVkSession, importVkBrowser } from './vkBrowser'
import { hasVkSessionCookie, matchVkWebAuthUrl } from './vkWeb'
import { spAuthUrl, spPkceChallenge, spPkceVerifier, matchSpotifyCallback, spExchange, spRefresh } from './spotify'
import { yaAuthUrl, matchYaAuthUrl, yaExchange, yaLikes, yaRefresh } from './yandex'
import { lfmAuthUrl, matchLfmAuthUrl, lfmGetSession, lastfmApi } from './lastfm'
import type { ImportedTrack } from '../shared/matching'

function accounts(): Record<string, ServiceAccount> {
  const data = loadData()
  return migrateAccounts(data.connections, data.serviceAccounts)
}
function saveAccount(account: ServiceAccount): void {
  const data = loadData()
  saveData({...data, serviceAccounts:{...accounts(),[account.id]:account}})
}
function requireAccount(id: string): ServiceAccount {
  const account = accounts()[id]
  if (!account) throw new Error('Аккаунт отключён')
  return account
}
const importing = new Map<string, Promise<AccountLibrary>>()

interface SpotifyTrack { id?:string; name?:string; artists?:Array<{name?:string}>; album?:{id?:string;artists?:Array<{name?:string}>;name?:string;images?:Array<{url:string}>}; duration_ms?:number }
function spotifyTrack(t: SpotifyTrack): ImportedTrack {
  return {albumId:t.album?.id ? `spotify:${t.album.id}` : undefined,albumArtist:t.album?.artists?.map(a=>a.name).filter(Boolean).join(', '),coverUrl:t.album?.images?.[0]?.url,extId:t.id,title:t.name ?? '',artist:t.artists?.map(a=>a.name).filter(Boolean).join(', ') ?? '',album:t.album?.name,durationSec:Math.round((t.duration_ms ?? 0)/1000)}
}
async function spotifyGet(account: ServiceAccount, path: string): Promise<any> {
  const url = new URL(path, 'https://api.spotify.com')
  if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('Spotify: неверный адрес страницы')
  const res = await fetch(url, {headers:{authorization:`Bearer ${account.token}`},signal:AbortSignal.timeout(30000)})
  if (!res.ok) throw new Error(`Spotify: HTTP ${res.status}${res.status === 403 ? ' — раздел недоступен для текущего приложения или аккаунта' : ''}`)
  return res.json()
}
async function spotifyPages(account: ServiceAccount, path: string): Promise<any[]> {
  const seen = new Set<string>(), result: any[] = []
  let next: string | null = path
  while (next) {
    if (seen.has(next)) throw new Error('Spotify: повтор страницы, обновление отменено')
    seen.add(next)
    const page = await spotifyGet(account, next)
    if (!Array.isArray(page.items)) throw new Error('Spotify: неизвестный формат списка')
    result.push(...page.items)
    next = page.next ?? null
  }
  return result
}
async function readLibrary(account: ServiceAccount): Promise<AccountLibrary> {
  const result: AccountLibrary = {all:[],liked:[],albums:[],unavailable:{},updatedAt:Date.now()}
  if (account.service === 'vk') {
    result.all = await importVkBrowser(account.partition)
    result.unavailable.liked = 'Отдельные лайки VK пока не загружаются. «Все песни» содержит добавленную музыку аккаунта.'
    result.unavailable.albums = 'Загрузка сохранённых альбомов VK пока не подключена.'
  } else if (account.service === 'spotify') {
    const data = loadData()
    const clientId = account.clientId || String(data.importSources.spotifyClientId ?? '')
    if (!clientId || !account.refreshToken) throw new Error('Spotify: переподключите аккаунт с Client ID')
    const tokens = await spRefresh(clientId, account.refreshToken)
    account = {...account,token:tokens.accessToken,refreshToken:tokens.refreshToken}
    if (!accounts()[account.id]) throw new Error('Аккаунт отключён')
    saveAccount({...requireAccount(account.id),token:account.token,refreshToken:account.refreshToken})
    // Разделы сохраняются независимо: запрет одного endpoint не скрывает остальные.
    try { result.liked = (await spotifyPages(account,'/v1/me/tracks?limit=50')).map(i=>spotifyTrack(i.item ?? i.track ?? {})).filter(t=>t.title) }
    catch(e) { result.unavailable.liked = errorMessage(e) }
    try {
      const albums = await spotifyPages(account,'/v1/me/albums?limit=50')
      for (const entry of albums) {
        const album = entry.album
        if (!album?.id) continue
        const tracks = (await spotifyPages(account,`/v1/albums/${encodeURIComponent(album.id)}/tracks?limit=50`)).map(spotifyTrack)
        result.albums.push({id:album.id,title:album.name,artist:album.artists?.map((a:any)=>a.name).join(', ') ?? '',tracks})
      }
    } catch(e) { result.albums=[]; result.unavailable.albums = errorMessage(e) }
    try {
      const tracks = [...result.liked, ...result.albums.flatMap(a=>a.tracks ?? [])]
      for (const playlist of await spotifyPages(account,'/v1/me/playlists?limit=50')) {
        const items = await spotifyPages(account,`/v1/playlists/${encodeURIComponent(playlist.id)}/items?limit=50`)
        tracks.push(...items.map(i=>spotifyTrack(i.item ?? i.track ?? {})).filter(t=>t.title))
      }
      result.all = [...new Map(tracks.map(t=>[t.extId ?? `${t.artist}\0${t.title}`,t])).values()]
    } catch(e) {result.unavailable.all=errorMessage(e)}
  } else if (account.service === 'yandex') {
    let likes
    try { likes = await yaLikes(account.token) }
    catch(e) {
      if (!account.refreshToken || !errorMessage(e).includes('сессия истекла')) throw e
      const tokens = await yaRefresh(account.refreshToken)
      account = {...account,token:tokens.accessToken,refreshToken:tokens.refreshToken}
      if (!accounts()[account.id]) throw new Error('Аккаунт отключён')
      saveAccount({...requireAccount(account.id),token:account.token,refreshToken:account.refreshToken})
      likes = await yaLikes(account.token)
    }
    result.liked=likes
    result.unavailable.all='Пока загружается только раздел «Понравилось», а не вся коллекция Яндекс Музыки.'
    result.unavailable.albums='Загрузка сохранённых альбомов Яндекс Музыки пока не подключена.'
  } else {
    const data = loadData()
    if (!account.userId) throw new Error('Last.fm: неизвестно имя аккаунта — переподключите его')
    for (const [section,method,key] of [['all','user.getTopTracks','toptracks'],['liked','user.getLovedTracks','lovedtracks']] as const) {
      try {
        let page=1, pages=1
        do {
          const response = await lastfmApi(method,{user:account.userId,limit:200,page},data.lastfmApiKey,data.lastfmProxy) as any
          const body=response[key]
          if (!Array.isArray(body?.track)) throw new Error('Last.fm: неизвестный формат списка')
          result[section].push(...body.track.map((t:any)=>({title:t.name,artist:t.artist?.name ?? t.artist?.['#text'] ?? '',extId:t.mbid || undefined})))
          pages=Number(body['@attr']?.totalPages ?? 1)
          if (!Number.isFinite(pages) || pages>10000) throw new Error('Last.fm: неверное количество страниц')
          page++
        } while(page<=pages)
      } catch(e) { result[section]=[]; result.unavailable[section]=errorMessage(e) }
    }
    result.unavailable.albums='Last.fm не предоставляет раздел сохранённых альбомов. «Все песни» — история прослушанных треков.'
  }
  return result
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export function registerAccountIpc(getWindow: () => BrowserWindow): void {
  const initial=loadData()
  const migrated=migrateAccounts(initial.connections,initial.serviceAccounts)
  if(Object.keys(migrated).length!==Object.keys(initial.serviceAccounts ?? {}).length) {
    saveData({...initial,serviceAccounts:migrated})
  }
  ipcMain.handle('accounts:list', () => Object.values(accounts()).map(accountView))
  ipcMain.handle('accounts:connect', async (_event, service: ServiceId, label: string, reconnectId?: string) => {
    let freshPartition: string | undefined
    try {
      if (!ACCOUNT_SERVICES.includes(service)) throw new Error('Неизвестный сервис')
      const old = reconnectId ? requireAccount(reconnectId) : undefined
      if (old && old.service !== service) throw new Error('Аккаунт другого сервиса')
      const id = old?.id ?? `${service}:${randomUUID()}`
      const partition = old?.partition ?? `persist:rezon-${id.replaceAll(':','-')}`
      if (!old) freshPartition=partition
      const data = loadData()
      let connection: {token:string;refreshToken?:string;userId?:string;clientId?:string}
      if (service==='vk') {
        prepareVkSession(partition)
        await openAuthWindow(getWindow(),{url:'https://vk.ru/audio',title:'Вход ВКонтакте',partition,match:matchVkWebAuthUrl,
          validateMatch:async()=>hasVkSessionCookie(await session.fromPartition(partition).cookies.get({}))})
        if (!hasVkSessionCookie(await session.fromPartition(partition).cookies.get({}))) throw new Error('Авторизация не завершена')
        connection={token:'web-session'}
      } else if (service==='spotify') {
        const clientId=old?.clientId || String(data.importSources.spotifyClientId ?? '')
        if (!clientId) throw new Error('Укажите Client ID Spotify в Настройки → Импорт')
        const verifier=spPkceVerifier(), state=spPkceVerifier()
        const auth = await openAuthWindow(getWindow(),{partition,title:'Вход Spotify',interceptRedirect:true,
          url:spAuthUrl(clientId,spPkceChallenge(verifier),state)+'&show_dialog=true',
          match:url=>matchSpotifyCallback(url,state)}) as {code:string}|null
        if (!auth) throw new Error('Авторизация не завершена')
        const tokens=await spExchange(clientId,auth.code,verifier)
        connection={token:tokens.accessToken,refreshToken:tokens.refreshToken,clientId}
      } else if (service==='yandex') {
        const code = await openAuthWindow(getWindow(),{partition,title:'Вход Яндекс ID',url:yaAuthUrl(),match:matchYaAuthUrl,interceptRedirect:true,browserCompatibility:true}) as string|null
        if (!code) throw new Error('Авторизация не завершена')
        const tokens=await yaExchange(code)
        connection={token:tokens.accessToken,refreshToken:tokens.refreshToken}
      } else {
        if (!data.lastfmApiKey || !data.lastfmApiSecret) throw new Error('Укажите API key и API secret Last.fm в Настройки → Импорт')
        const token=await openAuthWindow(getWindow(),{partition,title:'Вход Last.fm',url:lfmAuthUrl(data.lastfmApiKey),match:matchLfmAuthUrl,interceptRedirect:true,
          browserCompatibility:true,proxyUrl:data.lastfmProxy || '',
          forbiddenMessage:'Last.fm отклонил загрузку страницы входа (HTTP 403). Это не подтверждает ошибку API key. Проверьте доступ к last.fm в браузере; при необходимости укажите доступный вам HTTP-прокси в Настройки → Сервисы и импорт → Last.fm.'}) as string|null
        if (!token) throw new Error('Авторизация не завершена')
        const auth=await lfmGetSession(data.lastfmApiKey,data.lastfmApiSecret,token,data.lastfmProxy)
        connection={token:auth.key,userId:auth.username}
      }
      const account:ServiceAccount={...old,...connection,id,service,partition,connectedAt:Date.now(),autoRefresh:old?.autoRefresh ?? true,
        label:label?.trim() || connection.userId || `${SERVICE_NAMES[service]} ${Object.values(accounts()).filter(a=>a.service===service).length+1}`}
      saveAccount(account)
      return {ok:true,account:accountView(account)}
    } catch(e) {
      if(freshPartition) await session.fromPartition(freshPartition).clearStorageData().catch(()=>{})
      return {ok:false,error:errorMessage(e)}
    }
  })
  ipcMain.handle('accounts:update', (_event,id:string,patch:{label?:string;autoRefresh?:boolean})=>{
    const account=requireAccount(id)
    saveAccount({...account,label:patch.label?.trim() || account.label,autoRefresh:typeof patch.autoRefresh==='boolean'?patch.autoRefresh:account.autoRefresh})
    return accountView(requireAccount(id))
  })
  ipcMain.handle('accounts:disconnect', async (_event,id:string)=>{
    const account=requireAccount(id), data=loadData(), remaining=accounts()
    delete remaining[id]
    const connections={...data.connections}
    if(id===`${account.service}:default`) delete connections[account.service]
    saveData({...data,connections,serviceAccounts:remaining})
    await session.fromPartition(account.partition).clearStorageData()
    return true
  })
  ipcMain.handle('accounts:import', async (_event,id:string)=>{
    try {
      const account=requireAccount(id)
      if(!importing.has(id)) importing.set(id,readLibrary(account).finally(()=>importing.delete(id)))
      const library=await importing.get(id)!
      requireAccount(id) // аккаунт мог быть отключён во время запроса
      const data=loadData()
      const previous=data.accountLibraries?.[id]
      if(previous) {
        if(library.unavailable.all) library.all=previous.all
        if(library.unavailable.liked) library.liked=previous.liked
        if(library.unavailable.albums) library.albums=previous.albums
      }
      saveData({...data,accountLibraries:{...data.accountLibraries,[id]:library}})
      return {ok:true,library}
    } catch(e) {return {ok:false,error:errorMessage(e)}}
  })
}
