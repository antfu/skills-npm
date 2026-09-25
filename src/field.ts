import type { InstalledPackage, NpmRequest, NpmSkill, RemoteRequest, SkillsFieldEntry, SkillsFieldRequests } from './types'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { listInstalledPackages, scanPackageForSkills } from './scan'

const NPM_PREFIX = 'npm:'
const LOCAL_PATH_RE = /^(?:\.{1,2}(?:[\\/]|$)|[\\/~]|[a-z]:[\\/])/i
// owner/repo@skill (never a URL or scp-style git address: those contain ':')
const SHORTHAND_SKILL_RE = /^([^/@:\s]+\/[^/@:\s]+)@([^/@\s]+)$/

/**
 * Whether a source string names a git-hosted repository the `skills` CLI can
 * clone, as opposed to a local path or a plain download URL. Mirrors the CLI's
 * own `looksLikeGitSource` so the two agree on what is "remote".
 */
function isGitSource(source: string): boolean {
  if (/^(?:github:|gitlab:|git@|ssh:\/\/|git:\/\/)/.test(source))
    return true

  if (/^https?:\/\//i.test(source)) {
    let url: URL
    try {
      url = new URL(source)
    }
    catch {
      return false
    }
    return /(?:^|\.)(?:github|gitlab)\.com$/.test(url.hostname)
      || /\.git(?:$|[/?])/i.test(url.pathname)
      || url.pathname.split('/').includes('_git')
  }

  return !source.includes(':') && /^[^/]+\/[^/]+(?:\/.+)?$/.test(source)
}

function parseRemote(entry: Exclude<SkillsFieldEntry, string>, pkg: string): RemoteRequest {
  let source = entry.source
  let ref = entry.ref
  const skills = [...(entry.skills ?? [])]

  const hash = source.indexOf('#')
  if (hash >= 0) {
    if (ref !== undefined)
      throw new Error(`${pkg}: "${entry.source}" already carries a ref; remove the "ref" field`)
    const fragment = source.slice(hash + 1)
    source = source.slice(0, hash)
    const at = fragment.indexOf('@')
    ref = at >= 0 ? fragment.slice(0, at) : fragment
    if (at >= 0)
      skills.push(fragment.slice(at + 1))
  }
  else if (ref !== undefined && /\/(?:-\/)?tree\//.test(source)) {
    throw new Error(`${pkg}: "${entry.source}" already carries a ref in its path; remove the "ref" field`)
  }

  const shorthand = SHORTHAND_SKILL_RE.exec(source)
  if (shorthand) {
    source = shorthand[1]
    skills.push(shorthand[2])
  }

  if (LOCAL_PATH_RE.test(source))
    throw new Error(`${pkg}: local path "${entry.source}" is not allowed in the "skills" field; ship the skill in a skills/ directory instead`)
  if (!isGitSource(source))
    throw new Error(`${pkg}: "${entry.source}" is not a git-hosted source; only GitHub, GitLab and git URLs are supported`)

  return { package: pkg, source, ref, skills }
}

export function parseSkillsFieldEntry(raw: SkillsFieldEntry, pkg: string, packagePath: string): RemoteRequest | NpmRequest {
  const entry = typeof raw === 'string' ? { source: raw } : raw

  if (entry.source.startsWith(NPM_PREFIX)) {
    if (entry.ref !== undefined)
      throw new Error(`${pkg}: "ref" cannot be used with the npm source "${entry.source}"`)
    return { package: pkg, packagePath, target: entry.source.slice(NPM_PREFIX.length), skills: entry.skills ?? [] }
  }

  return parseRemote(entry, pkg)
}

function isSkillsFieldEntry(value: unknown): value is SkillsFieldEntry {
  if (typeof value === 'string')
    return true
  if (!value || typeof value !== 'object' || typeof (value as { source?: unknown }).source !== 'string')
    return false
  const { skills, ref } = value as { skills?: unknown, ref?: unknown }
  return (skills === undefined || (Array.isArray(skills) && skills.every(s => typeof s === 'string')))
    && (ref === undefined || typeof ref === 'string')
}

async function readPackageJson(packagePath: string): Promise<{ name?: string, skills?: unknown } | null> {
  try {
    return JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf-8'))
  }
  catch {
    return null
  }
}

async function readEntries(pkg: InstalledPackage, into: SkillsFieldRequests, strict: boolean): Promise<void> {
  const data = await readPackageJson(pkg.path)
  if (data?.skills === undefined)
    return
  if (!Array.isArray(data.skills)) {
    // a dependency may use the key for something else; only our own is an error
    if (strict)
      throw new Error(`${pkg.name}: the "skills" field must be an array`)
    return
  }

  for (const raw of data.skills) {
    if (!isSkillsFieldEntry(raw))
      throw new Error(`${pkg.name}: invalid "skills" entry ${JSON.stringify(raw)}`)
    const request = parseSkillsFieldEntry(raw, pkg.name, pkg.path)
    if ('target' in request)
      into.npm.push(request)
    else
      into.remote.push(request)
  }
}

/**
 * Collect `skills` field entries from the project at `dir` and from the same
 * installed packages the `skills/` directory scan honors. `rootName` is how
 * the project's own entries are attributed (`.` for the working directory).
 */
export async function readSkillsFieldRequests(dir: string, source: 'node_modules' | 'package.json', rootName?: string): Promise<SkillsFieldRequests> {
  const requests: SkillsFieldRequests = { remote: [], npm: [] }

  const root = await readPackageJson(dir)
  await readEntries({ name: rootName ?? root?.name ?? '.', path: dir }, requests, true)

  for (const pkg of await listInstalledPackages(dir, source))
    await readEntries(pkg, requests, false)

  return requests
}

/**
 * Node's node_modules lookup (realpath, then walk up) without the `exports`
 * restriction, which would hide package.json for packages that don't export it.
 */
async function findInstalledPackage(from: string, name: string): Promise<string | undefined> {
  let dir = await realpath(from).catch(() => from)
  while (true) {
    const candidate = join(dir, 'node_modules', name)
    if (await stat(join(candidate, 'package.json')).then(s => s.isFile(), () => false))
      return candidate
    const parent = dirname(dir)
    if (parent === dir)
      return undefined
    dir = parent
  }
}

/**
 * Turn `npm:` requests into skills found under the target package's `skills/`
 * directory, resolved from the declaring package so pnpm's isolated layout
 * works. Skills already discovered by the scan are left to the scan (no `via`).
 */
export async function resolveNpmRequests(requests: NpmRequest[], scanned: NpmSkill[]): Promise<NpmSkill[]> {
  const known = new Set(scanned.map(s => `${s.packageName}/${s.skillName}`))
  const resolved: NpmSkill[] = []

  for (const request of requests) {
    const packagePath = await findInstalledPackage(request.packagePath, request.target)
    if (!packagePath)
      throw new Error(`${request.package}: cannot resolve "npm:${request.target}"; list it in the dependencies of ${request.package}`)

    const { skills } = await scanPackageForSkills(packagePath, request.target)
    for (const skill of skills) {
      const wanted = request.skills.length === 0
        || request.skills.includes(skill.skillName)
        || request.skills.includes(skill.targetName)
      const key = `${skill.packageName}/${skill.skillName}`
      if (!wanted || known.has(key))
        continue
      known.add(key)
      resolved.push({ ...skill, via: request.package })
    }
  }

  return resolved
}
