import {useState,useEffect} from 'react'
import { ACCOUNT_SERVICES, SECTION_NAMES, SERVICE_NAMES, type AccountSection } from '@shared/accounts'
import { useAccountsStore } from '../stores/accountsStore'
import { useNavStore } from '../stores/navStore'

function FolderHeading({ label, count }: { label: string; count?: number }) {
  return <>
    <svg className="folder-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <svg className="folder-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" /></svg>
    <span className="folder-label" title={label}>{label}</span>
    {count !== undefined && <span className="folder-count">{count}</span>}
  </>
}

export default function ServiceExplorer() {
  const { accounts, busy, errors, connect } = useAccountsStore()
  const { view, setView } = useNavStore()
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  useEffect(()=>{if(view.name==='service'){const account=accounts.find(a=>a.id===view.accountId);if(account)setExpanded(s=>({...s,[account.service]:true,[account.id]:true}))}},[view,accounts])
  return <nav className="service-explorer" aria-label="Аккаунты музыкальных сервисов">
    {ACCOUNT_SERVICES.map(service => {
      const members = accounts.filter(a => a.service === service)
      return <details key={service} open={!!expanded[service]} className="library-folder service-folder">
        <summary onClick={e=>{e.preventDefault();setExpanded({...expanded,[service]:!expanded[service]})}}><FolderHeading label={SERVICE_NAMES[service]} count={members.length} /></summary>
        <div className="folder-children">
          {members.map(account => <details key={account.id} open={!!expanded[account.id]} className="library-folder account-folder">
            <summary onClick={e=>{e.preventDefault();setExpanded({...expanded,[account.id]:!expanded[account.id]})}}><FolderHeading label={account.label} />{busy[account.id] && <span className="account-sync" title="Обновление" aria-label="Обновление">↻</span>}</summary>
            <div className="folder-children">
              {(Object.keys(SECTION_NAMES) as AccountSection[]).map(section => {
                const active = view.name === 'service' && view.accountId === account.id && view.section === section
                return <button className={`service-section${active ? ' active' : ''}`} key={section} aria-current={active ? 'page' : undefined}
                  onClick={() => setView({ name: 'service', accountId: account.id, section })}>{account.service==='lastfm'&&section==='all'?'Часто слушаю':SECTION_NAMES[section]}</button>
              })}
              {errors[account.id] && <div className="import-error service-error">{errors[account.id]}</div>}
            </div>
          </details>)}
          <button className="service-section add-account" disabled={busy[service]} onClick={() => {
            if(service==='yandex'){setView({name:'settings',page:'integrations'});return}
            void connect(service, '').then(id => {
              if (id) setView({ name: 'service', accountId: id, section: 'all' })
            })
          }}>{busy[service] ? 'Ожидание входа…' : service==='yandex'?'О подключении':'+ Добавить аккаунт'}</button>
          {errors[service] && <div className="import-error service-error">{errors[service]} <button className="link-btn" onClick={() => setView({ name: 'settings', page:'integrations' })}>Настройки</button></div>}
        </div>
      </details>
    })}
    <button className="service-section side-sc" onClick={()=>setView({name:'search'})}>SoundCloud <span>Поиск музыки ↗</span></button>
  </nav>
}
