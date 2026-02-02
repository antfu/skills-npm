import type { CAC } from 'cac'
import type { AgentType, CommandOptions, NpmSkill } from './types.ts'
import process from 'node:process'
import * as p from '@clack/prompts'
import { cac } from 'cac'
import c from 'picocolors'
import { name, version } from '../package.json'
import { agents } from '../vendor/skills/src/agents.ts'
import { getAllAgentTypes, getDetectedAgents } from './agents.ts'
import { resolveConfig } from './config.ts'
import { isTTY } from './constants.ts'
import { hasGitignorePattern, updateGitignore } from './gitignore.ts'
import { printDryRun, printLogo, printOutro, printSkills, printSymlinkResults } from './printer.ts'
import { scanNodeModules } from './scan.ts'
import { symlinkSkills } from './symlink.ts'

const cli: CAC = cac(name)

try {
  cli
    .command('', 'CLI to install agents skills that shipped with your installed npm packages')
    .option('--cwd <cwd>', 'Current working directory')
    .option('--agents, -a <agents>', 'Comma-separated list of agents to install to')
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
      const targetAgents = await getTargetAgents(options)

      if (isTTY && !config.dryRun && !config.yes)
        await promptConfirm(skills, targetAgents)

      const [totalCount, successCount] = await createSymlinks(skills, targetAgents, options)

      if (config.gitignore !== false)
        await writeGitignore(options)

      printOutro(totalCount, successCount, options)
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
    message: `Create symlinks for ${c.yellow(skills.length.toString())} skill${skills.length > 1 ? 's' : ''} to ${c.yellow(targetAgents.length.toString())} agent${targetAgents.length > 1 ? 's' : ''}?`,
  })
  if (p.isCancel(result) || !result) {
    p.outro(c.red('Operation cancelled'))
    process.exit(0)
  }
}

async function scanSkills(options: CommandOptions): Promise<NpmSkill[]> {
  const spinner = isTTY ? p.spinner() : null
  spinner?.start('Scanning node_modules for skills...')

  const { skills, packageCount } = await scanNodeModules({ cwd: options.cwd })
  if (skills.length === 0) {
    const msg = `Scanned ${packageCount} package${packageCount !== 1 ? 's' : ''}, no skills found`
    if (isTTY) {
      spinner?.stop(msg)
      p.outro(c.dim('https://github.com/antfu/skills-npm'))
    }
    else {
      console.log(msg)
    }
    process.exit(0)
  }

  const message = `Scanned ${packageCount} package${packageCount !== 1 ? 's' : ''}, found ${skills.length} skill${skills.length !== 1 ? 's' : ''}`
  if (isTTY) {
    spinner?.stop(message)
    p.log.info('Discovered skills:')
    printSkills(skills)
  }
  else {
    console.log(message)
    for (const skill of skills) {
      console.log(`  - ${skill.name} (${skill.packageName})`)
    }
  }

  return skills
}

async function getTargetAgents(options: CommandOptions): Promise<AgentType[]> {
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

async function createSymlinks(skills: NpmSkill[], agents: AgentType[], options: CommandOptions): Promise<[number, number]> {
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

async function writeGitignore(options: CommandOptions): Promise<void> {
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
