import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../shared/updates'
import { startAutomaticUpdateChecks } from './updateSchedule'

const state: UpdateState = {channel:'beta',autoCheck:true,feedUrl:'https://github.com/RedKamdelore/RE-Zon/',currentVersion:'0.4.0-beta.4',phase:'idle'}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>vi.useRealTimers())

describe('automatic update checks',()=>{
  it('checks shortly after launch and then daily',async()=>{
    const check=vi.fn().mockResolvedValue(undefined)
    const stop=startAutomaticUpdateChecks({getState:()=>state,check})
    await vi.advanceTimersByTimeAsync(1499)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24*60*60*1000)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })
  it('respects the disabled setting and leaves an already found update visible',async()=>{
    let current={...state,autoCheck:false}
    const check=vi.fn().mockResolvedValue(undefined)
    const stop=startAutomaticUpdateChecks({getState:()=>current,check})
    await vi.advanceTimersByTimeAsync(1500)
    expect(check).not.toHaveBeenCalled()
    current={...state,phase:'available'}
    await vi.advanceTimersByTimeAsync(24*60*60*1000)
    expect(check).not.toHaveBeenCalled()
    stop()
  })
})
