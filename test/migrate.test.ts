import type { ResolvedOptions } from '../src/types'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateCatalog, migrateProject, migrateScript } from '../src/migrate'

describe('migrateScript', () => {
  it('replaces skills-npm with a non-interactive sync', () => {
    expect(migrateScript('skills-npm').script).toBe('skills experimental_sync -y')
  })

  it('leaves surrounding commands and spacing untouched', () => {
    expect(migrateScript('git config core.hooksPath .githooks && simple-git-hooks && skills-npm').script)
      .toBe('git config core.hooksPath .githooks && simple-git-hooks && skills experimental_sync -y')
    expect(migrateScript('husky&&  skills-npm  && echo ok').script).toBe('husky&&  skills experimental_sync -y  && echo ok')
  })

  it('does not touch scripts without skills-npm', () => {
    expect(migrateScript('my-skills-npm-wrapper build')).toEqual({ script: 'my-skills-npm-wrapper build', dropped: [] })
  })

  it('translates flags to their sync spelling', () => {
    expect(migrateScript('skills-npm --yes --agents cursor,claude-code --include=@acme/*,foo -r --no-remote').script)
      .toBe('skills experimental_sync -y -a cursor claude-code --include @acme/* foo -r --no-remote')
  })

  it('drops flags sync cannot honor and reports them', () => {
    expect(migrateScript('skills-npm -f --cwd packages/app --source node_modules --cleanup')).toEqual({
      script: 'skills experimental_sync -y',
      dropped: ['-f', '--cwd packages/app', '--source node_modules'],
    })
  })
})

describe('migrateCatalog', () => {
  it('renames the entry in a named catalog, keeping comments', () => {
    const source = 'catalogs:\n  agentic:\n    # skills\n    \'@antfu/skills\': ^0.1.0\n    skills-npm: ^4.0.0\n  cli:\n    eslint: ^10.0.0\n'
    expect(migrateCatalog(source, 'agentic'))
      .toBe('catalogs:\n  agentic:\n    # skills\n    \'@antfu/skills\': ^0.1.0\n    skills: ^1.7.2\n  cli:\n    eslint: ^10.0.0\n')
  })

  it('handles the default catalog', () => {
    expect(migrateCatalog('catalog:\n  skills-npm: ^4.0.0\n', 'default')).toBe('catalog:\n  skills: ^1.7.2\n')
  })

  it('drops the entry when the catalog already has skills', () => {
    expect(migrateCatalog('catalog:\n  skills: ^1.7.2\n  skills-npm: ^4.0.0\n', 'default')).toBe('catalog:\n  skills: ^1.7.2\n')
  })

  it('returns undefined when the catalog has no skills-npm', () => {
    expect(migrateCatalog('catalogs:\n  agentic:\n    skills: ^1.7.2\n', 'agentic')).toBeUndefined()
  })
})

describe('migrateProject', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'skills-npm-migrate-'))
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  function options(dryRun = false): ResolvedOptions {
    return { cwd, dryRun, agents: [], exclude: [] }
  }

  it('migrates scripts, dependency, catalog and lock file', async () => {
    await writeFile(join(cwd, 'package.json'), `${JSON.stringify({
      scripts: { prepare: 'simple-git-hooks && skills-npm' },
      devDependencies: { 'bumpp': '^1.0.0', 'skills-npm': 'catalog:agentic', 'tsx': '^4.0.0' },
    }, null, 2)}\n`)
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'catalogs:\n  agentic:\n    skills-npm: ^4.0.0\n')
    await writeFile(join(cwd, 'skills-npm-lock.json'), '{}')
    await writeFile(join(cwd, 'skills-npm.config.ts'), 'export default {}')

    const result = await migrateProject(options())

    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'))
    expect(pkg.scripts.prepare).toBe('simple-git-hooks && skills experimental_sync -y')
    expect(Object.entries(pkg.devDependencies)).toEqual([['bumpp', '^1.0.0'], ['skills', 'catalog:agentic'], ['tsx', '^4.0.0']])
    expect(await readFile(join(cwd, 'pnpm-workspace.yaml'), 'utf-8')).toBe('catalogs:\n  agentic:\n    skills: ^1.7.2\n')
    expect(existsSync(join(cwd, 'skills-npm-lock.json'))).toBe(false)
    expect(result.configFiles).toEqual(['skills-npm.config.ts'])
  })

  it('pins skills to a sync-capable range for a plain specifier', async () => {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { 'skills-npm': '^4.0.0' } }))

    await migrateProject(options())

    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'))
    expect(pkg.devDependencies).toEqual({ skills: '^1.7.2' })
  })

  it('changes nothing in dry-run mode', async () => {
    const pkg = JSON.stringify({ scripts: { prepare: 'skills-npm' }, devDependencies: { 'skills-npm': '^4.0.0' } })
    await writeFile(join(cwd, 'package.json'), pkg)
    await writeFile(join(cwd, 'skills-npm-lock.json'), '{}')

    const result = await migrateProject(options(true))

    expect(result.scripts).toEqual([{ name: 'prepare', before: 'skills-npm', after: 'skills experimental_sync -y' }])
    expect(result.lockRemoved).toBe(true)
    expect(await readFile(join(cwd, 'package.json'), 'utf-8')).toBe(pkg)
    expect(existsSync(join(cwd, 'skills-npm-lock.json'))).toBe(true)
  })
})
