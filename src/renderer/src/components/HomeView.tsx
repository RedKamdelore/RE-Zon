import type { Track } from '@shared/types'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import TrackList from './TrackList'
import { PlayIcon, MusicNoteIcon } from './icons'

interface Tile {
  id: string
  name: string
  coverDataUrl?: string
  tracks: Track[]
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

/** Псевдо-альбомы: группировка треков по album, порядок — первое появление */
function deriveAlbums(tracks: Track[]): Tile[] {
  const byAlbum = new Map<string, Track[]>()
  for (const t of tracks) {
    const key = t.album || 'Без альбома'
    const list = byAlbum.get(key)
    if (list) list.push(t)
    else byAlbum.set(key, [t])
  }
  return [...byAlbum.entries()].map(([name, list]) => ({
    id: `album:${name}`,
    name,
    coverDataUrl: list.find((t) => t.coverDataUrl)?.coverDataUrl,
    tracks: list,
  }))
}

export default function HomeView() {
  const tracks = useLibraryStore(visibleTracks)
  const loading = useLibraryStore((s) => s.loading)
  const usingDemo = useLibraryStore((s) => s.usingDemo)
  const addFolder = useLibraryStore((s) => s.addFolder)
  const playlists = usePlaylistStore((s) => s.playlists)

  const playlistTiles: Tile[] = playlists.slice(0, 6).map((pl) => {
    const byId = new Map(tracks.map((t) => [t.id, t]))
    return {
      id: `playlist:${pl.id}`,
      name: pl.name,
      coverDataUrl: pl.coverDataUrl,
      tracks: pl.trackIds.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined),
    }
  })
  const tiles = [...playlistTiles, ...deriveAlbums(tracks)].slice(0, 6)

  const playTile = (tile: Tile): void => {
    if (tile.tracks.length > 0) usePlayerStore.getState().playTracks(tile.tracks, 0)
  }

  return (
    <>
      <h1>{greeting()}</h1>
      {usingDemo && <p className="muted">Демо-библиотека — добавьте папку с музыкой</p>}
      <button className="btn-outline" onClick={() => void addFolder()}>
        Добавить папку с музыкой
      </button>

      {tiles.length > 0 && (
        <div className="tile-grid">
          {tiles.map((tile) => (
            <div key={tile.id} className="tile" onClick={() => playTile(tile)}>
              <span className="tile-cover">
                {tile.coverDataUrl ? (
                  <img src={tile.coverDataUrl} alt="" />
                ) : (
                  <MusicNoteIcon size={28} />
                )}
              </span>
              <span className="tile-name">{tile.name}</span>
              <button
                className="tile-play"
                title="Слушать"
                onClick={(e) => {
                  e.stopPropagation()
                  playTile(tile)
                }}
              >
                <PlayIcon size={20} />
              </button>
            </div>
          ))}
        </div>
      )}

      <h2>Все треки</h2>
      {loading ? <p className="muted">Загрузка…</p> : <TrackList tracks={tracks} />}
    </>
  )
}
