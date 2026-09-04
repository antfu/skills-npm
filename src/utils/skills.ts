import type { FilterItem, FilterResult, NpmSkill } from '../types'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { getPatternRegex, hasWildcard } from './pattern'

// Only a plain `---` fenced YAML block is treated as frontmatter. A language
// tag after the opening fence (e.g. `---js`) is deliberately not matched, so a
// SKILL.md can never trigger code execution at parse time.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function readSkillFrontmatter(content: string): { name?: string, description?: string } {
  const match = FRONTMATTER_RE.exec(content)
  if (!match)
    return {}

  const data = parseYaml(match[1])
  if (!data || typeof data !== 'object')
    return {}

  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
  }
}

export async function hasValidSkillMd(dir: string): Promise<{ valid: boolean, name?: string, description?: string, error?: string }> {
  try {
    const skillMdPath = join(dir, 'SKILL.md')
    const stats = await stat(skillMdPath)
    if (!stats.isFile())
      return { valid: false, error: 'not_a_file' }

    const content = await readFile(skillMdPath, 'utf-8')
    const { name, description } = readSkillFrontmatter(content)

    if (!name || !description)
      return { valid: false, error: 'missing_fields' }

    return { valid: true, name, description }
  }
  catch {
    return { valid: false, error: 'file_error' }
  }
}

function matchesPackagePattern(packageName: string, pattern: string): boolean {
  if (!hasWildcard(pattern))
    return packageName === pattern
  return getPatternRegex(pattern).test(packageName)
}

function matchesFilter(skill: NpmSkill, options: FilterItem[]): boolean {
  for (const item of options) {
    if (typeof item === 'string') {
      if (matchesPackagePattern(skill.packageName, item))
        return true
    }
    else {
      if (
        matchesPackagePattern(skill.packageName, item.package)
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
