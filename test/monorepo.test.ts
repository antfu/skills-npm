import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanNodeModules } from '../src/scan'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const monorepoTypes = [
  { name: 'pnpm-monorepo', path: 'pnpm-monorepo' },
  { name: 'monorepo (npm workspaces)', path: 'monorepo' },
] as const

describe.each(monorepoTypes)('$name', ({ path }) => {
  const monorepoPath = join(fixturesDir, path)

  it('should scan all packages recursively', async () => {
    const result = await scanNodeModules({
      cwd: monorepoPath,
      recursive: true,
    })

    expect(result.rootPaths[0]).toBe(monorepoPath)
    expect(result.skills.map(s => `${s.packageName}/${s.skillName}`).sort()).toEqual([
      '@test-scope/test-pkg-b/another-skill',
      'test-pkg-a/second-skill',
      'test-pkg-a/test-skill',
      'test-root-pkg/root-skill',
    ])

    const skillA = result.skills.find(s => s.skillName === 'test-skill')
    expect(skillA?.name).toBe('Test Skill A')
    expect(skillA?.description).toBe('A test skill in pkg-a')
    // test-pkg-a is installed under both pkg-a and pkg-b; the first root wins
    expect(skillA?.skillPath).toContain(join('packages', 'pkg-a'))

    const skillB = result.skills.find(s => s.packageName === '@test-scope/test-pkg-b')
    expect(skillB?.name).toBe('Another Skill B')
    expect(skillB?.description).toBe('Another test skill in pkg-b')

    expect(result.packagesScanned).toBeGreaterThanOrEqual(4)
  })

  it('should only scan current node_modules when recursive is false', async () => {
    const result = await scanNodeModules({
      cwd: monorepoPath,
      recursive: false,
    })

    expect(result.skills.map(s => s.packageName)).toEqual(['test-root-pkg'])
    expect(result.packagesScanned).toBe(1)
  })
})
