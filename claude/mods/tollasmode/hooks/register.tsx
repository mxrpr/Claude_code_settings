import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Action, AgentRow, PlanStep } from '../types'

const NAME = 'tollasmode'
const PANE = NAME
const MODELS = ['opus', 'sonnet', 'haiku', 'fable']
const VERSIONS: Record<string, string> = { opus: '5.5', sonnet: '5.5', haiku: '4.5', fable: '5.1' }
const labelOf = (x: string) => `${x} ${VERSIONS[x] ?? ''}`.trim()
const MAX_BULLETS = 4
// Finished agents stay visible this long, so a failure is not missed.
const LINGER_MS = 30_000
// More agents than this draw one line each, plan steps hidden.
const COMPACT_AFTER = 3

const model = atom({ plugin: 'tollasmode', key: 'model' } as const, '')
const skill = atom({ plugin: 'tollasmode', key: 'skill' } as const, '')
const skillCounts = atom({ plugin: 'tollasmode', key: 'skillCounts' } as const, {})
const skillNames = atom({ plugin: 'tollasmode', key: 'skillNames' } as const, [])
const agentCounts = atom({ plugin: 'tollasmode', key: 'agentCounts' } as const, {})
const agentNames = atom({ plugin: 'tollasmode', key: 'agentNames' } as const, [])
const SKILL_STORE_KEY = 'skillCounts'
const AGENT_STORE_KEY = 'agentCounts'
const TOP_SKILLS = 5 // rows per chart
// Commands this mod registers itself; not skills.
const OWN_COMMANDS = new Set(['tollasmode'])
const actions = atom({ plugin: 'tollasmode', key: 'actions' } as const, [])
const agents = atom({ plugin: 'tollasmode', key: 'agents' } as const, [])
const now = atom({ plugin: 'tollasmode', key: 'now' } as const, 0)
const plans = atom({ plugin: 'tollasmode', key: 'plans' } as const, {})
const MAIN = 'main'
const MAX_PLAN_STEPS = 12

const base = (p: unknown) => (typeof p === 'string' ? (p.split('/').pop() ?? p) : '')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

// Every known name with its count (0 when unused), most used first, top TOP_SKILLS.
function topRanked(names: string[], counts: Record<string, number>): Array<readonly [string, number]> {
  return [...new Set([...names, ...Object.keys(counts)])]
    .map(n => [n, counts[n] ?? 0] as const)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_SKILLS)
}

// Plugin skills and agents are named `plugin:skill`; the skill part alone tells them apart.
const shortName = (n: string) => n.slice(n.lastIndexOf(':') + 1)

// Scale under the bars: 0 at the left, the max at the right, the half in the middle.
function scaleAxis(max: number, width: number): string {
  const line = Array.from({ length: width }, () => ' ')
  const put = (at: number, label: string) => {
    const start = Math.max(0, Math.min(width - label.length, at))
    for (let i = 0; i < label.length; i++) line[start + i] = label[i] ?? ' '
  }
  put(0, '0')
  if (max >= 4) put(Math.round(width / 2) - 1, String(Math.round(max / 2)))
  put(width - String(max).length, String(max))
  return line.join('')
}

function describe(tool: string, a: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `Reading ${base(a.file_path)}`
    case 'Edit':
    case 'Write':
      return `Editing ${base(a.file_path)}`
    case 'Bash':
      return cut(String(a.description ?? a.command ?? 'Shell'), 40)
    case 'Grep':
    case 'Glob':
      return `Searching ${cut(String(a.pattern ?? ''), 28)}`
    case 'Agent':
      return `Agent: ${cut(String(a.description ?? ''), 34)}`
    case 'Skill':
      return `Skill: ${cut(String(a.skill ?? ''), 33)}`
    case 'WebFetch':
    case 'WebSearch':
      return 'Web lookup'
    default:
      return cut(tool.replace(/^mcp__[^_]+__/, ''), 40)
  }
}

const FINISHED = new Set(['completed', 'failed', 'killed'])
const FAILED = new Set(['failed', 'killed'])

// Pull the agent list: new agents join, finished ones get an end time and
// linger for LINGER_MS, then drop along with their plans.
async function sync($: EngineInterface) {
  const live = await $.agent.list()
  const t = await $.clock.now()
  await update($, now, () => t)
  await update($, agents, list => {
    const next: AgentRow[] = []
    for (const r of list) {
      const l = live.find(x => x.id === r.id)
      if (r.endedAt !== null) {
        if (t - r.endedAt < LINGER_MS) next.push(r)
      } else if (l === undefined || FINISHED.has(l.status)) {
        next.push({ ...r, status: l?.status ?? 'completed', endedAt: t, current: '' })
      } else {
        next.push({ ...r, status: l.status, task: l.description || l.type })
      }
    }
    for (const l of live) {
      if (FINISHED.has(l.status) || list.some(r => r.id === l.id)) continue
      next.push({ id: l.id, task: l.description || l.type, type: l.type, status: l.status, startedAt: t, endedAt: null, current: '' })
    }
    return next
  })
  const kept = new Set((await read($, agents)).map(r => r.id))
  await update($, plans, all => {
    const stale = Object.keys(all).filter(k => k !== MAIN && !kept.has(k))
    if (stale.length === 0) return all
    const next = { ...all }
    for (const k of stale) delete next[k]
    return next
  })
}

type Todo = { content: string; status: PlanStep['status'] }

// Plan steps come from TodoWrite (whole list) and TaskCreate/TaskUpdate (one task each).
async function trackPlan($: EngineInterface, key: string, tool: string, a: Record<string, unknown>, out: unknown) {
  if (tool === 'TodoWrite' && Array.isArray(a.todos)) {
    const steps = (a.todos as Todo[]).map((t, i) => ({ id: `todo-${i}`, text: t.content, status: t.status }))
    await update($, plans, all => ({ ...all, [key]: steps }))
  } else if (tool === 'TaskCreate') {
    const id = (out as { task?: { id?: string } } | undefined)?.task?.id
    if (id === undefined) return
    const step: PlanStep = { id: `task-${id}`, text: String(a.subject ?? ''), status: 'pending' }
    await update($, plans, all => ({ ...all, [key]: [...(all[key] ?? []).filter(s => s.id.startsWith('task-')), step] }))
  } else if (tool === 'TaskUpdate') {
    const id = `task-${String(a.taskId ?? '')}`
    const status = a.status as PlanStep['status'] | 'deleted' | undefined
    const subject = typeof a.subject === 'string' ? a.subject : undefined
    await update($, plans, all => {
      const next: Record<string, PlanStep[]> = {}
      for (const [k, steps] of Object.entries(all)) {
        next[k] = steps
          .filter(s => !(s.id === id && status === 'deleted'))
          .map(s => (s.id === id ? { ...s, status: status && status !== 'deleted' ? status : s.status, text: subject ?? s.text } : s))
      }
      return next
    })
  }
}

const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])
// The model's own way to put a plan in the pane, where TodoWrite is missing.
const PANE_PLAN = 'PanePlan'
const PANE_PLAN_TOOL = `mcp__tollasmode__${PANE_PLAN}`
const STEP_STATUSES = ['pending', 'in_progress', 'completed'] as const

// PanePlan's input: the whole step list each call, as TodoWrite takes it.
function parsePlan(a: Record<string, unknown>): PlanStep[] | string {
  if (!Array.isArray(a.steps)) return 'steps must be an array of { text, status }'
  const steps: PlanStep[] = []
  for (const [i, raw] of (a.steps as unknown[]).entries()) {
    const step = raw as { text?: unknown; status?: unknown }
    if (typeof step.text !== 'string' || step.text === '') return `steps[${i}].text must be a non-empty string`
    const status = STEP_STATUSES.find(x => x === step.status)
    if (status === undefined) return `steps[${i}].status must be one of ${STEP_STATUSES.join(', ')}`
    steps.push({ id: `pane-${i}`, text: step.text, status })
  }
  return steps
}

// Skills are the person's and the plugins' slash commands; built-ins and MCP are not.
async function loadSkillNames($: EngineInterface) {
  const cmds = await $.command.list()
  const names = cmds.filter(c => (c.source === 'user' || c.source === 'plugin') && !OWN_COMMANDS.has(c.name)).map(c => c.name)
  await update($, skillNames, () => names)
}

async function ensureKnown($: EngineInterface, id: string) {
  if (!(await read($, agents)).some(r => r.id === id)) await sync($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: NAME, description: 'Show/hide the tollasmode pane' })
    await $.tool.register({
      name: PANE_PLAN,
      description:
        'Show a step-by-step plan in the tollasmode pane, where the person watches it. Send the whole list every call: ' +
        'first all steps as pending, then mark the step you start in_progress, and completed when it is done (it turns green).',
      inputSchema: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The step, a few words' },
                status: { type: 'string', enum: [...STEP_STATUSES] },
              },
              required: ['text', 'status'],
            },
          },
        },
        required: ['steps'],
      },
    })
    void $.ui.open({ id: PANE, title: 'Tollasmode' })
    const stored = await $.store.get(SKILL_STORE_KEY)
    if (stored !== null && typeof stored === 'object') {
      await update($, skillCounts, () => stored as Record<string, number>)
    }
    const storedAgents = await $.store.get(AGENT_STORE_KEY)
    if (storedAgents !== null && typeof storedAgents === 'object') {
      await update($, agentCounts, () => storedAgents as Record<string, number>)
    }
    await loadSkillNames($)
    $.clock.every(2000, () => void sync($))
    return next(e)
  })

  on('command.run', { command: NAME }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Tollasmode hidden.' }
    }
    await $.ui.open({ id: PANE, title: 'Tollasmode' })
    return { text: 'Tollasmode shown.' }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, model, () => e.model)
    } else {
      await ensureKnown($, e.agentId)
    }
    return yield* next(e)
  })

  // No hook beneath answers the mod's own tool: this one does.
  on('tool.call', { tool: PANE_PLAN_TOOL }, async ($, e) => {
    const steps = parsePlan(e as unknown as Record<string, unknown>)
    if (typeof steps === 'string') return { result: steps, isError: true }
    const key = e.agentId ?? MAIN
    await update($, plans, all => ({ ...all, [key]: steps }))
    const done = steps.filter(s => s.status === 'completed').length
    return { result: `Plan shown in the pane: ${done}/${steps.length} done.` }
  })

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    const id = e.agentId
    const line = describe(e.tool, args)
    if (id === undefined) {
      await update($, actions, list => [...list.filter(l => l.text !== line), { text: line, done: false }].slice(-MAX_BULLETS))
    } else if (!PLAN_TOOLS.has(e.tool)) {
      await ensureKnown($, id)
      await update($, agents, list => list.map(r => (r.id === id && r.endedAt === null ? { ...r, current: line } : r)))
    }
    const res = await next(e)
    if (id === undefined) {
      await update($, actions, list => list.map(l => (l.text === line ? { ...l, done: true } : l)))
    }
    if (PLAN_TOOLS.has(e.tool) && res.deny === undefined && res.isError !== true) {
      await trackPlan($, id ?? MAIN, e.tool, args, res.result)
    }
    return res
  })

  // Fires for a typed /skill and a Skill tool call alike: one count each.
  on('skill.prompt', async ($, e, next) => {
    const name = e.skill
    await update($, skill, () => name)
    await update($, skillCounts, all => ({ ...all, [name]: (all[name] ?? 0) + 1 }))
    await $.store.set(SKILL_STORE_KEY, await read($, skillCounts))
    return next(e)
  })

  // Each agent type offered to the model passes here; the person's and the
  // plugins' ones are listed in the chart even before their first use.
  on('agent.offer', async ($, e, next) => {
    if (e.source !== 'built-in') {
      const name = e.agent
      await update($, agentNames, list => (list.includes(name) ? list : [...list, name]))
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const name = e.subagentType || 'general-purpose'
    await update($, agentCounts, all => ({ ...all, [name]: (all[name] ?? 0) + 1 }))
    await $.store.set(AGENT_STORE_KEY, await read($, agentCounts))
    return next(e)
  })

  // The skill line and a finished main plan clear when the next prompt comes in.
  on('prompt.submit', async ($, e, next) => {
    await update($, skill, () => '')
    await update($, plans, all => {
      const main = all[MAIN]
      if (main === undefined || main.some(s => s.status !== 'completed')) return all
      const { [MAIN]: _, ...rest } = all
      return rest
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) void sync($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = Math.max(24, e.props.bodyColumns)
    const m = await read($, model)
    const bullets: Action[] = await read($, actions)
    const allPlans = await read($, plans)
    const usedSkill = await read($, skill)
    const rows: AgentRow[] = await read($, agents)
    const t = await read($, now)
    const skillRanked = topRanked(await read($, skillNames), await read($, skillCounts))
    const agentRanked = topRanked(await read($, agentNames), await read($, agentCounts))
    // Framed horizontal bars: a faint track per row, filled by use against the top one.
    const barChart = (id: string, title: string, top: Array<readonly [string, number]>) => {
      if (top.length === 0) return null
      const maxUses = Math.max(1, top[0]?.[1] ?? 0)
      const countW = String(maxUses).length
      // Inside the frame: 2 border cells, 1 padding cell each side.
      const inner = cols - 4
      // Names get at most 40% of the row, so the bars always fit beside them.
      const nameW = Math.min(Math.floor(inner * 0.4), Math.max(...top.map(([n]) => shortName(n).length), 4))
      const barW = Math.max(3, inner - nameW - countW - 2)
      return (
        <Box key={`chart-${id}`} flexDirection="column" borderStyle="single" paddingX={1}>
          <Text bold>{title}</Text>
          {top.map(([n, c]) => {
            const filled = c === 0 ? 0 : Math.max(1, Math.round((c / maxUses) * barW))
            return (
              <Text key={`${id}-${n}`}>
                {`${cut(shortName(n), nameW).padEnd(nameW)} `}
                <Text color="cyan">{'█'.repeat(filled)}</Text>
                <Text dimColor>{'░'.repeat(barW - filled)}</Text>
                {` ${String(c).padStart(countW)}`}
              </Text>
            )
          })}
          <Text dimColor>{`${' '.repeat(nameW + 1)}${scaleAxis(maxUses, barW)}`}</Text>
        </Box>
      )
    }
    const current = MODELS.find(x => m.includes(x)) ?? MODELS[0]
    const pipe = <Text color="green">│</Text>
    const planList = (key: string) =>
      (allPlans[key] ?? []).slice(0, MAX_PLAN_STEPS).map(s =>
        s.status === 'completed' ? (
          <Text key={`${key}-${s.id}`}>
            {'  '}
            {pipe} <Text dimColor>{cut(s.text, cols - 4)}</Text>
          </Text>
        ) : s.status === 'in_progress' ? (
          <Text key={`${key}-${s.id}`} bold>
            {'  '}• {cut(s.text, cols - 4)}
          </Text>
        ) : (
          <Text key={`${key}-${s.id}`} dimColor>
            {'  '}○ {cut(s.text, cols - 4)}
          </Text>
        ),
      )

    const running = rows.filter(r => r.endedAt === null).length
    const done = rows.filter(r => r.status === 'completed').length
    const failed = rows.filter(r => FAILED.has(r.status)).length
    const header = ['Agents', `${running} running`, done > 0 ? `${done} done` : '', failed > 0 ? `${failed} failed` : '']
      .filter(Boolean)
      .join(' · ')
      .replace('Agents · ', 'Agents ')
    const compact = rows.length > COMPACT_AFTER
    const icon = (r: AgentRow) =>
      r.status === 'completed' ? (
        <Text color="green">✓</Text>
      ) : FAILED.has(r.status) ? (
        <Text color="red">✗</Text>
      ) : r.status === 'running' ? (
        <Text color="yellow">•</Text>
      ) : (
        <Text dimColor>◦</Text>
      )
    const doing = (r: AgentRow) => {
      if (r.endedAt !== null) return FAILED.has(r.status) ? r.status : ''
      if (r.current !== '') return r.current
      const step = (allPlans[r.id] ?? []).find(s => s.status === 'in_progress')
      return step ? step.text : r.status === 'running' ? 'starting' : r.status
    }

    return (
      <Box flexDirection="column">
        {usedSkill !== '' && <Text color="cyan">Use skill: {usedSkill}</Text>}
        <Box flexDirection="row" gap={1}>
          {MODELS.map(x =>
            x === current ? (
              <Button key={`model-${x}`} variant="primary" onPress={() => undefined}>
                {labelOf(x)}
              </Button>
            ) : (
              <Button
                key={`model-${x}`}
                plain
                dimColor
                onPress={() => {
                  void update($, model, () => x)
                  void $.command.run({ command: 'model', args: x })
                }}
              >
                {labelOf(x)}
              </Button>
            ),
          )}
        </Box>
        {barChart('skill', 'Top skills', skillRanked)}
        {barChart('agent', 'Top agents', agentRanked)}
        {bullets.length === 0 ? (
          <Text dimColor>• idle</Text>
        ) : (
          bullets.map((b, i) =>
            b.done ? (
              <Text key={`act-${b.text}`}>
                {pipe} <Text dimColor={i !== bullets.length - 1}>{b.text}</Text>
              </Text>
            ) : (
              <Text key={`act-${b.text}`}>• {b.text}</Text>
            ),
          )
        )}
        {(allPlans[MAIN]?.length ?? 0) > 0 && <Text bold>Plan</Text>}
        {planList(MAIN)}
        {rows.length > 0 && <Text bold>{header}</Text>}
        {rows.map(r => {
          const time = elapsed((r.endedAt ?? t) - r.startedAt)
          const ended = r.endedAt !== null
          if (compact) {
            const tail = doing(r)
            const head = `${cut(r.task, 18)} ${time}`
            return (
              <Text key={`agent-${r.id}`} dimColor={ended}>
                {icon(r)} {tail !== '' ? `${head} ${cut(tail, cols - head.length - 3)}` : head}
              </Text>
            )
          }
          const tail = doing(r)
          const meta = `${r.type} ${time}`
          return (
            <Box key={`agent-${r.id}`} flexDirection="column">
              <Text dimColor={ended}>
                {icon(r)} {cut(r.task, cols - meta.length - 3)} <Text dimColor>{meta}</Text>
              </Text>
              {tail !== '' && <Text dimColor>{`  ↳ ${cut(tail, cols - 4)}`}</Text>}
              {!ended && planList(r.id)}
            </Box>
          )
        })}
      </Box>
    )
  })
}
