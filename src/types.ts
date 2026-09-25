import type { AgentType } from '../vendor/skills/src/types'

export type { AgentConfig, AgentType, Skill } from '../vendor/skills/src/types'

/**
 * Filter item - either a package name/pattern (string) or an object specifying specific skills
 * Used by both include and exclude filters
 */
export type FilterItem
  = | string // package name or wildcard pattern to filter
    | { package: string, skills: string[] } // specific skills to filter from a package name or pattern

export interface CommandOptions {
  /**
   * Current working directory (defaults to workspace root)
   * @default searchForWorkspaceRoot(process.cwd())
   */
  cwd?: string
  /**
   * Target agents to install to (defaults to all detected agents)
   * @default all detected agents
   */
  agents?: AgentType | AgentType[]
  /**
   * Source to discover skills from
   * @default 'node_modules'
   */
  source?: 'node_modules' | 'package.json'
  /**
   * Whether to scan recursively for monorepo packages (defaults to false)
   * @default false
   */
  recursive?: boolean
  /**
   * Skip confirmation prompts
   * @default false
   */
  yes?: boolean
  /**
   * Dry run mode - don't make changes, just report what would be done
   * @default false
   */
  dryRun?: boolean
  /**
   * Packages or skills to include (only these will be installed)
   * Supports package wildcard patterns like "@some/*"
   * @default undefined (include all)
   */
  include?: FilterItem[]
  /**
   * Packages or skills to exclude from being installed
   * Supports package wildcard patterns like "@some/*"
   * @default []
   */
  exclude?: FilterItem[]
  /**
   * Force full reload, ignore cache
   * @default false
   */
  force?: boolean
  /**
   * Clean up stale skills-npm symlinks from agent directories
   * @default true
   */
  cleanup?: boolean
}

export interface ResolvedOptions extends Omit<CommandOptions, 'agents'> {
  agents: AgentType[]
}

export interface NpmSkill {
  /**
   * NPM package name
   */
  packageName: string
  /**
   * NPM package version
   */
  packageVersion?: string
  /**
   * Skill directory name inside the package's skills/ folder
   */
  skillName: string
  /**
   * Absolute path to the skill directory
   */
  skillPath: string
  /**
   * Symlink name: the frontmatter `name` sanitized the same way the
   * vercel-labs/skills CLI sanitizes install names (e.g., "presenter-mode")
   */
  targetName: string
  /**
   * Parsed skill metadata from SKILL.md
   */
  name: string
  /**
   * Parsed skill description from SKILL.md
   */
  description: string
}

export interface ScanOptions {
  /**
   * Current working directory (defaults to workspace root)
   * @default searchForWorkspaceRoot(process.cwd())
   */
  cwd?: string
  /**
   * Source to discover packages from
   * @default 'node_modules'
   */
  source?: 'node_modules' | 'package.json'
  /**
   * Whether to scan recursively for monorepo packages (defaults to false)
   * @default false
   */
  recursive?: boolean
  /**
   * Force full reload, ignore cache
   * @default false
   */
  force?: boolean
}

export interface SkillInvalidInfo {
  /**
   * NPM package name
   */
  packageName: string
  /**
   * NPM package version
   */
  packageVersion?: string
  /**
   * Skill directory name
   */
  skillName: string
  /**
   * Error describing why the skill is invalid
   */
  error: string
}

export interface ScanResultBase {
  /**
   * Skills found in the scan
   */
  skills: NpmSkill[]
  /**
   * Invalid skills found in the scan
   */
  skillsInvalid: SkillInvalidInfo[]
  /**
   * Root paths scanned
   */
  rootPaths: string[]
}

export interface ScanResult extends ScanResultBase {
  /**
   * Number of packages scanned
   */
  packagesScanned: number

  /**
   * Whether the result was loaded from cache
   */
  fromCache?: boolean
}

export interface PackageManagerLockfileInfo {
  /**
   * Hash of the package manager lockfile
   */
  hash: string
  /**
   * Path to the package manager lockfile
   */
  path: string
}

export interface SkillsNpmCache extends ScanResultBase {
  /**
   * Cache format version; caches from other versions are discarded
   */
  version: number
  /**
   * Package manager lockfile information
   */
  lockfile: PackageManagerLockfileInfo
}

export interface SkillsNpmLockEntry {
  /**
   * NPM package the skill ships in
   */
  package: string
  /**
   * Skill directory name inside the package's skills/ folder
   */
  skillFolder: string
}

/**
 * Committed manifest of skills managed by skills-npm (`skills-npm-lock.json`).
 * Descriptive output of the last sync, keyed by sanitized skill name.
 */
export interface SkillsNpmLock {
  version: number
  skills: Record<string, SkillsNpmLockEntry>
}

export type SkipReason
  = | 'vercel-lock' // name is declared in skills-lock.json (explicit install wins)
    | 'name-conflict' // same name provided by multiple packages with no clear winner

export interface SkippedSkill {
  skill: NpmSkill
  reason: SkipReason
  /**
   * For name conflicts: the other packages providing the same name
   */
  conflictsWith?: string[]
}

export interface SymlinkOptions {
  /**
   * Current working directory (defaults to workspace root)
   * @default searchForWorkspaceRoot(process.cwd())
   */
  cwd?: string
  /**
   * Dry run mode - don't make changes, just report what would be done
   * @default false
   */
  dryRun?: boolean
  /**
   * Target agents to install to (defaults to all detected agents)
   * @default all detected agents
   */
  agents?: AgentType[]
}

export interface SymlinkResult {
  /**
   * Skill to install
   */
  skill: NpmSkill
  /**
   * Agent to install to
   */
  agent: string
  /**
   * Symlink path to install to
   */
  targetPath: string
  /**
   * Outcome: `skipped` means the destination holds content skills-npm does not
   * manage (a real directory, or a symlink not pointing into node_modules)
   */
  status: 'created' | 'skipped' | 'failed'
  /**
   * Error or skip message
   */
  error?: string
}

export interface CleanupResult {
  /**
   * Agent the stale skill was cleaned from
   */
  agent: string
  /**
   * Target name of the stale skill
   */
  targetName: string
  /**
   * Full path to the removed entry
   */
  targetPath: string
  /**
   * Whether the removal was successful
   */
  success: boolean
  /**
   * Error message if removal failed
   */
  error?: string
}

export interface FilterResult {
  /**
   * Skills that matched the filters
   */
  skills: NpmSkill[]
  /**
   * Number of skills filtered out
   */
  excludedCount: number
}

export interface SetupResult {
  /**
   * Absolute path to the package.json that was (or would be) edited
   */
  packageJsonPath: string
  /**
   * Outcome of wiring the `prepare` script
   */
  prepare: {
    /**
     * Whether the prepare script was (or would be) changed
     */
    changed: boolean
    /**
     * The previous prepare script value, if any
     */
    before?: string
    /**
     * The resulting prepare script value
     */
    after: string
  }
}
