export {
  gitignoreExists,
  hasGitignorePattern,
  updateGitignore,
} from './gitignore.ts'

export {
  createTargetName,
  sanitizePackageName,
  scanNodeModules,
} from './scan.ts'

export type { ScanResult } from './scan.ts'

export {
  getAllAgentTypes,
  getDetectedAgents,
  symlinkSkill,
  symlinkSkills,
} from './symlink.ts'

export type {
  AgentConfig,
  AgentType,
  NpmSkill,
  ScanOptions,
  Skill,
  SymlinkOptions,
  SymlinkResult,
} from './types.ts'
