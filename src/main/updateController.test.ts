import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import { UpdateController } from './updateController'
import type { AppUpdater } from 'electron-updater'
function setup(packaged=true) {
  const engine = Object.assign(new EventEmitter(), { autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:false,allowDowngrade:true,channel:'',
    setFeedURL:vi.fn(),checkForUpdates:vi.fn(),downloadUpdate:vi.fn(),quitAndInstall:vi.fn() })
  const save=vi.fn(), publish=vi.fn()
  const controller=new UpdateController(engine as unknown as AppUpdater,packaged,'0.4.0-beta.1',{channel:'stable',autoCheck:true,feedUrl:'https://github.com/test/rezon/'},save,publish)
  return {engine,controller,save,publish}
}
describe('release channels and update lifecycle',()=>{
  it('uses GitHub and stable settings with no automatic download, install or downgrade',()=>{
    const {engine}=setup()
    expect(engine.setFeedURL).toHaveBeenCalledWith({provider:'github',owner:'test',repo:'rezon',private:false})
    expect(engine).toMatchObject({channel:'latest',allowPrerelease:false,allowDowngrade:false,autoDownload:false,autoInstallOnAppQuit:false})
  })
  it('persists beta choice and clears a downloaded installer before changing channels',async()=>{
    const {engine,controller,save}=setup()
    engine.emit('update-downloaded',{version:'0.4.0'})
    controller.setPreferences({channel:'beta'})
    expect(save).toHaveBeenCalledWith(expect.objectContaining({channel:'beta'}))
    expect(engine).toMatchObject({channel:'beta',allowPrerelease:true,allowDowngrade:false})
    expect(controller.getState()).toMatchObject({phase:'idle',nextVersion:undefined})
    expect(()=>controller.install()).toThrow('Сначала')
  })
  it('rejects prereleases accidentally advertised to stable users',async()=>{
    const {engine,controller}=setup()
    engine.checkForUpdates.mockImplementation(async()=>engine.emit('update-available',{version:'0.5.0-beta.1'}))
    await controller.check(); await controller.download()
    expect(controller.getState().phase).toBe('current')
    expect(engine.downloadUpdate).not.toHaveBeenCalled()
  })
  it('deduplicates checks and prevents changing sources during a request',async()=>{
    const {engine,controller}=setup()
    let finish!:()=>void
    engine.checkForUpdates.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
    const checking=controller.check();await controller.check()
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(()=>controller.setPreferences({channel:'beta'})).toThrow('Дождитесь')
    engine.emit('update-not-available');finish();await checking
    expect(controller.getState().lastChecked).toBeTypeOf('number')
  })
  it('downloads only after an available update and installs only after completion',async()=>{
    const {engine,controller}=setup()
    await controller.download();expect(engine.downloadUpdate).not.toHaveBeenCalled()
    engine.checkForUpdates.mockImplementation(async()=>engine.emit('update-available',{version:'0.4.0',releaseNotes:'New'}))
    await controller.check()
    engine.downloadUpdate.mockImplementation(async()=>{
      engine.emit('download-progress',{percent:53})
      expect(controller.getState()).toMatchObject({phase:'downloading',progress:53})
      engine.emit('update-downloaded',{version:'0.4.0'})
    })
    await controller.download()
    expect(controller.getState()).toMatchObject({phase:'downloaded',nextVersion:'0.4.0'})
    controller.install();await new Promise(resolve=>setImmediate(resolve))
    expect(engine.quitAndInstall).toHaveBeenCalledWith(true,true)
  })
  it('recovers from network failure and keeps checks disabled without a source or in development',async()=>{
    const {engine,controller}=setup()
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    engine.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await controller.check();expect(controller.getState().phase).toBe('error')
    engine.checkForUpdates.mockImplementation(async()=>engine.emit('update-not-available'))
    await controller.check();expect(controller.getState()).toMatchObject({phase:'current',error:undefined})
    controller.setPreferences({feedUrl:''});await controller.check()
    expect(controller.getState().phase).toBe('unconfigured')
    const dev=setup(false);await dev.controller.check();expect(dev.engine.checkForUpdates).not.toHaveBeenCalled()
    log.mockRestore()
  })
  it('validates values before persisting them',()=>{
    const {controller,save}=setup()
    expect(()=>controller.setPreferences({feedUrl:'http://insecure.test'})).toThrow()
    expect(()=>controller.setPreferences({feedUrl:'https://user:pass@example.com'})).toThrow()
    expect(()=>controller.setPreferences({channel:'nightly' as 'beta'})).toThrow()
    expect(save).not.toHaveBeenCalled()
  })
})
