import type { NpmSkill, SkillsNpmLock } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SKILLS_NPM_LOCK_FILE = 'skills-npm-lock.json'
export const SKILLS_NPM_LOCK_VERSION = 1

/**
 * The vercel-labs/skills CLI's committed lock file. Read-only for us: names
 * listed there are explicitly installed skills and always win over npm ones.
 */
export const VERCEL_LOCK_FILE = 'skills-lock.json'

/**
 * Skill names explicitly installed via the vercel-labs/skills CLI.
 * Tolerant read: missing or malformed lock yields an empty set.
 */
export async function readVercelLockNames(cwd: string): Promise<Set<string>> {
  try {
    const content = await readFile(join(cwd, VERCEL_LOCK_FILE), 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.skills && typeof parsed.skills === 'object')
      return new Set(Object.keys(parsed.skills))
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

export function createSkillsLock(skills: NpmSkill[]): SkillsNpmLock {
  const sorted = [...skills].sort((a, b) => a.targetName.localeCompare(b.targetName))
  const entries = Object.fromEntries(sorted.map(skill => [
    skill.targetName,
    { package: skill.packageName, skillFolder: skill.skillName },
  ]))
  return { version: SKILLS_NPM_LOCK_VERSION, skills: entries }
}

/**
 * Write `skills-npm-lock.json` reflecting the current resolved skill set.
 * Returns whether the file was (or would be) changed.
 */
export async function writeSkillsLock(cwd: string, skills: NpmSkill[], dryRun = false): Promise<boolean> {
  const lock = createSkillsLock(skills)
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
