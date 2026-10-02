import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const agentDirs = ['.agents/skills', '.claude/skills']
let dir: string

async function sync(...args: string[]) {
  return exec(process.execPath, [
    '--import',
    import.meta.resolve('tsx'),
    cli,
    '--cwd',
    dir,
    '--agents',
    'cursor,claude-code',
    '--yes',
    ...args,
  ], { env: { ...process.env, CI: '1', DISABLE_TELEMETRY: '1' } })
}

// Simulate an interactive terminal without depending on the host's installed
// agents or a platform-specific PTY library. Run the real CLI in the child.
async function syncWithoutDetectedAgents() {
  const preload = join(dir, 'interactive.mjs')
  await writeFile(preload, `
    import process from 'node:process'
    import { agents } from ${JSON.stringify(new URL('../src/agents.ts', import.meta.url).href)}
    Object.defineProperty(process.stdout, 'isTTY', { value: true })
    for (const agent of Object.values(agents))
      agent.detectInstalled = async () => false
  `)
  return exec(process.execPath, [
    '--import',
    import.meta.resolve('tsx'),
    '--import',
    pathToFileURL(preload).href,
    cli,
    '--cwd',
    dir,
    '--yes',
  ], {
    env: { PATH: '', SystemRoot: process.env.SystemRoot, CI: '1', DISABLE_TELEMETRY: '1' },
    timeout: 10_000,
  })
}

async function removeProvider() {
  await writeFile(join(dir, 'package.json'), '{"name":"consumer"}')
  await rm(join(dir, 'node_modules/provider'), { recursive: true })
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skills-npm-cleanup-'))
  const packageDir = join(dir, 'node_modules/provider')
  await mkdir(join(packageDir, 'skills/demo'), { recursive: true })
  await writeFile(join(dir, 'package.json'), '{"name":"consumer","dependencies":{"provider":"1.0.0"}}')
  await writeFile(join(packageDir, 'package.json'), '{"name":"provider","version":"1.0.0"}')
  await writeFile(join(packageDir, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: cleanup fixture\n---\n')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('cleanup with no discovered skills', () => {
  it('removes the final provider links and clears the lock while preserving user content', async () => {
    await sync()
    const ownDir = join(dir, '.agents/skills/manual')
    await mkdir(ownDir)
    await writeFile(join(ownDir, 'SKILL.md'), 'user content')
    await symlink(ownDir, join(dir, '.agents/skills/foreign'), 'junction')
    await removeProvider()

    await sync()

    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).rejects.toThrow()
    expect(JSON.parse(await readFile(join(dir, 'skills-npm-lock.json'), 'utf8'))).toEqual({ version: 3, skills: {} })
    expect(await readFile(join(ownDir, 'SKILL.md'), 'utf8')).toBe('user content')
    expect(await readFile(join(dir, '.agents/skills/foreign/SKILL.md'), 'utf8')).toBe('user content')
  })

  it('cleans the same agent targets when interactive --yes falls back to all agents', async () => {
    await syncWithoutDetectedAgents()
    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).resolves.toBeDefined()
    await removeProvider()

    await syncWithoutDetectedAgents()

    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).rejects.toThrow()
    expect(JSON.parse(await readFile(join(dir, 'skills-npm-lock.json'), 'utf8')).skills).toEqual({})
  })

  it('cleans links when the final skill is excluded', async () => {
    await sync()
    await sync('--exclude', 'provider')

    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).rejects.toThrow()
    expect(JSON.parse(await readFile(join(dir, 'skills-npm-lock.json'), 'utf8')).skills).toEqual({})
    await expect(lstat(join(dir, 'node_modules/provider/skills/demo/SKILL.md'))).resolves.toBeDefined()
  })

  it('cleans managed links even when the skills-npm lock is absent', async () => {
    await sync()
    await rm(join(dir, 'skills-npm-lock.json'))
    await removeProvider()

    await sync()

    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).rejects.toThrow()
  })

  it.each(['--no-cleanup', '--dry-run'])('preserves links and the lock with %s', async (flag) => {
    await sync()
    const lock = await readFile(join(dir, 'skills-npm-lock.json'), 'utf8')
    await removeProvider()

    await sync(flag)

    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir, 'demo'))).resolves.toBeDefined()
    expect(await readFile(join(dir, 'skills-npm-lock.json'), 'utf8')).toBe(lock)
  })

  it('clears a stale lock even if its links are already absent', async () => {
    await sync()
    for (const agentDir of agentDirs)
      await rm(join(dir, agentDir, 'demo'))
    await removeProvider()

    await sync()

    expect(JSON.parse(await readFile(join(dir, 'skills-npm-lock.json'), 'utf8')).skills).toEqual({})
  })

  it('keeps an empty project unchanged when interactive --yes finds no agents', async () => {
    await removeProvider()
    await syncWithoutDetectedAgents()

    await expect(lstat(join(dir, 'skills-npm-lock.json'))).rejects.toThrow()
    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir))).rejects.toThrow()
  })

  it('leaves a new empty project without a lock or agent directories', async () => {
    await removeProvider()
    await sync()

    await expect(lstat(join(dir, 'skills-npm-lock.json'))).rejects.toThrow()
    for (const agentDir of agentDirs)
      await expect(lstat(join(dir, agentDir))).rejects.toThrow()
  })
})
