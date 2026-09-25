import type { AgentType, RemoteInstall, RemotePlan, RemoteRequest, RemoteSkill, SkillsCliRunner, SkillsNpmLockRemoteEntry, SkippedRemote } from './types'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { sanitizeSkillName } from './utils/package'

export interface PlanRemoteInput {
  /**
   * Skill names in the `skills` CLI's skills-lock.json
   */
  vercelLockNames: Set<string>
  /**
   * `remote` map of the previous skills-npm-lock.json: what we installed before
   */
  previous: Record<string, SkillsNpmLockRemoteEntry>
  /**
   * Names of skills resolved from `skills/` directories; they win over remote
   */
  vendoredNames: Set<string>
  /**
   * Direct dependency names of the root package.json
   */
  directDeps: Set<string>
  /**
   * Refetch every source even when the lock shows it installed
   */
  force?: boolean
}

function sourceKey(request: { source: string, ref?: string }): string {
  return request.ref ? `${request.source}#${request.ref}` : request.source
}

function isInstalled(name: string, request: { source: string, ref?: string }, input: PlanRemoteInput): boolean {
  const entry = input.previous[name]
  return !input.force
    && input.vercelLockNames.has(name)
    && entry !== undefined
    && entry.source === request.source
    && entry.ref === request.ref
}

/**
 * Decide which `skills add` invocations a set of remote requests needs.
 *
 * Named skills go through the conflict ladder (vendored wins; a name in
 * skills-lock.json we did not install wins; direct beats transitive; ties are
 * skipped) and are skipped when the previous lock shows the same source
 * already installed. Requests for a whole repository cannot be checked by name
 * up front and are only skipped when every name recorded for that source last
 * time is still installed. Requests sharing a source are fetched together.
 */
export function planRemote(requests: RemoteRequest[], input: PlanRemoteInput): RemotePlan {
  const skipped: SkippedRemote[] = []
  const installed: RemoteSkill[] = []
  const groups = new Map<string, RemoteInstall>()

  const addToGroup = (request: RemoteRequest, skills: string[]): void => {
    const key = sourceKey(request)
    const group = groups.get(key) ?? { source: request.source, ref: request.ref, skills: [], requests: [] }
    if (skills.length === 0 || group.requests.some(r => r.skills.length === 0))
      group.skills = []
    else
      group.skills = [...new Set([...group.skills, ...skills])]
    if (!group.requests.includes(request))
      group.requests.push(request)
    groups.set(key, group)
  }

  // requested names are compared and recorded in sanitized form (the install
  // name); the raw spelling is what the CLI's --skill filter expects
  const byName = new Map<string, { raw: string, requesters: RemoteRequest[] }>()
  for (const request of requests) {
    for (const raw of request.skills) {
      const name = sanitizeSkillName(raw)
      const entry = byName.get(name) ?? { raw, requesters: [] }
      entry.requesters.push(request)
      byName.set(name, entry)
    }
  }

  for (const [name, { raw, requesters }] of byName) {
    const skip = (reason: SkippedRemote['reason'], losers: RemoteRequest[], conflictsWith?: string[]): void => {
      for (const r of losers)
        skipped.push({ name, package: r.package, source: r.source, reason, conflictsWith })
    }

    if (input.vendoredNames.has(name)) {
      skip('vendored', requesters)
      continue
    }
    if (input.vercelLockNames.has(name) && !input.previous[name]) {
      skip('vercel-lock', requesters)
      continue
    }

    let winners = requesters
    if (new Set(requesters.map(sourceKey)).size > 1) {
      const direct = requesters.filter(r => r.package === '.' || input.directDeps.has(r.package))
      if (new Set(direct.map(sourceKey)).size === 1) {
        winners = requesters.filter(r => sourceKey(r) === sourceKey(direct[0]))
      }
      else {
        skip('name-conflict', requesters, [...new Set(requesters.map(r => r.package))])
        continue
      }
      const losers = requesters.filter(r => !winners.includes(r))
      skip('name-conflict', losers, [...new Set(winners.map(r => r.package))])
    }

    const winner = winners[0]
    if (isInstalled(name, winner, input)) {
      installed.push({ name, package: winner.package, source: winner.source, ref: winner.ref })
      continue
    }
    for (const r of winners)
      addToGroup(r, [raw])
  }

  const bareSeen = new Set<string>()
  for (const request of requests.filter(r => r.skills.length === 0)) {
    const key = sourceKey(request)
    if (bareSeen.has(key))
      continue
    bareSeen.add(key)

    const recorded = Object.entries(input.previous)
      .filter(([, entry]) => sourceKey(entry) === key)
      .map(([name]) => name)
    if (recorded.length > 0 && recorded.every(name => isInstalled(name, request, input))) {
      for (const name of recorded)
        installed.push({ name, package: request.package, source: request.source, ref: request.ref })
      continue
    }
    addToGroup(request, [])
  }

  return { installs: [...groups.values()], installed, skipped }
}

export function addArgs(install: RemoteInstall, agents: AgentType[]): string[] {
  return [
    'add',
    sourceKey(install),
    ...(install.skills.length > 0 ? ['--skill', ...install.skills] : []),
    '-a',
    ...agents,
    '-y',
    '--json',
  ]
}

/**
 * No `-a`: a skill nobody requests anymore goes away for every agent, and the
 * CLI only clears the canonical copy and its lock entry when not scoped.
 */
export function removeArgs(names: string[]): string[] {
  return ['remove', ...names, '-y']
}

interface AddJsonResult {
  name: string
  status: 'installed' | 'skipped' | 'failed'
  reason?: string
  error?: string
}

function parseAddOutput(stdout: string): AddJsonResult[] {
  const parsed: unknown = JSON.parse(stdout)
  if (!Array.isArray(parsed) || !parsed.every(r => r && typeof r.name === 'string' && typeof r.status === 'string'))
    throw new Error('unexpected output from the skills CLI')
  return parsed
}

function describeFailure(args: string[], result: { exitCode: number, stderr: string }): Error {
  const detail = result.stderr.trim().split('\n').filter(Boolean).slice(-5).join('\n')
  return new Error(`skills ${args.join(' ')} exited with code ${result.exitCode}${detail ? `\n${detail}` : ''}`)
}

/**
 * Run every planned `skills add`, failing on the first source that does not
 * fully install so a broken pack never passes silently.
 */
export async function installRemote(installs: RemoteInstall[], agents: AgentType[], cwd: string, run: SkillsCliRunner): Promise<RemoteSkill[]> {
  const skills: RemoteSkill[] = []

  for (const install of installs) {
    const args = addArgs(install, agents)
    const result = await run(args, cwd)
    if (result.exitCode !== 0)
      throw describeFailure(args, result)

    for (const item of parseAddOutput(result.stdout)) {
      if (item.status !== 'installed')
        throw new Error(`skills add ${sourceKey(install)}: ${item.name} ${item.status}${item.error || item.reason ? ` (${item.error ?? item.reason})` : ''}`)
      const name = sanitizeSkillName(item.name)
      const requester = install.requests.find(r => r.skills.length === 0 || r.skills.some(s => sanitizeSkillName(s) === name)) ?? install.requests[0]
      skills.push({ name, package: requester.package, source: install.source, ref: install.ref })
    }
  }

  return skills
}

export async function removeRemote(names: string[], cwd: string, run: SkillsCliRunner): Promise<void> {
  if (names.length === 0)
    return
  const args = removeArgs(names)
  const result = await run(args, cwd)
  if (result.exitCode !== 0)
    throw describeFailure(args, result)
}

/**
 * Spawn the `skills` CLI bundled as our dependency. It has no programmatic
 * API; stdin is closed so a stray prompt can never hang the run.
 */
export const runSkillsCli: SkillsCliRunner = (args, cwd) => {
  const bin = join(dirname(createRequire(import.meta.url).resolve('skills/package.json')), 'bin/cli.mjs')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: string[] = []
    const stderr: string[] = []
    child.stdout.setEncoding('utf-8').on('data', chunk => stdout.push(chunk))
    child.stderr.setEncoding('utf-8').on('data', chunk => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', exitCode => resolve({ exitCode: exitCode ?? 1, stdout: stdout.join(''), stderr: stderr.join('') }))
  })
}
