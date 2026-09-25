import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { calculateStorageUsage } from './storageUsage'

const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    if (resolve(folder).startsWith(resolve(process.cwd()) + '\\')) await rm(folder,{recursive:true,force:true})
  }
})

describe('storage usage', () => {
  it('counts the profile and unique indexed songs without counting an offline copy twice', async () => {
    const root = await mkdtemp(join(process.cwd(),'storage-usage-test-'))
    folders.push(root)
    const profile = join(root,'profile'), offline = join(profile,'offline'), music = join(root,'music')
    await mkdir(offline,{recursive:true}); await mkdir(music)
    const song = join(music,'song.mp3'), copy = join(offline,'copy.mp3')
    await writeFile(song,Buffer.alloc(100)); await writeFile(copy,Buffer.alloc(25))
    const usage = await calculateStorageUsage(profile,join(root,'app','ReZon.exe'),false,[song,song,copy])
    expect(usage.library).toBe(100)
    expect(usage.profile).toBe(25)
    expect(usage.offline).toBe(25)
  })
})
