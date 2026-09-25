import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates'
import { useNavStore } from '../stores/navStore'

export default function UpdateNotice() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissed, setDismissed] = useState('')
  useEffect(() => {
    if (!window.api?.updatesState) return
    let alive = true
    const receive = (value: UpdateState) => { if (alive) setState(value) }
    const off = window.api.onUpdateState(receive)
    void window.api.updatesState().then(receive).catch(() => {})
    return () => { alive = false; off() }
  }, [])
  if (!state || !['available', 'downloaded'].includes(state.phase) || dismissed === state.phase + state.nextVersion) return null
  return <div className="update-banner" role="status" aria-live="polite"><div className="update-banner-copy"><strong>{state.phase === 'downloaded' ? 'Обновление готово' : 'Доступно обновление Re:Zon'}</strong><span>Версия {state.nextVersion} · {state.channel === 'beta' ? 'Бета' : 'Основное'}</span></div>
    <button className="btn-primary" onClick={() => { setDismissed(state.phase + state.nextVersion); useNavStore.getState().setView({ name: 'settings', page: 'updates' }) }}>{state.phase === 'downloaded' ? 'Установить' : 'Посмотреть'}</button>
    <button className="icon-btn" aria-label="Скрыть уведомление об обновлении" title="Позже" onClick={() => setDismissed(state.phase + state.nextVersion)}>×</button>
  </div>
}
