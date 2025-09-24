"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import type { AgentSelectorProps } from "./agent-selector-props"

export default function AgentSelector({ agents, selectedAgent, onSelectAgent }: AgentSelectorProps) {
  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <Card
          key={agent.id}
          className={`p-3 cursor-pointer transition-all hover:scale-105 ${
            selectedAgent?.id === agent.id ? "ring-2 ring-primary bg-primary/10" : "glass-effect hover:bg-white/5"
          }`}
          onClick={() => onSelectAgent(agent)}
        >
          <div className="flex items-center gap-3">
            <Avatar className={`${agent.color} border border-white/20`}>
              <AvatarFallback className="bg-transparent text-lg">{agent.icon}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-card-foreground text-sm truncate">{agent.name}</h4>
              <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
