export type AgentRow = {
  id: string
  task: string
  // Agent type it was spawned as (Explore, code-agent, ...).
  type: string
  status: string
  // Clock time the pane first saw the agent.
  startedAt: number
  // Clock time it finished; null while it still runs.
  endedAt: number | null
  // What the agent is doing right now; '' before its first tool call.
  current: string
}

export type Action = {
  text: string
  done: boolean
}

export type PlanStep = {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

declare module 'claude-code' {
  interface PluginState {
    'tollasmode': {
      model: string
      // Last skill any agent invoked this prompt; '' when none.
      skill: string
      // Skill name -> times invoked, across sessions (mirrored to $.store).
      skillCounts: Record<string, number>
      // Skill names available this session, so unused ones show at 0.
      skillNames: string[]
      // Agent type -> times spawned, across sessions (mirrored to $.store).
      agentCounts: Record<string, number>
      // Non-built-in agent types offered this session, so unused ones show at 0.
      agentNames: string[]
      actions: Action[]
      agents: AgentRow[]
      // Clock time of the last agent sync; drives elapsed times.
      now: number
      // Plan steps per loop: 'main' or a subagent id.
      plans: Record<string, PlanStep[]>
    }
  }
}
