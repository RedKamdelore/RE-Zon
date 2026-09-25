import { useMemo } from 'react'
import { useCatalog } from '../stores/catalog'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useStatsStore } from '../stores/statsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { normalizeRecording, preferredSource } from '@shared/catalog'
import CatalogList from './CatalogList'

export default function PersonalRecommendations(){
  const catalog=useCatalog()
  const favorites=useFavoritesStore(s=>s.ids)
  const stats=useStatsStore(s=>s.stats)
  const libraries=useAccountsStore(s=>s.libraries)
  const accounts=useAccountsStore(s=>s.accounts)
  const entries=useMemo(()=>{
    const affinity=new Map<string,number>()
    const add=(artist:string,value:number)=>{const key=normalizeRecording(artist);affinity.set(key,(affinity.get(key)??0)+value)}
    for(const a of accounts) for(const t of libraries[a.id]?.liked ?? [])add(t.artist,3)
    for(const e of catalog){const score=e.sources.reduce((n,s)=>n+(favorites.includes(s.id)?5:0)+Math.min(stats[s.id]?.count ?? 0,10),0);if(score)add(e.artist,score)}
    return catalog.filter(e=>preferredSource(e)&&!e.sources.some(s=>favorites.includes(s.id))).map(e=>({entry:e,score:affinity.get(normalizeRecording(e.artist))??0})).filter(e=>e.score>0).sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title)).slice(0,6).map(e=>e.entry)
  },[catalog,favorites,stats,libraries,accounts])
  if(!entries.length)return null
  return <section><div className="section-heading"><h2>По вашему вкусу</h2></div><p className="muted">Исполнители из любимого и истории прослушиваний. Эти треки доступны в ReZon.</p><CatalogList entries={entries}/></section>
}
