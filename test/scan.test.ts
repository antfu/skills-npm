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
    expect(result.packagesScanned).toBe(3)

    const skillA = result.skills.find(s => s.packageName === 'test-pkg-a')
    expect(skillA?.skillName).toBe('test-skill')
    expect(skillA?.name).toBe('Test Skill A')
    // Link name derives from the sanitized frontmatter name, not the folder
    expect(skillA?.targetName).toBe('test-skill-a')

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
    expect(result.packagesScanned).toBe(2)

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

describe('scanPackageForSkills - skill locations', () => {
  const skillLocationsPath = join(fixturesDir, 'skill-locations')

  it('discovers skills at the package root, in dist/skills and in .agents/skills', async () => {
    const result = await scanCurrentNodeModules(skillLocationsPath, 'node_modules')

    expect(result.skills.map(s => [s.packageName, s.skillName, s.skillFile]).sort()).toEqual([
      ['agents-dir-pkg', 'canonical', '.agents/skills/canonical/SKILL.md'],
      ['dist-pkg', 'built', 'dist/skills/built/SKILL.md'],
      ['dup-pkg', 'shared', 'skills/shared/SKILL.md'],
      ['root-skill-pkg', 'root-skill', 'SKILL.md'],
    ])
  })

  it('treats a root SKILL.md as the whole package and links the package directory', async () => {
    const result = await scanCurrentNodeModules(skillLocationsPath, 'node_modules')
    const root = result.skills.find(s => s.packageName === 'root-skill-pkg')

    expect(root?.targetName).toBe('root-skill')
    expect(root?.skillPath).toBe(join(skillLocationsPath, 'node_modules', 'root-skill-pkg'))
    expect(root?.packageVersion).toBe('2.0.0')
  })

  it('prefers skills/ over dist/skills for the same skill name', async () => {
    const result = await scanCurrentNodeModules(skillLocationsPath, 'node_modules')
    const shared = result.skills.filter(s => s.targetName === 'shared-skill')

    expect(shared).toHaveLength(1)
    expect(shared[0].description).toBe('Source copy')
  })

  it('reports an invalid root SKILL.md', async () => {
    const result = await scanCurrentNodeModules(skillLocationsPath, 'node_modules')

    expect(result.skillsInvalid).toEqual([
      { packageName: 'bad-root-pkg', packageVersion: '1.0.0', skillName: 'SKILL.md', error: 'missing_fields' },
    ])
  })
})
