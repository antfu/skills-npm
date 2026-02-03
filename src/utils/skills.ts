import type { FilterItem, FilterResult, NpmSkill } from '../types.ts'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

export async function hasValidSkillMd(dir: string): Promise<{ valid: boolean, name?: string, description?: string, error?: string }> {
  try {
    const skillMdPath = join(dir, 'SKILL.md')
    const stats = await stat(skillMdPath)
    if (!stats.isFile())
      return { valid: false, error: 'not_a_file' }

    const content = await readFile(skillMdPath, 'utf-8')
    const { data } = matter(content)

    if (!data.name || !data.description)
      return { valid: false, error: 'missing_fields' }

    return {
      valid: true,
      name: data.name,
      description: data.description,
    }
  }
  catch {
    return { valid: false, error: 'file_error' }
  }
}

function matchesFilter(skill: NpmSkill, options: FilterItem[]): boolean {
  for (const item of options) {
    if (typeof item === 'string') {
      if (skill.packageName === item)
        return true
    }
    else {
      if (
        skill.packageName === item.package
        && item.skills.includes(skill.skillName)
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * Filter skills by include/exclude options
 */
export function filterSkills(
  skills: NpmSkill[],
  options: FilterItem[] | undefined,
  shouldMatch: boolean,
): NpmSkill[] {
  if (!options || options.length === 0)
    return skills

  return skills.filter((skill) => {
    const matched = matchesFilter(skill, options)
    return shouldMatch ? matched : !matched
  })
}

/**
 * Apply include and exclude filters to skills
 */
export function processSkills(
  skills: NpmSkill[],
  include: FilterItem[] = [],
  exclude: FilterItem[] = [],
): FilterResult {
  const includedSkills = filterSkills(skills, include, true)
  const excludedSkills = filterSkills(includedSkills, exclude, false)

  return {
    skills: excludedSkills,
    excludedCount: skills.length - excludedSkills.length,
  }
}
