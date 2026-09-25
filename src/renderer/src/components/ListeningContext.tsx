import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import PlayerBar from './PlayerBar'
import { QueuePanel, LyricsPanel } from './RightPanel'
import Equalizer from './Equalizer'
import { AtlasIcon } from './AtlasIcon'
export default function ListeningContext({ onMini }: { onMini: () => void }) {
  const { pinned, pinSession, sessionTab, setSessionTab, closeSession } = useWorkspaceStore()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !useWorkspaceStore.getState().searchOpen && !document.querySelector('.ctx-menu')) closeSession() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); previous?.focus() }
  }, [closeSession])
  return <aside className="listening-context material-surface" aria-label="Сеанс прослушивания">
    <header className="session-heading"><span className="eyebrow"><AtlasIcon name="wave" size={16}/> СЕАНС</span><div><button className={'icon-btn pin-session'+(pinned?' active':'')} aria-label="Закрепить сеанс" aria-pressed={pinned} title="Закрепить рядом с коллекцией" onClick={pinSession}><AtlasIcon name="pin" size={18}/></button><button ref={closeRef} className="icon-btn" aria-label="Закрыть сеанс" onClick={closeSession}>×</button></div></header>
    <PlayerBar onTogglePanel={p => p === 'mini' ? onMini() : setSessionTab(p)}/>
    <div className="session-tabs" role="tablist" aria-label="Разделы сеанса">{(['queue','lyrics','eq'] as const).map((tab,i) => <button key={tab} id={'session-tab-'+tab} role="tab" aria-selected={sessionTab===tab} aria-controls="session-content" className={sessionTab===tab?'active':''} onClick={() => setSessionTab(tab)}>{['Очередь','Текст','Звук'][i]}</button>)}</div>
    <div className="session-content" id="session-content" role="tabpanel" aria-labelledby={'session-tab-'+sessionTab}>{sessionTab==='queue'?<QueuePanel/>:sessionTab==='lyrics'?<LyricsPanel/>:<Equalizer/>}</div>
  </aside>
}
