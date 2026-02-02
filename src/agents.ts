import type { AgentType } from './types'
import { agents, detectInstalledAgents } from '../vendor/skills/src/agents'

export async function getDetectedAgents(): Promise<AgentType[]> {
  return detectInstalledAgents()
}

export function getAllAgentTypes(): AgentType[] {
  return Object.keys(agents) as AgentType[]
}
