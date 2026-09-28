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
    skillFile: `skills/${skillName}/SKILL.md`,
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
      version: 3,
      skills: {
        alpha: { package: '@scope/pkg-a', skillPath: 'skills/alpha-folder/SKILL.md' },
        zeta: { package: 'pkg-b', skillPath: 'skills/zeta/SKILL.md' },
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
    const changed = await writeSkillsLock(dir, [skill('pkg-a', 'alpha', 'alpha')], [], true)
    expect(changed).toBe(true)
    await expect(readFile(join(dir, SKILLS_NPM_LOCK_FILE), 'utf-8')).rejects.toThrow()
  })
})

describe('createSkillsLock', () => {
  it('keys entries by target name', () => {
    const lock = createSkillsLock([skill('pkg-a', 'folder-name', 'display-name')])
    expect(lock.skills['display-name']).toEqual({ package: 'pkg-a', skillPath: 'skills/folder-name/SKILL.md' })
    expect(lock).not.toHaveProperty('remote')
  })

  it('records which pack requested an npm: skill', () => {
    const lock = createSkillsLock([{ ...skill('@vueuse/skills', 'vueuse', 'vueuse'), via: '@acme/pack' }])
    expect(lock.skills.vueuse).toEqual({ package: '@vueuse/skills', skillPath: 'skills/vueuse/SKILL.md', via: '@acme/pack' })
  })

  it('records the installed package version when known', () => {
    const lock = createSkillsLock([{ ...skill('pkg-a', 'alpha', 'alpha'), packageVersion: '1.2.3' }])
    expect(lock.skills.alpha).toEqual({ package: 'pkg-a', version: '1.2.3', skillPath: 'skills/alpha/SKILL.md' })
  })

  it('records remote skills sorted by name with their requesting package', () => {
    const lock = createSkillsLock([], [
      { name: 'zeta', package: '.', source: 'owner/repo', ref: 'v1' },
      { name: 'alpha', package: '@acme/pack', source: 'vercel-labs/agent-skills' },
    ])
    expect(Object.keys(lock.remote!)).toEqual(['alpha', 'zeta'])
    expect(lock.remote).toEqual({
      alpha: { package: '@acme/pack', source: 'vercel-labs/agent-skills' },
      zeta: { package: '.', source: 'owner/repo', ref: 'v1' },
    })
  })
})
