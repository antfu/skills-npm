import type { NpmSkill, ScanOptions } from './types.ts'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import matter from 'gray-matter'

/**
 * Convert a package name to a safe directory name
 * - Removes @ prefix from scoped packages
 * - Replaces / with -
 * - Converts to lowercase
 */
export function sanitizePackageName(packageName: string): string {
  return packageName
    .replace(/^@/, '') // Remove @ prefix
    .replace(/\//g, '-') // Replace / with -
    .toLowerCase()
}

/**
 * Create the target symlink name for a skill
 * Format: npm-<sanitized-package-name>-<skill-name>
 */
export function createTargetName(packageName: string, skillName: string): string {
  const sanitizedPackage = sanitizePackageName(packageName)
  return `npm-${sanitizedPackage}-${skillName}`
}

/**
 * Check if a directory contains a valid SKILL.md file
 */
async function hasValidSkillMd(dir: string): Promise<{ valid: boolean, name?: string, description?: string }> {
  try {
    const skillMdPath = join(dir, 'SKILL.md')
    const stats = await stat(skillMdPath)
    if (!stats.isFile())
      return { valid: false }

    const content = await readFile(skillMdPath, 'utf-8')
    const { data } = matter(content)

    if (!data.name || !data.description)
      return { valid: false }

    return {
      valid: true,
      name: data.name,
      description: data.description,
    }
  }
  catch {
    return { valid: false }
  }
}

/**
 * Scan a single package for skills
 */
async function scanPackageForSkills(
  nodeModulesPath: string,
  packageName: string,
): Promise<NpmSkill[]> {
  const skills: NpmSkill[] = []
  const packagePath = join(nodeModulesPath, packageName)
  const skillsDir = join(packagePath, 'skills')

  try {
    const skillsDirStats = await stat(skillsDir)
    if (!skillsDirStats.isDirectory())
      return skills

    const entries = await readdir(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const skillPath = join(skillsDir, entry.name)
      const skillInfo = await hasValidSkillMd(skillPath)

      if (skillInfo.valid) {
        skills.push({
          packageName,
          skillName: entry.name,
          skillPath,
          targetName: createTargetName(packageName, entry.name),
          name: skillInfo.name!,
          description: skillInfo.description!,
        })
      }
    }
  }
  catch {
    // skills/ directory doesn't exist or isn't readable
  }

  return skills
}

export interface ScanResult {
  skills: NpmSkill[]
  packageCount: number
}

/**
 * Check if a dirent is a directory (or symlink to a directory)
 * pnpm uses symlinks in node_modules, so we need to check both
 */
function isDirectoryOrSymlink(entry: { isDirectory: () => boolean, isSymbolicLink: () => boolean }): boolean {
  return entry.isDirectory() || entry.isSymbolicLink()
}

/**
 * Scan node_modules for packages that contain skills
 * Only scans first-level packages (not nested dependencies)
 */
export async function scanNodeModules(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd || process.cwd()
  const nodeModulesPath = join(cwd, 'node_modules')
  const allSkills: NpmSkill[] = []
  let packageCount = 0

  try {
    const entries = await readdir(nodeModulesPath, { withFileTypes: true })

    for (const entry of entries) {
      // Check for directory or symlink (pnpm uses symlinks)
      if (!isDirectoryOrSymlink(entry))
        continue

      // Skip hidden directories and common non-package directories
      if (entry.name.startsWith('.'))
        continue

      // Handle scoped packages (@org/package)
      if (entry.name.startsWith('@')) {
        const scopePath = join(nodeModulesPath, entry.name)
        try {
          const scopedEntries = await readdir(scopePath, { withFileTypes: true })
          for (const scopedEntry of scopedEntries) {
            if (!isDirectoryOrSymlink(scopedEntry))
              continue
            packageCount++
            const fullPackageName = `${entry.name}/${scopedEntry.name}`
            const skills = await scanPackageForSkills(nodeModulesPath, fullPackageName)
            allSkills.push(...skills)
          }
        }
        catch {
          // Scope directory not readable
        }
      }
      else {
        // Regular package
        packageCount++
        const skills = await scanPackageForSkills(nodeModulesPath, entry.name)
        allSkills.push(...skills)
      }
    }
  }
  catch {
    // node_modules doesn't exist or isn't readable
  }

  return { skills: allSkills, packageCount }
}
