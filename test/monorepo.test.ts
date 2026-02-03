import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanNodeModules } from '../src/scan'

const fixturesDir = join(fileURLToPath(import.meta.url), '..', 'fixtures')

describe('monorepo', () => {
  it('should scan all packages recursively', async () => {
    const monorepoPath = join(fixturesDir, 'monorepo')
    const result = await scanNodeModules({
      cwd: monorepoPath,
      recursive: true,
    })

    expect(result.skills).toHaveLength(2)

    const skillA = result.skills.find(s => s.packageName === 'test-pkg-a')
    expect(skillA).toBeDefined()
    expect(skillA?.skillName).toBe('test-skill')
    expect(skillA?.name).toBe('Test Skill A')
    expect(skillA?.description).toBe('A test skill in pkg-a')

    const skillB = result.skills.find(s => s.packageName === '@test-scope/test-pkg-b')
    expect(skillB).toBeDefined()
    expect(skillB?.skillName).toBe('another-skill')
    expect(skillB?.name).toBe('Another Skill B')
    expect(skillB?.description).toBe('Another test skill in pkg-b')

    expect(result.packageCount).toBeGreaterThanOrEqual(2)
  })

  it('should only scan current node_modules when recursive is false', async () => {
    const monorepoPath = join(fixturesDir, 'monorepo')
    const result = await scanNodeModules({
      cwd: monorepoPath,
      recursive: false,
    })

    expect(result.skills).toHaveLength(0)
    expect(result.packageCount).toBe(0)
  })
})
