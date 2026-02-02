export type { AgentConfig, AgentType, Skill } from '../vendor/skills/src/types.ts'

export interface CommandOptions {
  /**
   * current working directory (defaults to process.cwd())
   * @default process.cwd()
   */
  cwd?: string
  /**
   * target agents to install to (defaults to all detected agents)
   * @default all detected agents
   */
  agents?: string[]
  /**
   * skip updating .gitignore
   * @default true
   */
  gitignore?: boolean
  /**
   * skip confirmation prompts
   * @default false
   */
  yes?: boolean
  /**
   * dry run mode - don't make changes, just report what would be done
   * @default false
   */
  dryRun?: boolean
}

export interface NpmSkill {
  /**
   * npm package name
   */
  packageName: string
  /**
   * skill directory name inside the package's skills/ folder
   */
  skillName: string
  /**
   * absolute path to the skill directory
   */
  skillPath: string
  /**
   * target symlink name with npm- prefix (e.g., "npm-eslint-best-practices")
   */
  targetName: string
  /**
   * parsed skill metadata from SKILL.md
   */
  name: string
  description: string
}

export interface ScanOptions {
  /**
   * current working directory (defaults to process.cwd())
   * @default process.cwd()
   */
  cwd?: string
}

export interface ScanResult {
  /**
   * skills found in the scan
   */
  skills: NpmSkill[]
  /**
   * number of packages scanned
   */
  packageCount: number
}

export interface SymlinkOptions {
  /**
   * current working directory (defaults to process.cwd())
   * @default process.cwd()
   */
  cwd?: string
  /**
   * dry run mode - don't make changes, just report what would be done
   * @default false
   */
  dryRun?: boolean
  /**
   * target agents to install to (defaults to all detected agents)
   * @default all detected agents
   */
  agents?: string[]
}

export interface SymlinkResult {
  /**
   * skill to install
   */
  skill: NpmSkill
  /**
   * agent to install to
   */
  agent: string
  /**
   * symlink path to install to
   */
  targetPath: string
  /**
   * success flag
   */
  success: boolean
  /**
   * error message
   */
  error?: string
}
