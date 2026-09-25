#!/usr/bin/env node
import type { CAC } from 'cac'
import type { AgentType, CommandOptions, NpmRequest, NpmSkill, RemoteInstall, RemoteRequest, RemoteSkill, ResolvedOptions } from './types'
import type { FilterSubject } from './utils/skills'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { cac } from 'cac'
import c from 'picocolors'
import { name, version } from '../package.json'
import { agents, getAllAgentTypes, getDetectedAgents } from './agents'
import { resolveConfig } from './config'
import { isCI, isTTY, LEGACY_GITIGNORE_PATTERNS } from './constants'
import { readSkillsFieldRequests, resolveNpmRequests } from './field'
import { readSkillsLock, readVercelLockNames, SKILLS_NPM_LOCK_FILE, writeSkillsLock } from './lock'
import { printCleanupResults, printDryRun, printInvalidSkills, printLogo, printOutro, printRemotePlan, printSetupResults, printSkills, printSkippedRemote, printSkippedSkills, printSymlinkResults } from './printer'
import { installRemote, planRemote, removeRemote, runSkillsCli } from './remote'
import { resolveConflicts } from './resolve'
import { scanNodeModules } from './scan'
import { setupProject } from './setup'
import { cleanupStaleSkills, symlinkSkills } from './symlink'
import { getPackageDeps, isSelected, processSkills, sanitizeSkillName } from './utils/index'

const cli: CAC = cac(name)

function isCliEntrypoint(): boolean {
  const entry = process.argv[1]
  if (!entry)
    return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  }
  catch {
    return false
  }
}

try {
  cli
    .command('', 'CLI to install agents skills that shipped with your installed npm packages')
    .option('--cwd <cwd>', 'Current working directory')
    .option('--agents, -a <agents>', 'Comma-separated list of agents to install to')
    .option('--source, -s <source>', 'Source used to discover skills')
    .option('--recursive, -r', 'Scan recursively for monorepo packages')
    .option('--yes', 'Skip confirmation prompts')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--force', 'Force full reload, ignore cache')
    .option('--cleanup', 'Clean up stale skills-npm symlinks from agent directories (enabled by default; use --no-cleanup to disable)')
    .option('--remote', 'Fetch remote skills declared in "skills" fields (enabled by default; use --no-remote when offline)')
    .action(async (options: Partial<CommandOptions>) => {
      if (isTTY) {
        printLogo()
        p.intro(`${c.inverse(`${name}@${version}`)}`)
      }

      const config = await resolveConfig(options)
      await run(() => runSync(config))
    })

  cli
    .command('setup', 'Set up skills-npm in this project (prepare script + first sync)')
    .option('--cwd <cwd>', 'Current working directory')
    .option('--agents, -a <agents>', 'Comma-separated list of agents to install to')
    .option('--source, -s <source>', 'Source used to discover skills')
    .option('--recursive, -r', 'Scan recursively for monorepo packages')
    .option('--yes', 'Skip confirmation prompts')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--force', 'Force full reload, ignore cache')
    .option('--cleanup', 'Clean up stale skills-npm symlinks from agent directories (enabled by default; use --no-cleanup to disable)')
    .option('--remote', 'Fetch remote skills declared in "skills" fields (enabled by default; use --no-remote when offline)')
    .action(async (options: Partial<CommandOptions>) => {
      if (isTTY) {
        printLogo()
        p.intro(`${c.inverse(`${name}@${version}`)}`)
      }

      const config = await resolveConfig(options)
      await run(async () => {
        const result = await setupProject(config)
        printSetupResults(result, config)
        await runSync(config)
      })
    })

  cli.help()
  cli.version(version)

  // Only run the CLI when executed directly (as the bin or via tsx), not when
  // the module is imported (e.g. by the exports snapshot test), which would
  // otherwise run a full sync as an import side effect.
  if (isCliEntrypoint())
    cli.parse()
}
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  if (isTTY)
    p.log.error(message)
  else
    console.error(message)
  process.exit(1)
}

/**
 * cac does not await async actions, so a rejection would surface as an
 * unhandled rejection with a stack trace instead of a message.
 */
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isTTY)
      p.log.error(message)
    else
      console.error(message)
    process.exit(1)
  }
}

async function promptConfirm(skills: NpmSkill[], installs: RemoteInstall[], targetAgents: AgentType[]): Promise<void> {
  const parts = []
  if (skills.length > 0)
    parts.push(`create symlinks for ${c.yellow(skills.length)} skill${skills.length > 1 ? 's' : ''}`)
  if (installs.length > 0)
    parts.push(`fetch ${c.yellow(installs.length)} remote source${installs.length > 1 ? 's' : ''}`)
  const summary = parts.join(' and ')
  const result = await p.confirm({
    message: `${summary[0].toUpperCase()}${summary.slice(1)} for ${c.yellow(targetAgents.length)} agent${targetAgents.length > 1 ? 's' : ''}?`,
  })
  if (p.isCancel(result) || !result) {
    p.outro(c.red('Operation cancelled'))
    process.exit(0)
  }
}

/**
 * Collect `skills` field entries from the same places the scan looked. `npm:`
 * entries become vendored skills; git-hosted ones are returned for planning.
 */
async function collectFieldRequests(rootPaths: string[], scanned: NpmSkill[], options: ResolvedOptions): Promise<{ skills: NpmSkill[], remote: RemoteRequest[] }> {
  const remote: RemoteRequest[] = []
  const npm: NpmRequest[] = []
  for (const dir of rootPaths) {
    const requests = await readSkillsFieldRequests(dir, options.source!, dir === options.cwd ? '.' : undefined)
    remote.push(...requests.remote)
    npm.push(...requests.npm)
  }
  return { skills: await resolveNpmRequests(npm, scanned), remote }
}

/**
 * Apply include/exclude to remote requests: by requesting package always, by
 * skill name where the entry names skills.
 */
function filterRemoteRequests(requests: RemoteRequest[], options: ResolvedOptions): RemoteRequest[] {
  return requests.flatMap((request) => {
    const subject = (name = ''): FilterSubject => ({ packageName: request.package, skillName: name, targetName: name })
    if (request.skills.length === 0)
      return isSelected(subject(), options.include, options.exclude) ? [request] : []
    const skills = request.skills.filter(name => isSelected(subject(name), options.include, options.exclude))
    return skills.length > 0 ? [{ ...request, skills }] : []
  })
}

async function scanSkills(options: ResolvedOptions): Promise<{ skills: NpmSkill[], remote: RemoteRequest[] }> {
  const spinner = isTTY ? p.spinner() : null
  spinner?.start('Scanning node_modules for skills...')

  const { skills: scannedSkills, skillsInvalid, packagesScanned, fromCache, rootPaths } = await scanNodeModules({
    cwd: options.cwd,
    source: options.source,
    recursive: options.recursive,
    force: options.force,
  })
  const field = await collectFieldRequests(rootPaths, scannedSkills, options)

  const hasInvalidSkills = skillsInvalid.length > 0
  const invalidCount = skillsInvalid.length

  const { skills, excludedCount } = processSkills(
    [...scannedSkills, ...field.skills],
    options.include,
    options.exclude,
  )
  const remote = options.remote === false ? [] : filterRemoteRequests(field.remote, options)

  // remote skills we installed earlier still need syncing (removal) even when
  // nothing is requested anymore
  const hasPreviousRemote = Object.keys((await readSkillsLock(options.cwd!))?.remote ?? {}).length > 0

  if (skills.length === 0 && remote.length === 0 && !hasPreviousRemote) {
    let msg = `Scanned ${c.yellow(packagesScanned)} package${packagesScanned !== 1 ? 's' : ''}, no skills found`
    if (fromCache)
      msg += ' (from cache)'
    if (excludedCount > 0)
      msg += ` (${c.yellow(excludedCount)} filtered)`
    if (hasInvalidSkills)
      msg += ` (${c.yellow(invalidCount)} invalid)`
    if (isTTY) {
      spinner?.stop(msg)
      if (hasInvalidSkills)
        printInvalidSkills(skillsInvalid)
      p.outro(c.dim('https://github.com/antfu/skills-npm'))
    }
    else {
      console.log(msg)
      if (hasInvalidSkills)
        printInvalidSkills(skillsInvalid)
    }
    process.exit(0)
  }

  let message = `Scanned ${packagesScanned} package${packagesScanned !== 1 ? 's' : ''}, found ${skills.length} skill${skills.length !== 1 ? 's' : ''}`
  if (remote.length > 0)
    message += ` and ${remote.length} remote request${remote.length !== 1 ? 's' : ''}`
  if (fromCache)
    message += ' (from cache)'
  if (excludedCount > 0)
    message += ` (${excludedCount} filtered)`
  if (hasInvalidSkills)
    message += ` (${invalidCount} invalid)`
  if (isTTY)
    spinner?.stop(message)
  else
    console.log(message)

  if (isTTY && skills.length > 0)
    p.log.info('Discovered skills:')

  printSkills(skills)

  if (hasInvalidSkills)
    printInvalidSkills(skillsInvalid)

  return { skills, remote }
}

async function getTargetAgents(options: ResolvedOptions): Promise<AgentType[]> {
  let targetAgents: AgentType[]

  if (options.agents && options.agents.length > 0) {
    targetAgents = options.agents as AgentType[]
  }
  else {
    const detectedAgents = await getDetectedAgents()
    targetAgents = detectedAgents

    if (!isTTY && detectedAgents.length === 0) {
      const logger = isCI ? console.warn : console.error
      const exitCode = isCI ? 0 : 1
      logger('No agents detected. Use --agents to specify target agents')
      process.exit(exitCode)
    }

    if (isTTY) {
      const allAgents = getAllAgentTypes()

      if (options.yes) {
        targetAgents = detectedAgents.length > 0 ? detectedAgents : allAgents
      }
      else {
        // Offer every agent, with detected ones pre-selected and listed first,
        // so you can both deselect detected agents and add undetected ones.
        const orderedAgents = [
          ...detectedAgents,
          ...allAgents.filter(agent => !detectedAgents.includes(agent)),
        ]
        const selected = await p.multiselect<string>({
          message: detectedAgents.length > 0
            ? 'Select agents to install to:'
            : 'No agents detected. Select agents to install to:',
          options: orderedAgents
            .map(agent => ({
              value: agent,
              label: agents[agent].displayName,
            })),
          required: true,
          initialValues: detectedAgents.length > 0 ? detectedAgents : undefined,
        })

        if (p.isCancel(selected)) {
          p.outro(c.red('Operation cancelled'))
          process.exit(0)
        }

        targetAgents = selected as AgentType[]
      }
    }
  }

  const message = `Target agents: ${c.cyan(targetAgents.join(', '))}`
  if (isTTY)
    p.log.info(message)
  else
    console.log(message)

  return targetAgents
}

async function createSymlinks(skills: NpmSkill[], agents: AgentType[], options: ResolvedOptions): Promise<[number, number]> {
  const spinner = isTTY ? p.spinner() : null

  if (options.dryRun && isTTY)
    printDryRun('Would create the following symlinks:')
  else if (!options.dryRun && isTTY)
    spinner?.start('Creating symlinks...')

  const results = await symlinkSkills(skills, {
    cwd: options.cwd,
    dryRun: options.dryRun,
    agents,
  })

  if (!options.dryRun && isTTY)
    spinner?.stop('Symlinks created')

  printSymlinkResults(results, options)

  const successCount = results.filter(r => r.status === 'created').length
  const totalCount = results.length

  return [totalCount, successCount]
}

async function cleanupStale(skills: NpmSkill[], agents: AgentType[], options: ResolvedOptions): Promise<number> {
  const spinner = isTTY ? p.spinner() : null

  if (options.dryRun && isTTY)
    printDryRun('Would remove the following stale skills:')
  else if (!options.dryRun && isTTY)
    spinner?.start('Cleaning up stale skills...')

  const results = await cleanupStaleSkills(skills, {
    cwd: options.cwd,
    dryRun: options.dryRun,
    agents,
  })

  if (results.length > 0) {
    const successCount = results.filter(r => r.success).length
    if (!options.dryRun && isTTY)
      spinner?.stop(`Cleaned up ${successCount} stale skill${successCount !== 1 ? 's' : ''}`)

    printCleanupResults(results, options)
  }
  else {
    if (!options.dryRun && isTTY)
      spinner?.stop('No stale skills to clean up')
  }

  return results.length
}

async function updateLock(skills: NpmSkill[], remote: RemoteSkill[], options: ResolvedOptions): Promise<void> {
  const changed = await writeSkillsLock(options.cwd!, skills, remote, options.dryRun)
  if (!changed)
    return

  const msg = options.dryRun
    ? `Would update ${SKILLS_NPM_LOCK_FILE}`
    : `Updated ${SKILLS_NPM_LOCK_FILE}`
  if (options.dryRun)
    printDryRun(msg)
  else if (isTTY)
    p.log.success(msg)
  else
    console.log(msg)
}

/**
 * v1 gitignored its `npm-*` links; v2 names carry no prefix, so a leftover v1
 * block no longer matches anything. Hint at it, but never edit .gitignore.
 */
async function hintLegacyGitignore(options: ResolvedOptions): Promise<void> {
  let content: string
  try {
    content = await readFile(join(options.cwd!, '.gitignore'), 'utf-8')
  }
  catch {
    return
  }

  const lines = content.split('\n').map(line => line.trim())
  if (!LEGACY_GITIGNORE_PATTERNS.some(pattern => lines.includes(pattern)))
    return

  const msg = 'Your .gitignore still has the skills-npm v1 "skills/npm-*" pattern; it no longer matches anything and can be removed'
  if (isTTY)
    p.log.info(msg)
  else
    console.log(msg)
}

interface RemoteSync {
  installs: RemoteInstall[]
  installed: RemoteSkill[]
  /**
   * Names we installed last time that no honored package requests anymore
   */
  stale: string[]
}

function sourceKey(entry: { source: string, ref?: string }): string {
  return entry.ref ? `${entry.source}#${entry.ref}` : entry.source
}

async function planRemoteSync(requests: RemoteRequest[], vendored: NpmSkill[], vercelLockNames: Set<string>, directDeps: Set<string>, options: ResolvedOptions): Promise<RemoteSync> {
  const previous = (await readSkillsLock(options.cwd!))?.remote ?? {}
  if (options.remote === false) {
    // offline: keep what the lock already records, neither fetch nor remove
    const installed = Object.entries(previous).map(([name, entry]) => ({ name, ...entry }))
    return { installs: [], installed, stale: [] }
  }

  const plan = planRemote(requests, {
    vercelLockNames,
    previous,
    vendoredNames: new Set(vendored.map(s => s.targetName)),
    directDeps,
    force: options.force,
  })
  printSkippedRemote(plan.skipped)

  const requested = new Set([...plan.installed.map(s => s.name), ...plan.installs.flatMap(i => i.skills.map(sanitizeSkillName))])
  const stale = Object.keys(previous).filter(name =>
    !requested.has(name)
    && vercelLockNames.has(name)
    // a whole-repository fetch may still provide names we cannot know up front
    && !plan.installs.some(i => i.skills.length === 0 && sourceKey(i) === sourceKey(previous[name])),
  )

  return { installs: plan.installs, installed: plan.installed, stale }
}

async function executeRemoteSync(sync: RemoteSync, agents: AgentType[], options: ResolvedOptions): Promise<RemoteSkill[]> {
  const stale = options.cleanup === false ? [] : sync.stale
  if (sync.installs.length === 0 && stale.length === 0)
    return sync.installed

  printRemotePlan(sync.installs, stale, agents, options)
  if (options.dryRun)
    return sync.installed

  const spinner = isTTY ? p.spinner() : null
  spinner?.start('Fetching remote skills...')
  try {
    const installed = await installRemote(sync.installs, agents, options.cwd!, runSkillsCli)
    await removeRemote(stale, options.cwd!, runSkillsCli)
    spinner?.stop(`Fetched ${installed.length} remote skill${installed.length !== 1 ? 's' : ''}`)
    return [...sync.installed, ...installed]
  }
  catch (error) {
    spinner?.error('Fetching remote skills failed')
    throw error
  }
}

async function runSync(config: ResolvedOptions): Promise<void> {
  const { skills, remote: requests } = await scanSkills(config)

  const [vercelLockNames, directDeps] = await Promise.all([
    readVercelLockNames(config.cwd!),
    getPackageDeps(config.cwd!).then(deps => new Set(deps)),
  ])
  const { resolved, skipped } = resolveConflicts(skills, { vercelLockNames, directDeps })
  printSkippedSkills(skipped)

  const targetAgents = await getTargetAgents(config)

  const sync = await planRemoteSync(requests, resolved, vercelLockNames, directDeps, config)

  if ((resolved.length > 0 || sync.installs.length > 0) && isTTY && !config.dryRun && !config.yes)
    await promptConfirm(resolved, sync.installs, targetAgents)

  const [totalCount, successCount] = await createSymlinks(resolved, targetAgents, config)

  if (config.cleanup !== false)
    await cleanupStale(resolved, targetAgents, config)

  const remote = await executeRemoteSync(sync, targetAgents, config)

  await updateLock(resolved, remote, config)
  await hintLegacyGitignore(config)

  printOutro(totalCount, successCount, remote.length, config)
}
