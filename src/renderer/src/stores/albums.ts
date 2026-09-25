import type { CatalogEntry } from '@shared/catalog'
import { normalizeRecording as norm } from '@shared/catalog'

const unknown=new Set(['vk','soundcloud','spotify','yandex','lastfm','без альбома','неизвестный альбом','unnamed','unknown album'])
const lead=(artist:string)=>artist.split(/\s*\(?(?:\bfeat\.?|\bft\.?|\bfeaturing|фит\.?|при участии)\s+/i)[0].trim()
const credits=(artist:string)=>lead(artist).split(/\s*[,;]\s*|\s+(?:&|x|×|и)\s+/i).map(s=>s.trim()).filter(Boolean)
const coverKey=(cover?:string)=>{
  if(!cover)return ''
  try{const u=new URL(cover);if(u.protocol==='https:'||u.protocol==='http:'){u.search='';u.hash='';return u.href}}catch{}
  return cover
}
interface Album {id:string;name:string;artist:string;cover?:string;entries:CatalogEntry[]}
function albumArtist(entries:CatalogEntry[]):string {
  const explicit=entries.find(e=>e.albumArtist?.trim())?.albumArtist
  if(explicit)return explicit.trim()
  if(entries.every(e=>norm(e.artist)===norm(entries[0].artist)))return lead(entries[0].artist)
  const counts=new Map<string,{name:string;count:number}>()
  for(const e of entries)for(const name of new Set(credits(e.artist))){const key=norm(name);const old=counts.get(key);counts.set(key,{name,count:(old?.count??0)+1})}
  if(entries.length>1&&[...counts.values()].every(v=>v.count===1))return 'Разные исполнители'
  return [...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))[0]?.name ?? entries[0].artist
}
/** Prefer release identity and album artist; use shared artwork and credits for legacy imports. */
export function deriveAlbums(entries:CatalogEntry[]):Album[] {
  const byTitle=new Map<string,CatalogEntry[]>()
  for(const e of entries){const name=norm(e.album);if(!name||unknown.has(name))continue;const bucket=byTitle.get(name)??[];bucket.push(e);byTitle.set(name,bucket)}
  const result:Album[]=[]
  for(const [title,items] of byTitle){
    const groups:CatalogEntry[][]=[]
    const compatible=(a:CatalogEntry[],b:CatalogEntry[])=>{
      const ids=new Set([...a,...b].map(e=>e.albumId).filter(Boolean))
      // Distinct IDs from the same provider represent distinct releases.
      const providers=new Map<string,Set<string>>()
      for(const id of ids){const provider=id!.split(':')[0];const set=providers.get(provider)??new Set();set.add(id!);providers.set(provider,set)}
      return ![...providers.values()].some(s=>s.size>1)
    }
    const related=(a:CatalogEntry,b:CatalogEntry)=>{
      if(a.albumId&&a.albumId===b.albumId)return true
      if(/трибьют|tribute/i.test(a.album))return true
      if(a.albumArtist&&b.albumArtist)return norm(a.albumArtist)===norm(b.albumArtist)
      if(coverKey(a.coverDataUrl)&&coverKey(a.coverDataUrl)===coverKey(b.coverDataUrl))return true
      if(norm(lead(a.artist))===norm(lead(b.artist)))return true
      const ac=credits(a.artist).map(norm),bc=credits(b.artist).map(norm)
      return ac[0]===bc[0] && (ac.length>1||bc.length>1) || ac.length===1&&bc.includes(ac[0]) || bc.length===1&&ac.includes(bc[0])
    }
    // Repeat merging to make bridge evidence (e.g. a solo track) order-independent.
    for(const item of items)groups.push([item])
    let changed=true
    while(changed){
      changed=false
      merge: for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
        if(compatible(groups[i],groups[j])&&groups[i].some(a=>groups[j].some(b=>related(a,b)))){
          groups[i].push(...groups[j]);groups.splice(j,1);changed=true;break merge
        }
      }
    }
    for(const group of groups){const artist=albumArtist(group);const release=group.find(e=>e.albumId)?.albumId;result.push({id:JSON.stringify([title,release??norm(artist)]),name:group[0].album.trim(),artist,cover:group.find(e=>e.coverDataUrl)?.coverDataUrl,entries:group})}
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name)||a.artist.localeCompare(b.artist))
}
export function albumEntries(entries:CatalogEntry[],name:string,artist?:string,albumKey?:string):CatalogEntry[] {
  const albums=deriveAlbums(entries).filter(a=>norm(a.name)===norm(name))
  if(albumKey){
    const exact=albums.find(a=>a.id===albumKey)
    if(exact)return exact.entries
    // A refresh can add a previously missing release ID to the open album.
    const candidates=albums.filter(a=>artist&&(norm(a.artist)===norm(artist)||a.entries.some(e=>norm(e.artist)===norm(artist))))
    return candidates.length===1?candidates[0].entries:[]
  }
  if(!artist)return albums.flatMap(a=>a.entries)
  return albums.find(a=>norm(a.artist)===norm(artist)||a.entries.some(e=>norm(e.artist)===norm(artist)))?.entries??[]
}
