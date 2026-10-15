import type { MigrateResult, ResolvedOptions } from './types'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { glob } from 'tinyglobby'
import { isMap, isScalar, parseDocument } from 'yaml'
import { SKILLS_NPM_LOCK_FILE } from './lock'
import { readPackageJson } from './package-json'
import { searchForWorkspaceRoot } from './utils/index'

const SYNC_COMMAND = 'skills experimental_sync'
// First release whose sync honors the `skills` field
const SKILLS_RANGE = '^1.7.2'

const WHITESPACE_RE = /\s+/

const SHARED_FLAGS = new Set(['--dry-run', '--no-cleanup', '--no-remote', '-r', '--recursive'])
const IMPLIED_FLAGS = new Set(['-y', '--yes', '--cleanup', '--remote'])
// skills-npm takes comma lists, sync takes space-separated values
const LIST_FLAGS: Record<string, string> = {
  '-a': '-a',
  '--agent': '-a',
  '--agents': '-a',
  '--include': '--include',
  '--exclude': '--exclude',
}
const UNSUPPORTED_VALUE_FLAGS = new Set(['--cwd', '-s', '--source'])

/**
 * Translate skills-npm sync arguments into `skills experimental_sync` ones.
 * `-y` is always added: sync prompts by default, which would block `prepare`.
 */
export function translateArgs(args: string[]): { args: string[], dropped: string[] } {
  const out = ['-y']
  const dropped: string[] = []
  for (let i = 0; i < args.length; i++) {
    const eq = args[i].indexOf('=')
    const [flag, inline] = args[i].startsWith('--') && eq > 0
      ? [args[i].slice(0, eq), args[i].slice(eq + 1)]
      : [args[i]]
    const value = (): string => inline ?? args[++i] ?? ''

    if (IMPLIED_FLAGS.has(flag))
      continue
    if (SHARED_FLAGS.has(flag))
      out.push(flag)
    else if (flag in LIST_FLAGS)
      out.push(LIST_FLAGS[flag], ...value().split(',').filter(Boolean))
    else if (UNSUPPORTED_VALUE_FLAGS.has(flag))
      dropped.push(`${flag} ${value()}`)
    else
      dropped.push(args[i])
  }
  return { args: out, dropped }
}

/**
 * Replace every `&&`-separated `skills-npm` command in a script, leaving the
 * other commands and their spacing untouched.
 */
export function migrateScript(script: string): { script: string, dropped: string[] } {
  const dropped: string[] = []
  const migrated = script.split('&&').map((segment) => {
    const body = segment.trim()
    const [command, ...args] = body.split(WHITESPACE_RE)
    if (command !== 'skills-npm')
      return segment
    const translated = translateArgs(args)
    dropped.push(...translated.dropped)
    return segment.replace(body, () => [SYNC_COMMAND, ...translated.args].join(' '))
  })
  return { script: migrated.join('&&'), dropped }
}

/**
 * Rename the `skills-npm` dependency to `skills` in place, keeping key order.
 * A `catalog:` specifier is kept so the catalog entry can be migrated instead.
 */
function migrateDependencies(deps: Record<string, string>): Record<string, string> {
  const spec = deps['skills-npm']
  const next = spec.startsWith('catalog:') ? spec : SKILLS_RANGE
  return Object.fromEntries(Object.entries(deps).flatMap(([name, value]) => {
    if (name !== 'skills-npm')
      return [[name, value]]
    return deps.skills ? [] : [['skills', next]]
  }))
}

/**
 * Replace `skills-npm` with `skills` in a pnpm-workspace.yaml catalog, keeping
 * comments and quoting. Returns the updated file, or `undefined` if untouched.
 */
export function migrateCatalog(source: string, catalog: string): string | undefined {
  const doc = parseDocument(source)
  const paths = catalog === 'default' ? [['catalog'], ['catalogs', 'default']] : [['catalogs', catalog]]
  const map = paths.map(path => doc.getIn(path)).find(isMap)
  if (!map?.has('skills-npm'))
    return

  if (map.has('skills')) {
    map.delete('skills-npm')
  }
  else {
    for (const pair of map.items) {
      if (isScalar(pair.key) && pair.key.value === 'skills-npm') {
        pair.key.value = 'skills'
        if (isScalar(pair.value))
          pair.value.value = SKILLS_RANGE
      }
    }
  }
  return doc.toString()
}

/**
 * Move a project from skills-npm to `skills experimental_sync`. The caller
 * reinstalls afterwards, which fetches `skills` and runs the new `prepare`.
 */
export async function migrateProject(options: ResolvedOptions): Promise<MigrateResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const packageJsonPath = join(cwd, 'package.json')

  if (!existsSync(packageJsonPath))
    throw new Error(`No package.json found at ${packageJsonPath}`)

  const { pkg, serialize } = await readPackageJson(packageJsonPath)
  const result: MigrateResult = {
    packageJsonPath,
    scripts: [],
    dependencyFields: [],
    lockRemoved: false,
    droppedFlags: [],
    configFiles: await glob('skills-npm.config.*', { cwd }),
  }

  const scripts = pkg.scripts ?? {}
  for (const [name, before] of Object.entries(scripts)) {
    const { script: after, dropped } = migrateScript(before)
    if (after === before)
      continue
    scripts[name] = after
    result.scripts.push({ name, before, after })
    result.droppedFlags.push(...dropped)
  }

  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field]
    const spec = deps?.['skills-npm']
    if (!deps || spec === undefined)
      continue
    pkg[field] = migrateDependencies(deps)
    result.dependencyFields.push(field)
    if (spec.startsWith('catalog:'))
      result.catalog = spec.slice('catalog:'.length) || 'default'
  }

  const workspacePath = join(cwd, 'pnpm-workspace.yaml')
  const workspace = result.catalog && existsSync(workspacePath)
    ? migrateCatalog(await readFile(workspacePath, 'utf-8'), result.catalog)
    : undefined
  if (!workspace)
    result.catalog = undefined

  const lockPath = join(cwd, SKILLS_NPM_LOCK_FILE)
  result.lockRemoved = existsSync(lockPath)

  if (options.dryRun)
    return result

  if (result.scripts.length > 0 || result.dependencyFields.length > 0)
    await writeFile(packageJsonPath, serialize(pkg), 'utf-8')
  if (workspace)
    await writeFile(workspacePath, workspace, 'utf-8')
  if (result.lockRemoved)
    await rm(lockPath)

  return result
}
