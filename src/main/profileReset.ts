import { existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MARKER = '.reset-request'

function profilePath(appData: string, userData: string): string {
  const expected = resolve(appData, 'rezon')
  if (resolve(userData) !== expected || resolve(appData) === expected) throw new Error('Unexpected profile path')
  if (existsSync(expected) && lstatSync(expected).isSymbolicLink()) throw new Error('Linked profiles cannot be reset')
  return expected
}

export function requestProfileReset(appData: string, userData: string): void {
  const folder = profilePath(appData, userData)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, MARKER), 'confirmed', { flag: 'w' })
}

// Runs in the next process before windows, Chromium sessions and data stores open.
export function applyPendingProfileReset(appData: string, userData: string): boolean {
  const folder = profilePath(appData, userData)
  if (!existsSync(join(folder, MARKER))) return false
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    mkdirSync(folder, { recursive: true })
  } catch (error) {
    // Do not silently start with a partially cleared profile on the next launch.
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, MARKER), 'confirmed')
    throw error
  }
  return true
}
