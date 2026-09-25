import type { View } from '../stores/navStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { AtlasIcon } from './AtlasIcon'
import BrandMark from './BrandMark'
export default function Sidebar({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const open = useWorkspaceStore(s => s.sessionOpen)
  const collection = ['library', 'playlist', 'album', 'artist', 'favorites', 'radio'].includes(view.name)
  const item = (label: string, icon: string, target: View, active: boolean) => <button className={'rail-item'+(active ? ' active' : '')} aria-label={label} aria-current={active ? 'page' : undefined} title={label} onClick={() => onNavigate(target)}><AtlasIcon name={icon}/><span>{label}</span></button>
  return <nav className="nav-rail" aria-label="Навигация ReZon">
    <button className="brand-mark" aria-label="Re:Zon — Обзор" onClick={() => onNavigate({ name: 'home' })}><BrandMark /></button>
    <div className="rail-main">
      {item('Обзор', 'compass', { name: 'home' }, view.name === 'home')}
      {item('Коллекция', 'collection', { name: 'library', section: 'songs' }, collection)}
      {item('Поиск', 'search', { name: 'search' }, view.name === 'search')}
      <div className="rail-divider"/>
      {item('Источники', 'sources', { name: 'sources' }, view.name === 'sources' || view.name === 'service')}
    </div>
    <div className="rail-bottom">
      <button className={'rail-item'+(open ? ' active' : '')} aria-label="Сеанс" aria-expanded={open} title="Сеанс прослушивания" onClick={() => useWorkspaceStore.getState().toggleSession()}><AtlasIcon name="wave"/><span>Сеанс</span></button>
      {item('Настройки', 'settings', { name: 'settings' }, view.name === 'settings')}
    </div>
  </nav>
}
