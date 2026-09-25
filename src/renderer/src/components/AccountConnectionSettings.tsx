import {useState} from 'react'
import {useSettingsStore} from '../stores/settingsStore'
import {getPersistedBase,persistPatch} from '../stores/playlistStore'
import {useAccountsStore} from '../stores/accountsStore'
import {useNavStore} from '../stores/navStore'

export default function AccountConnectionSettings() {
  const settings=useSettingsStore()
  const {accounts,busy,errors,connect,refresh,update}=useAccountsStore()
  const vkAccounts=accounts.filter(account=>account.service==='vk')
  const [clientId,setClientId]=useState(String(getPersistedBase()?.importSources.spotifyClientId ?? ''))
  return <>
    <p className="muted">Аккаунты и обновления находятся в разделе «Источники». Здесь можно настроить параметры входа и импорт. <button className="text-button" onClick={()=>useNavStore.getState().setView({name:'sources'})}>Открыть источники ↗</button></p>
    <div className="import-card"><div className="import-card-name">ВКонтакте (VK)</div>
      <p className="muted">Подключите аккаунт через окно входа VK, чтобы загрузить свою музыку.</p>
      {vkAccounts.map(account=><div key={account.id}>
        <p><strong>{account.label}</strong> · Подключено</p>
        <div className="import-actions">
          <button className="btn-outline" disabled={busy[account.id]} onClick={()=>void refresh(account.id)}>{busy[account.id]?'Обновление…':'Обновить музыку'}</button>
          <button className="btn-outline" onClick={()=>useNavStore.getState().setView({name:'service',accountId:account.id,section:'all'})}>Открыть музыку</button>
          <button className="btn-outline" disabled={busy[account.id]} onClick={()=>void connect('vk',account.label,account.id)}>Повторить вход</button>
        </div>
        <label><input type="checkbox" checked={account.autoRefresh} onChange={e=>void update(account.id,{autoRefresh:e.target.checked})}/> Обновлять автоматически</label>
        {errors[account.id]&&<p role="alert" className="import-error">{errors[account.id]}</p>}
      </div>)}
      <div className="import-actions"><button className="btn-outline" disabled={busy.vk} onClick={()=>void connect('vk','')}>{busy.vk?'Ожидание входа…':vkAccounts.length?'Добавить аккаунт VK':'Подключить VK'}</button></div>
      {errors.vk&&<p role="alert" className="import-error">{errors.vk}</p>}
    </div>
    <div className="import-card"><div className="import-card-name">Spotify</div>
      <label>Client ID приложения<input className="settings-input" value={clientId} onChange={e=>{
        setClientId(e.target.value)
        persistPatch({importSources:{...getPersistedBase()?.importSources,spotifyClientId:e.target.value.trim()}})
      }} /></label>
      <p className="muted">В настройках приложения Spotify укажите Redirect URI: http://127.0.0.1:8888/callback. Доступ зависит от режима приложения и разрешений аккаунта.</p>
      <p className="muted">Загружаются списки и метаданные. Воспроизведение — из совпадений в библиотеке ReZon.</p>
    </div>
    <div className="import-card"><div className="import-card-name">Яндекс Музыка</div>
      <p className="muted">Новые подключения временно недоступны: Яндекс отклонил встроенный идентификатор приложения. Для восстановления входа требуется действующий OAuth-клиент с доступом к музыке. Повторный ввод телефона эту ошибку не устранит.</p>
    </div>
    <div className="import-card"><div className="import-card-name">Last.fm</div>
      <label>API key<input type="password" className="settings-input" autoComplete="off" value={settings.lastfmApiKey} onChange={e=>settings.setLastfmKey(e.target.value.trim())} /></label>
      <label>Shared secret<input type="password" className="settings-input" autoComplete="off" value={settings.lastfmApiSecret} onChange={e=>settings.setLastfmSecret(e.target.value.trim())} /></label>
      <label>HTTP-прокси<input className="settings-input" value={settings.lastfmProxy} onChange={e=>settings.setLastfmProxy(e.target.value)} /></label>
      <p className="muted">Прокси применяется к странице входа и запросам Last.fm. Оставьте поле пустым, чтобы использовать обычное подключение.</p>
      <p className="muted">Из аккаунта загружаются прослушанные и понравившиеся треки. Музыкальные потоки Last.fm не предоставляет.</p>
    </div>
  </>
}
