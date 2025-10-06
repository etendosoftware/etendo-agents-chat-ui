import type { Agent } from './chat-interface'

export interface AgentSelectorProps {
  agents: Agent[]
  selectedAgent: Agent | null
  onSelectAgent: (agent: Agent) => void
}
