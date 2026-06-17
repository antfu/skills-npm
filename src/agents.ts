import type { AgentType } from './types'
import type { CommandProbeOptions } from './utils/command'

import { agents, detectInstalledAgents } from '../vendor/skills/src/agents'
import { isCommandAvailable } from './utils/command'

export { agents, detectInstalledAgents } from '../vendor/skills/src/agents'

/**
 * Conservative map of agent -> CLI command(s) that land on PATH when the tool is
 * installed. Used to augment the vendored directory-based detection so agents
 * that are installed but have not created their home directory yet are still
 * found.
 *
 * Only agents with an unambiguous, definitely-a-CLI binary are included.
 * Agents whose command name is generic (e.g. `pi`, `goose`, `vibe`, `cn`) or
 * that are GUI-only (e.g. windsurf, trae, roo) are intentionally omitted; their
 * directory-based detection is more reliable. Disambiguated long aliases are
 * used where the short name collides (e.g. `kilocode`, not `kilo`).
 */
const AGENT_COMMANDS: Partial<Record<AgentType, string[]>> = {
  'adal': ['adal'],
  'amp': ['amp'],
  'augment': ['auggie'],
  'claude-code': ['claude'],
  'cline': ['cline'],
  'codebuddy': ['codebuddy'],
  'codex': ['codex'],
  'command-code': ['command-code', 'commandcode'],
  'crush': ['crush'],
  'cursor': ['cursor-agent'],
  'deepagents': ['deepagents'],
  'droid': ['droid'],
  'gemini-cli': ['gemini'],
  'github-copilot': ['copilot'],
  'iflow-cli': ['iflow'],
  'junie': ['junie'],
  'kilo': ['kilocode'],
  'kimi-cli': ['kimi'],
  'kiro-cli': ['kiro'],
  'kode': ['kode'],
  'neovate': ['neovate'],
  'openclaw': ['openclaw', 'clawdbot', 'moltbot'],
  'opencode': ['opencode'],
  'openhands': ['openhands'],
  'pochi': ['pochi'],
  'qwen-code': ['qwen'],
}

/**
 * Detect installed agents by probing for their CLI command on PATH.
 * Conservative and additive; see {@link AGENT_COMMANDS}.
 */
export async function detectAgentsByCommand(options?: CommandProbeOptions): Promise<AgentType[]> {
  const entries = Object.entries(AGENT_COMMANDS) as [AgentType, string[]][]
  const results = await Promise.all(
    entries.map(async ([type, commands]) => {
      const hits = await Promise.all(commands.map(command => isCommandAvailable(command, options)))
      return { type, installed: hits.some(Boolean) }
    }),
  )
  return results.filter(result => result.installed).map(result => result.type)
}

/**
 * All detected agents: the union of the vendored directory-based detection and
 * the command-on-PATH detection, deduplicated.
 */
export async function getDetectedAgents(): Promise<AgentType[]> {
  const [byDir, byCommand] = await Promise.all([
    detectInstalledAgents(),
    detectAgentsByCommand(),
  ])
  return [...new Set([...byDir, ...byCommand])]
}

export function getAllAgentTypes(): AgentType[] {
  return Object.keys(agents) as AgentType[]
}
