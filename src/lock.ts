import type { NpmSkill, RemoteSkill, SkillsNpmLock, SkillsNpmLockRemoteEntry } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sanitizeSkillName } from './utils/package'

export const SKILLS_NPM_LOCK_FILE = 'skills-npm-lock.json'
export const SKILLS_NPM_LOCK_VERSION = 2

/**
 * The vercel-labs/skills CLI's committed lock file. Read-only for us: names
 * listed there are explicitly installed skills and always win over npm ones.
 */
export const VERCEL_LOCK_FILE = 'skills-lock.json'

/**
 * Skill names explicitly installed via the vercel-labs/skills CLI, in install
 * (sanitized) form: the lock is keyed by the raw frontmatter name.
 * Tolerant read: missing or malformed lock yields an empty set.
 */
export async function readVercelLockNames(cwd: string): Promise<Set<string>> {
  try {
    const content = await readFile(join(cwd, VERCEL_LOCK_FILE), 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.skills && typeof parsed.skills === 'object')
      return new Set(Object.keys(parsed.skills).map(sanitizeSkillName))
  }
  catch {
    // No lock file or unreadable JSON
  }
  return new Set()
}

export async function readSkillsLock(cwd: string): Promise<SkillsNpmLock | null> {
  try {
    const content = await readFile(join(cwd, SKILLS_NPM_LOCK_FILE), 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed.version === 'number' && parsed.skills && typeof parsed.skills === 'object')
      return parsed
  }
  catch {
    // No lock file or unreadable JSON
  }
  return null
}

function sortedEntries<T, E>(items: T[], name: (item: T) => string, entry: (item: T) => E): Record<string, E> {
  return Object.fromEntries(
    [...items]
      .sort((a, b) => name(a).localeCompare(name(b)))
      .map(item => [name(item), entry(item)]),
  )
}

export function createSkillsLock(skills: NpmSkill[], remote: RemoteSkill[] = []): SkillsNpmLock {
  const lock: SkillsNpmLock = {
    version: SKILLS_NPM_LOCK_VERSION,
    skills: sortedEntries(skills, s => s.targetName, s => ({
      package: s.packageName,
      skillFolder: s.skillName,
      ...(s.via ? { via: s.via } : {}),
    })),
  }
  if (remote.length > 0) {
    lock.remote = sortedEntries(remote, r => r.name, (r): SkillsNpmLockRemoteEntry => ({
      package: r.package,
      source: r.source,
      ...(r.ref ? { ref: r.ref } : {}),
    }))
  }
  return lock
}

/**
 * Write `skills-npm-lock.json` reflecting the current resolved skill set.
 * Returns whether the file was (or would be) changed.
 */
export async function writeSkillsLock(cwd: string, skills: NpmSkill[], remote: RemoteSkill[] = [], dryRun = false): Promise<boolean> {
  const lock = createSkillsLock(skills, remote)
  const content = `${JSON.stringify(lock, null, 2)}\n`
  const path = join(cwd, SKILLS_NPM_LOCK_FILE)

  try {
    const existing = await readFile(path, 'utf-8')
    if (existing === content)
      return false
  }
  catch {
    // File doesn't exist yet
  }

  if (!dryRun)
    await writeFile(path, content, 'utf-8')
  return true
}
