import type { AgentType } from '../vendor/skills/src/types'

export type { AgentConfig, AgentType, Skill } from '../vendor/skills/src/types'

/**
 * Filter item - either a package name (string) or an object specifying specific skills
 * Used by both include and exclude filters
 */
export type FilterItem
  = | string // package name to filter
    | { package: string, skills: string[] } // specific skills to filter from a package

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
   * Skip updating .gitignore
   * @default true
   */
  gitignore?: boolean
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
   * @default undefined (include all)
   */
  include?: FilterItem[]
  /**
   * Packages or skills to exclude from being installed
   * @default []
   */
  exclude?: FilterItem[]
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
   * Target symlink name with npm- prefix (e.g., "npm-eslint-best-practices")
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
}

export interface InvalidSkill {
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

export interface ScanResult {
  /**
   * Skills found in the scan
   */
  skills: NpmSkill[]
  /**
   * Invalid skills found in the scan
   */
  invalidSkills: InvalidSkill[]
  /**
   * Number of packages scanned
   */
  packageCount: number
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
   * Success flag
   */
  success: boolean
  /**
   * Error message
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
