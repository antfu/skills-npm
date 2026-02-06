import type { NpmSkill } from './types'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCK_FILES } from './constants'

const CACHE_FILE = '.skills-npm-cache.json'

interface CacheData {
  lockFileHash: string
  lockFilePath: string
  skills: NpmSkill[]
}

export async function readCache(cwd: string): Promise<CacheData | null> {
  try {
    const content = await readFile(join(cwd, CACHE_FILE), 'utf-8')
    return JSON.parse(content)
  }
  catch {
    return null
  }
}

export async function writeCache(cwd: string, data: CacheData): Promise<void> {
  await writeFile(join(cwd, CACHE_FILE), JSON.stringify(data, null, 2))
}

function isBinaryLockFile(filename: string): boolean {
  return LOCK_FILES.binary.includes(filename as typeof LOCK_FILES.binary[number])
}

export async function getLockFileHash(cwd: string): Promise<{ hash: string, path: string } | null> {
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

export function isCacheValid(cache: CacheData | null, lockFileHash: string): boolean {
  return cache !== null && cache.lockFileHash === lockFileHash
}
