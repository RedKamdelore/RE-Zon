import { useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLibraryStore } from '../stores/libraryStore'
import { getPersistedBase } from '../stores/playlistStore'
import { CloseIcon } from './icons'
import ImportSection from './ImportSection'

const SKINS: { id: string; name: string; gradient: string }[] = [
  { id: 'spotify-dark', name: 'Spotify Dark', gradient: 'linear-gradient(135deg, #121212 60%, #1DB954)' },
  { id: 'light', name: 'Светлая', gradient: 'linear-gradient(135deg, #f5f5f5 60%, #1DB954)' },
  { id: 'midnight', name: 'Midnight', gradient: 'linear-gradient(135deg, #0b1026 60%, #8B5CF6)' },
  { id: 'frutiger-aero', name: 'Frutiger Aero', gradient: 'linear-gradient(135deg, #7ec8e3, #a8e063)' },
  { id: 'liquid-glass', name: 'Liquid Glass', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)' },
]

const ACCENT_PRESETS = ['#1DB954', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899']

export default function SettingsView() {
  const appearance = useSettingsStore((s) => s.appearance)
  const playback = useSettingsStore((s) => s.playback)
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey)
  const loading = useLibraryStore((s) => s.loading)
  // musicFolders живут только в persisted base — локальный снапшот, обновляем после add/remove
  const [folders, setFolders] = useState<string[]>(() => getPersistedBase()?.musicFolders ?? [])

  const refreshFolders = (): void => setFolders(getPersistedBase()?.musicFolders ?? [])

  const addFolder = async (): Promise<void> => {
    await useLibraryStore.getState().addFolder()
    refreshFolders()
  }

  const removeFolder = async (folder: string): Promise<void> => {
    await useLibraryStore.getState().removeFolder(folder)
    refreshFolders()
  }

  const s = useSettingsStore.getState

  return (
    <>
      <h1>Настройки</h1>

      <section className="settings-section">
        <h2>Внешний вид</h2>
        <div className="settings-label">Скин</div>
        <div className="skin-row">
          {SKINS.map((skin) => (
            <button
              key={skin.id}
              className={`skin-card${appearance.skin === skin.id ? ' active' : ''}`}
              onClick={() => s().setSkin(skin.id)}
            >
              <span className="skin-swatch" style={{ background: skin.gradient }} />
              <span className="skin-name">{skin.name}</span>
            </button>
          ))}
        </div>

        <div className="settings-label">Акцентный цвет</div>
        <div className="accent-row">
          {ACCENT_PRESETS.map((hex) => (
            <button
              key={hex}
              className={`accent-swatch${appearance.accent.toLowerCase() === hex.toLowerCase() ? ' active' : ''}`}
              style={{ background: hex }}
              title={hex}
              onClick={() => s().setAccent(hex)}
            />
          ))}
          <input
            type="color"
            className="accent-custom"
            title="Свой цвет"
            value={appearance.accent}
            onChange={(e) => s().setAccent(e.target.value)}
          />
        </div>

        <div className="settings-label">Радиус углов: {appearance.radius} px</div>
        <input
          type="range"
          className="slider settings-slider"
          min={0}
          max={16}
          step={1}
          value={appearance.radius}
          style={{ ['--progress' as string]: `${(appearance.radius / 16) * 100}%` }}
          onChange={(e) => s().setRadius(Number(e.target.value))}
        />

        <div className="settings-label">Масштаб интерфейса: {Math.round(appearance.scale * 100)}%</div>
        <input
          type="range"
          className="slider settings-slider"
          min={0.85}
          max={1.15}
          step={0.05}
          value={appearance.scale}
          style={{ ['--progress' as string]: `${((appearance.scale - 0.85) / 0.3) * 100}%` }}
          onChange={(e) => s().setScale(Number(e.target.value))}
        />
      </section>

      <section className="settings-section">
        <h2>Воспроизведение</h2>
        <div className="settings-label">
          Кроссфейдер: {playback.crossfadeSec === 0 ? 'Выкл' : `${playback.crossfadeSec} сек`}
        </div>
        <input
          type="range"
          className="slider settings-slider"
          min={0}
          max={12}
          step={1}
          value={playback.crossfadeSec}
          style={{ ['--progress' as string]: `${(playback.crossfadeSec / 12) * 100}%` }}
          onChange={(e) => s().setCrossfadeSec(Number(e.target.value))}
        />
      </section>

      <section className="settings-section">
        <h2>Интеграции</h2>
        <div className="settings-label">Last.fm API key</div>
        <input
          type="password"
          className="settings-input"
          placeholder="Введите API ключ"
          value={lastfmApiKey}
          onChange={(e) => s().setLastfmKey(e.target.value)}
        />
      </section>

      <ImportSection />

      <section className="settings-section">
        <h2>Источники</h2>
        {folders.length === 0 ? (
          <p className="muted">Папки с музыкой не добавлены</p>
        ) : (
          <ul className="folder-list">
            {folders.map((f) => (
              <li key={f} className="folder-row">
                <span className="folder-path" title={f}>
                  {f}
                </span>
                <button
                  className="icon-btn"
                  title="Удалить папку"
                  disabled={loading}
                  onClick={() => void removeFolder(f)}
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn-outline" disabled={loading} onClick={() => void addFolder()}>
          Добавить папку
        </button>
      </section>
    </>
  )
}
