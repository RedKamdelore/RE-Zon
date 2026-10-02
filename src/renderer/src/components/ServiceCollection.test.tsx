// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { accountTrackId } from '@shared/accounts'
import ServiceCollection from './ServiceCollection'
import { useAccountsStore } from '../stores/accountsStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'

it('shows a service playlist in source order and plays a matching track', () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  const accountId='spotify:test'
  const playable={id:accountTrackId('spotify',accountId,'first'),sourceId:'local',title:'First',artist:'Artist',album:'Album',durationSec:120,filePath:'C:\\Music\\first.mp3'}
  useLibraryStore.setState({tracks:[playable],hiddenIds:[],lastHiddenIds:[]})
  useAccountsStore.setState({
    accounts:[{id:accountId,service:'spotify',label:'My Spotify',connectedAt:1,autoRefresh:true}],
    libraries:{[accountId]:{all:[],liked:[],albums:[],playlists:[{id:'mix',title:'Road Mix',owner:'Artist',tracks:[
      {extId:'first',title:'First',artist:'Artist'},
      {extId:'missing',title:'Second',artist:'Artist'},
    ]}],unavailable:{},updatedAt:1}},
    busy:{},errors:{},
  })
  const play=vi.fn();const original=usePlayerStore.getState().playTracks;usePlayerStore.setState({playTracks:play})
  const host=document.createElement('div');const root=createRoot(host)
  try {
    act(()=>root.render(<ServiceCollection accountId={accountId} section="playlists"/>))
    expect(host.querySelector('summary')?.textContent).toContain('Road Mix · 2 записи')
    expect(host.textContent).toContain('Second · нет доступного аудио')
    act(()=>host.querySelector<HTMLElement>('.tl-row')!.click())
    expect(play).toHaveBeenCalledOnce()
    expect(play.mock.calls[0][0]).toEqual([playable])
  } finally {act(()=>root.unmount());usePlayerStore.setState({playTracks:original})}
})
