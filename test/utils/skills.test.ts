import type { NpmSkill } from '../../src/types'
import { describe, expect, it } from 'vitest'
import { filterSkills, processSkills } from '../../src/utils/skills'

const mockSkills: NpmSkill[] = [
  { packageName: 'pkg-a', skillName: 'skill1', skillPath: '/a/skill1', targetName: 'npm-pkg-a-skill1', name: 'Skill 1', description: 'Desc 1' },
  { packageName: 'pkg-a', skillName: 'skill2', skillPath: '/a/skill2', targetName: 'npm-pkg-a-skill2', name: 'Skill 2', description: 'Desc 2' },
  { packageName: 'pkg-b', skillName: 'skill3', skillPath: '/b/skill3', targetName: 'npm-pkg-b-skill3', name: 'Skill 3', description: 'Desc 3' },
  { packageName: '@some/foo', skillName: 'integration', skillPath: '/some/foo/integration', targetName: 'npm-some-foo-integration', name: 'Foo Integration', description: 'Desc 4' },
  { packageName: '@some/foo', skillName: 'guide', skillPath: '/some/foo/guide', targetName: 'npm-some-foo-guide', name: 'Foo Guide', description: 'Desc 5' },
  { packageName: '@some/bar', skillName: 'integration', skillPath: '/some/bar/integration', targetName: 'npm-some-bar-integration', name: 'Bar Integration', description: 'Desc 6' },
  { packageName: 'pkg-c', skillName: 'skill4', skillPath: '/c/skill4', targetName: 'npm-pkg-c-skill4', name: 'Skill 4', description: 'Desc 4' },
]

describe('filterSkills', () => {
  it('returns all skills when options is empty', () => {
    const result = filterSkills(mockSkills, undefined, true)
    expect(result).toHaveLength(7)
  })

  it('returns all skills when options is empty array', () => {
    const result = filterSkills(mockSkills, [], true)
    expect(result).toHaveLength(7)
  })

  it('filters by package name (string)', () => {
    const result = filterSkills(mockSkills, ['pkg-a'], true)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.packageName === 'pkg-a')).toBe(true)
  })

  it('filters by package pattern (string)', () => {
    const result = filterSkills(mockSkills, ['@some/*'], true)
    expect(result).toHaveLength(3)
    expect(result.every(s => s.packageName.startsWith('@some/'))).toBe(true)
  })

  it('filters by package with specific skills', () => {
    const result = filterSkills(mockSkills, [{ package: 'pkg-a', skills: ['skill1'] }], true)
    expect(result).toHaveLength(1)
    expect(result[0].skillName).toBe('skill1')
  })

  it('filters by package pattern with specific skills', () => {
    const result = filterSkills(mockSkills, [{ package: '@some/*', skills: ['integration'] }], true)
    expect(result).toHaveLength(2)
    expect(result.every(s => s.skillName === 'integration')).toBe(true)
    expect(result.every(s => s.packageName.startsWith('@some/'))).toBe(true)
  })

  it('excludes matching skills when shouldMatch is false', () => {
    const result = filterSkills(mockSkills, ['pkg-a'], false)
    expect(result).toHaveLength(5)
    expect(result.every(s => s.packageName !== 'pkg-a')).toBe(true)
  })

  it('excludes matching package patterns when shouldMatch is false', () => {
    const result = filterSkills(mockSkills, ['@some/*'], false)
    expect(result).toHaveLength(4)
    expect(result.every(s => !s.packageName.startsWith('@some/'))).toBe(true)
  })
})

describe('processSkills', () => {
  it('returns all skills when no filters provided', () => {
    const result = processSkills(mockSkills)
    expect(result.skills).toHaveLength(7)
    expect(result.excludedCount).toBe(0)
  })

  it('applies include filter only', () => {
    const result = processSkills(mockSkills, ['pkg-a'])
    expect(result.skills.map(s => ({ packageName: s.packageName, skillName: s.skillName })))
      .toEqual([
        { packageName: 'pkg-a', skillName: 'skill1' },
        { packageName: 'pkg-a', skillName: 'skill2' },
      ])
    expect(result.excludedCount).toBe(5)
  })

  it('applies exclude filter only', () => {
    const result = processSkills(mockSkills, [], ['pkg-a'])
    expect(result.skills.map(s => ({ packageName: s.packageName, skillName: s.skillName })))
      .toEqual([
        { packageName: 'pkg-b', skillName: 'skill3' },
        { packageName: '@some/foo', skillName: 'integration' },
        { packageName: '@some/foo', skillName: 'guide' },
        { packageName: '@some/bar', skillName: 'integration' },
        { packageName: 'pkg-c', skillName: 'skill4' },
      ])
    expect(result.excludedCount).toBe(2)
  })

  it('applies include filter with package patterns', () => {
    const result = processSkills(mockSkills, ['@some/*'])
    expect(result.skills.map(s => ({ packageName: s.packageName, skillName: s.skillName })))
      .toEqual([
        { packageName: '@some/foo', skillName: 'integration' },
        { packageName: '@some/foo', skillName: 'guide' },
        { packageName: '@some/bar', skillName: 'integration' },
      ])
    expect(result.excludedCount).toBe(4)
  })

  it('applies both include and exclude filters', () => {
    const result = processSkills(
      mockSkills,
      ['pkg-a', 'pkg-b'],
      [{ package: 'pkg-a', skills: ['skill1'] }],
    )
    expect(result.skills.map(s => ({ packageName: s.packageName, skillName: s.skillName })))
      .toEqual([
        { packageName: 'pkg-a', skillName: 'skill2' },
        { packageName: 'pkg-b', skillName: 'skill3' },
      ])
    expect(result.excludedCount).toBe(5)
  })

  it('applies package patterns in both include and exclude filters', () => {
    const result = processSkills(
      mockSkills,
      ['pkg-a', '@some/*'],
      [{ package: '@some/*', skills: ['guide'] }],
    )
    expect(result.skills.map(s => ({ packageName: s.packageName, skillName: s.skillName })))
      .toEqual([
        { packageName: 'pkg-a', skillName: 'skill1' },
        { packageName: 'pkg-a', skillName: 'skill2' },
        { packageName: '@some/foo', skillName: 'integration' },
        { packageName: '@some/bar', skillName: 'integration' },
      ])
    expect(result.excludedCount).toBe(3)
  })
})
