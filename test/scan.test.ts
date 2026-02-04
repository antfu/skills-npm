import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanCurrentNodeModules } from '../src/scan'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const sourceFilterPath = join(fixturesDir, 'source-filter')

describe('scanCurrentNodeModules - source option', () => {
  it('should scan all packages when source is node_modules', async () => {
    const result = await scanCurrentNodeModules(sourceFilterPath, 'node_modules')

    expect(result.skills).toHaveLength(3)
    expect(result.packageCount).toBe(3)

    const skillA = result.skills.find(s => s.packageName === 'test-pkg-a')
    expect(skillA?.skillName).toBe('test-skill')
    expect(skillA?.name).toBe('Test Skill A')

    const skillB = result.skills.find(s => s.packageName === '@test-scope/test-pkg-b')
    expect(skillB?.skillName).toBe('scoped-skill')
    expect(skillB?.name).toBe('Test Skill B')

    const skillC = result.skills.find(s => s.packageName === 'test-pkg-c')
    expect(skillC?.skillName).toBe('another-skill')
    expect(skillC?.name).toBe('Test Skill C')
  })

  it('should only scan declared dependencies when source is package.json', async () => {
    const result = await scanCurrentNodeModules(sourceFilterPath, 'package.json')

    expect(result.skills).toHaveLength(2)
    expect(result.packageCount).toBe(2)

    const skillA = result.skills.find(s => s.packageName === 'test-pkg-a')
    expect(skillA).toBeDefined()
    expect(skillA?.name).toBe('Test Skill A')

    const skillB = result.skills.find(s => s.packageName === '@test-scope/test-pkg-b')
    expect(skillB).toBeDefined()
    expect(skillB?.name).toBe('Test Skill B')

    // test-pkg-c should be filtered out (not in package.json)
    const skillC = result.skills.find(s => s.packageName === 'test-pkg-c')
    expect(skillC).toBeUndefined()
  })
})
