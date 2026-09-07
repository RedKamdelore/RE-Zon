import { useRef, useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLibraryStore } from '../stores/libraryStore'
import { getPersistedBase } from '../stores/playlistStore'
import type { PanelMaterial, BackgroundKind } from '@shared/themeModel'
import { CloseIcon } from './icons'
import ImportSection from './ImportSection'

const BUILTIN_SKINS: { id: string; name: string; gradient: string }[] = [
  { id: 'spotify-dark', name: 'Spotify Dark', gradient: 'linear-gradient(135deg, #121212 60%, #1DB954)' },
  { id: 'light', name: 'Светлая', gradient: 'linear-gradient(135deg, #f5f5f5 60%, #1DB954)' },
  { id: 'midnight', name: 'Midnight', gradient: 'linear-gradient(135deg, #0b1026 60%, #8B5CF6)' },
  { id: 'frutiger-aero', name: 'Frutiger Aero', gradient: 'linear-gradient(135deg, #7ec8e3, #a8e063)' },
  { id: 'liquid-glass', name: 'Liquid Glass', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)' },
]

const ACCENT_PRESETS = ['#1DB954', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899']

const MATERIALS: { id: PanelMaterial; name: string }[] = [
  { id: 'flat', name: 'Плоский' },
  { id: 'glass', name: 'Стекло' },
  { id: 'gloss', name: 'Глянец' },
  { id: 'neumorphic', name: 'Неоморфизм' },
]

const BG_KINDS: { id: BackgroundKind; name: string }[] = [
  { id: 'color', name: 'Цвет' },
  { id: 'gradient', name: 'Градиент' },
  { id: 'image', name: 'Картинка' },
]

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/** Подпись + слайдер с CSS-переменной --progress для заливки трека */
function SliderRow(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <>
      <div className="settings-label">{props.label}</div>
      <input
        type="range"
        className="slider settings-slider"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        style={{ ['--progress' as string]: `${((props.value - props.min) / (props.max - props.min)) * 100}%` }}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </>
  )
}

export default function SettingsView() {
  const appearance = useSettingsStore((s) => s.appearance)
  const playback = useSettingsStore((s) => s.playback)
  const lastfmApiKey = useSettingsStore((s) => s.lastfmApiKey)
  const lastfmProxy = useSettingsStore((s) => s.lastfmProxy)
  const loading = useLibraryStore((s) => s.loading)
  const allTracks = useLibraryStore((s) => s.tracks)
  const hiddenIds = useLibraryStore((s) => s.hiddenIds)
  // musicFolders живут только в persisted base — локальный снапшот, обновляем после add/remove
  const [folders, setFolders] = useState<string[]>(() => getPersistedBase()?.musicFolders ?? [])
  const [savingTheme, setSavingTheme] = useState(false)
  const [themeName, setThemeName] = useState('')
  const [imageError, setImageError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const theme = appearance.theme

  const refreshFolders = (): void => setFolders(getPersistedBase()?.musicFolders ?? [])

  // Скрытые треки резолвятся из полной библиотеки (tracks хранит и скрытые)
  const hiddenTracks = hiddenIds
    .map((id) => allTracks.find((t) => t.id === id))
    .filter((t): t is (typeof allTracks)[number] => t !== undefined)

  const addFolder = async (): Promise<void> => {
    await useLibraryStore.getState().addFolder()
    refreshFolders()
  }

  const removeFolder = async (folder: string): Promise<void> => {
    await useLibraryStore.getState().removeFolder(folder)
    refreshFolders()
  }

  const s = useSettingsStore.getState

  const saveTheme = (): void => {
    if (!themeName.trim()) return
    s().saveCustomTheme(themeName)
    setThemeName('')
    setSavingTheme(false)
  }

  const pickImage = (file: File | undefined): void => {
    setImageError('')
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Файл больше 2 МБ — выберите картинку поменьше')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      s().patchTheme({ bgImageDataUrl: String(reader.result), background: 'image' })
    }
    reader.onerror = () => setImageError('Не удалось прочитать файл')
    reader.readAsDataURL(file)
  }

  return (
    <>
      <h1>Настройки</h1>

      <section className="settings-section">
        <h2>Внешний вид</h2>
        <div className="settings-label">Тема</div>
        <div className="skin-row">
          {BUILTIN_SKINS.map((skin) => (
            <button
              key={skin.id}
              className={`skin-card${appearance.skin === skin.id ? ' active' : ''}`}
              onClick={() => s().setSkin(skin.id)}
            >
              <span className="skin-swatch" style={{ background: skin.gradient }} />
              <span className="skin-name">{skin.name}</span>
            </button>
          ))}
          {Object.entries(appearance.customThemes).map(([name, t]) => (
            <button
              key={name}
              className={`skin-card${appearance.skin === name ? ' active' : ''}`}
              onClick={() => s().setSkin(name)}
            >
              <span
                className="skin-swatch"
                style={{ background: `linear-gradient(135deg, ${t.bgApp} 60%, ${t.accent})` }}
              />
              <span className="skin-name">{name}</span>
              <span
                className="skin-card-delete"
                title="Удалить тему"
                onClick={(e) => {
                  e.stopPropagation()
                  s().deleteCustomTheme(name)
                }}
              >
                <CloseIcon size={12} />
              </span>
            </button>
          ))}
          {savingTheme ? (
            <div className="skin-card theme-save-card">
              <input
                className="settings-input theme-name-input"
                placeholder="Название темы"
                value={themeName}
                autoFocus
                onChange={(e) => setThemeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTheme()
                  if (e.key === 'Escape') setSavingTheme(false)
                }}
              />
              <button className="btn-outline" onClick={saveTheme}>
                Сохранить
              </button>
            </div>
          ) : (
            <button className="skin-card" title="Сохранить текущую тему" onClick={() => setSavingTheme(true)}>
              <span className="skin-swatch skin-swatch-add">+</span>
              <span className="skin-name">Сохранить как…</span>
            </button>
          )}
        </div>

        <div className="settings-label">Материал панелей</div>
        <div className="eq-presets theme-btn-row">
          {MATERIALS.map((m) => (
            <button
              key={m.id}
              className={`eq-preset${theme.panelMaterial === m.id ? ' active' : ''}`}
              onClick={() => s().patchTheme({ panelMaterial: m.id })}
            >
              {m.name}
            </button>
          ))}
        </div>
        {theme.panelMaterial === 'glass' && (
          <>
            <SliderRow
              label={`Размытие: ${theme.glassBlur} px`}
              min={0}
              max={40}
              step={1}
              value={theme.glassBlur}
              onChange={(v) => s().patchTheme({ glassBlur: v })}
            />
            <SliderRow
              label={`Прозрачность: ${Math.round(theme.panelOpacity * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={theme.panelOpacity}
              onChange={(v) => s().patchTheme({ panelOpacity: v })}
            />
          </>
        )}
        {theme.panelMaterial === 'gloss' && (
          <>
            <SliderRow
              label={`Сила блика: ${Math.round(theme.glossIntensity * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={theme.glossIntensity}
              onChange={(v) => s().patchTheme({ glossIntensity: v })}
            />
            <SliderRow
              label={`Прозрачность: ${Math.round(theme.panelOpacity * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={theme.panelOpacity}
              onChange={(v) => s().patchTheme({ panelOpacity: v })}
            />
          </>
        )}
        {theme.panelMaterial === 'neumorphic' && (
          <SliderRow
            label={`Сила теней: ${Math.round(theme.shadowStrength * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={theme.shadowStrength}
            onChange={(v) => s().patchTheme({ shadowStrength: v })}
          />
        )}

        <div className="settings-label">Фон</div>
        <div className="eq-presets theme-btn-row">
          {BG_KINDS.map((k) => (
            <button
              key={k.id}
              className={`eq-preset${theme.background === k.id ? ' active' : ''}`}
              onClick={() => s().patchTheme({ background: k.id })}
            >
              {k.name}
            </button>
          ))}
        </div>
        {theme.background === 'color' && (
          <div className="theme-color-row">
            <label className="theme-color">
              <input
                type="color"
                className="accent-custom"
                value={theme.bgApp}
                onChange={(e) => s().patchTheme({ bgApp: e.target.value })}
              />
              <span className="muted">Цвет фона</span>
            </label>
          </div>
        )}
        {theme.background === 'gradient' && (
          <>
            <div className="theme-color-row">
              <label className="theme-color">
                <input
                  type="color"
                  className="accent-custom"
                  value={theme.bgGradientFrom}
                  onChange={(e) => s().patchTheme({ bgGradientFrom: e.target.value })}
                />
                <span className="muted">От</span>
              </label>
              <label className="theme-color">
                <input
                  type="color"
                  className="accent-custom"
                  value={theme.bgGradientTo}
                  onChange={(e) => s().patchTheme({ bgGradientTo: e.target.value })}
                />
                <span className="muted">До</span>
              </label>
            </div>
            <SliderRow
              label={`Угол: ${theme.bgGradientAngle}°`}
              min={0}
              max={360}
              step={5}
              value={theme.bgGradientAngle}
              onChange={(v) => s().patchTheme({ bgGradientAngle: v })}
            />
          </>
        )}
        {theme.background === 'image' && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                pickImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <div className="theme-color-row">
              <button className="btn-outline" onClick={() => fileRef.current?.click()}>
                Выбрать файл
              </button>
              {theme.bgImageDataUrl && (
                <button
                  className="btn-outline"
                  onClick={() => s().patchTheme({ bgImageDataUrl: undefined })}
                >
                  Убрать картинку
                </button>
              )}
            </div>
            {imageError && <p className="import-error">{imageError}</p>}
            {theme.bgImageDataUrl && (
              <>
                <SliderRow
                  label={`Размытие: ${theme.bgImageBlur} px`}
                  min={0}
                  max={40}
                  step={1}
                  value={theme.bgImageBlur}
                  onChange={(v) => s().patchTheme({ bgImageBlur: v })}
                />
                <SliderRow
                  label={`Затемнение: ${Math.round(theme.bgImageDim * 100)}%`}
                  min={0}
                  max={1}
                  step={0.05}
                  value={theme.bgImageDim}
                  onChange={(v) => s().patchTheme({ bgImageDim: v })}
                />
              </>
            )}
          </>
        )}

        <div className="settings-label">Цвета</div>
        <div className="theme-color-row">
          <label className="theme-color">
            <input
              type="color"
              className="accent-custom"
              value={theme.textPrimary}
              onChange={(e) => s().patchTheme({ textPrimary: e.target.value })}
            />
            <span className="muted">Текст</span>
          </label>
          <label className="theme-color">
            <input
              type="color"
              className="accent-custom"
              value={theme.textSecondary}
              onChange={(e) => s().patchTheme({ textSecondary: e.target.value })}
            />
            <span className="muted">Доп. текст</span>
          </label>
        </div>
        <div className="settings-label">Акцентный цвет</div>
        <div className="accent-row">
          {ACCENT_PRESETS.map((hex) => (
            <button
              key={hex}
              className={`accent-swatch${theme.accent.toLowerCase() === hex.toLowerCase() ? ' active' : ''}`}
              style={{ background: hex }}
              title={hex}
              onClick={() => s().setAccent(hex)}
            />
          ))}
          <input
            type="color"
            className="accent-custom"
            title="Свой цвет"
            value={theme.accent}
            onChange={(e) => s().setAccent(e.target.value)}
          />
        </div>

        <div className="settings-label">Радиус углов: {theme.radius} px</div>
        <input
          type="range"
          className="slider settings-slider"
          min={0}
          max={16}
          step={1}
          value={theme.radius}
          style={{ ['--progress' as string]: `${(theme.radius / 16) * 100}%` }}
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
        <div className="settings-label">Прокси для Last.fm (опционально, http://host:port)</div>
        <input
          type="text"
          className="settings-input"
          placeholder="http://127.0.0.1:8080"
          value={lastfmProxy}
          onChange={(e) => s().setLastfmProxy(e.target.value)}
        />
        <p className="muted">
          Если видите ошибку 403 — Last.fm блокирует запросы по региону; укажите любой HTTP-прокси
        </p>
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

      <section className="settings-section">
        <h2>
          Скрытые треки
          {hiddenTracks.length > 0 && <span className="muted"> ({hiddenTracks.length})</span>}
        </h2>
        {hiddenTracks.length === 0 ? (
          <p className="muted">Нет скрытых треков</p>
        ) : (
          <ul className="folder-list">
            {hiddenTracks.map((t) => (
              <li key={t.id} className="folder-row">
                <span className="folder-path" title={`${t.artist} — ${t.title}`}>
                  {t.title} — {t.artist}
                </span>
                <button
                  className="btn-outline"
                  onClick={() => useLibraryStore.getState().unhideTrack(t.id)}
                >
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
