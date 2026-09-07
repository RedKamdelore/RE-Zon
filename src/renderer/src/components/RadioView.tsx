import { useEffect, useMemo, useState } from 'react'
import type { Track } from '@shared/types'
import { localRecommendations } from '@shared/recommend'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useStatsStore } from '../stores/statsStore'
import { useNavStore } from '../stores/navStore'
import { fetchSimilar, type SimilarTrack } from '../lastfm'
import TrackList from './TrackList'
import { MusicNoteIcon } from './icons'

/** Точное совпадение «название + исполнитель» (регистронезависимо) в библиотеке */
function findInLibrary(library: Track[], s: SimilarTrack): Track | undefined {
  const name = s.name.toLowerCase()
  const artist = s.artist.toLowerCase()
  return library.find(
    (t) => t.title.toLowerCase() === name && t.artist.toLowerCase() === artist,
  )
}

function LastfmSection({ seed }: { seed: Track }) {
  const apiKey = useSettingsStore((s) => s.lastfmApiKey)
  const tracks = useLibraryStore(visibleTracks)
  const setView = useNavStore((s) => s.setView)
  const [similar, setSimilar] = useState<SimilarTrack[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!apiKey) return
    let cancelled = false
    setSimilar(null)
    setError(null)
    fetchSimilar(seed.artist, seed.title)
      .then((list) => {
        if (!cancelled) setSimilar(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [seed.artist, seed.title, apiKey])

  if (!apiKey) {
    return (
      <>
        <p className="muted">Укажите API-ключ Last.fm в настройках</p>
        <button className="btn-outline" onClick={() => setView({ name: 'settings' })}>
          Открыть настройки
        </button>
      </>
    )
  }
  if (error) return <p className="muted">Last.fm: {error}</p>
  if (similar === null) return <p className="muted">Загрузка…</p>
  if (similar.length === 0) return <p className="muted">Last.fm не нашёл похожих треков</p>

  return (
    <div className="tl">
      {similar.map((s, i) => {
        const local = findInLibrary(tracks, s)
        return (
          <div
            key={`${s.artist}:${s.name}:${i}`}
            className={`tl-row radio-lfm-row${local ? '' : ' missing'}`}
            onClick={
              local
                ? () => usePlayerStore.getState().playTracks([local], 0)
                : undefined
            }
          >
            <span className="tl-num">{i + 1}</span>
            <span className="tl-title-cell">
              <span className="tl-title-text">
                <span className="tl-title">{s.name}</span>
                <span className="tl-artist">{s.artist}</span>
              </span>
            </span>
            <span className="tl-album">{Math.round(s.match * 100)}%</span>
            <span className="tl-duration muted">
              {local ? '' : 'нет в библиотеке'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** «Радио по треку»: локальные рекомендации + похожие с Last.fm */
export default function RadioView({ trackId }: { trackId: string }) {
  const tracks = useLibraryStore(visibleTracks)
  const stats = useStatsStore((s) => s.stats)
  const seed = tracks.find((t) => t.id === trackId)

  const recs = useMemo(
    () => (seed ? localRecommendations(seed, tracks, stats) : []),
    [seed, tracks, stats],
  )

  if (!seed) {
    return (
      <>
        <h1>Радио по треку</h1>
        <p className="muted">Трек не найден в библиотеке</p>
      </>
    )
  }

  return (
    <>
      <div className="pl-header">
        <div className="pl-cover">
          {seed.coverDataUrl ? <img src={seed.coverDataUrl} alt="" /> : <MusicNoteIcon size={64} />}
        </div>
        <div className="pl-header-text">
          <div className="pl-label">РАДИО ПО ТРЕКУ</div>
          <div className="pl-name">{seed.title}</div>
          <div className="pl-meta">{seed.artist}</div>
        </div>
      </div>

      <h2>Похожие в вашей библиотеке</h2>
      {recs.length === 0 ? (
        <p className="muted">Пока нет рекомендаций — послушайте больше музыки</p>
      ) : (
        <TrackList tracks={recs.map((r) => r.track)} />
      )}

      <h2>Рекомендации Last.fm</h2>
      <LastfmSection seed={seed} />
    </>
  )
}
