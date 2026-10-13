import { session } from 'electron'
import { VK_PARTITION } from './vkWeb'
import { vkAudioGetWith } from './vk'
import { withVkBrowserApi } from './vkBrowserApi'
import type { ImportedTrack } from '../shared/matching'

export function prepareVkSession(partition = VK_PARTITION): void {
  const ses = session.fromPartition(partition)
  ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\s(?:rezon|ReZon)\/\S+/gi, ''))
}

const pending = new Map<string, Promise<ImportedTrack[]>>()

/** VK issues its own authorization; it stays in main and the isolated VK page. */
export function importVkBrowser(partition = VK_PARTITION): Promise<ImportedTrack[]> {
  if (!pending.has(partition)) pending.set(partition, withVkBrowserApi(partition, api => vkAudioGetWith(async requestUrl => {
    const params = new URL(requestUrl).searchParams
    const requestedCount = Number(params.get('count'))
    const count = Number.isInteger(requestedCount) && requestedCount > 0 ? Math.min(200, requestedCount) : 200
    const data = await api('audio.get', { count: String(count), offset: params.get('offset') ?? '0' })
    return { ok: true, status: 200, json: async () => data }
  }, 'browser-session'), 120_000).finally(() => { pending.delete(partition) }))
  return pending.get(partition)!
}
