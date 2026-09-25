import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readVercelLockNames } from '../src/lock'
import { installRemote, removeRemote, runSkillsCli } from '../src/remote'

// Pins the contract we rely on from the real `skills` binary: `add --json`
// output, where files land, and `remove` cleaning up. Uses a local-path
// source so the test never touches the network.
describe('skills CLI contract', () => {
  let dir: string

  beforeAll(async () => {
    process.env.DISABLE_TELEMETRY = '1'
    dir = await mkdtemp(join(tmpdir(), 'skills-npm-cli-'))
    const skillDir = join(dir, 'src', 'skills', 'demo-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: Demo Skill\ndescription: contract test\n---\n# Demo\n')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('installs into the selected agent directories and records skills-lock.json', async () => {
    const install = { source: './src/skills', skills: [], requests: [{ package: '.', source: './src/skills', skills: [] }] }
    const installed = await installRemote([install], ['claude-code', 'cursor'], dir, runSkillsCli)

    expect(installed).toEqual([{ name: 'demo-skill', package: '.', source: './src/skills', ref: undefined }])
    expect(await readVercelLockNames(dir)).toEqual(new Set(['demo-skill']))
    expect((await lstat(join(dir, '.agents/skills/demo-skill/SKILL.md'))).isFile()).toBe(true)
    // symlink on POSIX, junction or copy on Windows: only presence is contractual
    await expect(lstat(join(dir, '.claude/skills/demo-skill'))).resolves.toBeDefined()
  })

  it('removes an installed skill', async () => {
    await removeRemote(['demo-skill'], dir, runSkillsCli)

    await expect(lstat(join(dir, '.claude/skills/demo-skill'))).rejects.toThrow()
    await expect(lstat(join(dir, '.agents/skills/demo-skill'))).rejects.toThrow()
    expect(await readVercelLockNames(dir)).toEqual(new Set())
  })
}, 60_000)
