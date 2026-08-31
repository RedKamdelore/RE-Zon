import { useEffect, useRef, useState } from 'react'
import { searchTracks } from '@shared/search'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import TrackList from './TrackList'
import { SearchIcon, MusicNoteIcon } from './icons'

export default function SearchView() {
  const tracks = useLibraryStore((s) => s.tracks)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Дебаунс 200 мс, чтобы не фильтровать на каждое нажатие клавиши
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  const results = searchTracks(tracks, debounced)
  const best = results[0]

  return (
    <div className="search-view">
      <div className="search-input-wrap">
        <SearchIcon size={20} />
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          value={query}
          placeholder="Что хотите послушать?"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {debounced.trim() === '' ? (
        <div className="search-hint">Найдите трек, исполнителя или альбом</div>
      ) : results.length === 0 ? (
        <div className="search-hint">По запросу «{debounced}» ничего не найдено</div>
      ) : (
        <>
          <h2>Лучший результат</h2>
          <div
            className="search-best"
            onClick={() => usePlayerStore.getState().playTracks([best], 0)}
          >
            <div className="search-best-cover">
              {best.coverDataUrl ? (
                <img src={best.coverDataUrl} alt="" />
              ) : (
                <MusicNoteIcon size={48} />
              )}
            </div>
            <div className="search-best-title">{best.title}</div>
            <div className="search-best-meta">
              <span className="search-best-artist">{best.artist}</span>
              <span className="search-best-pill">Трек</span>
            </div>
          </div>
          <h2>Треки</h2>
          <TrackList tracks={results} />
        </>
      )}
    </div>
  )
}
