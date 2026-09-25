import { readdirSync } from 'fs'
import { join, extname } from 'path'
import { parseFile } from 'music-metadata'
import type { Track } from '../shared/types'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus'])

function walk(dir: string, acc: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    // папка могла быть удалена/недоступна между выбором и сканированием
    console.error('[library] skip unreadable dir:', dir, err)
    return acc
  }
  for (const entry of entries) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, acc)
    else if (AUDIO_EXT.has(extname(entry.name).toLowerCase())) acc.push(p)
  }
  return acc
}

async function toTrack(filePath: string): Promise<Track | null> {
  try {
    const meta = await parseFile(filePath, { duration: true })
    const pic = meta.common.picture?.[0]
    return {
      id: `local:${filePath}`,
      sourceId: 'local',
      title: meta.common.title ?? filePath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''),
      artist: meta.common.artist ?? 'Неизвестный исполнитель',
      albumArtist: meta.common.albumartist,
      album: meta.common.album ?? 'Неизвестный альбом',
      durationSec: Math.round(meta.format.duration ?? 0),
      coverDataUrl: pic
        ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
        : undefined,
      filePath,
      lyrics: meta.common.lyrics?.[0]?.text,
    }
  } catch (err) {
    console.error('[library] skip unreadable file:', filePath, err)
    return null
  }
}

export async function scanFolders(folders: string[]): Promise<Track[]> {
  const files = folders.flatMap(f => walk(f))
  const tracks = await Promise.all(files.map(toTrack))
  return tracks.filter((t): t is Track => t !== null)
}

/** Демо-треки из resources/demo — когда локальной музыки нет */
export function demoTracks(demoDir: string): Track[] {
  // порядок NAMES соответствует алфавитному порядку имён файлов (sort ниже)
  const NAMES: Array<[string, string]> = [
    ['Analog Dreams', 'Sampled Souls'], ['Neon Sunset', 'DXD Ensemble'],
    ['Night Drive', 'DXD Ensemble'], ['Rainy Loops', 'Sampled Souls'],
  ]
  return readdirSync(demoDir)
    .filter(f => f.endsWith('.wav'))
    .sort()
    .map((f, i) => ({
      id: `demo:${f}`,
      sourceId: 'demo',
      title: NAMES[i]?.[0] ?? f,
      artist: NAMES[i]?.[1] ?? 'Demo',
      album: 'Re:Zon Demo Pack',
      durationSec: 20,
      filePath: join(demoDir, f),
    }))
}
