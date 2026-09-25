import type { NpmSkill } from '../src/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSkillsLock, readVercelLockNames, SKILLS_NPM_LOCK_FILE, writeSkillsLock } from '../src/lock'

function skill(packageName: string, skillName: string, targetName: string): NpmSkill {
  return {
    packageName,
    skillName,
    skillPath: `/nm/${packageName}/skills/${skillName}`,
    targetName,
    name: targetName,
    description: 'desc',
  }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skills-npm-lock-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readVercelLockNames', () => {
  it('returns skill names from skills-lock.json', async () => {
    await writeFile(join(dir, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'my-skill': { source: 'github.com/foo/bar', sourceType: 'github', computedHash: 'x' },
      },
    }))
    expect(await readVercelLockNames(dir)).toEqual(new Set(['my-skill']))
  })

  it('returns an empty set when the lock is missing or malformed', async () => {
    expect(await readVercelLockNames(dir)).toEqual(new Set())
    await writeFile(join(dir, 'skills-lock.json'), 'not json')
    expect(await readVercelLockNames(dir)).toEqual(new Set())
  })
})

describe('writeSkillsLock', () => {
  it('writes a sorted manifest of managed skills', async () => {
    const changed = await writeSkillsLock(dir, [
      skill('pkg-b', 'zeta', 'zeta'),
      skill('@scope/pkg-a', 'alpha-folder', 'alpha'),
    ])
    expect(changed).toBe(true)

    const lock = JSON.parse(await readFile(join(dir, SKILLS_NPM_LOCK_FILE), 'utf-8'))
    expect(lock).toEqual({
      version: 1,
      skills: {
        alpha: { package: '@scope/pkg-a', skillFolder: 'alpha-folder' },
        zeta: { package: 'pkg-b', skillFolder: 'zeta' },
      },
    })
    expect(Object.keys(lock.skills)).toEqual(['alpha', 'zeta'])
  })

  it('reports no change when content is identical', async () => {
    const skills = [skill('pkg-a', 'alpha', 'alpha')]
    await writeSkillsLock(dir, skills)
    expect(await writeSkillsLock(dir, skills)).toBe(false)
  })

  it('does not write in dry-run mode', async () => {
    const changed = await writeSkillsLock(dir, [skill('pkg-a', 'alpha', 'alpha')], true)
    expect(changed).toBe(true)
    await expect(readFile(join(dir, SKILLS_NPM_LOCK_FILE), 'utf-8')).rejects.toThrow()
  })
})

describe('createSkillsLock', () => {
  it('keys entries by target name', () => {
    const lock = createSkillsLock([skill('pkg-a', 'folder-name', 'display-name')])
    expect(lock.skills['display-name']).toEqual({ package: 'pkg-a', skillFolder: 'folder-name' })
  })
})
