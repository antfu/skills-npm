import type {
  AgentType,
  CleanupResult,
  NpmSkill,
  SymlinkOptions,
  SymlinkResult,
} from './types'
import { lstat, mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises'
import { platform } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { agents, detectInstalledAgents } from './agents'
import { searchForWorkspaceRoot } from './utils'

async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target)
    const resolvedLinkPath = resolve(linkPath)

    // Don't create symlink to the same target
    if (resolvedTarget === resolvedLinkPath)
      return true

    try {
      const stats = await lstat(linkPath)

      if (stats.isSymbolicLink()) {
        // Check if existing symlink points to correct target
        const existingTarget = await readlink(linkPath)
        const resolvedExisting = resolve(dirname(linkPath), existingTarget)

        if (resolvedExisting === resolvedTarget) {
          // Symlink already exists and points to correct target
          return true
        }

        // Symlink exists but points to wrong target, remove it
        await rm(linkPath)
      }
      else {
        // Not a symlink, remove it
        await rm(linkPath, { recursive: true })
      }
    }
    catch (err: unknown) {
      // Handle ELOOP (circular symlink) or ENOENT (doesn't exist)
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ELOOP') {
        try {
          await rm(linkPath, { force: true })
        }
        catch {
          // If we can't remove it, symlink creation will fail
        }
      }
      // ENOENT is expected if link doesn't exist, continue to create
    }

    // Create parent directory if needed
    const linkDir = dirname(linkPath)
    await mkdir(linkDir, { recursive: true })

    // Create relative symlink
    const relativePath = relative(linkDir, target)
    const symlinkType = platform() === 'win32' ? 'junction' : undefined

    await symlink(relativePath, linkPath, symlinkType)
    return true
  }
  catch {
    return false
  }
}

export async function symlinkSkill(skill: NpmSkill, options: SymlinkOptions = {}): Promise<SymlinkResult[]> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const results: SymlinkResult[] = []

  // Determine which agents to install to
  let targetAgents: AgentType[]
  if (options.agents && options.agents.length > 0)
    targetAgents = options.agents as AgentType[]
  else
    targetAgents = await detectInstalledAgents()

  for (const agentType of targetAgents) {
    const agent = agents[agentType]
    if (!agent)
      continue

    // Create symlink in agent's skills directory
    const agentSkillsDir = join(cwd, agent.skillsDir)
    const linkPath = join(agentSkillsDir, skill.targetName)

    if (options.dryRun) {
      results.push({
        skill,
        agent: agentType,
        targetPath: linkPath,
        success: true,
      })
      continue
    }

    const success = await createSymlink(skill.skillPath, linkPath)
    results.push({
      skill,
      agent: agentType,
      targetPath: linkPath,
      success,
      error: success ? undefined : 'Failed to create symlink',
    })
  }

  return results
}

export async function symlinkSkills(skills: NpmSkill[], options: SymlinkOptions = {}): Promise<SymlinkResult[]> {
  const allResults: SymlinkResult[] = []

  for (const skill of skills) {
    const results = await symlinkSkill(skill, options)
    allResults.push(...results)
  }

  return allResults
}

export async function cleanupStaleSkills(skills: NpmSkill[], options: SymlinkOptions = {}): Promise<CleanupResult[]> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const results: CleanupResult[] = []

  // Build set of valid target names from discovered skills
  const validTargetNames = new Set(skills.map(s => s.targetName))

  // Determine which agents to check
  let targetAgents: AgentType[]
  if (options.agents && options.agents.length > 0)
    targetAgents = options.agents as AgentType[]
  else
    targetAgents = await detectInstalledAgents()

  for (const agentType of targetAgents) {
    const agent = agents[agentType]
    if (!agent)
      continue

    const agentSkillsDir = join(cwd, agent.skillsDir)

    // Read entries in the agent's skills directory
    let entries: string[]
    try {
      entries = await readdir(agentSkillsDir)
    }
    catch {
      // Directory doesn't exist, nothing to clean
      continue
    }

    // Find npm-* entries that are not in the valid set
    const staleEntries = entries.filter(entry => entry.startsWith('npm-') && !validTargetNames.has(entry))

    for (const entry of staleEntries) {
      const entryPath = join(agentSkillsDir, entry)

      if (options.dryRun) {
        results.push({
          agent: agentType,
          targetName: entry,
          targetPath: entryPath,
          success: true,
        })
        continue
      }

      try {
        await rm(entryPath, { recursive: true, force: true })
        results.push({
          agent: agentType,
          targetName: entry,
          targetPath: entryPath,
          success: true,
        })
      }
      catch (err) {
        results.push({
          agent: agentType,
          targetName: entry,
          targetPath: entryPath,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove stale skill',
        })
      }
    }
  }

  return results
}
