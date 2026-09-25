import { useEffect, useMemo, useState } from 'react'
import type { OfflineItem } from '@shared/offline'
import type { OfflineSettings } from '@shared/offlineSettings'
import { CACHE_LIMITS } from '@shared/offlineSettings'
import type { StorageUsage } from '../../../main/storageUsage'
import { useLibraryStore } from '../stores/libraryStore'

const size = (bytes: number): string => bytes >= 1024 ** 3 ? `${(bytes/1024**3).toFixed(2)} ГБ` : `${(bytes/1024**2).toFixed(1)} МБ`

export default function DownloadsSettings() {
  const tracks = useLibraryStore(state => state.tracks)
  const [items,setItems] = useState<OfflineItem[]>([])
  const [settings,setSettings] = useState<OfflineSettings | null>(null)
  const [usage,setUsage] = useState<StorageUsage | null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const directTracks = useMemo(() => tracks.filter(track => track.sourceId === 'direct'),[tracks])
  const directById = useMemo(() => new Map(directTracks.map(track => [track.id,track])),[directTracks])
  const saved = items.filter(item => item.phase === 'saved')
  const pending = items.filter(item => item.phase === 'queued' || item.phase === 'downloading')
  const refreshUsage = async () => {
    const paths = tracks.filter(track => track.sourceId === 'local').map(track => track.filePath)
    setUsage(await window.api.storageUsage(paths))
  }
  useEffect(() => {
    let alive = true
    const off = window.api.onOfflineState(value => { if (alive) setItems(value) })
    void Promise.all([window.api.offlineList(),window.api.offlineSettings()]).then(([list,config]) => {
      if (alive) { setItems(list); setSettings(config) }
    }).catch(() => { if (alive) setError('Не удалось прочитать настройки загрузок.') })
    return () => { alive = false; off() }
  }, [])
  useEffect(() => { void refreshUsage().catch(() => setError('Не удалось подсчитать занятое место.')) },[tracks,saved.length])
  const run = async (action: () => Promise<unknown>) => {
    setError('');setBusy(true)
    try { await action(); await refreshUsage() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие.') }
    finally { setBusy(false) }
  }
  const queueAll = async () => { for (const track of directTracks) await window.api.offlineQueue(track) }
  const retry = (item: OfflineItem) => {
    const track = directById.get(item.trackId)
    if (track) void run(()=>window.api.offlineQueue(track))
  }
  const total = usage ? usage.program + usage.profile + usage.library : 0
  return <section className="settings-section downloads-settings">
    <h3>Музыка на устройстве</h3>
    <p>Прямые аудиофайлы сохраняются при воспроизведении. Плеер сначала использует локальную копию, а если её нет — исходную ссылку. Локальные файлы из ваших папок уже доступны без интернета и повторно не копируются. Потоки VK и SoundCloud не добавляются в офлайн-очередь.</p>
    <label className="update-auto"><input type="checkbox" checked={settings?.autoSaveDirect ?? true} disabled={!settings || busy} onChange={event => void run(async () => setSettings(await window.api.offlineSetSettings({autoSaveDirect:event.target.checked})))}/> Автоматически сохранять прямые файлы при воспроизведении</label>
    <label className="settings-label">Лимит офлайн-копий
      <select className="settings-input" value={settings?.maxCacheBytes ?? CACHE_LIMITS[1]} disabled={!settings || busy} onChange={event => void run(async()=>setSettings(await window.api.offlineSetSettings({maxCacheBytes:Number(event.target.value)})))}>
        <option value={CACHE_LIMITS[0]}>1 ГБ</option><option value={CACHE_LIMITS[1]}>5 ГБ</option><option value={CACHE_LIMITS[2]}>20 ГБ</option><option value={CACHE_LIMITS[3]}>Без ограничения</option>
      </select>
    </label>
    <div className="heading-actions">
      <button className="btn-outline" disabled={busy || directTracks.length === 0} onClick={()=>void run(queueAll)}>Сохранить все прямые файлы</button>
      <button className="btn-outline" disabled={busy || pending.length === 0} onClick={()=>void run(async()=>{for(const item of pending) await window.api.offlineCancel(item.trackId)})}>Отменить очередь</button>
      <button className="btn-outline" onClick={()=>void run(()=>window.api.offlineOpenFolder())}>Открыть папку копий</button>
      <button className="btn-outline" disabled={busy} onClick={()=>void run(refreshUsage)}>Обновить расчёт</button>
    </div>
    <div className="storage-card">
      <div className="storage-head"><strong>Место на компьютере</strong><span>{usage ? size(total) : 'Считаем…'}</span></div>
      <div className="storage-bar" role="img" aria-label="Состав занимаемого места: программа, профиль и локальная библиотека">
        {usage && total > 0 && <><span className="storage-program" style={{width:`${usage.program/total*100}%`}}/><span className="storage-profile" style={{width:`${usage.profile/total*100}%`}}/><span className="storage-library" style={{width:`${usage.library/total*100}%`}}/></>}
      </div>
      <div className="storage-breakdown"><span>● Программа: {size(usage?.program ?? 0)}</span><span>● Профиль: {size(usage?.profile ?? 0)} <small>(офлайн-копии {size(usage?.offline ?? 0)})</small></span><span>● Локальная библиотека: {size(usage?.library ?? 0)}</span></div>
      <p className="muted">Учтены файлы установленной программы, профиль Re:Zon и проиндексированные локальные песни. Свободно на диске профиля: {usage ? size(usage.diskFree) : '…'}. Музыка на других дисках входит в сумму библиотеки.</p>
    </div>
    <div className="storage-head"><strong>Офлайн-копии</strong><span>{saved.length} · {size(saved.reduce((sum,item)=>sum+item.bytes,0))}</span></div>
    {error && <p className="import-error" role="alert">{error}</p>}
    {items.length === 0 && <p className="muted">Сохранённых записей пока нет.</p>}
    <div className="offline-list">{items.map(item => <div className="offline-item" key={item.trackId}>
      <div><strong>{item.title}</strong><span className="muted"> · {item.artist}</span></div>
      <div className="offline-status">
        {item.phase === 'saved' && <span>Сохранено · {size(item.bytes)}</span>}
        {item.phase === 'queued' && <span>В очереди</span>}
        {item.phase === 'downloading' && <span>Загружается · {item.total ? `${Math.floor(item.bytes/item.total*100)}%` : size(item.bytes)}</span>}
        {item.phase === 'error' && <span role="alert">{item.error || 'Ошибка загрузки'}</span>}
        {item.phase === 'cancelled' && <span>Отменено</span>}
        {(item.phase === 'downloading' || item.phase === 'queued') && <button className="btn-outline" disabled={busy} onClick={()=>void run(()=>window.api.offlineCancel(item.trackId))}>Отменить</button>}
        {(item.phase === 'error' || item.phase === 'cancelled') && directById.has(item.trackId) && <button className="btn-outline" disabled={busy} onClick={()=>retry(item)}>Повторить</button>}
        {item.phase === 'saved' && <button className="btn-outline" disabled={busy} onClick={()=>void run(()=>window.api.offlineRemove(item.trackId))}>Удалить копию</button>}
      </div>
      {item.phase === 'downloading' && item.total && <progress max={item.total} value={item.bytes} aria-label={`Загрузка ${item.title}`}/>}
    </div>)}</div>
    <p className="muted">Удаление копии оставляет запись в коллекции. При следующем воспроизведении она снова сохранится, если включена автоматическая загрузка.</p>
  </section>
}
