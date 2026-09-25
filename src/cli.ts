#!/usr/bin/env node
import type { CAC } from 'cac'
import type { AgentType, CommandOptions, NpmSkill, ResolvedOptions } from './types'
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
import { readVercelLockNames, SKILLS_NPM_LOCK_FILE, writeSkillsLock } from './lock'
import { printCleanupResults, printDryRun, printInvalidSkills, printLogo, printOutro, printSetupResults, printSkills, printSkippedSkills, printSymlinkResults } from './printer'
import { resolveConflicts } from './resolve'
import { scanNodeModules } from './scan'
import { setupProject } from './setup'
import { cleanupStaleSkills, symlinkSkills } from './symlink'
import { getPackageDeps, processSkills } from './utils/index'

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
    .option('--source, -s <source>', 'Source used to discover skills', { default: 'package.json' })
    .option('--recursive, -r', 'Scan recursively for monorepo packages', { default: false })
    .option('--yes', 'Skip confirmation prompts', { default: false })
    .option('--dry-run', 'Show what would be done without making changes', { default: false })
    .option('--force', 'Force full reload, ignore cache', { default: false })
    .option('--cleanup', 'Clean up stale skills-npm symlinks from agent directories', { default: true })
    .action(async (options: Partial<CommandOptions>) => {
      if (isTTY) {
        printLogo()
        p.intro(`${c.inverse(`${name}@${version}`)}`)
      }

      const config = await resolveConfig(options)
      await runSync(config)
    })

  cli
    .command('setup', 'Set up skills-npm in this project (prepare script + first sync)')
    .option('--cwd <cwd>', 'Current working directory')
    .option('--agents, -a <agents>', 'Comma-separated list of agents to install to')
    .option('--source, -s <source>', 'Source used to discover skills', { default: 'package.json' })
    .option('--recursive, -r', 'Scan recursively for monorepo packages', { default: false })
    .option('--yes', 'Skip confirmation prompts', { default: false })
    .option('--dry-run', 'Show what would be done without making changes', { default: false })
    .option('--force', 'Force full reload, ignore cache', { default: false })
    .option('--cleanup', 'Clean up stale skills-npm symlinks from agent directories', { default: true })
    .action(async (options: Partial<CommandOptions>) => {
      if (isTTY) {
        printLogo()
        p.intro(`${c.inverse(`${name}@${version}`)}`)
      }

      const config = await resolveConfig(options)
      const result = await setupProject(config)
      printSetupResults(result, config)
      await runSync(config)
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

async function promptConfirm(skills: NpmSkill[], targetAgents: AgentType[]): Promise<void> {
  const result = await p.confirm({
    message: `Create symlinks for ${c.yellow(skills.length)} skill${skills.length > 1 ? 's' : ''} to ${c.yellow(targetAgents.length)} agent${targetAgents.length > 1 ? 's' : ''}?`,
  })
  if (p.isCancel(result) || !result) {
    p.outro(c.red('Operation cancelled'))
    process.exit(0)
  }
}

async function scanSkills(options: ResolvedOptions): Promise<NpmSkill[]> {
  const spinner = isTTY ? p.spinner() : null
  spinner?.start('Scanning node_modules for skills...')

  const { skills: scannedSkills, skillsInvalid, packagesScanned, fromCache } = await scanNodeModules({
    cwd: options.cwd,
    source: options.source,
    recursive: options.recursive,
    force: options.force,
  })

  const hasInvalidSkills = skillsInvalid.length > 0
  const invalidCount = skillsInvalid.length

  const { skills, excludedCount } = processSkills(
    scannedSkills,
    options.include,
    options.exclude,
  )

  if (skills.length === 0) {
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

  if (isTTY)
    p.log.info('Discovered skills:')

  printSkills(skills)

  if (hasInvalidSkills)
    printInvalidSkills(skillsInvalid)

  return skills
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

async function updateLock(skills: NpmSkill[], options: ResolvedOptions): Promise<void> {
  const changed = await writeSkillsLock(options.cwd!, skills, options.dryRun)
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

async function runSync(config: ResolvedOptions): Promise<void> {
  const skills = await scanSkills(config)

  const [vercelLockNames, directDeps] = await Promise.all([
    readVercelLockNames(config.cwd!),
    getPackageDeps(config.cwd!),
  ])
  const { resolved, skipped } = resolveConflicts(skills, {
    vercelLockNames,
    directDeps: new Set(directDeps),
  })
  printSkippedSkills(skipped)

  const targetAgents = await getTargetAgents(config)

  if (resolved.length > 0 && isTTY && !config.dryRun && !config.yes)
    await promptConfirm(resolved, targetAgents)

  const [totalCount, successCount] = await createSymlinks(resolved, targetAgents, config)

  if (config.cleanup !== false)
    await cleanupStale(resolved, targetAgents, config)

  await updateLock(resolved, config)
  await hintLegacyGitignore(config)

  printOutro(totalCount, successCount, config)
}
