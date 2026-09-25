import { useState } from 'react'
import { ACCOUNT_SERVICES, SERVICE_NAMES, SECTION_NAMES } from '@shared/accounts'
import { useAccountsStore } from '../stores/accountsStore'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { getPersistedBase } from '../stores/playlistStore'
import { useNavStore } from '../stores/navStore'
import { AtlasIcon } from './AtlasIcon'
export default function SourcesView() {
  const {accounts,libraries,busy,errors,connect,refresh,update,disconnect}=useAccountsStore()
  const tracks=useLibraryStore(visibleTracks),loading=useLibraryStore(s=>s.loading)
  const [folders,setFolders]=useState(()=>getPersistedBase()?.musicFolders??[])
  const navigate=useNavStore(s=>s.setView)
  const addFolder=async()=>{await useLibraryStore.getState().addFolder();setFolders(getPersistedBase()?.musicFolders??[])}
  return <section className="sources-page">
    <header className="page-heading"><div><span className="eyebrow">СВЯЗИ ВАШЕЙ КОЛЛЕКЦИИ</span><h1>Источники</h1><p>Музыка из разных мест. Одна личная коллекция.</p></div><button className="btn-outline" onClick={()=>navigate({name:'settings',page:'integrations'})}>Импорт и параметры входа</button></header>
    <div className="source-banner"><AtlasIcon name="sources" size={32}/><div><strong>{accounts.length} подключённых аккаунтов</strong><p>Метаданные объединяются в каталоге. Доступный источник воспроизведения указан у каждой записи.</p></div></div>
    <div className="section-heading"><h2>На компьютере</h2><button className="btn-primary" disabled={loading} onClick={()=>void addFolder()}><AtlasIcon name="plus" size={16}/>Добавить папку</button></div>
    <div className="local-source"><AtlasIcon name="folder" size={26}/><div><strong>Локальная библиотека</strong><p>{tracks.filter(t=>t.sourceId==='local').length} записей · {folders.length} папок{loading?' · Сканирование…':''}</p></div></div>
    {folders.map(folder=><div className="folder-row" key={folder}><span className="folder-path" title={folder}>{folder}</span><button className="text-button" disabled={loading} onClick={()=>void useLibraryStore.getState().removeFolder(folder).then(()=>setFolders(getPersistedBase()?.musicFolders??[]))}>Убрать из источников</button></div>)}
    <div className="section-heading"><h2>Музыкальные сервисы</h2><span className="muted">Можно подключить несколько аккаунтов</span></div>
    <div className="services-grid">{ACCOUNT_SERVICES.map(service=><article key={service} className="service-card material-surface"><header><span className="source-monogram large">{service==='vk'?'vk':service==='spotify'?'sp':service==='yandex'?'я':'fm'}</span><div><h3>{SERVICE_NAMES[service]}</h3><p>{service==='vk'?'Ваша музыка и сохранённые записи':service==='lastfm'?'История прослушиваний и любимое':'Коллекции и совпадения с библиотекой'}</p></div></header>
      {accounts.filter(a=>a.service===service).map(a=><div className="account-card" key={a.id}><div className="account-title"><strong>{a.label||'Основной аккаунт'}</strong><span className={'status-label'+(errors[a.id]?' warning':'')}>{busy[a.id]?'Обновление…':errors[a.id]?'Нужна проверка':'Подключён'}</span></div><p className="muted">{libraries[a.id]?libraries[a.id].all.length+' записей · '+new Date(libraries[a.id].updatedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Коллекция ещё не загружена'}</p>
        <div className="account-links">{(['all','liked','albums'] as const).map(section=><button className="text-button" key={section} onClick={()=>navigate({name:'service',accountId:a.id,section})}>{SECTION_NAMES[section]} ↗</button>)}</div>
        <div className="import-actions"><button className="btn-outline" disabled={busy[a.id]} onClick={()=>void refresh(a.id)}>Обновить</button><details className="account-options"><summary>Управление</summary><label>Название<input className="settings-input" defaultValue={a.label} key={a.label} onBlur={e=>{const label=e.target.value.trim();if(label&&label!==a.label)void update(a.id,{label})}}/></label><label><input type="checkbox" checked={a.autoRefresh} onChange={e=>void update(a.id,{autoRefresh:e.target.checked})}/> Обновлять автоматически</label><button className="btn-outline" disabled={busy[a.id]} onClick={()=>void connect(service,a.label,a.id)}>Войти снова</button><button className="btn-outline danger" disabled={busy[a.id]} onClick={()=>{if(window.confirm('Отключить аккаунт «'+a.label+'»?'))void disconnect(a.id)}}>Отключить</button></details></div>{errors[a.id]&&<p role="alert" className="import-error">{errors[a.id]}</p>}
      </div>)}
      <button className="text-button" disabled={busy[service]||service==='yandex'} onClick={()=>void connect(service,'')}>{busy[service]?'Ожидание входа…':service==='yandex'?'Новые подключения временно недоступны':'+ Подключить аккаунт'}</button>{errors[service]&&<p role="alert" className="import-error">{errors[service]}</p>}
    </article>)}</div>
    <div className="source-banner"><AtlasIcon name="search" size={26}/><div><strong>SoundCloud</strong><p>Публичный поиск доступен без подключения аккаунта.</p></div><button className="btn-outline" onClick={()=>navigate({name:'search'})}>Найти музыку</button></div>
  </section>
}
