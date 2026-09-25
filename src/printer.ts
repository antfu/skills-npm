/* eslint-disable no-console */
import type { AgentType, CleanupResult, NpmSkill, RemoteInstall, ResolvedOptions, SetupResult, SkillInvalidInfo, SkippedRemote, SkippedSkill, SymlinkResult } from './types'
import * as p from '@clack/prompts'
import c from 'picocolors'
import { GRAYS, isTTY, LOGO_LINES, RESET } from './constants'
import { addArgs, removeArgs } from './remote'

function formatStatus(success: boolean): string {
  return success ? c.green('✓') : c.red('✗')
}

function formatArrow(): string {
  return c.yellow('→')
}

export function printLogo(): void {
  console.log()
  LOGO_LINES.forEach((line, i) => console.log(`${GRAYS[i]}${line}${RESET}`))
  console.log()
}

function formatPackageMeta(packageName: string, packageVersion?: string): string {
  return packageVersion ? `${packageName}@${packageVersion}` : packageName
}

export function printSkills(skills: NpmSkill[]): void {
  if (isTTY) {
    for (const skill of skills) {
      const pkg = formatPackageMeta(skill.packageName, skill.packageVersion)
      console.log(`  ${c.green('●')} ${c.bold(skill.name)} ${c.dim(`from ${pkg}`)}`)
      console.log(`    ${c.dim(skill.description)}`)
    }
  }
  else {
    for (const skill of skills) {
      const pkg = formatPackageMeta(skill.packageName, skill.packageVersion)
      console.log(`  - ${skill.name} (${pkg})`)
    }
  }
}

export function printInvalidSkills(invalidSkills: SkillInvalidInfo[]): void {
  if (isTTY) {
    p.log.info('Invalid skills skipped:')
    for (const invalid of invalidSkills) {
      const pkg = formatPackageMeta(invalid.packageName, invalid.packageVersion)
      console.log(`  ${c.yellow('⚠')} ${c.dim(`${pkg}/${invalid.skillName}`)}`)
      console.log(`    ${c.dim(`Error: ${invalid.error}`)}`)
    }
  }
  else {
    console.log('Invalid skills skipped:')
    for (const invalid of invalidSkills) {
      const pkg = formatPackageMeta(invalid.packageName, invalid.packageVersion)
      console.log(`  - ${pkg}/${invalid.skillName}: ${invalid.error}`)
    }
  }
}

export function printSymlinkResults(results: SymlinkResult[], options: ResolvedOptions): void {
  const agentsResult = new Map<string, SymlinkResult[]>()
  for (const result of results) {
    const agentResults = agentsResult.get(result.agent) || []
    agentResults.push(result)
    agentsResult.set(result.agent, agentResults)
  }

  for (const [agent, agentResults] of agentsResult) {
    const skills = agentResults.map((result) => {
      const status = result.status === 'skipped'
        ? c.yellow('⊘')
        : formatStatus(result.status === 'created')
      const prefix = options.dryRun ? formatArrow() : status
      return `${prefix} ${result.skill.targetName}`
    }).join(', ')

    console.log(`  ${c.bold(agent)}: ${skills}`)
    if (!isTTY)
      return

    const errors = agentResults.filter(r => r.status !== 'created' && r.error)
    for (const result of errors) {
      const color = result.status === 'skipped' ? c.yellow : c.red
      console.log(`    ${color(result.error)}`)
    }
  }
}

export function printSkippedSkills(skipped: SkippedSkill[]): void {
  if (skipped.length === 0)
    return

  const header = 'Skipped skills:'
  if (isTTY)
    p.log.warn(header)
  else
    console.warn(header)

  for (const { skill, reason, conflictsWith } of skipped) {
    const detail = reason === 'vercel-lock'
      ? 'explicitly installed via skills-lock.json'
      : `name conflict with ${conflictsWith?.join(', ') || 'another package'}`
    if (isTTY) {
      console.log(`  ${c.yellow('⊘')} ${c.bold(skill.targetName)} ${c.dim(`from ${skill.packageName}`)}`)
      console.log(`    ${c.dim(detail)}`)
    }
    else {
      console.warn(`  - ${skill.targetName} (${skill.packageName}): ${detail}`)
    }
  }
}

const SKIP_DETAILS: Record<SkippedRemote['reason'], (skipped: SkippedRemote) => string> = {
  'vercel-lock': () => 'already in skills-lock.json but not installed by skills-npm',
  'vendored': () => 'a skill shipped in an npm package has the same name',
  'name-conflict': s => `name conflict with ${s.conflictsWith?.join(', ') || 'another package'}`,
}

export function printSkippedRemote(skipped: SkippedRemote[]): void {
  if (skipped.length === 0)
    return

  const header = 'Skipped remote skills:'
  if (isTTY)
    p.log.warn(header)
  else
    console.warn(header)

  for (const item of skipped) {
    const detail = SKIP_DETAILS[item.reason](item)
    if (isTTY) {
      console.log(`  ${c.yellow('⊘')} ${c.bold(item.name)} ${c.dim(`from ${item.source} via ${item.package}`)}`)
      console.log(`    ${c.dim(detail)}`)
    }
    else {
      console.warn(`  - ${item.name} (${item.source} via ${item.package}): ${detail}`)
    }
  }
}

/**
 * The exact `skills` CLI invocations about to run, so a dry run shows what a
 * real run would spawn.
 */
export function printRemotePlan(installs: RemoteInstall[], stale: string[], agents: AgentType[], options: ResolvedOptions): void {
  const header = options.dryRun ? 'Would run the skills CLI:' : 'Running the skills CLI:'
  if (options.dryRun)
    printDryRun(header)
  else if (isTTY)
    p.log.info(header)
  else
    console.log(header)

  const commands = installs.map(install => addArgs(install, agents))
  if (stale.length > 0)
    commands.push(removeArgs(stale))
  for (const args of commands)
    console.log(`  ${formatArrow()} ${c.dim('skills')} ${args.join(' ')}`)
}

export function printOutro(totalCount: number, successCount: number, remoteCount: number, options: ResolvedOptions): void {
  const remote = remoteCount > 0 ? `, ${remoteCount} remote skill${remoteCount !== 1 ? 's' : ''}` : ''
  if (options.dryRun)
    p.outro(c.yellow(`[Dry run] Would create ${totalCount} symlinks${remote}`))
  else
    p.outro(c.green(`✓ Created ${successCount}/${totalCount} symlinks${remote}`))
}

export function printCleanupResults(results: CleanupResult[], options: ResolvedOptions): void {
  if (results.length === 0)
    return

  const agentsResult = new Map<string, CleanupResult[]>()
  for (const result of results) {
    const agentResults = agentsResult.get(result.agent) || []
    agentResults.push(result)
    agentsResult.set(result.agent, agentResults)
  }

  for (const [agent, agentResults] of agentsResult) {
    const entries = agentResults.map((result) => {
      const status = formatStatus(result.success)
      const prefix = options.dryRun ? formatArrow() : status
      return `${prefix} ${result.targetName}`
    }).join(', ')

    console.log(`  ${c.bold(agent)}: ${entries}`)
    if (!isTTY)
      return

    const errors = agentResults.filter(r => !r.success && r.error)
    for (const result of errors) {
      console.log(`    ${c.red(result.error)}`)
    }
  }
}

export function printDryRun(message: string): void {
  if (isTTY)
    p.log.info(`${c.yellow('[Dry run]')} ${message}`)
  else
    console.log(`[Dry run] ${message}`)
}

export function printSetupResults(result: SetupResult, options: ResolvedOptions): void {
  const dry = options.dryRun ? `${c.yellow('[Dry run]')} ` : ''

  const prepareMsg = result.prepare.changed
    ? `${dry}${result.prepare.before ? 'Updated' : 'Added'} package.json "prepare" script: ${c.cyan(result.prepare.after)}`
    : 'package.json "prepare" script already runs skills-npm'

  if (isTTY) {
    if (result.prepare.changed)
      p.log.success(prepareMsg)
    else
      p.log.info(prepareMsg)
  }
  else {
    console.log(prepareMsg)
  }
}
