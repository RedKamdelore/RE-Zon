// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/updates'
import { useNavStore } from '../stores/navStore'
import UpdateNotice from './UpdateNotice'

let host: HTMLDivElement, root: Root, emit: (state: UpdateState) => void
const available: UpdateState = {channel:'beta',autoCheck:true,feedUrl:'https://github.com/RedKamdelore/RE-Zon/',currentVersion:'0.4.0-beta.4',phase:'available',nextVersion:'0.4.0-beta.5'}
beforeEach(()=>{
  ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
  useNavStore.setState({view:{name:'home'},past:[],future:[]})
  ;(window as unknown as {api:unknown}).api={updatesState:vi.fn().mockResolvedValue({...available,phase:'idle'}),onUpdateState:(listener:typeof emit)=>{emit=listener;return()=>{}}}
})
afterEach(()=>{act(()=>root.unmount());host.remove()})
it('shows the startup update banner and navigates to update settings',async()=>{
  await act(async()=>root.render(<UpdateNotice/>))
  act(()=>emit(available))
  expect(host.querySelector('.update-banner')?.textContent).toContain('0.4.0-beta.5')
  act(()=>host.querySelector<HTMLButtonElement>('.update-banner .btn-primary')!.click())
  expect(useNavStore.getState().view).toEqual({name:'settings',page:'updates'})
  expect(host.querySelector('.update-banner')).toBeNull()
})
