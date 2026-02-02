import type { AgentType } from '../vendor/skills/src/types.ts'
import type { NpmSkill, SymlinkOptions, SymlinkResult } from './types.ts'
import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { platform } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { agents, detectInstalledAgents } from '../vendor/skills/src/agents.ts'

async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target)
    const resolvedLinkPath = resolve(linkPath)

    // Don't create symlink to the same target
    if (resolvedTarget === resolvedLinkPath)
      return true

    try {
      const stats = await lstat(linkPath)
      if (!stats.isSymbolicLink())
        await rm(linkPath, { recursive: true })

      const existingTarget = await readlink(linkPath)
      const resolvedExisting = resolve(dirname(linkPath), existingTarget)

      if (resolvedExisting === resolvedTarget)
        return true

      await rm(linkPath)
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
  const cwd = options.cwd || process.cwd()
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
