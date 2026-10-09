import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OfflineItem } from '../shared/offline'
import { directAudioUrl, publicHttpsUrl } from '../shared/offline'

const MAX_BYTES = 300 * 1024 * 1024
interface SavedItem { file: string; bytes: number; sha256: string; title: string; artist: string }
interface DownloadRequest { trackId: string; title: string; artist: string; url: string }
type Fetcher = typeof fetch

function audioHeader(bytes: Uint8Array, extension: string): boolean {
  if (extension === 'mp3') return Buffer.from(bytes).subarray(0,3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  if (extension === 'flac') return Buffer.from(bytes).subarray(0,4).toString() === 'fLaC'
  if (extension === 'wav') return Buffer.from(bytes).subarray(0,4).toString() === 'RIFF' && Buffer.from(bytes).subarray(8,12).toString() === 'WAVE'
  if (extension === 'ogg' || extension === 'opus') return Buffer.from(bytes).subarray(0,4).toString() === 'OggS'
  if (extension === 'm4a') return Buffer.from(bytes).subarray(4,8).toString() === 'ftyp'
  return false
}

export class OfflineDownloads {
  private saved: Record<string, SavedItem> = {}
  private active = new Map<string, AbortController>()
  private tasks = new Map<string, OfflineItem>()
  private tail: Promise<void> = Promise.resolve()
  private indexPath: string
  private maxCacheBytes = 0
  constructor(private folder: string, private publish: (items: OfflineItem[]) => void, private fetcher: Fetcher = fetch) {
    mkdirSync(folder, { recursive: true })
    this.indexPath = join(folder, 'index.json')
    try { this.saved = JSON.parse(readFileSync(this.indexPath, 'utf8')) ?? {} } catch { this.saved = {} }
    for (const [id, item] of Object.entries(this.saved)) {
      if (!item || typeof item.file !== 'string' || !/^[a-f0-9]{64}\.(mp3|flac|wav|ogg|opus|m4a)$/.test(item.file) || !existsSync(join(folder,item.file))) delete this.saved[id]
    }
  }
  list(): OfflineItem[] {
    const saved = Object.entries(this.saved).map(([trackId,item]):OfflineItem => ({trackId,title:item.title,artist:item.artist,phase:'saved',bytes:item.bytes,total:item.bytes}))
    return [...saved.filter(item => !this.tasks.has(item.trackId)),...this.tasks.values()]
  }
  setLimit(bytes: number): void { this.maxCacheBytes = bytes }
  private savedBytes(): number { return Object.values(this.saved).reduce((sum,item) => sum + item.bytes,0) }
  resolve(trackId: string): string | null {
    const item = this.saved[trackId]
    if (!item) return null
    const file = join(this.folder, item.file)
    try { if (statSync(file).size === item.bytes) return file } catch {}
    delete this.saved[trackId]
    this.persist()
    return null
  }
  private persist(): void {
    const temp = this.indexPath + '.tmp'
    writeFileSync(temp, JSON.stringify(this.saved))
    renameSync(temp,this.indexPath)
    this.publish(this.list())
  }
  queue(request: DownloadRequest): OfflineItem[] {
    if (!request || typeof request.trackId !== 'string' || request.trackId.length > 300 || !request.trackId || typeof request.title !== 'string' || typeof request.artist !== 'string') throw new Error('Некорректный трек.')
    if (typeof request.url !== 'string') throw new Error('Нет ссылки на аудиофайл.')
    directAudioUrl(request.url)
    if (this.saved[request.trackId]) return this.list()
    if (this.tasks.has(request.trackId) && !['cancelled','error'].includes(this.tasks.get(request.trackId)!.phase)) return this.list()
    this.tasks.delete(request.trackId)
    const state: OfflineItem = {trackId:request.trackId,title:request.title.slice(0,180),artist:request.artist.slice(0,180),phase:'queued',bytes:0}
    this.tasks.set(request.trackId,state); this.publish(this.list())
    this.tail = this.tail.then(() => this.download(request,state)).catch(() => {})
    return this.list()
  }
  cancel(trackId: string): void {
    this.active.get(trackId)?.abort()
    const state = this.tasks.get(trackId)
    if (state?.phase === 'queued') { state.phase='cancelled'; this.publish(this.list()) }
  }
  remove(trackId: string): void {
    if (this.tasks.get(trackId)?.phase === 'downloading') throw new Error('Сначала отмените загрузку.')
    const item = this.saved[trackId]
    if (!item) return
    const path = join(this.folder,item.file)
    if (existsSync(path)) unlinkSync(path)
    delete this.saved[trackId]
    this.tasks.delete(trackId)
    this.persist()
  }
  private async download(request: DownloadRequest, state: OfflineItem): Promise<void> {
    if (state.phase === 'cancelled') return
    const controller = new AbortController()
    this.active.set(request.trackId,controller)
    state.phase='downloading'; this.publish(this.list())
    const {extension} = directAudioUrl(request.url)
    const file = `${createHash('sha256').update(request.trackId).digest('hex')}.${extension}`
    const target = join(this.folder,file), part = target+'.part'
    try {
      let url = request.url, response: Response | undefined
      for (let redirects=0; redirects<6; redirects++) {
        publicHttpsUrl(url)
        response = await this.fetcher(url,{redirect:'manual',signal:controller.signal})
        if (![301,302,303,307,308].includes(response.status)) break
        const next = response.headers.get('location')
        if (!next) throw new Error('Источник вернул неверное перенаправление.')
        url = new URL(next,url).toString()
        response = undefined
      }
      if (!response?.ok || !response.body) throw new Error('Не удалось получить аудиофайл. Проверьте доступ к источнику.')
      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Файл больше 300 МБ.')
      if (this.maxCacheBytes && Number.isFinite(length) && length > 0 && this.savedBytes() + length > this.maxCacheBytes) throw new Error('Достигнут лимит офлайн-копий. Увеличьте его в настройках загрузок.')
      state.total = Number.isFinite(length) && length > 0 ? length : undefined
      const hash = createHash('sha256')
      let header = new Uint8Array()
      const manager=this
      async function* chunks() {
        for await (const chunk of response!.body!) {
          if (controller.signal.aborted) throw new Error('Загрузка отменена.')
          const data = Buffer.from(chunk)
          state.bytes += data.length
          if (state.bytes > MAX_BYTES) throw new Error('Файл больше 300 МБ.')
          if (manager.maxCacheBytes && manager.savedBytes() + state.bytes > manager.maxCacheBytes) throw new Error('Достигнут лимит офлайн-копий. Увеличьте его в настройках загрузок.')
          if (header.length < 16) header = Buffer.concat([header,data]).subarray(0,16)
          hash.update(data)
          yield data
          manager.publish(manager.list())
        }
      }
      // pipeline installs error handlers before opening the file and destroys
      // both streams on disk failure, source failure or cancellation.
      await pipeline(Readable.from(chunks()),createWriteStream(part,{flags:'w'}),{signal:controller.signal})
      if (controller.signal.aborted) throw new Error('Загрузка отменена.')
      if (!state.bytes || (state.total && state.bytes !== state.total) || !audioHeader(header,extension)) throw new Error('Файл загружен не полностью или имеет неверный формат.')
      renameSync(part,target)
      this.saved[request.trackId] = {file,bytes:state.bytes,sha256:hash.digest('hex'),title:state.title,artist:state.artist}
      this.tasks.delete(request.trackId)
      this.persist()
    } catch (error) {
      try { if (existsSync(part)) unlinkSync(part) } catch {}
      state.phase=controller.signal.aborted?'cancelled':'error'
      state.error=error instanceof Error ? error.message : 'Не удалось сохранить файл.'
      this.publish(this.list())
    } finally { this.active.delete(request.trackId) }
  }
}
