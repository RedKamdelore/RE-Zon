import { loadData } from './persistence'
import { migrateAccounts } from '../shared/accounts'
import type { LyricsLookupRequest, LyricsSourceStatus } from '../shared/lyricsLookup'
import { lookupVkLyricsWith, type VkAudioApi } from './vkLyrics'
import { withVkBrowserApi } from './vkBrowserApi'

export function lookupVkLyrics(request: LyricsLookupRequest): Promise<LyricsSourceStatus> {
  const data = loadData()
  const accounts = Object.values(migrateAccounts(data.connections, data.serviceAccounts))
  return lookupVkLyricsWith(request, accounts, (account, work) => {
    if (account.token === 'web-session') return withVkBrowserApi(account.partition, work)
    const api: VkAudioApi = async (method, params) => {
      const response = await fetch(`https://api.vk.com/method/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, access_token: account.token, v: '5.131' }), signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('VK не ответил на запрос')
      return response.json()
    }
    return work(api)
  })
}
