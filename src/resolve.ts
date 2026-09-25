import type { NpmSkill, SkippedSkill } from './types'

export interface ResolveConflictsInput {
  /**
   * Skill names declared in the vercel-labs/skills CLI's skills-lock.json.
   * Explicitly installed skills always win, even when their link is missing.
   */
  vercelLockNames: Set<string>
  /**
   * Direct dependency names from the root package.json. A direct dependency
   * beats transitive ones when the same skill name comes from several packages.
   */
  directDeps: Set<string>
}

export interface ResolveConflictsResult {
  resolved: NpmSkill[]
  skipped: SkippedSkill[]
}

/**
 * Apply the conflict priority ladder to the discovered skills:
 *
 * 1. A name in skills-lock.json is skipped (explicit install wins).
 * 2. Among packages providing the same name, a single direct dependency wins
 *    over transitive ones.
 * 3. Any remaining tie skips every contender; the user resolves it via
 *    include/exclude.
 */
export function resolveConflicts(skills: NpmSkill[], input: ResolveConflictsInput): ResolveConflictsResult {
  const resolved: NpmSkill[] = []
  const skipped: SkippedSkill[] = []

  const byName = new Map<string, NpmSkill[]>()
  for (const skill of skills) {
    if (input.vercelLockNames.has(skill.targetName)) {
      skipped.push({ skill, reason: 'vercel-lock' })
      continue
    }
    const group = byName.get(skill.targetName) ?? []
    group.push(skill)
    byName.set(skill.targetName, group)
  }

  for (const group of byName.values()) {
    if (group.length === 1) {
      resolved.push(group[0])
      continue
    }

    const direct = group.filter(skill => input.directDeps.has(skill.packageName))
    if (direct.length === 1) {
      resolved.push(direct[0])
      const winner = direct[0]
      for (const skill of group) {
        if (skill !== winner)
          skipped.push({ skill, reason: 'name-conflict', conflictsWith: [winner.packageName] })
      }
      continue
    }

    const packages = group.map(skill => skill.packageName)
    for (const skill of group) {
      skipped.push({
        skill,
        reason: 'name-conflict',
        conflictsWith: packages.filter(name => name !== skill.packageName),
      })
    }
  }

  return { resolved, skipped }
}
