// Re-export types from vendor
export type { AgentConfig, AgentType, Skill } from '../vendor/skills/src/types.ts'

export interface NpmSkill {
  /** npm package name (e.g., "eslint" or "@antfu/eslint-config") */
  packageName: string
  /** Skill directory name inside the package's skills/ folder */
  skillName: string
  /** Absolute path to the skill directory */
  skillPath: string
  /** Target symlink name with npm- prefix (e.g., "npm-eslint-best-practices") */
  targetName: string
  /** Parsed skill metadata from SKILL.md */
  name: string
  description: string
}

export interface ScanOptions {
  /** Current working directory (defaults to process.cwd()) */
  cwd?: string
}

export interface SymlinkOptions {
  /** Current working directory (defaults to process.cwd()) */
  cwd?: string
  /** Dry run mode - don't make changes, just report what would be done */
  dryRun?: boolean
  /** Target agents to install to (defaults to all detected agents) */
  agents?: string[]
}

export interface SymlinkResult {
  skill: NpmSkill
  agent: string
  targetPath: string
  success: boolean
  error?: string
}
