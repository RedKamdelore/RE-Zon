import { opendir, lstat, stat, statfs } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface StorageUsage {
  program: number
  profile: number
  offline: number
  library: number
  diskTotal: number
  diskFree: number
}

async function folderBytes(folder: string): Promise<number> {
  let total = 0
  try {
    for await (const entry of await opendir(folder)) {
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) total += await folderBytes(path)
      else if (entry.isFile()) { try { total += (await stat(path)).size } catch {} }
    }
  } catch {}
  return total
}

function inside(path: string, folder: string): boolean {
  const rel = relative(folder, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export async function calculateStorageUsage(userData: string, executable: string, packaged: boolean, localFiles: string[]): Promise<StorageUsage> {
  const programRoot = dirname(executable)
  const profileRoot = resolve(userData)
  const [program, profile, offline] = await Promise.all([
    packaged ? folderBytes(programRoot) : Promise.resolve(0),
    folderBytes(profileRoot),
    folderBytes(join(profileRoot, 'offline')),
  ])
  let library = 0
  const files = new Set(localFiles.filter(path => typeof path === 'string' && isAbsolute(path)).map(path => resolve(path)))
  const paths = [...files].filter(path => !inside(path, profileRoot) && !(packaged && inside(path, programRoot)))
  for (let index = 0; index < paths.length; index += 100) {
    const sizes = await Promise.all(paths.slice(index,index+100).map(async path => {
      try { const info = await lstat(path); return info.isFile() ? info.size : 0 } catch { return 0 }
    }))
    library += sizes.reduce((sum, size) => sum + size, 0)
  }
  let diskTotal = 0, diskFree = 0
  try { const disk = await statfs(profileRoot); diskTotal = disk.blocks * disk.bsize; diskFree = disk.bavail * disk.bsize } catch {}
  return {program,profile,offline,library,diskTotal,diskFree}
}
