import type { InstalledPackage, NpmSkill, PackageManagerLockfileInfo, ScanOptions, ScanResult, SkillInvalidInfo } from './types'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { CACHE_VERSION, getPackageManagerLockFileHash, isCacheUpToDate, readCache, writeCache } from './cache'
import {
  getPackageDeps,
  getPackageVersion,
  hasValidSkillMd,
  isDirectoryOrSymlink,
  sanitizeSkillName,
  searchForPackagesRoot,
  searchForWorkspaceRoot,
} from './utils'

export async function scanNodeModules(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())

  let lockFileInfo: PackageManagerLockfileInfo | null = null
  // Check cache first (unless force is enabled)
  if (!options.force) {
    lockFileInfo = await getPackageManagerLockFileHash(cwd)
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

  if (lockFileInfo)
    await saveCache(cwd, result, lockFileInfo)

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

export async function saveCache(cwd: string, result: ScanResult, lockFileInfo: PackageManagerLockfileInfo): Promise<void> {
  await writeCache(cwd, {
    version: CACHE_VERSION,
    lockfile: lockFileInfo,
    skills: result.skills,
    skillsInvalid: result.skillsInvalid,
    rootPaths: result.rootPaths,
  })
}

/**
 * Packages installed under `<cwd>/node_modules`: every hoisted one, or only
 * the root package.json's dependencies when `source` is `package.json`.
 */
export async function listInstalledPackages(cwd: string, source: ScanOptions['source'] = 'node_modules'): Promise<InstalledPackage[]> {
  const nodeModulesPath = join(cwd, 'node_modules')
  const packageNames = source === 'package.json' ? await getPackageDeps(cwd) : null
  const packages: InstalledPackage[] = []

  const add = (name: string): void => {
    if (!packageNames || packageNames.includes(name))
      packages.push({ name, path: join(nodeModulesPath, name) })
  }

  try {
    const entries = await readdir(nodeModulesPath, { withFileTypes: true })

    for (const entry of entries) {
      // pnpm installs packages as symlinks
      if (!isDirectoryOrSymlink(entry) || entry.name.startsWith('.'))
        continue

      if (entry.name.startsWith('@')) {
        try {
          const scopedEntries = await readdir(join(nodeModulesPath, entry.name), { withFileTypes: true })
          for (const scopedEntry of scopedEntries) {
            if (isDirectoryOrSymlink(scopedEntry))
              add(`${entry.name}/${scopedEntry.name}`)
          }
        }
        catch {
          // Scope directory not readable
        }
      }
      else {
        add(entry.name)
      }
    }
  }
  catch {
    // The node_modules doesn't exist or isn't readable
  }

  return packages
}

export async function scanCurrentNodeModules(cwd: string, source: ScanOptions['source'] = 'node_modules'): Promise<ScanResult> {
  const allSkills: NpmSkill[] = []
  const allInvalidSkills: SkillInvalidInfo[] = []

  const packages = await listInstalledPackages(cwd, source)
  for (const pkg of packages) {
    const { skills, skillsInvalid } = await scanPackageForSkills(pkg.path, pkg.name)
    allSkills.push(...skills)
    allInvalidSkills.push(...skillsInvalid)
  }

  return {
    skills: allSkills,
    skillsInvalid: allInvalidSkills,
    packagesScanned: packages.length,
    rootPaths: [cwd],
  }
}

export async function scanPackageForSkills(packagePath: string, packageName: string): Promise<{ skills: NpmSkill[], skillsInvalid: SkillInvalidInfo[] }> {
  const skills: NpmSkill[] = []
  const skillsInvalid: SkillInvalidInfo[] = []
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
          targetName: sanitizeSkillName(skillInfo.name!),
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
