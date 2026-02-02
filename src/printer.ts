/* eslint-disable no-console */
import type { CommandOptions, NpmSkill, SymlinkResult } from './types.ts'
import * as p from '@clack/prompts'
import c from 'picocolors'
import { GRAYS, isTTY, LOGO_LINES, RESET } from './constants.ts'

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

export function printSkills(skills: NpmSkill[]): void {
  for (const skill of skills) {
    console.log(`  ${c.green('●')} ${c.bold(skill.name)} ${c.dim(`from ${skill.packageName}`)}`)
    console.log(`    ${c.dim(skill.description)}`)
  }
}

export function printSymlinkResults(results: SymlinkResult[], options: CommandOptions): void {
  const agentsResult = new Map<string, SymlinkResult[]>()
  for (const result of results) {
    const agentResults = agentsResult.get(result.agent) || []
    agentResults.push(result)
    agentsResult.set(result.agent, agentResults)
  }

  for (const [agent, agentResults] of agentsResult) {
    const skills = agentResults.map((result) => {
      const status = formatStatus(result.success)
      const prefix = options.dryRun ? formatArrow() : status
      return `${prefix} ${result.skill.targetName}`
    }).join(', ')

    console.log(`  ${c.bold(agent)}: ${skills}`)
    if (!isTTY)
      return

    const errors = agentResults.filter(r => !r.success && r.error)
    for (const result of errors) {
      console.log(`    ${c.red(result.error)}`)
    }
  }
}

export function printOutro(totalCount: number, successCount: number, options: CommandOptions): void {
  if (options.dryRun)
    p.outro(c.yellow(`[Dry run] Would create ${totalCount} symlinks`))
  else
    p.outro(c.green(`✓ Created ${successCount}/${totalCount} symlinks`))
}

export function printDryRun(message: string): void {
  if (isTTY)
    p.log.info(`${c.yellow('[Dry run]')} ${message}`)
  else
    console.log(`[Dry run] ${message}`)
}
