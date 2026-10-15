import type { SkillsFieldEntry } from '../src/types'
import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readSkillsLock, readVercelLockNames } from '../src/lock'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const source = 'https://skills-npm.test/remote.git'

// Exercise the real CLIs and git clone without the network. Git rewrites this
// valid remote source to a disposable repository; no installer is mocked.
describe('remote cleanup', () => {
  let root: string
  let env: NodeJS.ProcessEnv

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'skills-npm-remote-cleanup-'))
    const repo = join(root, 'remote')
    const skill = join(repo, 'skills', 'remote-skill')
    await mkdir(skill, { recursive: true })
    await writeFile(join(skill, 'SKILL.md'), '---\nname: remote-skill\ndescription: Remote cleanup test\n---\n# Remote skill\n')
    await exec('git', ['init', repo])
    await exec('git', ['-C', repo, 'add', '.'])
    await exec('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-m', 'test: add remote skill'])
    await exec('git', ['-C', repo, 'tag', 'v2'])
    env = {
      ...process.env,
      DISABLE_TELEMETRY: '1',
      XDG_STATE_HOME: join(root, 'state'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(repo).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: source,
    }
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function sync(cwd: string, ...args: string[]): Promise<void> {
    await exec(process.execPath, [require.resolve('tsx/cli'), cli, '--cwd', cwd, '--agents', 'claude-code', '--yes', ...args], { env })
  }

  async function writeProject(cwd: string, skills: SkillsFieldEntry[]): Promise<void> {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({
      name: 'consumer',
      dependencies: { 'local-skills': '1.0.0' },
      skills,
    }))
  }

  async function createProject(name: string): Promise<string> {
    const cwd = join(root, name)
    // Keep one npm skill so cleanup is reached independently of empty scans.
    const pkg = join(cwd, 'node_modules', 'local-skills')
    await mkdir(join(pkg, 'skills', 'local-skill'), { recursive: true })
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'local-skills', version: '1.0.0' }))
    await writeFile(join(pkg, 'skills', 'local-skill', 'SKILL.md'), '---\nname: local-skill\ndescription: Local cleanup control\n---\n# Local skill\n')
    await writeProject(cwd, [{ source, skills: ['remote-skill'] }])
    await sync(cwd)
    expect((await readSkillsLock(cwd))?.remote).toEqual({ 'remote-skill': { package: '.', source } })
    expect(await readVercelLockNames(cwd)).toContain('remote-skill')
    expect(await readFile(join(cwd, '.agents/skills/remote-skill/SKILL.md'), 'utf-8')).toContain('# Remote skill')
    return cwd
  }

  it.each(['default', '--no-cleanup', '--no-remote', '--dry-run'])('removes unrequested remote skills after %s', async (mode) => {
    const cwd = await createProject(mode)
    await writeProject(cwd, [])
    if (mode !== 'default') {
      const before = await readFile(join(cwd, 'skills-npm-lock.json'), 'utf-8')
      await sync(cwd, mode)
      expect(await readFile(join(cwd, '.agents/skills/remote-skill/SKILL.md'), 'utf-8')).toContain('# Remote skill')
      expect.soft((await readSkillsLock(cwd))?.remote).toEqual({ 'remote-skill': { package: '.', source } })
      if (mode === '--dry-run')
        expect(await readFile(join(cwd, 'skills-npm-lock.json'), 'utf-8')).toBe(before)
    }
    await sync(cwd)
    await expect(lstat(join(cwd, '.agents/skills/remote-skill'))).rejects.toThrow()
    await expect(lstat(join(cwd, '.claude/skills/remote-skill'))).rejects.toThrow()
    expect(await readVercelLockNames(cwd)).not.toContain('remote-skill')
    expect((await readSkillsLock(cwd))?.remote).toBeUndefined()
    expect(await readFile(join(cwd, '.agents/skills/local-skill/SKILL.md'), 'utf-8')).toContain('# Local skill')
  })

  it('keeps manually installed skills while cleaning up deferred remote skills', async () => {
    const cwd = await createProject('manual')
    const manual = join(cwd, 'manual')
    await mkdir(manual)
    await writeFile(join(manual, 'SKILL.md'), '---\nname: manual-skill\ndescription: Explicit install\n---\n# Manual skill\n')
    const bin = join(require.resolve('skills/package.json'), '..', 'bin/cli.mjs')
    await exec(process.execPath, [bin, 'add', manual, '--agents', 'claude-code', '--yes', '--json'], { cwd, env })
    await writeProject(cwd, [])
    await sync(cwd, '--no-cleanup')
    await sync(cwd)
    await expect(lstat(join(cwd, '.agents/skills/remote-skill'))).rejects.toThrow()
    expect(await readFile(join(cwd, '.agents/skills/manual-skill/SKILL.md'), 'utf-8')).toContain('# Manual skill')
    expect(await readVercelLockNames(cwd)).toEqual(new Set(['manual-skill']))
    expect((await readSkillsLock(cwd))?.remote).toBeUndefined()
  })

  it('records the current requester instead of retaining its previous owner', async () => {
    const cwd = await createProject('new-requester')
    await writeProject(cwd, [])
    const pkg = join(cwd, 'node_modules', 'local-skills', 'package.json')
    await writeFile(pkg, JSON.stringify({ name: 'local-skills', version: '1.0.0', skills: [{ source, skills: ['remote-skill'] }] }))
    await sync(cwd, '--no-cleanup')
    expect((await readSkillsLock(cwd))?.remote).toEqual({ 'remote-skill': { package: 'local-skills', source } })
  })

  it('records a new whole-repository install over retained entries with the same name', async () => {
    const cwd = await createProject('new-ref')
    await writeProject(cwd, [{ source, ref: 'v2' }])
    await sync(cwd, '--no-cleanup')
    expect((await readSkillsLock(cwd))?.remote).toEqual({ 'remote-skill': { package: '.', source, ref: 'v2' } })
    expect(await readFile(join(cwd, '.agents/skills/remote-skill/SKILL.md'), 'utf-8')).toContain('# Remote skill')
  })
}, 60_000)
