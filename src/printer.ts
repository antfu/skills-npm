/* eslint-disable no-console */
import type { InvalidSkill, NpmSkill, ResolvedOptions, SymlinkResult } from './types'
import * as p from '@clack/prompts'
import c from 'picocolors'
import { GRAYS, isTTY, LOGO_LINES, RESET } from './constants'

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

export function printInvalidSkills(invalidSkills: InvalidSkill[]): void {
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

export function printOutro(totalCount: number, successCount: number, options: ResolvedOptions): void {
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
