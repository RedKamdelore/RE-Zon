import {useNavStore} from '../stores/navStore'
import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useLibraryStore } from '../stores/libraryStore'
import { getPersistedBase } from '../stores/playlistStore'
import { CloseIcon } from './icons'
import ThemeStudio from './ThemeStudio'
import ImportSection from './ImportSection'
import UpdatesSettings from './UpdatesSettings'
import DataSettings from './DataSettings'
import DownloadsSettings from './DownloadsSettings'
import { animateViewChange } from '../motion'

const SETTINGS_PAGES = [
  { id: 'data', title: 'Данные приложения', description: 'Хранение профиля и сброс настроек и аккаунтов' },
  { id: 'downloads', title: 'Загрузки', description: 'Музыка, сохранённая для прослушивания без интернета' },
  { id: 'updates', title: 'Обновления', description: 'Версия приложения, канал выпусков и установка обновлений' },
  { id: 'appearance', title: 'Оформление', description: 'Тема, материал, фон и цвета в одном пространстве' },
  { id: 'playback', title: 'Воспроизведение', description: 'Параметры прослушивания музыки' },
  { id: 'integrations', title: 'Сервисы и импорт', description: 'Подключение аккаунтов и загрузка музыкальной коллекции' },
  { id: 'folders', title: 'Папки с музыкой', description: 'Локальные источники вашей медиатеки' },
  { id: 'hidden', title: 'Скрытые треки', description: 'Возвращение удалённых из медиатеки треков' },
] as const

export default function SettingsView() {
  const view=useNavStore(s=>s.view)
  const targetPage=view.name==='settings'?view.page:undefined
  const [page, setPage] = useState<string>(targetPage ?? 'appearance')
  useEffect(()=>{if(targetPage)setPage(targetPage)},[targetPage])
  const visiblePage = page === 'background' ? 'appearance' : page
  const currentPage = SETTINGS_PAGES.find(item => item.id === visiblePage) ?? SETTINGS_PAGES[3]
  const contentRef = useRef<HTMLDivElement>(null)
  const playback = useSettingsStore((s) => s.playback)
  const loading = useLibraryStore((s) => s.loading)
  const allTracks = useLibraryStore((s) => s.tracks)
  const hiddenIds = useLibraryStore((s) => s.hiddenIds)
  // musicFolders живут только в persisted base — локальный снапшот, обновляем после add/remove
  const [folders, setFolders] = useState<string[]>(() => getPersistedBase()?.musicFolders ?? [])

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

  return (
    <div className="settings-workspace">
      <header className="settings-heading"><h1>Настройки</h1><span className="muted">Re:Zon</span></header>
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label="Разделы настроек">
          {SETTINGS_PAGES.map(item => <button key={item.id} className={visiblePage === item.id ? 'active' : ''}
            aria-current={visiblePage === item.id ? 'page' : undefined} aria-controls="settings-content"
            onClick={() => { if (visiblePage === item.id) return; animateViewChange(() => { setPage(item.id); contentRef.current?.scrollTo(0, 0) }, 'settings') }}>{item.title}</button>)}
          <p>Изменения сохраняются автоматически</p>
        </nav>
        <div className="settings-content" id="settings-content" ref={contentRef}>
          <header className="settings-page-heading"><h2>{currentPage.title}</h2><p className="muted">{currentPage.description}</p></header>
          {page === 'updates' && <UpdatesSettings />}
          {page === 'data' && <DataSettings />}
          {page === 'downloads' && <DownloadsSettings />}

      {visiblePage === 'appearance' && <ThemeStudio />}

      <section className="settings-section" hidden={page !== 'playback'}>
        <h2>Воспроизведение</h2>
        <div className="settings-label">
          Кроссфейд: {playback.crossfadeSec === 0 ? 'Выкл' : `${playback.crossfadeSec} с`}
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

      <div hidden={page !== 'integrations'}><ImportSection /></div>

      <section className="settings-section" hidden={page !== 'folders'}>
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

      <section className="settings-section" hidden={page !== 'hidden'}>
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
        </div>
      </div>
    </div>
  )
}
