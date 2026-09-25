import { useState } from 'react'

export default function DataSettings() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const reset = async () => {
    setPending(true); setError('')
    try { await window.api.resetProfile() }
    catch { setError('Не удалось начать сброс. Завершите операцию обновления, если она идёт, и повторите попытку.') }
    finally { setPending(false) }
  }
  return <section className="settings-section">
    <h3>Локальный профиль</h3>
    <p>Настройки, коллекция, офлайн-копии и входы в сервисы сохраняются на этом компьютере. Обычное удаление и повторная установка Re:Zon сохраняют профиль.</p>
    <p className="muted">При удалении приложения можно отдельно выбрать удаление данных. Автоматическое обновление сохраняет профиль.</p>
    <hr />
    <h3>Начать заново</h3>
    <p>Сброс удалит настройки, плейлисты, избранное, сохранённые тексты, входы в сервисы и кэш профиля. Музыкальные файлы вне папки профиля останутся на месте.</p>
    <p className="muted">После подтверждения приложение перезапустится с пустым профилем. Восстановить удалённые данные через Re:Zon нельзя.</p>
    <button className="btn-outline" disabled={pending || !window.api?.resetProfile} onClick={() => void reset()}>{pending ? 'Ожидаем подтверждения…' : 'Сбросить данные приложения…'}</button>
    {error && <p role="alert" className="import-error">{error}</p>}
  </section>
}
