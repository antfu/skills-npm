#!/usr/bin/env node
import type { CAC } from 'cac'
import type { AgentType, CommandOptions, NpmSkill, ResolvedOptions } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import { cac } from 'cac'
import c from 'picocolors'
import { name, version } from '../package.json'
import { agents, getAllAgentTypes, getDetectedAgents } from './agents'
import { resolveConfig } from './config'
import { isTTY } from './constants'
import { hasGitignorePattern, updateGitignore } from './gitignore'
import { printDryRun, printInvalidSkills, printLogo, printOutro, printSkills, printSymlinkResults } from './printer'
import { scanNodeModules } from './scan'
import { symlinkSkills } from './symlink'
import { processSkills } from './utils/index'

const cli: CAC = cac(name)

try {
  cli
    .command('', 'CLI to install agents skills that shipped with your installed npm packages')
    .option('--cwd <cwd>', 'Current working directory')
    .option('--agents, -a <agents>', 'Comma-separated list of agents to install to')
    .option('--source, -s <source>', 'Source used to discover skills', { default: 'node_modules' })
    .option('--recursive, -r', 'Scan recursively for monorepo packages', { default: false })
    .option('--gitignore', 'Skip updating .gitignore', { default: true })
    .option('--yes', 'Skip confirmation prompts', { default: false })
    .option('--dry-run', 'Show what would be done without making changes', { default: false })
    .action(async (options: Partial<CommandOptions>) => {
      if (isTTY) {
        printLogo()
        p.intro(`${c.inverse(`${name}@${version}`)}`)
      }

      const config = await resolveConfig(options)

      const skills = await scanSkills(config)
      const targetAgents = await getTargetAgents(config)

      if (isTTY && !config.dryRun && !config.yes)
        await promptConfirm(skills, targetAgents)

      const [totalCount, successCount] = await createSymlinks(skills, targetAgents, config)

      if (config.gitignore !== false)
        await writeGitignore(config)

      printOutro(totalCount, successCount, config)
    })

  cli.help()
  cli.version(version)
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

  const { skills: scannedSkills, invalidSkills, packageCount } = await scanNodeModules({
    cwd: options.cwd,
    source: options.source,
    recursive: options.recursive,
  })

  const hasInvalidSkills = invalidSkills.length > 0
  const invalidCount = invalidSkills.length

  const { skills, excludedCount } = processSkills(
    scannedSkills,
    options.include,
    options.exclude,
  )

  if (skills.length === 0) {
    let msg = `Scanned ${c.yellow(packageCount)} package${packageCount !== 1 ? 's' : ''}, no skills found`
    if (excludedCount > 0)
      msg += ` (${c.yellow(excludedCount)} filtered)`
    if (hasInvalidSkills)
      msg += ` (${c.yellow(invalidCount)} invalid)`
    if (isTTY) {
      spinner?.stop(msg)
      if (hasInvalidSkills)
        printInvalidSkills(invalidSkills)
      p.outro(c.dim('https://github.com/antfu/skills-npm'))
    }
    else {
      console.log(msg)
      if (hasInvalidSkills)
        printInvalidSkills(invalidSkills)
    }
    process.exit(0)
  }

  let message = `Scanned ${packageCount} package${packageCount !== 1 ? 's' : ''}, found ${skills.length} skill${skills.length !== 1 ? 's' : ''}`
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
    printInvalidSkills(invalidSkills)

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
      console.error('No agents detected. Use --agents to specify target agents')
      process.exit(1)
    }

    if (isTTY) {
      const agentOptions = detectedAgents.length > 0 ? detectedAgents : getAllAgentTypes()

      const selected = await p.multiselect<string>({
        message: detectedAgents.length > 0
          ? 'Select agents to install to:'
          : 'No agents detected. Select agents to install to:',
        options: agentOptions
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

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length

  return [totalCount, successCount]
}

async function writeGitignore(options: ResolvedOptions): Promise<void> {
  const hasPattern = await hasGitignorePattern(options.cwd)

  if (hasPattern)
    return

  if (options.dryRun) {
    printDryRun('Would update .gitignore with: skills/npm-*')
    return
  }

  const { updated, created } = await updateGitignore(options.cwd)
  if (updated) {
    const msg = created
      ? 'Created .gitignore with skills/npm-* pattern'
      : 'Updated .gitignore with skills/npm-* pattern'
    if (isTTY)
      p.log.success(msg)
    else
      console.log(msg)
  }
}
