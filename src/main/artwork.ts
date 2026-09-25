import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { normalizeRecording } from '../shared/catalog'
interface CachedCover {url:string|null;expires:number}
let cache:Record<string,CachedCover>|undefined
let queue:Promise<unknown>=Promise.resolve()
const pending=new Map<string,Promise<string|null>>()
function cachePath(){return join(app.getPath('userData'),'album-covers.json')}
function getCache(){if(!cache){try{cache=JSON.parse(readFileSync(cachePath(),'utf8'))}catch{cache={}}}return cache!}
async function json(url:string){const response=await fetch(url,{headers:{'User-Agent':'ReZon/0.3.0 (personal music library)'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Artwork unavailable');return response.json() as Promise<any>}
export function findAlbumCover(artist:string,album:string):Promise<string|null>{
  if(typeof artist!=='string'||typeof album!=='string'||!artist.trim()||!album.trim()||artist.length>250||album.length>250||['vk','soundcloud','lastfm','spotify','yandex','без альбома'].includes(album.toLowerCase()))return Promise.resolve(null)
  const key=normalizeRecording(artist)+'\0'+normalizeRecording(album)
  const known=getCache()[key];if(known&&known.expires>Date.now())return Promise.resolve(known.url)
  if(pending.has(key))return pending.get(key)!
  const work=queue.then(async()=>{
    let url:string|null=null
    try{
      const escape=(s:string)=>s.replace(/[\\"+!():^\[\]{}~*?\/|&-]/g,' ')
      const query=`release:"${escape(album)}" AND artist:"${escape(artist)}"`
      const data=await json('https://musicbrainz.org/ws/2/release/?fmt=json&limit=5&query='+encodeURIComponent(query))
      const release=data.releases?.find((r:any)=>normalizeRecording(r.title ?? '')===normalizeRecording(album)&&r['artist-credit']?.some((a:any)=>normalizeRecording(a.artist?.name ?? a.name ?? '')===normalizeRecording(artist)))
      if(release&&/^[0-9a-f-]{36}$/i.test(release.id)){
        const art=await json(`https://coverartarchive.org/release/${release.id}`)
        const candidate=art.images?.find((i:any)=>i.front)?.thumbnails?.['250']
        if(typeof candidate==='string'&&candidate.startsWith('https://'))url=candidate
      }
      getCache()[key]={url,expires:Date.now()+(url?30:1)*86400000}
      const entries=Object.entries(getCache()).slice(-2000);cache=Object.fromEntries(entries)
      const temp=cachePath()+'.tmp';writeFileSync(temp,JSON.stringify(cache));renameSync(temp,cachePath())
    }catch{getCache()[key]={url:null,expires:Date.now()+60000}}
    await new Promise(r=>setTimeout(r,1100))
    return url
  })
  queue=work.catch(()=>null);pending.set(key,work);void work.finally(()=>pending.delete(key));return work
}
