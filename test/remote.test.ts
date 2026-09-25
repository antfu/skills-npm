import type { RemoteRequest, SkillsCliRunner } from '../src/types'
import { describe, expect, it } from 'vitest'
import { addArgs, installRemote, planRemote, removeArgs, removeRemote } from '../src/remote'

function request(pkg: string, source: string, skills: string[] = [], ref?: string): RemoteRequest {
  return { package: pkg, source, ref, skills }
}

const empty = { vercelLockNames: new Set<string>(), previous: {}, vendoredNames: new Set<string>(), directDeps: new Set<string>() }

describe('planRemote', () => {
  it('groups requests that share a source into one install', () => {
    const plan = planRemote([
      request('.', 'owner/repo', ['a']),
      request('pack', 'owner/repo', ['b', 'a']),
      request('pack', 'other/repo', ['c']),
    ], empty)

    expect(plan.installs).toEqual([
      expect.objectContaining({ source: 'owner/repo', skills: ['a', 'b'] }),
      expect.objectContaining({ source: 'other/repo', skills: ['c'] }),
    ])
    expect(plan.skipped).toEqual([])
  })

  it('keeps sources with different refs apart and a whole-repo request swallows the names', () => {
    const plan = planRemote([
      request('.', 'owner/repo', ['a'], 'v1'),
      request('pack', 'owner/repo', ['a'], 'v2'),
    ], { ...empty, directDeps: new Set(['pack']) })
    // both direct with different sources: tie, nobody wins
    expect(plan.installs).toEqual([])
    expect(plan.skipped.map(s => s.reason)).toEqual(['name-conflict', 'name-conflict'])

    const whole = planRemote([request('.', 'owner/repo', ['a']), request('pack', 'owner/repo')], empty)
    expect(whole.installs).toEqual([expect.objectContaining({ source: 'owner/repo', skills: [] })])
  })

  it('skips a name shipped in an npm package or installed by hand', () => {
    const plan = planRemote([
      request('pack', 'owner/repo', ['vendored', 'manual', 'fresh']),
    ], { ...empty, vendoredNames: new Set(['vendored']), vercelLockNames: new Set(['manual']) })

    expect(plan.installs).toEqual([expect.objectContaining({ skills: ['fresh'] })])
    expect(plan.skipped).toEqual([
      expect.objectContaining({ name: 'vendored', reason: 'vendored' }),
      expect.objectContaining({ name: 'manual', reason: 'vercel-lock' }),
    ])
  })

  it('lets a direct dependency win over a transitive one on the same name', () => {
    const plan = planRemote([
      request('direct', 'a/repo', ['x']),
      request('transitive', 'b/repo', ['x']),
    ], { ...empty, directDeps: new Set(['direct']) })

    expect(plan.installs).toEqual([expect.objectContaining({ source: 'a/repo', skills: ['x'] })])
    expect(plan.skipped).toEqual([
      expect.objectContaining({ name: 'x', package: 'transitive', reason: 'name-conflict', conflictsWith: ['direct'] }),
    ])
  })

  it('does not refetch a name the previous lock shows installed from the same source', () => {
    const previous = { x: { package: 'pack', source: 'owner/repo', ref: 'v1' } }
    const same = planRemote([request('pack', 'owner/repo', ['X'], 'v1')], { ...empty, previous, vercelLockNames: new Set(['x']) })
    expect(same.installs).toEqual([])
    expect(same.installed).toEqual([{ name: 'x', package: 'pack', source: 'owner/repo', ref: 'v1' }])

    const newRef = planRemote([request('pack', 'owner/repo', ['x'], 'v2')], { ...empty, previous, vercelLockNames: new Set(['x']) })
    expect(newRef.installs).toHaveLength(1)

    const filesGone = planRemote([request('pack', 'owner/repo', ['x'], 'v1')], { ...empty, previous })
    expect(filesGone.installs).toHaveLength(1)

    const forced = planRemote([request('pack', 'owner/repo', ['x'], 'v1')], { ...empty, previous, vercelLockNames: new Set(['x']), force: true })
    expect(forced.installs).toHaveLength(1)
  })

  it('treats a whole-repo request as installed when every recorded name still is', () => {
    const previous = {
      a: { package: 'pack', source: 'owner/repo' },
      b: { package: 'pack', source: 'owner/repo' },
    }
    const done = planRemote([request('pack', 'owner/repo')], { ...empty, previous, vercelLockNames: new Set(['a', 'b']) })
    expect(done.installs).toEqual([])
    expect(done.installed.map(s => s.name)).toEqual(['a', 'b'])

    const partial = planRemote([request('pack', 'owner/repo')], { ...empty, previous, vercelLockNames: new Set(['a']) })
    expect(partial.installs).toHaveLength(1)
  })
})

describe('cli arguments', () => {
  it('builds add and remove invocations the skills CLI accepts', () => {
    expect(addArgs({ source: 'owner/repo', ref: 'v1', skills: ['a', 'b'], requests: [] }, ['claude-code', 'cursor']))
      .toEqual(['add', 'owner/repo#v1', '--skill', 'a', 'b', '-a', 'claude-code', 'cursor', '-y', '--json'])
    expect(addArgs({ source: 'owner/repo', skills: [], requests: [] }, ['cursor']))
      .toEqual(['add', 'owner/repo', '-a', 'cursor', '-y', '--json'])
    expect(removeArgs(['a', 'b'])).toEqual(['remove', 'a', 'b', '-y'])
  })
})

describe('installRemote', () => {
  const install = { source: 'owner/repo', skills: [], requests: [request('pack', 'owner/repo')] }

  it('records installed skills under their install name, attributed to the requester', async () => {
    const calls: string[][] = []
    const run: SkillsCliRunner = async (args) => {
      calls.push(args)
      return { exitCode: 0, stderr: '', stdout: JSON.stringify([{ name: 'X Skill', status: 'installed' }, { name: 'y', status: 'installed' }]) }
    }

    const skills = await installRemote([install], ['cursor'], '/proj', run)
    expect(calls).toEqual([['add', 'owner/repo', '-a', 'cursor', '-y', '--json']])
    expect(skills).toEqual([
      { name: 'x-skill', package: 'pack', source: 'owner/repo', ref: undefined },
      { name: 'y', package: 'pack', source: 'owner/repo', ref: undefined },
    ])
  })

  it('attributes a named skill to the request that named it, however spelled', async () => {
    const run: SkillsCliRunner = async () => ({ exitCode: 0, stderr: '', stdout: JSON.stringify([{ name: 'X Skill', status: 'installed' }]) })
    const grouped = { source: 'owner/repo', skills: ['x-skill'], requests: [request('other', 'owner/repo', ['y']), request('pack', 'owner/repo', ['x-skill'])] }
    expect(await installRemote([grouped], ['cursor'], '/proj', run)).toEqual([
      { name: 'x-skill', package: 'pack', source: 'owner/repo', ref: undefined },
    ])
  })

  it('fails on a non-zero exit with the CLI stderr', async () => {
    const run: SkillsCliRunner = async () => ({ exitCode: 1, stdout: '', stderr: 'noise\nfatal: repository not found' })
    await expect(installRemote([install], ['cursor'], '/proj', run)).rejects.toThrow(/exited with code 1[\s\S]*repository not found/)
  })

  it('fails when a skill is skipped or failed', async () => {
    const run: SkillsCliRunner = async () => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([{ name: 'x', status: 'skipped', reason: 'missing-agent-project-directory' }]),
    })
    await expect(installRemote([install], ['cursor'], '/proj', run)).rejects.toThrow(/x skipped \(missing-agent-project-directory\)/)
  })
})

describe('removeRemote', () => {
  it('does nothing for an empty list and surfaces failures', async () => {
    const calls: string[][] = []
    const run: SkillsCliRunner = async (args) => {
      calls.push(args)
      return { exitCode: 1, stdout: '', stderr: 'boom' }
    }
    await removeRemote([], '/proj', run)
    expect(calls).toEqual([])
    await expect(removeRemote(['x'], '/proj', run)).rejects.toThrow(/boom/)
  })
})
