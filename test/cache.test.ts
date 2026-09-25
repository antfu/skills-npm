import type { PackageManagerLockfileInfo, ScanCacheKey, SkillsNpmCache } from '../src/types'
import { describe, expect, it } from 'vitest'
import { CACHE_VERSION, isCacheUpToDate } from '../src/cache'

const lockFileInfo: PackageManagerLockfileInfo = {
  hash: 'abc123',
  path: 'pnpm-lock.yaml',
}

function makeCache(overrides: Partial<SkillsNpmCache> = {}): SkillsNpmCache {
  return {
    version: CACHE_VERSION,
    lockfile: lockFileInfo,
    scan: { source: 'node_modules', recursive: false },
    skills: [],
    skillsInvalid: [],
    rootPaths: [],
    ...overrides,
  }
}

describe('isCacheUpToDate', () => {
  const scan: ScanCacheKey = { source: 'node_modules', recursive: false }

  it('reuses the cache when lockfile and scan options match', () => {
    expect(isCacheUpToDate(makeCache(), lockFileInfo, scan)).toBe(true)
  })

  it('rejects the cache when the lockfile hash differs', () => {
    expect(isCacheUpToDate(makeCache(), { ...lockFileInfo, hash: 'different' }, scan)).toBe(false)
  })

  it('rejects a non-recursive cache for a recursive scan', () => {
    const cache = makeCache({ scan: { source: 'node_modules', recursive: false } })
    expect(isCacheUpToDate(cache, lockFileInfo, { source: 'node_modules', recursive: true })).toBe(false)
  })

  it('rejects a cache built from a different source', () => {
    const cache = makeCache({ scan: { source: 'node_modules', recursive: false } })
    expect(isCacheUpToDate(cache, lockFileInfo, { source: 'package.json', recursive: false })).toBe(false)
  })

  it('rejects a legacy cache with no recorded scan options', () => {
    const cache = { ...makeCache(), scan: undefined } as unknown as SkillsNpmCache
    expect(isCacheUpToDate(cache, lockFileInfo, scan)).toBe(false)
  })
})
