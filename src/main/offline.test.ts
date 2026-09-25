import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { OfflineDownloads } from './offline'
import { directAudioUrl } from '../shared/offline'

let root: string
const request = {trackId:'direct:one',title:'Запись',artist:'Автор',url:'https://music.example.org/song.mp3'}
const content = Buffer.concat([Buffer.from('ID3'),Buffer.alloc(2000,42)])
const audio = () => new Response(content,{headers:{'content-length':String(content.length)}})
beforeEach(() => { root = mkdtempSync(join(tmpdir(),'rezon-offline-test-')) })
afterEach(() => {
  const safe = resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/') + 'rezon-offline-test-')
  if (safe) rmSync(root,{recursive:true,force:true})
})
const ready = async (manager: OfflineDownloads, phase: string) => vi.waitFor(() => expect(manager.list()[0]?.phase).toBe(phase),{timeout:1500})

describe('direct offline downloads', () => {
  it('rejects private, insecure and non-audio URLs before fetching', () => {
    expect(() => directAudioUrl('http://music.example.org/song.mp3')).toThrow()
    expect(() => directAudioUrl('https://127.0.0.1/song.mp3')).toThrow()
    expect(() => directAudioUrl('https://music.example.org/page.html')).toThrow()
    expect(() => directAudioUrl('https://user:pass@music.example.org/song.mp3')).toThrow()
  })
  it('stores a complete audio file, survives restart, plays without fetch and removes only its copy', async () => {
    const fetcher=vi.fn(async()=>audio()) as unknown as typeof fetch
    const manager=new OfflineDownloads(root,()=>{},fetcher)
    manager.queue(request)
    await ready(manager,'saved')
    const saved=manager.resolve(request.trackId)!
    expect(readFileSync(saved)).toEqual(content)
    writeFileSync(join(root,'unrelated.txt'),'keep')
    const restarted=new OfflineDownloads(root,()=>{},vi.fn(() => {throw new Error('network should not be used')}) as unknown as typeof fetch)
    expect(restarted.resolve(request.trackId)).toBe(saved)
    restarted.remove(request.trackId)
    expect(restarted.resolve(request.trackId)).toBeNull()
    expect(readFileSync(join(root,'unrelated.txt'),'utf8')).toBe('keep')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects HTML, keeps no playable copy and permits a retry', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('<html>not audio</html>')).mockResolvedValueOnce(audio()) as unknown as typeof fetch
    const manager=new OfflineDownloads(root,()=>{},fetcher)
    manager.queue(request)
    await ready(manager,'error')
    expect(manager.resolve(request.trackId)).toBeNull()
    manager.queue(request)
    await ready(manager,'saved')
    expect(manager.resolve(request.trackId)).not.toBeNull()
  })
  it('does not follow redirects to local addresses', async () => {
    const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private.mp3'}})) as unknown as typeof fetch
    const manager=new OfflineDownloads(root,()=>{},fetcher)
    manager.queue(request)
    await ready(manager,'error')
    expect(manager.resolve(request.trackId)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('honors the cache limit and can retry after increasing it', async () => {
    const manager = new OfflineDownloads(root,()=>{},vi.fn(async()=>audio()) as unknown as typeof fetch)
    manager.setLimit(1000)
    manager.queue(request)
    await ready(manager,'error')
    expect(manager.resolve(request.trackId)).toBeNull()
    manager.setLimit(5000)
    manager.queue(request)
    await ready(manager,'saved')
    expect(manager.resolve(request.trackId)).not.toBeNull()
  })
})
