import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const profileRoot = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({ app: { getPath: () => profileRoot.path } }))

beforeEach(() => {
  profileRoot.path = mkdtempSync(join(tmpdir(), 'rezon-profile-test-'))
  vi.resetModules()
})

afterEach(() => {
  const target = resolve(profileRoot.path)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes('rezon-profile-test-')) throw new Error('Unexpected test path')
  rmSync(target, { recursive: true, force: true })
})

it('keeps the prior valid profile and restores it when the current file is damaged', async () => {
  const persistence = await import('./persistence')
  const profile = join(profileRoot.path, 'player-data.json')
  persistence.saveData({ ...persistence.DEFAULT_DATA, volume: 0.3 })
  persistence.saveData({ ...persistence.DEFAULT_DATA, volume: 0.8 })
  expect(JSON.parse(readFileSync(profile + '.bak', 'utf-8')).volume).toBe(0.3)
  writeFileSync(profile, '{broken')

  vi.resetModules()
  const restarted = await import('./persistence')
  expect(restarted.loadData().volume).toBe(0.3)
  expect(restarted.profileRecoveryStatus().recovered).toBe(true)
  expect(JSON.parse(readFileSync(profile, 'utf-8')).volume).toBe(0.3)
  expect(readdirSync(profileRoot.path).some(name => name.startsWith('player-data.json.corrupt-'))).toBe(true)
})

it('refuses to overwrite a damaged profile when no valid backup exists', async () => {
  const profile = join(profileRoot.path, 'player-data.json')
  writeFileSync(profile, '{broken')
  const persistence = await import('./persistence')
  expect(() => persistence.loadData()).toThrow('Не удалось прочитать профиль')
  expect(() => persistence.saveData(persistence.DEFAULT_DATA)).toThrow('Не удалось прочитать профиль')
  expect(readFileSync(profile, 'utf-8')).toBe('{broken')
  expect(existsSync(profile + '.bak')).toBe(false)
})
it('restores a surviving backup when the primary profile is missing',async()=>{
 const profile=join(profileRoot.path,'player-data.json')
 const persistence=await import('./persistence')
 writeFileSync(profile+'.bak',JSON.stringify({...persistence.DEFAULT_DATA,volume:.42,favoriteIds:['keep-me']}))
 expect(persistence.loadData()).toMatchObject({volume:.42,favoriteIds:['keep-me']})
 expect(persistence.profileRecoveryStatus().recovered).toBe(true)
 expect(JSON.parse(readFileSync(profile,'utf8')).favoriteIds).toEqual(['keep-me'])
})
it('does not overwrite an unreadable orphan backup with a new profile',async()=>{
 const profile=join(profileRoot.path,'player-data.json')
 writeFileSync(profile+'.bak','broken-backup')
 const persistence=await import('./persistence')
 expect(()=>persistence.saveData(persistence.DEFAULT_DATA)).toThrow('резервная копия повреждена')
 expect(existsSync(profile)).toBe(false)
 expect(readFileSync(profile+'.bak','utf8')).toBe('broken-backup')
})
