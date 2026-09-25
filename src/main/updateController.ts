import type { AppUpdater } from 'electron-updater'
import type { UpdatePreferences, UpdateState } from '../shared/updates'
import { validateFeedUrl } from '../shared/updates'

type Engine = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'allowPrerelease' | 'allowDowngrade' | 'channel' | 'on' | 'setFeedURL' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>
export class UpdateController {
  private state: UpdateState
  private busy = false
  constructor(private engine: Engine, private packaged: boolean, version: string, prefs: UpdatePreferences,
    private save: (prefs: UpdatePreferences) => void, private publish: (state: UpdateState) => void) {
    this.state = { ...prefs, currentVersion: version, phase: !packaged ? 'development' : prefs.feedUrl ? 'idle' : 'unconfigured' }
    engine.autoDownload = false
    engine.autoInstallOnAppQuit = false
    this.configureEngine()
    engine.on('update-available', info => {
      // Even a mistakenly published prerelease in latest.yml must not reach stable users.
      if (this.state.channel === 'stable' && info.version.includes('-')) {
        this.patch({ phase: 'current', nextVersion: undefined, releaseNotes: undefined }); return
      }
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.map(n => n.note).join('\n')
      this.patch({ phase: 'available', nextVersion: info.version, releaseNotes: notes?.slice(0, 12000) })
    })
    engine.on('update-not-available', () => this.patch({ phase: 'current', nextVersion: undefined, releaseNotes: undefined }))
    engine.on('download-progress', p => { if (this.state.phase === 'downloading') this.patch({ progress: Math.max(0, Math.min(100, p.percent)) }) })
    engine.on('update-downloaded', info => this.patch({ phase: 'downloaded', nextVersion: info.version, progress: 100 }))
    engine.on('error', error => this.fail(error))
  }
  getState(): UpdateState { return { ...this.state } }
  private patch(patch: Partial<UpdateState>) { this.state = { ...this.state, ...patch }; this.publish(this.getState()) }
  private configureEngine() {
    const { channel, feedUrl } = this.state
    this.engine.channel = channel === 'stable' ? 'latest' : 'beta'
    this.engine.allowPrerelease = channel === 'beta'
    // Assign after channel: electron-updater's channel setter enables downgrades.
    this.engine.allowDowngrade = false
    if (feedUrl) {
      const url = new URL(feedUrl)
      const parts = url.pathname.split('/').filter(Boolean)
      if (url.hostname === 'github.com' && parts.length === 2) {
        this.engine.setFeedURL({ provider: 'github', owner: parts[0], repo: parts[1], private: false })
      } else this.engine.setFeedURL({ provider: 'generic', url: feedUrl, channel: channel === 'stable' ? 'latest' : 'beta' })
    }
  }
  private fail(error: unknown) {
    console.error('Update failed:', error)
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    const unavailable = ['ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'].includes(code)
    this.patch({ phase: 'error', progress: undefined, error: unavailable
      ? 'В этом канале пока нет доступного выпуска с файлами обновления. Проверьте, что релиз опубликован и репозиторий открыт.'
      : 'Не удалось выполнить обновление. Проверьте подключение и адрес сервера, затем повторите проверку.' })
  }
  setPreferences(patch: Partial<UpdatePreferences>): UpdateState {
    if (this.busy || this.state.phase === 'installing') throw new Error('Дождитесь завершения текущей операции.')
    if (!patch || typeof patch !== 'object') throw new Error('Некорректные настройки обновлений.')
    if (patch.channel !== undefined && patch.channel !== 'stable' && patch.channel !== 'beta') throw new Error('Неизвестный канал обновлений.')
    if (patch.autoCheck !== undefined && typeof patch.autoCheck !== 'boolean') throw new Error('Некорректная настройка автопроверки.')
    const prefs: UpdatePreferences = {
      channel: patch.channel ?? this.state.channel,
      autoCheck: patch.autoCheck ?? this.state.autoCheck,
      feedUrl: patch.feedUrl === undefined ? this.state.feedUrl : validateFeedUrl(patch.feedUrl),
    }
    this.save(prefs)
    const changed = prefs.channel !== this.state.channel || prefs.feedUrl !== this.state.feedUrl
    this.patch({ ...prefs, ...(changed ? { phase: !this.packaged ? 'development' : prefs.feedUrl ? 'idle' : 'unconfigured', nextVersion: undefined, releaseNotes: undefined, progress: undefined, error: undefined, lastChecked: undefined } : {}) })
    this.configureEngine()
    return this.getState()
  }
  async check(): Promise<UpdateState> {
    if (this.busy || ['downloaded', 'installing'].includes(this.state.phase)) return this.getState()
    if (!this.packaged || !this.state.feedUrl) return this.getState()
    this.busy = true
    this.patch({ phase: 'checking', error: undefined, nextVersion: undefined, releaseNotes: undefined, progress: undefined })
    try {
      await this.engine.checkForUpdates()
      this.patch({ lastChecked: Date.now() })
    } catch (error) { this.fail(error) }
    finally { this.busy = false }
    return this.getState()
  }
  async download(): Promise<UpdateState> {
    if (this.busy || this.state.phase !== 'available') return this.getState()
    this.busy = true
    this.patch({ phase: 'downloading', progress: 0, error: undefined })
    try { await this.engine.downloadUpdate() } catch (error) { this.fail(error) }
    finally { this.busy = false }
    return this.getState()
  }
  install(): UpdateState {
    if (this.busy || this.state.phase !== 'downloaded') throw new Error('Сначала полностью загрузите обновление.')
    this.patch({ phase: 'installing' })
    setImmediate(() => { try { this.engine.quitAndInstall(true, true) } catch (error) { this.fail(error) } })
    return this.getState()
  }
}
