import type { NpmSkill, ScanOptions, ScanResult, SkillInvalidInfo } from './types.ts'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { getPackageManagerLockFileHash, isCacheUpToDate, readCache, writeCache } from './cache.ts'
import {
  createTargetName,
  getPackageDeps,
  getPackageVersion,
  hasValidSkillMd,
  isDirectoryOrSymlink,
  searchForPackagesRoot,
  searchForWorkspaceRoot,
} from './utils/index.ts'

export async function scanNodeModules(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())

  // Check cache first (unless force is enabled)
  if (!options.force) {
    const lockFileInfo = await getPackageManagerLockFileHash(cwd)
    if (lockFileInfo) {
      const lockfile = await readCache(cwd)
      if (lockfile && isCacheUpToDate(lockfile, lockFileInfo)) {
        // Lock file unchanged, use cached skills
        return {
          skills: lockfile.skills,
          skillsInvalid: lockfile.skillsInvalid,
          rootPaths: lockfile.rootPaths,
          packagesScanned: 0,
          fromCache: true,
        }
      }
    }
  }

  const result = options.recursive
    ? await scanNodeModulesRecursively(options)
    : await scanCurrentNodeModules(cwd, options.source)

  await saveCache(cwd, result)

  return result
}

export async function scanNodeModulesRecursively(options: ScanOptions): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const scanResult = {
    skills: new Map<string, NpmSkill>(),
    invalidSkills: new Map<string, SkillInvalidInfo>(),
    packagesScanned: 0,
  }

  const rootPaths = await searchForPackagesRoot(cwd)
  for (const dir of rootPaths) {
    const { skills, skillsInvalid, packagesScanned } = await scanCurrentNodeModules(
      dir,
      options.source,
    )

    skills.forEach((skill) => {
      if (!scanResult.skills.has(skill.packageName))
        scanResult.skills.set(skill.packageName, skill)
    })

    skillsInvalid.forEach((invalidSkill) => {
      if (!scanResult.invalidSkills.has(invalidSkill.packageName))
        scanResult.invalidSkills.set(invalidSkill.packageName, invalidSkill)
    })

    scanResult.packagesScanned += packagesScanned
  }

  return {
    skills: Array.from(scanResult.skills.values()),
    skillsInvalid: Array.from(scanResult.invalidSkills.values()),
    packagesScanned: scanResult.packagesScanned,
    rootPaths,
  }
}

export async function saveCache(cwd: string, result: ScanResult): Promise<void> {
  const lockFileInfo = await getPackageManagerLockFileHash(cwd)
  if (lockFileInfo) {
    await writeCache(cwd, {
      lockfile: lockFileInfo,
      skills: result.skills,
      skillsInvalid: result.skillsInvalid,
      rootPaths: result.rootPaths,
    })
  }
}

export async function scanCurrentNodeModules(cwd: string, source: ScanOptions['source'] = 'node_modules'): Promise<ScanResult> {
  const nodeModulesPath = join(cwd, 'node_modules')
  const allSkills: NpmSkill[] = []
  const allInvalidSkills: SkillInvalidInfo[] = []
  let packageCount = 0

  const packageNames = source === 'package.json' ? await getPackageDeps(cwd) : null

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

            const fullPackageName = `${entry.name}/${scopedEntry.name}`

            if (packageNames && !packageNames.includes(fullPackageName))
              continue

            packageCount++
            const { skills, skillsInvalid } = await scanPackageForSkills(nodeModulesPath, fullPackageName)
            allSkills.push(...skills)
            allInvalidSkills.push(...skillsInvalid)
          }
        }
        catch {
          // Scope directory not readable
        }
      }
      else {
        if (packageNames && !packageNames.includes(entry.name))
          continue

        packageCount++
        const { skills, skillsInvalid } = await scanPackageForSkills(nodeModulesPath, entry.name)
        allSkills.push(...skills)
        allInvalidSkills.push(...skillsInvalid)
      }
    }
  }
  catch {
    // The node_modules doesn't exist or isn't readable
  }

  return {
    skills: allSkills,
    skillsInvalid: allInvalidSkills,
    packagesScanned: packageCount,
    rootPaths: [cwd],
  }
}

export async function scanPackageForSkills(nodeModulesPath: string, packageName: string): Promise<{ skills: NpmSkill[], skillsInvalid: SkillInvalidInfo[] }> {
  const skills: NpmSkill[] = []
  const skillsInvalid: SkillInvalidInfo[] = []
  const packagePath = join(nodeModulesPath, packageName)
  const skillsDir = join(packagePath, 'skills')

  try {
    const skillsDirStats = await stat(skillsDir)
    if (!skillsDirStats.isDirectory())
      return { skills, skillsInvalid }

    const entries = await readdir(skillsDir, { withFileTypes: true })
    const packageVersion = await getPackageVersion(packageName, packagePath)

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const skillPath = join(skillsDir, entry.name)
      const skillInfo = await hasValidSkillMd(skillPath)

      if (skillInfo.valid) {
        skills.push({
          packageName,
          packageVersion,
          skillName: entry.name,
          skillPath,
          targetName: createTargetName(packageName, entry.name),
          name: skillInfo.name!,
          description: skillInfo.description!,
        })
      }
      else {
        skillsInvalid.push({
          packageName,
          packageVersion,
          skillName: entry.name,
          error: skillInfo.error || 'unknown_error',
        })
      }
    }
  }
  catch {
    // The skills/ directory doesn't exist or isn't readable
  }

  return { skills, skillsInvalid }
}
