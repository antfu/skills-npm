import type { NpmSkill } from '../src/types'
import { describe, expect, it } from 'vitest'
import { resolveConflicts } from '../src/resolve'

function skill(packageName: string, targetName: string): NpmSkill {
  return {
    packageName,
    skillName: targetName,
    skillPath: `/nm/${packageName}/skills/${targetName}`,
    targetName,
    name: targetName,
    description: 'desc',
  }
}

describe('resolveConflicts', () => {
  it('passes through unique names', () => {
    const skills = [skill('pkg-a', 'alpha'), skill('pkg-b', 'beta')]
    const result = resolveConflicts(skills, { vercelLockNames: new Set(), directDeps: new Set() })
    expect(result.resolved).toHaveLength(2)
    expect(result.skipped).toHaveLength(0)
  })

  it('skips names declared in skills-lock.json, even without a conflict', () => {
    const skills = [skill('pkg-a', 'alpha'), skill('pkg-b', 'beta')]
    const result = resolveConflicts(skills, {
      vercelLockNames: new Set(['alpha']),
      directDeps: new Set(['pkg-a']),
    })
    expect(result.resolved.map(s => s.targetName)).toEqual(['beta'])
    expect(result.skipped).toEqual([{ skill: skills[0], reason: 'vercel-lock' }])
  })

  it('lets a single direct dependency win over transitive ones', () => {
    const direct = skill('pkg-direct', 'alpha')
    const transitive = skill('pkg-transitive', 'alpha')
    const result = resolveConflicts([direct, transitive], {
      vercelLockNames: new Set(),
      directDeps: new Set(['pkg-direct']),
    })
    expect(result.resolved).toEqual([direct])
    expect(result.skipped).toEqual([
      { skill: transitive, reason: 'name-conflict', conflictsWith: ['pkg-direct'] },
    ])
  })

  it('skips all contenders when two direct dependencies collide', () => {
    const a = skill('pkg-a', 'alpha')
    const b = skill('pkg-b', 'alpha')
    const result = resolveConflicts([a, b], {
      vercelLockNames: new Set(),
      directDeps: new Set(['pkg-a', 'pkg-b']),
    })
    expect(result.resolved).toHaveLength(0)
    expect(result.skipped).toEqual([
      { skill: a, reason: 'name-conflict', conflictsWith: ['pkg-b'] },
      { skill: b, reason: 'name-conflict', conflictsWith: ['pkg-a'] },
    ])
  })

  it('skips all contenders when only transitive packages collide', () => {
    const a = skill('pkg-a', 'alpha')
    const b = skill('pkg-b', 'alpha')
    const result = resolveConflicts([a, b], {
      vercelLockNames: new Set(),
      directDeps: new Set(),
    })
    expect(result.resolved).toHaveLength(0)
    expect(result.skipped).toHaveLength(2)
  })
})
