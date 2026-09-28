import type { InstalledPackage, NpmSkill, PackageManagerLockfileInfo, ScanCacheKey, ScanOptions, ScanResult, SkillInvalidInfo } from './types'
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
  const scanKey: ScanCacheKey = {
    source: options.source ?? 'node_modules',
    recursive: options.recursive ?? false,
  }

  let lockFileInfo: PackageManagerLockfileInfo | null = null
  // Check cache first (unless force is enabled)
  if (!options.force) {
    lockFileInfo = await getPackageManagerLockFileHash(cwd)
    if (lockFileInfo) {
      const lockfile = await readCache(cwd)
      if (lockfile && isCacheUpToDate(lockfile, lockFileInfo, scanKey)) {
        // Lock file and scan options unchanged, use cached skills
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
    await saveCache(cwd, result, lockFileInfo, scanKey)

  return result
}

export async function scanNodeModulesRecursively(options: ScanOptions): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const scanResult = {
    skills: new Map<string, NpmSkill>(),
    invalidSkills: new Map<string, SkillInvalidInfo>(),
    packagesScanned: 0,
  }

  // The same package can be installed under several workspace node_modules;
  // keep its first occurrence but never collapse distinct skills of one package.
  const rootPaths = [...new Set([cwd, ...await searchForPackagesRoot(cwd)])]
  for (const dir of rootPaths) {
    const { skills, skillsInvalid, packagesScanned } = await scanCurrentNodeModules(
      dir,
      options.source,
    )

    skills.forEach((skill) => {
      const key = `${skill.packageName}/${skill.targetName}`
      if (!scanResult.skills.has(key))
        scanResult.skills.set(key, skill)
    })

    skillsInvalid.forEach((invalidSkill) => {
      const key = `${invalidSkill.packageName}/${invalidSkill.skillName}`
      if (!scanResult.invalidSkills.has(key))
        scanResult.invalidSkills.set(key, invalidSkill)
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

export async function saveCache(cwd: string, result: ScanResult, lockFileInfo: PackageManagerLockfileInfo, scan: ScanCacheKey): Promise<void> {
  await writeCache(cwd, {
    version: CACHE_VERSION,
    lockfile: lockFileInfo,
    scan,
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

/**
 * Where a package may ship skills, mirroring `skills experimental_sync`: a
 * single-skill package has `SKILL.md` at its root; otherwise each skill is a
 * subdirectory of one of these folders. A skill name seen in an earlier folder
 * wins over the same name in a later one (source vs. built copies).
 */
const SKILL_DIRS = ['skills', 'dist/skills', '.agents/skills']

export async function scanPackageForSkills(packagePath: string, packageName: string): Promise<{ skills: NpmSkill[], skillsInvalid: SkillInvalidInfo[] }> {
  const skills: NpmSkill[] = []
  const skillsInvalid: SkillInvalidInfo[] = []
  let packageVersion: string | undefined

  // `folder` is undefined for a root SKILL.md, which has no directory of its own
  const visit = async (skillPath: string, skillFile: string, folder?: string): Promise<void> => {
    const skillInfo = await hasValidSkillMd(skillPath)
    packageVersion ??= await getPackageVersion(packageName, packagePath)

    if (!skillInfo.valid) {
      skillsInvalid.push({ packageName, packageVersion, skillName: folder ?? skillFile, error: skillInfo.error || 'unknown_error' })
      return
    }

    const targetName = sanitizeSkillName(skillInfo.name!)
    if (skills.some(skill => skill.targetName === targetName))
      return

    skills.push({
      packageName,
      packageVersion,
      skillName: folder ?? targetName,
      skillPath,
      skillFile,
      targetName,
      name: skillInfo.name!,
      description: skillInfo.description!,
    })
  }

  if (await isFile(join(packagePath, 'SKILL.md'))) {
    await visit(packagePath, 'SKILL.md')
    return { skills, skillsInvalid }
  }

  for (const dir of SKILL_DIRS) {
    let entries
    try {
      entries = await readdir(join(packagePath, dir), { withFileTypes: true })
    }
    catch {
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory())
        await visit(join(packagePath, dir, entry.name), `${dir}/${entry.name}/SKILL.md`, entry.name)
    }
  }

  return { skills, skillsInvalid }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  }
  catch {
    return false
  }
}
