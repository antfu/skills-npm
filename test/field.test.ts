import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSkillsFieldEntry, readSkillsFieldRequests, resolveNpmRequests } from '../src/field'
import { scanCurrentNodeModules } from '../src/scan'

const fixture = join(import.meta.dirname, 'fixtures/skills-field')

describe('parseSkillsFieldEntry', () => {
  const parse = (entry: Parameters<typeof parseSkillsFieldEntry>[0]): ReturnType<typeof parseSkillsFieldEntry> =>
    parseSkillsFieldEntry(entry, 'pack', '/pack')

  it('parses a bare repository', () => {
    expect(parse('owner/repo')).toEqual({ package: 'pack', source: 'owner/repo', ref: undefined, skills: [] })
  })

  it('splits the owner/repo@skill shorthand', () => {
    expect(parse('owner/repo@my-skill')).toMatchObject({ source: 'owner/repo', skills: ['my-skill'] })
  })

  it('splits a #ref and #ref@skill fragment', () => {
    expect(parse('owner/repo#v1.2.0')).toMatchObject({ source: 'owner/repo', ref: 'v1.2.0', skills: [] })
    expect(parse('owner/repo#v1.2.0@my-skill')).toMatchObject({ source: 'owner/repo', ref: 'v1.2.0', skills: ['my-skill'] })
  })

  it('accepts git URLs untouched', () => {
    for (const source of [
      'https://github.com/owner/repo/tree/main/skills/x',
      'https://gitlab.com/group/sub/repo/-/tree/main/x',
      'git@github.com:owner/repo.git',
      'https://git.example.com/owner/repo.git',
      'github:owner/repo',
    ]) {
      expect(parse(source)).toMatchObject({ source, skills: [] })
    }
  })

  it('reads the object form', () => {
    expect(parse({ source: 'owner/repo', skills: ['a', 'b'], ref: 'v2' }))
      .toEqual({ package: 'pack', source: 'owner/repo', ref: 'v2', skills: ['a', 'b'] })
  })

  it('rejects a ref given twice', () => {
    expect(() => parse({ source: 'owner/repo#v1', ref: 'v2' })).toThrow(/already carries a ref/)
    expect(() => parse({ source: 'https://github.com/o/r/tree/main/x', ref: 'v2' })).toThrow(/already carries a ref/)
  })

  it('rejects local paths', () => {
    for (const source of ['./skills/x', '../x', '/abs/x', 'C:\\x', '.'])
      expect(() => parse(source)).toThrow(/local path/)
  })

  it('rejects non-git HTTP sources', () => {
    expect(() => parse('https://skills.sh/p/abc')).toThrow(/not a git-hosted source/)
    expect(() => parse('https://example.com/skills/index.json')).toThrow(/not a git-hosted source/)
  })

  it('parses npm: entries and forbids a ref on them', () => {
    expect(parse('npm:@vueuse/skills')).toEqual({ package: 'pack', packagePath: '/pack', target: '@vueuse/skills', skills: [] })
    expect(parse({ source: 'npm:@vueuse/skills', skills: ['x'] })).toMatchObject({ target: '@vueuse/skills', skills: ['x'] })
    expect(() => parse({ source: 'npm:@vueuse/skills', ref: 'v1' })).toThrow(/ref/)
  })
})

describe('readSkillsFieldRequests', () => {
  it('collects root and direct dependency fields under source package.json', async () => {
    const { remote, npm } = await readSkillsFieldRequests(fixture, 'package.json', '.')

    expect(remote).toEqual([
      { package: '.', source: 'owner/root-repo', ref: undefined, skills: ['root-skill'] },
      { package: '@acme/pack', source: 'vercel-labs/agent-skills', ref: 'v1.4.0', skills: ['web-design-guidelines'] },
      { package: '@acme/pack', source: 'owner/repo', ref: 'v2', skills: ['a', 'b'] },
    ])
    expect(npm).toEqual([
      { package: '@acme/pack', packagePath: join(fixture, 'node_modules/@acme/pack'), target: '@acme/vendored', skills: [] },
    ])
  })

  it('also honors transitive packages under source node_modules', async () => {
    const { remote } = await readSkillsFieldRequests(fixture, 'node_modules', '.')
    expect(remote.map(r => r.package)).toContain('transitive-pack')
  })

  it('ignores a dependency whose skills key is not an array', async () => {
    const { remote } = await readSkillsFieldRequests(fixture, 'node_modules', '.')
    expect(remote.map(r => r.package)).not.toContain('odd-field')
  })

  it('attributes the root field to the package name when no root name is given', async () => {
    const { remote } = await readSkillsFieldRequests(fixture, 'package.json')
    expect(remote[0].package).toBe('test-skills-field')
  })
})

describe('resolveNpmRequests', () => {
  it('resolves the target from the declaring package and tags the skill with via', async () => {
    const { npm } = await readSkillsFieldRequests(fixture, 'package.json', '.')
    const skills = await resolveNpmRequests(npm, [])

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      packageName: '@acme/vendored',
      skillName: 'vendored-skill',
      targetName: 'vendored-skill',
      via: '@acme/pack',
      skillPath: join(fixture, 'node_modules/@acme/pack/node_modules/@acme/vendored/skills/vendored-skill'),
    })
  })

  it('narrows to the requested skills', async () => {
    const request = { package: '@acme/pack', packagePath: join(fixture, 'node_modules/@acme/pack'), target: '@acme/vendored', skills: ['other'] }
    expect(await resolveNpmRequests([request], [])).toEqual([])
  })

  it('leaves skills the scan already found to the scan', async () => {
    const { npm } = await readSkillsFieldRequests(fixture, 'package.json', '.')
    const { skills: scanned } = await scanCurrentNodeModules(fixture, 'package.json')
    const alreadyDirect = { ...scanned[0], packageName: '@acme/vendored', skillName: 'vendored-skill' }
    expect(await resolveNpmRequests(npm, [alreadyDirect])).toEqual([])
  })

  it('fails when the target is not installed', async () => {
    const request = { package: '@acme/pack', packagePath: join(fixture, 'node_modules/@acme/pack'), target: 'missing-pkg', skills: [] }
    await expect(resolveNpmRequests([request], [])).rejects.toThrow(/cannot resolve "npm:missing-pkg"/)
  })
})
