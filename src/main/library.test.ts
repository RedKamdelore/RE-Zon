import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { scanFolders, demoTracks } from './library'

const DEMO_DIR = fileURLToPath(new URL('../../resources/demo', import.meta.url))

describe('scanFolders', () => {
  it('сканирует демо-WAV с фолбэк-метаданными', async () => {
    const tracks = await scanFolders([DEMO_DIR])
    expect(tracks).toHaveLength(4)
    // wav не несёт тегов → title = имя файла без расширения
    expect(tracks.map(t => t.title).sort()).toEqual(
      ['analog-dreams', 'neon-sunset', 'night-drive', 'rainy-loops'],
    )
    for (const t of tracks) {
      expect(t.sourceId).toBe('local')
      expect(t.artist).toBe('Неизвестный исполнитель')
      expect(t.album).toBe('Неизвестный альбом')
      expect(t.durationSec).toBeGreaterThanOrEqual(18)
      expect(t.durationSec).toBeLessThanOrEqual(22)
      expect(t.coverDataUrl).toBeUndefined()
    }
  })

  it('толерантен к несуществующим папкам', async () => {
    await expect(scanFolders([join(DEMO_DIR, 'no-such-dir')])).resolves.toEqual([])
  })
})

describe('demoTracks', () => {
  it('возвращает 4 демо-трека с именами из пакета', () => {
    const tracks = demoTracks(DEMO_DIR)
    expect(tracks).toHaveLength(4)
    const byFile = new Map(tracks.map(t => [t.filePath.split(/[\\/]/).pop(), t]))
    expect(byFile.get('analog-dreams.wav')?.title).toBe('Analog Dreams')
    expect(byFile.get('neon-sunset.wav')?.title).toBe('Neon Sunset')
    expect(byFile.get('night-drive.wav')?.title).toBe('Night Drive')
    expect(byFile.get('rainy-loops.wav')?.title).toBe('Rainy Loops')
    for (const t of tracks) {
      expect(t.sourceId).toBe('demo')
      expect(t.album).toBe('Re:Zon Demo Pack')
      expect(t.durationSec).toBe(20)
    }
  })
})
