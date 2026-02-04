import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { toArray } from '@antfu/utils'
import { glob } from 'tinyglobby'

export function isDirectoryOrSymlink(entry: {
  isDirectory: () => boolean
  isSymbolicLink: () => boolean
}): boolean {
  return entry.isDirectory() || entry.isSymbolicLink()
}

/**
 * Used for monorepo support to find all packages that may have their own node_modules
 */
export async function searchForPackagesRoot(current: string): Promise<string[]> {
  const patterns = [
    ...await getPnpmWorkspacePackages(current),
    ...await getWorkspacePackages(current),
  ]
  if (patterns.length === 0)
    return []

  return await glob(patterns, {
    cwd: current,
    absolute: true,
    onlyDirectories: true,
  })
}

async function readJSON(current: string): Promise<Record<string, any> | null> {
  const filepath = join(current, 'package.json')
  if (!existsSync(filepath))
    return null

  try {
    return JSON.parse(await readFile(filepath, 'utf-8'))
  }
  catch {
    return null
  }
}

export async function getWorkspacePackages(current: string): Promise<string[]> {
  const data = await readJSON(current)
  if (!data)
    return []
  return Array.isArray(data.workspaces) ? data.workspaces : []
}

export async function getPnpmWorkspacePackages(current: string): Promise<string[]> {
  const pnpmWorkspacePath = join(current, 'pnpm-workspace.yaml')
  if (!existsSync(pnpmWorkspacePath))
    return []

  const { parse } = await import('yaml')
  const content = await readFile(pnpmWorkspacePath, 'utf-8')
  const data = parse(content)
  return toArray(data.packages)
}

export async function getPackageDeps(current: string): Promise<string[]> {
  const filepath = join(current, 'package.json')
  if (!existsSync(filepath))
    return []

  const content = await readFile(filepath, 'utf-8')
  const data = JSON.parse(content)
  const deps = {
    ...data.dependencies,
    ...data.devDependencies,
  }
  return Object.keys(deps)
}

const packageVersionCache = new Map<string, string | undefined>()

export async function getPackageVersion(name: string, path: string): Promise<string | undefined> {
  if (packageVersionCache.has(name))
    return packageVersionCache.get(name)

  const data = await readJSON(path)
  const version = data?.version
  packageVersionCache.set(name, version)

  return version
}
