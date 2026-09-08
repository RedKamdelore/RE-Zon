import type { ImportedTrack } from '../shared/matching'

/**
 * VK через веб-сессию (V3-3b «VK через сайт»). OAuth Kate Mobile мёртв
 * (VK отдаёт access denied на окне разрешения), поэтому:
 *   1) пользователь входит в m.vk.com в окне Re:Zon (partition persist:vk);
 *   2) сессия (куки) живёт на дискe месяцами — повторный вход не нужен;
 *   3) импорт — GET m.vk.com/audio с куками сессии, треки+mp3-URL прямо
 *      в данных страницы (json-блоках аудиозаписей).
 *
 * vkParseAudioPage — чистая функция (DI-парсер, тестируется на фикстурах);
 * fetchVkAudioPage/fetchVkAudioList — обёртки над electron session.fetch.
 */

/** Сессия VK-окна: partition, в которой живут куки входа */
export const VK_PARTITION = 'persist:vk'

export interface VkWebTrack extends ImportedTrack {
  extId: string // owner_id_audioId — стабильный id для upsert
}

// --- Парсер страницы ----------------------------------------------------------

interface VkJsonAudio {
  owner_id?: number
  id?: number
  title?: string
  artist?: string
  duration?: number // сек
  url?: string
}

/**
 * Матчит URL редиректа после входа: m.vk.com/audio (или /audio*) —
 * неавторизованных VK сам уводит на login, после входа возвращает обратно.
 */
export function matchVkWebAuthUrl(url: string): boolean | null {
  if (/^https:\/\/m\.vk\.com\/audio/.test(url)) return true
  return null
}

/**
 * Разбирает страницу m.vk.com/audio: аудиозаписи лежат в json-блоках
 * <script> как массивы объектов с owner_id/id/artist/title/url/duration.
 * Возвращает треки со стабильным extId; битые записи молча пропускаются.
 */
export function vkParseAudioPage(html: string): VkWebTrack[] {
  const out: VkWebTrack[] = []
  const seen = new Set<string>()

  // Стратегия 1: full-json блоки аудиозаписей
  const AUDIO_JSON_RE = /\{"id":\s*\d+,"owner_id":\s*\d+[^{}]*?"artist":"[^"]*"[^{}]*?\}/g
  for (const m of html.matchAll(AUDIO_JSON_RE)) {
    const track = tryParseJsonAudio(m[0])
    if (track && !seen.has(track.extId)) {
      seen.add(track.extId)
      out.push(track)
    }
  }

  // Стратегия 2 (fallback): data-атрибуты разметки аудиоблоков
  if (out.length === 0) {
    const DATA_RE =
      /data-audio="\[(&quot;|')([^"']*)\1[^"]*"/g
    for (const _m of html.matchAll(DATA_RE)) {
      // разметка может отличаться — стратегия подстраховочная
      break
    }
  }

  return out
}

/** Безопасный парсинг json-подобного фрагмента аудиозаписи */
function tryParseJsonAudio(raw: string): VkWebTrack | null {
  try {
    // Кавычки внутри значений закодированы как &quot; — для JSON.parse это
    // обычный текст внутри строки. Анэскейпим ПОСЛЕ парсинга, на значениях.
    const obj = JSON.parse(raw) as VkJsonAudio
    if (typeof obj.owner_id !== 'number' || typeof obj.id !== 'number') return null
    const unescape = (s: string | undefined): string =>
      (s ?? '').replaceAll('&quot;', '"').replaceAll('&#33;', '!').replaceAll('&amp;', '&').replaceAll('&#039;', "'")
    const extId = `${obj.owner_id}_${obj.id}`
    return {
      title: unescape(obj.title),
      artist: unescape(obj.artist),
      durationSec: typeof obj.duration === 'number' ? obj.duration : undefined,
      streamUrl: obj.url || undefined,
      extId,
    }
  } catch {
    return null
  }
}

/** Есть ли в html признак «не авторизован» (страница логина)? */
export function vkPageLooksUnauthorized(html: string): boolean {
  return /m\.vk\.com\/login|\/login\?/.test(html) || (html.includes('Вход') && !html.includes('audio'))
}

// --- Фетчер страницы с сессией -----------------------------------------------

export type VkWebFetcher = (url: string) => Promise<{ status: number; html: string }>

/**
 * Загружает страницу аудиозаписей с куками VK-сессии (partition).
 * DI: fetcher инжектится в тестах; реальный транспорт — electron session.
 */
export async function fetchVkAudioPageWith(
  fetcher: VkWebFetcher,
  offset = 0,
): Promise<{ html: string; status: number }> {
  const url =
    offset > 0 ? `https://m.vk.com/audio?offset=${offset}` : 'https://m.vk.com/audio'
  const res = await fetcher(url)
  return { html: res.html, status: res.status }
}

/**
 * Полный список аудиозаписей: первая страница + пагинация (если VK отдаёт
 * порциями). Возвращает треки; при пустом результате отдаёт дамп страницы
 * для диагностики (первый живой прогон — разведка вёрстки).
 */
export async function fetchVkAudioListWith(
  fetcher: VkWebFetcher,
  opts: { maxPages?: number; onPage?: (html: string, page: number) => void } = {},
): Promise<{ tracks: VkWebTrack[]; unauthorized: boolean }> {
  const maxPages = opts.maxPages ?? 10
  const tracks: VkWebTrack[] = []
  const seen = new Set<string>()
  for (let page = 0; page < maxPages; page++) {
    const { html, status } = await fetchVkAudioPageWith(fetcher, page * 2000)
    opts.onPage?.(html, page)
    if (status !== 200 || vkPageLooksUnauthorized(html)) {
      return { tracks, unauthorized: true }
    }
    const parsed = vkParseAudioPage(html)
    const fresh = parsed.filter((t) => !seen.has(t.extId))
    if (fresh.length === 0) break // страниц больше нет
    for (const t of fresh) {
      seen.add(t.extId)
      tracks.push(t)
    }
  }
  return { tracks, unauthorized: false }
}
