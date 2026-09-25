import { useState, type ReactNode } from 'react'
import type { Track } from '@shared/types'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useNavStore } from '../stores/navStore'
import { plural } from '../utils/plural'
import AccountConnectionSettings from './AccountConnectionSettings'
import { directAudioUrl } from '@shared/offline'

export default function ImportSection() {
  return <section className="settings-section"><h2>Импорт</h2><AccountConnectionSettings /><ScCard /><DirectCard /></section>
}

function DirectCard() {
  const [url,setUrl] = useState('')
  const [title,setTitle] = useState('')
  const [artist,setArtist] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const add = async () => {
    setError(''); setBusy(true)
    try {
      const direct = directAudioUrl(url.trim())
      if (!title.trim()) throw new Error('Укажите название записи.')
      const track: Track = {
        id:`direct:${crypto.randomUUID()}`, sourceId:'direct',title:title.trim(),artist:artist.trim() || 'Неизвестный исполнитель',
        album:'Прямые загрузки',durationSec:0,filePath:direct.url,
      }
      useLibraryStore.getState().addTracks([track])
      await window.api.offlineQueue(track)
      setUrl('');setTitle('');setArtist('')
      useNavStore.getState().setView({name:'settings',page:'downloads'})
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось начать загрузку.') }
    finally { setBusy(false) }
  }
  return <ProviderCard name="Прямой файл">
    <p className="muted">Добавьте свою доступную HTTPS-ссылку на аудиофайл. Re:Zon сохранит копию для прослушивания без интернета.</p>
    <label className="settings-label">Ссылка на MP3, FLAC, WAV, OGG, OPUS или M4A<input className="settings-input" type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://example.com/music/track.mp3"/></label>
    <label className="settings-label">Название<input className="settings-input" value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label className="settings-label">Исполнитель<input className="settings-input" value={artist} onChange={event=>setArtist(event.target.value)}/></label>
    <div className="import-actions"><button className="btn-outline" disabled={busy||!url.trim()||!title.trim()} onClick={()=>void add()}>{busy?'Добавляем…':'Добавить и сохранить офлайн'}</button></div>
    {error && <p className="import-error" role="alert">{error}</p>}
  </ProviderCard>
}

function ProviderCard({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="import-card">
      <div className="import-card-name">{name}</div>
      {children}
    </div>
  )
}

function nextScPlaylistName(existing: string[], query: string): string {
  const base = `SoundCloud: ${query}`
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} (${n})`)) n++
  return `${base} (${n})`
}

function ScCard() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doImport = async (): Promise<void> => {
    const q = query.trim()
    if (!window.api || busy || q === '') return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await window.api.scSearch(q)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const playable = res.tracks.filter((t) => t.streamUrl)
      if (playable.length === 0) {
        setStatus(
          res.tracks.length === 0
            ? 'По запросу ничего не найдено'
            : 'Найденные треки недоступны для стриминга',
        )
        return
      }
      // filePath — transcoding API URL: финальный поток резолвится при старте
      // воспроизведения (playerStore → scResolveStream)
      const tracks: Track[] = playable.map((t) => ({
        id: `soundcloud:${t.extId ?? `${t.artist}:${t.title}`}`,
        sourceId: 'soundcloud',
        title: t.title,
        artist: t.artist,
        album: t.album ?? '',
        coverDataUrl: t.coverUrl,
        durationSec: t.durationSec ?? 0,
        filePath: t.streamUrl!,
      }))
      useLibraryStore.getState().addTracks(tracks)
      const pl = usePlaylistStore.getState()
      const name = nextScPlaylistName(pl.playlists.map((p) => p.name), q)
      const playlistId = pl.create(name)
      for (const t of tracks) pl.addTrack(playlistId, t.id)
      setStatus(`Импортировано ${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}`)
      useNavStore.getState().setView({ name: 'playlist', id: playlistId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProviderCard name="SoundCloud">
      <div className="settings-label">Поиск по публичному каталогу (без токена)</div>
      <input
        type="text"
        className="settings-input"
        placeholder="Например: lofi"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void doImport()
        }}
      />
      <div className="import-actions">
        <button
          className="btn-outline"
          disabled={busy || query.trim() === ''}
          onClick={() => void doImport()}
        >
          {busy ? 'Импорт…' : 'Импортировать топ-50 как плейлист'}
        </button>
      </div>
      {error && <div className="import-status import-error">{error}</div>}
      {status && <div className="import-status">{status}</div>}
    </ProviderCard>
  )
}
