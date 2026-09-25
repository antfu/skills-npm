import type { NpmSkill } from '../src/types'
import { lstat, mkdir, mkdtemp, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupStaleSkills, isManagedTarget, symlinkSkill } from '../src/symlink'

const AGENT = 'claude-code'
const AGENT_SKILLS_DIR = '.claude/skills'

let dir: string

async function addPackageSkill(packageName: string, skillFolder: string): Promise<string> {
  const skillPath = join(dir, 'node_modules', packageName, 'skills', skillFolder)
  await mkdir(skillPath, { recursive: true })
  await writeFile(join(skillPath, 'SKILL.md'), '---\nname: x\ndescription: y\n---\n')
  return skillPath
}

function npmSkill(packageName: string, skillFolder: string, targetName: string, skillPath: string): NpmSkill {
  return {
    packageName,
    skillName: skillFolder,
    skillPath,
    targetName,
    name: targetName,
    description: 'desc',
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skills-npm-symlink-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('isManagedTarget', () => {
  it('matches skill directories inside node_modules', () => {
    expect(isManagedTarget('/proj/node_modules/pkg/skills/foo')).toBe(true)
    expect(isManagedTarget('/proj/node_modules/@scope/pkg/skills/foo')).toBe(true)
    expect(isManagedTarget('/proj/node_modules/.pnpm/pkg@1/node_modules/pkg/skills/foo')).toBe(true)
  })

  it('rejects other paths', () => {
    expect(isManagedTarget('/proj/.agents/skills/foo')).toBe(false)
    expect(isManagedTarget('/proj/node_modules/pkg/lib/foo')).toBe(false)
    expect(isManagedTarget('/proj/skills/foo')).toBe(false)
  })
})

describe('symlinkSkill', () => {
  it('creates a relative symlink named after the skill', async () => {
    const skillPath = await addPackageSkill('pkg-a', 'folder-name')
    const skill = npmSkill('pkg-a', 'folder-name', 'my-skill', skillPath)

    const results = await symlinkSkill(skill, { cwd: dir, agents: [AGENT] })

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('created')

    const linkPath = join(dir, AGENT_SKILLS_DIR, 'my-skill')
    const target = await readlink(linkPath)
    expect(target).toBe(join('..', '..', 'node_modules', 'pkg-a', 'skills', 'folder-name'))
  })

  it('skips a real directory occupying the destination', async () => {
    const skillPath = await addPackageSkill('pkg-a', 'foo')
    const destination = join(dir, AGENT_SKILLS_DIR, 'foo')
    await mkdir(destination, { recursive: true })
    await writeFile(join(destination, 'keep.txt'), 'user content')

    const results = await symlinkSkill(npmSkill('pkg-a', 'foo', 'foo', skillPath), { cwd: dir, agents: [AGENT] })

    expect(results[0].status).toBe('skipped')
    expect((await lstat(destination)).isDirectory()).toBe(true)
  })

  it('skips a symlink not pointing into node_modules', async () => {
    const skillPath = await addPackageSkill('pkg-a', 'foo')
    const foreignTarget = join(dir, '.agents', 'skills', 'foo')
    await mkdir(foreignTarget, { recursive: true })
    const destination = join(dir, AGENT_SKILLS_DIR, 'foo')
    await mkdir(join(dir, AGENT_SKILLS_DIR), { recursive: true })
    await symlink(foreignTarget, destination)

    const results = await symlinkSkill(npmSkill('pkg-a', 'foo', 'foo', skillPath), { cwd: dir, agents: [AGENT] })

    expect(results[0].status).toBe('skipped')
    expect(await readlink(destination)).toBe(foreignTarget)
  })

  it('repairs a managed symlink pointing at the wrong skill', async () => {
    const oldPath = await addPackageSkill('pkg-old', 'foo')
    const newPath = await addPackageSkill('pkg-new', 'foo')
    const destination = join(dir, AGENT_SKILLS_DIR, 'foo')
    await mkdir(join(dir, AGENT_SKILLS_DIR), { recursive: true })
    await symlink(oldPath, destination)

    const results = await symlinkSkill(npmSkill('pkg-new', 'foo', 'foo', newPath), { cwd: dir, agents: [AGENT] })

    expect(results[0].status).toBe('created')
    const target = await readlink(destination)
    expect(join(dir, AGENT_SKILLS_DIR, target)).toBe(newPath)
    expect(oldPath).not.toBe(newPath)
  })
})

describe('cleanupStaleSkills', () => {
  it('removes managed symlinks not in the resolved set, including v1 npm-* links', async () => {
    const skillPath = await addPackageSkill('pkg-a', 'foo')
    const agentDir = join(dir, AGENT_SKILLS_DIR)
    await mkdir(agentDir, { recursive: true })

    // Current skill, a stale managed link, and a legacy v1 link
    await symlink(skillPath, join(agentDir, 'foo'))
    const stalePath = await addPackageSkill('pkg-gone', 'stale')
    await symlink(stalePath, join(agentDir, 'stale'))
    await symlink(skillPath, join(agentDir, 'npm-pkg-a-foo'))

    const results = await cleanupStaleSkills(
      [npmSkill('pkg-a', 'foo', 'foo', skillPath)],
      { cwd: dir, agents: [AGENT] },
    )

    expect(results.map(r => r.targetName).sort()).toEqual(['npm-pkg-a-foo', 'stale'])
    expect(results.every(r => r.success)).toBe(true)
    expect(await readdir(agentDir)).toEqual(['foo'])
  })

  it('never removes real directories or foreign symlinks', async () => {
    const agentDir = join(dir, AGENT_SKILLS_DIR)
    await mkdir(join(agentDir, 'real-skill'), { recursive: true })
    const foreignTarget = join(dir, '.agents', 'skills', 'vercel-skill')
    await mkdir(foreignTarget, { recursive: true })
    await symlink(foreignTarget, join(agentDir, 'vercel-skill'))

    const results = await cleanupStaleSkills([], { cwd: dir, agents: [AGENT] })

    expect(results).toHaveLength(0)
    expect((await readdir(agentDir)).sort()).toEqual(['real-skill', 'vercel-skill'])
  })
})
