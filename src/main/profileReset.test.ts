import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { applyPendingProfileReset, requestProfileReset } from './profileReset'

let root: string, profile: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rezon-reset-test-'))
  profile = join(root, 'rezon')
  mkdirSync(profile)
  writeFileSync(join(profile, 'player-data.json'), '{"test":true}')
})
afterEach(() => {
  if (resolve(root).startsWith(resolve(tmpdir()) + '\\rezon-reset-test-') || resolve(root).startsWith(resolve(tmpdir()) + '/rezon-reset-test-')) rmSync(root, { recursive: true, force: true })
})
describe('profile reset boundary', () => {
  it('preserves the profile during ordinary launches and updates', () => {
    expect(applyPendingProfileReset(root, profile)).toBe(false)
    expect(existsSync(join(profile, 'player-data.json'))).toBe(true)
  })
  it('defers deletion until next launch and removes sessions without touching music outside the profile', () => {
    mkdirSync(join(profile, 'Partitions', 'vk'), { recursive: true })
    writeFileSync(join(profile, 'Partitions', 'vk', 'Cookies'), 'test-session')
    writeFileSync(join(root, 'music.mp3'), 'test-music')
    requestProfileReset(root, profile)
    expect(existsSync(join(profile, 'player-data.json'))).toBe(true)
    expect(applyPendingProfileReset(root, profile)).toBe(true)
    expect(existsSync(join(profile, 'Partitions'))).toBe(false)
    expect(existsSync(join(profile, 'player-data.json'))).toBe(false)
    expect(readFileSync(join(root, 'music.mp3'), 'utf8')).toBe('test-music')
    expect(applyPendingProfileReset(root, profile)).toBe(false)
  })
  it('rejects parent and unrelated directories', () => {
    expect(() => requestProfileReset(root, root)).toThrow('Unexpected profile path')
    expect(() => applyPendingProfileReset(root, join(root, 'music'))).toThrow('Unexpected profile path')
  })
  it('does not traverse a linked profile', () => {
    const otherRoot = join(root, 'other')
    mkdirSync(otherRoot)
    symlinkSync(profile, join(otherRoot, 'rezon'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => requestProfileReset(otherRoot, join(otherRoot, 'rezon'))).toThrow('Linked profiles')
    expect(existsSync(join(profile, 'player-data.json'))).toBe(true)
  })
})
