import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates'
import { flushPersist } from '../stores/playlistStore'

const labels: Record<UpdateState['phase'], string> = {
  unconfigured: 'Источник обновлений ещё не указан', idle: 'Можно проверить обновления', checking: 'Проверяем обновления…',
  available: 'Доступна новая версия', current: 'Новых версий в этом канале нет', downloading: 'Загружаем обновление…',
  downloaded: 'Обновление готово к установке', installing: 'Перезапускаем приложение…', error: 'Обновление не выполнено', development: 'Проверка доступна в установленном приложении',
}
export default function UpdatesSettings() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!window.api?.updatesState) return
    let alive = true
    const receive = (value: UpdateState) => { if (alive) setState(value) }
    const off = window.api.onUpdateState(receive)
    void window.api.updatesState().then(receive).catch(() => { if (alive) setError('Не удалось получить состояние обновлений.') })
    return () => { alive = false; off() }
  }, [])
  useEffect(() => { setSource(state?.feedUrl ?? '') }, [state?.feedUrl])
  const run = async (action: () => Promise<UpdateState>) => {
    setError(''); setPending(true)
    try { setState(await action()) } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.') }
    finally { setPending(false) }
  }
  if (!state) return <p className="muted">{error || (window.api ? 'Загрузка…' : 'Обновления доступны в приложении Re:Zon для Windows.')}</p>
  const busy = pending || ['checking', 'downloading', 'installing'].includes(state.phase)
  const checkDisabled = busy || ['unconfigured', 'development', 'downloaded'].includes(state.phase)
  return <section className="updates-settings">
    <div className="update-version"><div><span className="eyebrow">УСТАНОВЛЕНА</span><h3>Re:Zon {state.currentVersion}</h3></div><span className="update-channel-label">{state.channel === 'beta' ? 'Бета' : 'Основное'}</span></div>
    <fieldset className="update-channels" disabled={busy}><legend>Канал обновлений</legend>
      {(['stable', 'beta'] as const).map(channel => <label key={channel} className={'update-channel'+(state.channel === channel ? ' selected' : '')}>
        <input type="radio" name="update-channel" value={channel} checked={state.channel === channel} onChange={() => void run(() => window.api.updatesPreferences({ channel }))}/>
        <span><strong>{channel === 'stable' ? 'Основное' : 'Бета'}</strong><small>{channel === 'stable' ? 'Стабильные выпуски приложения' : 'Новые функции раньше. Возможны ошибки.'}</small></span>
      </label>)}
    </fieldset>
    {state.currentVersion.includes('-') && state.channel === 'stable' && <p className="muted">У вас тестовая версия. Основное обновление появится, когда выйдет подходящий стабильный выпуск. Более старая версия не установится автоматически.</p>}
    <label className="update-auto"><input type="checkbox" checked={state.autoCheck} disabled={busy} onChange={e => void run(() => window.api.updatesPreferences({ autoCheck: e.target.checked }))}/> Проверять при запуске и раз в сутки</label>
    <div className="update-status" aria-live="polite"><h3>{labels[state.phase]}{state.nextVersion ? ' · '+state.nextVersion : ''}</h3>
      {state.lastChecked && <p className="muted">Последняя проверка: {new Date(state.lastChecked).toLocaleString('ru-RU')}</p>}
      {state.phase === 'unconfigured' && <p className="muted">Укажите публичный GitHub-репозиторий в настройках источника ниже.</p>}
      {state.phase === 'downloading' && <><progress max={100} value={state.progress ?? 0} aria-label="Загрузка обновления"/><span>{Math.floor(state.progress ?? 0)}%</span></>}
      {(error || state.error) && <p role="alert" className="import-error">{error || state.error}</p>}
      <div className="heading-actions">
        <button className="btn-outline" disabled={checkDisabled} onClick={() => void run(() => window.api.updatesCheck())}>Проверить обновления</button>
        {state.phase === 'available' && <button className="btn-primary" disabled={busy} onClick={() => void run(() => window.api.updatesDownload())}>Загрузить обновление</button>}
        {state.phase === 'downloaded' && <button className="btn-primary" disabled={busy} onClick={() => void run(async () => { await flushPersist(); return window.api.updatesInstall() })}>Установить и перезапустить</button>}
      </div>
      <p className="muted">Загрузка запускается по вашей команде. Установка перезапустит плеер. Если Re:Zon установлен для всех пользователей Windows, система может запросить разрешение администратора.</p>
    </div>
    {state.releaseNotes && <details className="update-notes"><summary>Что нового в версии {state.nextVersion}</summary><pre>{state.releaseNotes}</pre></details>}
    <details className="update-source"><summary>Источник обновлений</summary><form onSubmit={e => { e.preventDefault(); void run(() => window.api.updatesPreferences({ feedUrl: source })) }}>
      <label>Публичный GitHub-репозиторий или HTTPS-сервер<input className="settings-input" type="url" placeholder="https://github.com/owner/ReZon" value={source} disabled={busy} onChange={e => setSource(e.target.value)}/></label>
      <p className="muted">Из этого источника Re:Zon получает установщики. Указывайте адрес репозитория разработчика.</p>
      <button className="btn-outline" disabled={busy || source === state.feedUrl}>Сохранить источник</button>
    </form></details>
  </section>
}
