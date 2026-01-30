#!/usr/bin/env node
import type { AgentType } from './types.ts'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'picocolors'
import { version } from '../package.json'
import { hasGitignorePattern, updateGitignore } from './gitignore.ts'
import { scanNodeModules } from './scan.ts'
import { getAllAgentTypes, getDetectedAgents, symlinkSkills } from './symlink.ts'

const isTTY = process.stdout.isTTY

// ASCII art logo - similar style to skills CLI
const LOGO_LINES = [
  '███████╗██╗  ██╗██╗██╗     ██╗     ███████╗      ███╗   ██╗██████╗ ███╗   ███╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝      ████╗  ██║██╔══██╗████╗ ████║',
  '███████╗█████╔╝ ██║██║     ██║     ███████╗█████╗██╔██╗ ██║██████╔╝██╔████╔██║',
  '╚════██║██╔═██╗ ██║██║     ██║     ╚════██║╚════╝██║╚██╗██║██╔═══╝ ██║╚██╔╝██║',
  '███████║██║  ██╗██║███████╗███████╗███████║      ██║ ╚████║██║     ██║ ╚═╝ ██║',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝      ╚═╝  ╚═══╝╚═╝     ╚═╝     ╚═╝',
]

// 256-color middle grays - visible on both light and dark backgrounds
const GRAYS = [
  '\x1B[38;5;250m', // lighter gray
  '\x1B[38;5;248m',
  '\x1B[38;5;245m', // mid gray
  '\x1B[38;5;243m',
  '\x1B[38;5;240m',
  '\x1B[38;5;238m', // darker gray
]
const RESET = '\x1B[0m'

function showLogo(): void {
  if (!isTTY)
    return
  console.log()
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`)
  })
  console.log()
}

function parseArgs(args: string[]): {
  cwd?: string
  dryRun: boolean
  agents?: string[]
  skipGitignore: boolean
  help: boolean
  version: boolean
  yes: boolean
} {
  const result = {
    cwd: undefined as string | undefined,
    dryRun: false,
    agents: undefined as string[] | undefined,
    skipGitignore: false,
    help: false,
    version: false,
    yes: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      result.dryRun = true
    }
    else if (arg === '--agents' || arg === '-a') {
      const next = args[++i]
      if (next) {
        result.agents = next.split(',').map(a => a.trim())
      }
    }
    else if (arg === '--no-gitignore') {
      result.skipGitignore = true
    }
    else if (arg === '--help' || arg === '-h') {
      result.help = true
    }
    else if (arg === '--version' || arg === '-v') {
      result.version = true
    }
    else if (arg === '--yes' || arg === '-y') {
      result.yes = true
    }
    else if (!arg.startsWith('-')) {
      result.cwd = arg
    }
  }

  return result
}

function showHelp(): void {
  console.log(`
${c.bold('Usage:')} skills-npm [cwd] [options]

${c.bold('Description:')}
  Discover agent skills from npm packages in node_modules and
  create symlinks for coding agents to consume.

${c.bold('Options:')}
  -a, --agents <agents>  Comma-separated list of agents to install to
  --dry-run              Show what would be done without making changes
  --no-gitignore         Skip updating .gitignore
  -y, --yes              Skip confirmation prompts
  -h, --help             Show this help message
  -v, --version          Show version number

${c.bold('Examples:')}
  ${c.dim('$')} npx skills-npm
  ${c.dim('$')} npx skills-npm --dry-run
  ${c.dim('$')} npx skills-npm --agents cursor,claude-code
  ${c.dim('$')} npx skills-npm ./my-project

${c.dim('Learn more:')} https://github.com/antfu/skills-npm
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  if (options.version) {
    console.log(version)
    return
  }

  if (options.help) {
    showLogo()
    showHelp()
    return
  }

  showLogo()

  const workingDir = options.cwd || process.cwd()

  if (isTTY) {
    p.intro(c.inverse(' skills-npm '))
  }

  // Scan for skills
  const spinner = isTTY ? p.spinner() : null
  spinner?.start('Scanning node_modules for skills...')

  const { skills, packageCount } = await scanNodeModules({ cwd: workingDir })

  if (skills.length === 0) {
    const msg = `Scanned ${packageCount} package${packageCount !== 1 ? 's' : ''}, no skills found`
    if (isTTY) {
      spinner?.stop(msg)
      p.outro(c.dim('https://github.com/antfu/skills-npm'))
    }
    else {
      console.log(msg)
    }
    return
  }

  const scanMsg = `Scanned ${packageCount} package${packageCount !== 1 ? 's' : ''}, found ${skills.length} skill${skills.length !== 1 ? 's' : ''}`
  if (isTTY) {
    spinner?.stop(scanMsg)
    p.log.info('Discovered skills:')
    for (const skill of skills) {
      console.log(`  ${c.green('●')} ${c.bold(skill.name)} ${c.dim(`from ${skill.packageName}`)}`)
      console.log(`    ${c.dim(skill.description)}`)
    }
  }
  else {
    console.log(scanMsg)
    for (const skill of skills) {
      console.log(`  - ${skill.name} (${skill.packageName})`)
    }
  }

  // Detect agents
  const detectedAgents = await getDetectedAgents()
  let targetAgents: AgentType[]

  if (options.agents && options.agents.length > 0) {
    targetAgents = options.agents as AgentType[]
  }
  else if (detectedAgents.length > 0) {
    targetAgents = detectedAgents
  }
  else if (isTTY) {
    // No agents detected, prompt user to select (TTY only)
    const allAgents = getAllAgentTypes()
    const agentOptions = allAgents.map(agent => ({ value: agent, label: agent }))
    const selected = await p.multiselect({
      message: 'No agents detected. Select agents to install to:',
      options: agentOptions as any,
      required: true,
    })

    if (p.isCancel(selected)) {
      p.cancel('Operation cancelled')
      process.exit(0)
    }

    targetAgents = selected as AgentType[]
  }
  else {
    // Non-TTY with no agents: error
    console.error('No agents detected. Use --agents to specify target agents.')
    process.exit(1)
  }

  if (isTTY) {
    p.log.info(`Target agents: ${c.cyan(targetAgents.join(', '))}`)
  }
  else {
    console.log(`Target agents: ${targetAgents.join(', ')}`)
  }

  // Confirm before proceeding (TTY only, unless --yes)
  if (isTTY && !options.dryRun && !options.yes) {
    const confirmed = await p.confirm({
      message: `Create symlinks for ${skills.length} skill${skills.length > 1 ? 's' : ''} to ${targetAgents.length} agent${targetAgents.length > 1 ? 's' : ''}?`,
    })

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Operation cancelled')
      process.exit(0)
    }
  }

  // Create symlinks
  if (options.dryRun && isTTY) {
    p.log.warn('[Dry run] Would create the following symlinks:')
  }
  else if (!options.dryRun && isTTY) {
    spinner?.start('Creating symlinks...')
  }

  const results = await symlinkSkills(skills, {
    cwd: workingDir,
    dryRun: options.dryRun,
    agents: targetAgents,
  })

  if (!options.dryRun && isTTY) {
    spinner?.stop('Symlinks created')
  }

  // Group results by agent
  const byAgent = new Map<string, typeof results>()
  for (const result of results) {
    const agentResults = byAgent.get(result.agent) || []
    agentResults.push(result)
    byAgent.set(result.agent, agentResults)
  }

  for (const [agent, agentResults] of byAgent) {
    if (isTTY) {
      console.log()
      console.log(`  ${c.bold(agent)}:`)
      for (const result of agentResults) {
        const status = result.success ? c.green('✓') : c.red('✗')
        const prefix = options.dryRun ? c.yellow('→') : status
        console.log(`    ${prefix} ${result.skill.targetName}`)
        if (!result.success && result.error) {
          console.log(`      ${c.red(result.error)}`)
        }
      }
    }
    else {
      console.log(`${agent}:`)
      for (const result of agentResults) {
        const status = result.success ? '✓' : '✗'
        const prefix = options.dryRun ? '→' : status
        console.log(`  ${prefix} ${result.skill.targetName}`)
      }
    }
  }

  // Update .gitignore
  if (!options.skipGitignore) {
    const hasPattern = await hasGitignorePattern(workingDir)
    if (!hasPattern) {
      if (options.dryRun) {
        if (isTTY) {
          p.log.info(`${c.yellow('[Dry run]')} Would update .gitignore with: skills/npm-*`)
        }
        else {
          console.log('[Dry run] Would update .gitignore with: skills/npm-*')
        }
      }
      else {
        const { updated, created } = await updateGitignore(workingDir)
        if (updated) {
          const msg = created
            ? 'Created .gitignore with skills/npm-* pattern'
            : 'Updated .gitignore with skills/npm-* pattern'
          if (isTTY) {
            p.log.success(msg)
          }
          else {
            console.log(msg)
          }
        }
      }
    }
  }

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length

  if (isTTY) {
    if (options.dryRun) {
      p.outro(c.yellow(`[Dry run] Would create ${totalCount} symlinks`))
    }
    else {
      p.outro(c.green(`✓ Created ${successCount}/${totalCount} symlinks`))
    }
  }
  else {
    if (options.dryRun) {
      console.log(`[Dry run] Would create ${totalCount} symlinks`)
    }
    else {
      console.log(`Created ${successCount}/${totalCount} symlinks`)
    }
  }
}

main().catch((error) => {
  if (isTTY) {
    p.log.error(error instanceof Error ? error.message : 'Unknown error')
  }
  else {
    console.error(error instanceof Error ? error.message : 'Unknown error')
  }
  process.exit(1)
})
