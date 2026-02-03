import type { InvalidSkill, NpmSkill, ScanOptions, ScanResult } from './types.ts'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import {
  createTargetName,
  hasValidSkillMd,
  isDirectoryOrSymlink,
  searchForWorkspaceRoot,
} from './utils/index'

/**
 * Scan node_modules for packages that contain skills
 * Only scans first-level packages (not nested dependencies)
 */
export async function scanNodeModules(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const nodeModulesPath = join(cwd, 'node_modules')
  const allSkills: NpmSkill[] = []
  const allInvalidSkills: InvalidSkill[] = []
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
            const { skills, invalidSkills } = await scanPackageForSkills(nodeModulesPath, fullPackageName)
            allSkills.push(...skills)
            allInvalidSkills.push(...invalidSkills)
          }
        }
        catch {
          // Scope directory not readable
        }
      }
      else {
        packageCount++
        const { skills, invalidSkills } = await scanPackageForSkills(nodeModulesPath, entry.name)
        allSkills.push(...skills)
        allInvalidSkills.push(...invalidSkills)
      }
    }
  }
  catch {
    // The node_modules doesn't exist or isn't readable
  }

  return { skills: allSkills, invalidSkills: allInvalidSkills, packageCount }
}

export async function scanPackageForSkills(nodeModulesPath: string, packageName: string): Promise<{ skills: NpmSkill[], invalidSkills: InvalidSkill[] }> {
  const skills: NpmSkill[] = []
  const invalidSkills: InvalidSkill[] = []
  const packagePath = join(nodeModulesPath, packageName)
  const skillsDir = join(packagePath, 'skills')

  try {
    const skillsDirStats = await stat(skillsDir)
    if (!skillsDirStats.isDirectory())
      return { skills, invalidSkills }

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
      else {
        invalidSkills.push({
          packageName,
          skillName: entry.name,
          error: skillInfo.error || 'unknown_error',
        })
      }
    }
  }
  catch {
    // The skills/ directory doesn't exist or isn't readable
  }

  return { skills, invalidSkills }
}
