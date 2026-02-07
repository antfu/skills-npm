import type { PackageManagerLockfileInfo, SkillsNpmCache } from './types'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { LOCK_FILES } from './constants'

const LOCK_FILE_PATH = 'node_modules/.skills-npm/cache.json'

export async function readCache(cwd: string): Promise<SkillsNpmCache | null> {
  try {
    const path = join(cwd, LOCK_FILE_PATH)
    if (!existsSync(path))
      return null
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content)
  }
  catch {
    return null
  }
}

export async function writeCache(cwd: string, data: SkillsNpmCache): Promise<void> {
  const path = join(cwd, LOCK_FILE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2))
}

function isBinaryLockFile(filename: string): boolean {
  return LOCK_FILES.binary.includes(filename as typeof LOCK_FILES.binary[number])
}

export async function getPackageManagerLockFileHash(cwd: string): Promise<PackageManagerLockfileInfo | null> {
  for (const file of LOCK_FILES.all) {
    try {
      // Binary files (bun.lockb) need Buffer reading, text files use UTF-8
      const encoding = isBinaryLockFile(file) ? undefined : 'utf-8'
      const content = await readFile(join(cwd, file), encoding)
      return {
        hash: createHash('md5').update(content).digest('hex'),
        path: file,
      }
    }
    catch {
      continue
    }
  }

  return null
}

export function isCacheUpToDate(
  lockfile: SkillsNpmCache | null,
  lockFileInfo: PackageManagerLockfileInfo,
): boolean {
  return lockfile != null && lockfile.lockfile.hash === lockFileInfo.hash && lockfile.lockfile.path === lockFileInfo.path
}
