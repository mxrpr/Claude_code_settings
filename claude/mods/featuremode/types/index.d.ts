export type BoardStep = {
  num: string
  step: string
  // not ready | ongoing | blocked | done (free text kept as written)
  status: string
  agent: string
  doing: string
}

export type BoardAgent = {
  agent: string
  step: string
}

export type Board = {
  feature: string
  phase: string
  updated: string
  steps: BoardStep[]
  agents: BoardAgent[]
}

declare module 'claude-code' {
  interface PluginState {
    'featuremode': {
      // Absolute path of the status.md being shown; '' when none found.
      path: string
      // Parsed board; null when no status.md was found.
      board: Board | null
      // mtimeMs of the last parsed read, to skip unchanged files.
      mtime: number
    }
  }
}
