import type {
  AgentType,
  CleanupResult,
  NpmSkill,
  SymlinkOptions,
  SymlinkResult,
} from './types'
import { lstat, mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { agents, getDetectedAgents } from './agents'
import { isWindows } from './constants'
import { searchForWorkspaceRoot } from './utils'

const MANAGED_TARGET_RE = /[\\/]node_modules[\\/].+[\\/]skills[\\/][^\\/]+[\\/]?$/

/**
 * Whether a symlink target is one skills-npm manages: a skill directory inside
 * node_modules. Ownership is derived from the target, not from the link name,
 * so committed links survive clones and no bookkeeping prefix is needed.
 */
export function isManagedTarget(resolvedTarget: string): boolean {
  return MANAGED_TARGET_RE.test(resolvedTarget)
}

type LinkOutcome
  = | { status: 'created' | 'skipped' }
    | { status: 'failed', error: string }

async function createSymlink(target: string, linkPath: string): Promise<LinkOutcome> {
  try {
    const resolvedTarget = resolve(target)
    const resolvedLinkPath = resolve(linkPath)

    // Don't create symlink to the same target
    if (resolvedTarget === resolvedLinkPath)
      return { status: 'created' }

    try {
      const stats = await lstat(linkPath)

      if (stats.isSymbolicLink()) {
        const existingTarget = await readlink(linkPath)
        const resolvedExisting = resolve(dirname(linkPath), existingTarget)

        // Symlink already exists and points to correct target
        if (resolvedExisting === resolvedTarget)
          return { status: 'created' }

        // A symlink we don't manage (e.g. created by the skills CLI or the
        // user) occupies the name: never replace foreign content.
        if (!isManagedTarget(resolvedExisting))
          return { status: 'skipped' }

        // Ours but pointing at the wrong skill, replace it
        await rm(linkPath)
      }
      else {
        // Real directory or file: not ours, leave it alone
        return { status: 'skipped' }
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

    const relativeTarget = relative(linkDir, resolvedTarget)

    if (!isWindows) {
      await symlink(relativeTarget, linkPath)
      return { status: 'created' }
    }

    // Windows: prefer a real symlink (committable by git; needs Developer
    // Mode or symlink privilege), fall back to a junction which git cannot
    // represent as a symlink.
    try {
      await symlink(relativeTarget, linkPath, 'dir')
      return { status: 'created' }
    }
    catch {
      await symlink(resolvedTarget, linkPath, 'junction')
      return { status: 'created' }
    }
  }
  catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : 'Failed to create symlink' }
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
    targetAgents = await getDetectedAgents()

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
        status: 'created',
      })
      continue
    }

    const outcome = await createSymlink(skill.skillPath, linkPath)
    results.push({
      skill,
      agent: agentType,
      targetPath: linkPath,
      status: outcome.status,
      error: outcome.status === 'failed'
        ? outcome.error
        : outcome.status === 'skipped'
          ? 'Skipped: existing content is not managed by skills-npm'
          : undefined,
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

/**
 * Remove symlinks that point into node_modules skill directories but are no
 * longer part of the resolved skill set. Only managed symlinks are ever
 * removed; real directories and foreign links are never touched. Legacy v1
 * `npm-*` links also target node_modules, so migration falls out of the same
 * rule.
 */
export async function cleanupStaleSkills(skills: NpmSkill[], options: SymlinkOptions = {}): Promise<CleanupResult[]> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const results: CleanupResult[] = []

  // Build set of valid target names from resolved skills
  const validTargetNames = new Set(skills.map(s => s.targetName))

  // Determine which agents to check
  let targetAgents: AgentType[]
  if (options.agents && options.agents.length > 0)
    targetAgents = options.agents as AgentType[]
  else
    targetAgents = await getDetectedAgents()

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

    for (const entry of entries) {
      if (validTargetNames.has(entry))
        continue

      const entryPath = join(agentSkillsDir, entry)

      let isStale = false
      try {
        const stats = await lstat(entryPath)
        if (stats.isSymbolicLink()) {
          const target = await readlink(entryPath)
          isStale = isManagedTarget(resolve(agentSkillsDir, target))
        }
      }
      catch {
        // Unreadable entry, leave it alone
      }

      if (!isStale)
        continue

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
        await rm(entryPath)
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
