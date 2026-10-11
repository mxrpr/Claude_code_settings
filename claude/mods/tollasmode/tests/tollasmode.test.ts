import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const PANE = {
  title: 'Tollasmode',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

test('main-loop Read shows as activity bullet in the pane', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Read', file_path: '/a/b/foo.rs' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'tollasmode', surface, component: 'Pane', props: PANE, requestId: 'tollasmode' })
    expect(await pane.find({ type: 'Text', text: '│ Reading foo.rs' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '│', color: 'green' } as never)).toBeDefined()
    expect(await pane.find({ type: 'Button', text: 'haiku 4.5' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '• idle' })).toBeUndefined()
  }
})

test('empty session shows idle', async $ => {
  const pane = await $.ui.mount({ plugin: 'tollasmode', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'tollasmode' })
  expect(await pane.find({ type: 'Text', text: '• idle' })).toBeDefined()
})

test('models drawn side by side, current one primary, others pressable', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'tollasmode', surface, component: 'Pane', props: PANE, requestId: 'tollasmode' })
    for (const m of ['opus', 'sonnet', 'haiku', 'fable']) {
      expect(await pane.find({ type: 'Button', key: `model-${m}` })).toBeDefined()
    }
    const drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('"variant":"primary"')
  }
})

test('/tollasmode toggles the pane: shown, then hidden', async ($, on) => {
  const open = new Set<string>()
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id })) }) as never)
  on('ui.open', (_$, e) => (open.add(e.id), { value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e) => (open.delete(e.id), { value: undefined }))

  const shown = await $.command.run({ command: 'tollasmode', args: '' } as never)
  expect(open.has('tollasmode')).toBe(true)
  expect(shown.text).toBe('Tollasmode shown.')

  const hidden = await $.command.run({ command: 'tollasmode', args: '' } as never)
  expect(open.has('tollasmode')).toBe(false)
  expect(hidden.text).toBe('Tollasmode hidden.')
})

test('in-flight tool shows bullet, finished one shows green pipe', async ($, on) => {
  let seen: string | undefined
  on('tool.call', async () => {
    const pane = await $.ui.mount({ plugin: 'tollasmode', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'tollasmode' })
    seen = (await pane.find({ type: 'Text', text: '• Reading bar.rs' })) ? 'bullet' : 'none'
    return { result: 'ok' }
  })
  await $.tool.call({ tool: 'Read', file_path: '/x/bar.rs' })
  expect(seen).toBe('bullet')
})

test('TodoWrite plan steps listed, completed ones with green pipe', async ($, on) => {
  on('tool.call', () => ({ result: {} }) as never)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Write parser', status: 'completed', activeForm: 'Writing parser' },
      { content: 'Add tests', status: 'in_progress', activeForm: 'Adding tests' },
      { content: 'Update docs', status: 'pending', activeForm: 'Updating docs' },
    ],
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'tollasmode', surface, component: 'Pane', props: PANE, requestId: 'tollasmode' })
    expect(await pane.find({ type: 'Text', text: 'Plan' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  │ Write parser' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  • Add tests' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  ○ Update docs' })).toBeDefined()
  }
})

test('TaskCreate adds a step, TaskUpdate completes it', async ($, on) => {
  let n = 0
  on('tool.call', (_$, e) => (e.tool === 'TaskCreate' ? { result: { task: { id: String(++n), subject: 'x' } } } : { result: {} }) as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Build index', description: '' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Ship it', description: '' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)

  const pane = await $.ui.mount({ plugin: 'tollasmode', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'tollasmode' })
  expect(await pane.find({ type: 'Text', text: '  │ Build index' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '  ○ Ship it' })).toBeDefined()
})

test('skill used by an agent shows above the model list', async ($, on) => {
  skillWorld(on)
  await $.skill.prompt({ skill: 'quality-bar', text: '' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'tollasmode', surface, component: 'Pane', props: PANE, requestId: 'tollasmode' })
    expect(await pane.find({ type: 'Text', text: 'Use skill: quality-bar' })).toBeDefined()
    const drawn = JSON.stringify(await pane.drawn())
    expect(drawn.indexOf('Use skill: quality-bar')).toBeLessThan(drawn.indexOf('model-opus'))
  }
})


// Stand-ins for the engine calls the skill chart path makes.
// Returns the names of the model tools the mod registered.
function skillWorld(on: On): string[] {
  const tools: string[] = []
  on('tool.register', (_$, e) => (tools.push(e.name), { value: { tool: `mcp__tollasmode__${e.name}` } }) as never)
  mock.store(on)
  mock.clock(on)
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.start', (_$, e) => e as never)
  return tools
}

const startSession = ($: Engine) => $.session.start({ source: 'startup', cwd: '/tmp' } as never)

type Live = { id: string; description: string; type: string; status: string }

const mountPane = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'tollasmode', surface, component: 'Pane', props: PANE, requestId: 'tollasmode' })

// A tool call from an agent the pane does not know makes it re-read the agent list.
const resync = ($: Engine) =>
  $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'nobody' } as never)

function agentWorld(on: On, live: Live[]) {
  on('agent.list', () => ({ value: live }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
}

test("each agent shows what it is doing now, under a running count", async ($, on) => {
  mock.clock(on)
  agentWorld(on, [
    { id: 'a1', description: 'Find auth code', type: 'Explore', status: 'running' },
    { id: 'a2', description: 'Write parser', type: 'code-agent', status: 'running' },
  ])
  await $.tool.call({ tool: 'Read', file_path: '/src/auth.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', description: 'Run cargo test', agentId: 'a2' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await mountPane($, surface)
    expect(await pane.find({ type: 'Text', text: 'Agents 2 running' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  ↳ Reading auth.ts' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  ↳ Run cargo test' })).toBeDefined()
    // Agent actions stay out of the main thread's bullets.
    expect(await pane.find({ type: 'Text', text: '• idle' })).toBeDefined()
  }
})

test('elapsed time counts from when the agent was first seen', async ($, on) => {
  const clock = mock.clock(on)
  agentWorld(on, [{ id: 'a1', description: 'Find auth code', type: 'Explore', status: 'running' }])
  await resync($)
  await clock.advance(65_000)
  await resync($)
  const drawn = JSON.stringify(await (await mountPane($)).drawn())
  expect(drawn).toContain('Explore 1m05s')
})

test('finished agents linger with ✓ or ✗, then drop after 30s', async ($, on) => {
  const clock = mock.clock(on)
  const live: Live[] = [
    { id: 'a1', description: 'Find auth code', type: 'Explore', status: 'running' },
    { id: 'a2', description: 'Write parser', type: 'code-agent', status: 'running' },
  ]
  agentWorld(on, live)
  await resync($)
  live[0]!.status = 'completed'
  live[1]!.status = 'failed'
  await clock.advance(1000)
  await resync($)

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'Agents 0 running · 1 done · 1 failed' })).toBeDefined()
  let drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('✓')
  expect(drawn).toContain('✗')
  expect(await pane.find({ type: 'Text', text: '  ↳ failed' })).toBeDefined()

  await clock.advance(31_000)
  await resync($)
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).not.toContain('Find auth code')
  expect(drawn).not.toContain('Agents')
})

test('more than 3 agents draw one line each, plan steps hidden', async ($, on) => {
  mock.clock(on)
  on('agent.list', () =>
    ({ value: ['a1', 'a2', 'a3', 'a4'].map(id => ({ id, description: `Task ${id}`, type: 'Explore', status: 'running' })) }) as never,
  )
  on('tool.call', () => ({ result: {} }) as never)
  await $.tool.call({
    tool: 'TodoWrite',
    agentId: 'a1',
    todos: [
      { content: 'Scan repo', status: 'in_progress', activeForm: 'Scanning' },
      { content: 'Report', status: 'pending', activeForm: 'Reporting' },
    ],
  } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a2' } as never)

  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'Agents 4 running' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '  ○ Report' })).toBeUndefined()
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('Task a2 0s Searching TODO')
  expect(drawn).toContain('Task a3 0s starting')
  // A plan tool call leaves the live line alone; the current plan step shows instead.
  expect(drawn).toContain('Task a1 0s Scan repo')
})

test('top skills drawn as bars under the models, most used first', async ($, on) => {
  skillWorld(on)
  for (let i = 0; i < 3; i++) await $.skill.prompt({ skill: 'commit-clean', text: '' })
  await $.skill.prompt({ skill: 'quality-bar', text: '' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await mountPane($, surface)
    const drawn = JSON.stringify(await pane.drawn())
    expect(drawn.indexOf('model-fable')).toBeLessThan(drawn.indexOf('Top skills'))
    const top = drawn.slice(drawn.indexOf('Top skills'))
    expect(top.indexOf('commit-clean')).toBeLessThan(top.indexOf('quality-bar'))
    // Track is 40 cols - 4 frame - 12 name - 1 count - 2 gaps = 21 cells.
    // Most used fills it; 1 of 3 fills a third, the rest a faint track.
    expect(top).toContain(`"${'█'.repeat(21)}"`)
    expect(top).toContain(`"${'█'.repeat(7)}"`)
    expect(top).toContain(`"${'░'.repeat(14)}"`)
    expect(top).toContain('" 3"')
    expect(top).toContain('" 1"')
    expect(drawn).toContain('"borderStyle":"single"')
    // Scale axis: 0 under the bar start, the max (3) under its end.
    expect(top).toContain(`"${' '.repeat(13)}0${' '.repeat(19)}3"`)
  }
})

test('every skill is listed by name, unused ones at 0, built-ins and own commands left out', async ($, on) => {
  skillWorld(on)
  on('command.list', () =>
    ({
      value: [
        { name: 'help', description: '', source: 'builtin' },
        { name: 'quality-bar', description: '', source: 'user' },
        { name: 'caveman', description: '', source: 'plugin' },
        { name: 'tollasmode', description: '', source: 'plugin' },
        { name: 'github__issue', description: '', source: 'mcp' },
      ],
    }) as never,
  )
  await startSession($)
  await $.skill.prompt({ skill: 'quality-bar', text: '' })

  const drawn = JSON.stringify(await (await mountPane($)).drawn())
  const top = drawn.slice(drawn.indexOf('Top skills'))
  expect(top.indexOf('quality-bar')).toBeLessThan(top.indexOf('caveman'))
  // An unused skill still gets a full faint track.
  expect(top).toContain('" 0"')
  expect(top).toMatch(/"░{20,}"/)
  for (const absent of ['"help', '"tollasmode ', 'github__issue']) expect(top).not.toContain(absent)
})

test('only the top 5 skills show, long and plugin-prefixed names cut to fit', async ($, on) => {
  skillWorld(on)
  on('command.list', () =>
    ({
      value: [
        ...Array.from({ length: 6 }, (_, i) => ({ name: `s${i}`, description: '', source: 'user' })),
        { name: 'comprehensive-review:full-review', description: '', source: 'plugin' },
        { name: 'a-very-long-skill-name-here', description: '', source: 'user' },
      ],
    }) as never,
  )
  await startSession($)
  await $.skill.prompt({ skill: 'comprehensive-review:full-review', text: '' })
  await $.skill.prompt({ skill: 'a-very-long-skill-name-here', text: '' })
  const drawn = JSON.stringify(await (await mountPane($)).drawn())
  const top = drawn.slice(drawn.indexOf('Top skills'))
  // Prefix dropped; 40 cols - 4 frame = 36, names get 14 at most.
  expect(top).toContain('"full-review    "')
  expect(top).toContain('"a-very-long-s… "')
  expect(top).not.toContain('comprehensive-review')
  for (const shown of ['s0', 's1', 's2']) expect(top).toContain(`"${shown}`)
  for (const hidden of ['"s3', '"s4', '"s5', 'more']) expect(top).not.toContain(hidden)
})

test('agents chart under the skills chart: own agents listed at 0, spawns counted, built-ins only once used', async ($, on) => {
  skillWorld(on)
  on('agent.offer', () => ({ isOffered: true }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5' }) as never)
  const provider = { plugin: 'engine', tier: 'core' } as never
  for (const [agent, source] of [
    ['code-agent', 'userSettings'],
    ['test-runner', 'userSettings'],
    ['Explore', 'built-in'],
    ['Plan', 'built-in'],
  ] as const) {
    await $.agent.offer({ agent, description: '', source, provider })
  }
  for (const t of ['code-agent', 'code-agent', 'Explore']) {
    await $.agent.spawn({ prompt: 'p', description: 'd', subagentType: t, provider } as never)
  }
  await $.skill.prompt({ skill: 'quality-bar', text: '' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const drawn = JSON.stringify(await (await mountPane($, surface)).drawn())
    expect(drawn.indexOf('Top skills')).toBeLessThan(drawn.indexOf('Top agents'))
    const top = drawn.slice(drawn.indexOf('Top agents'))
    expect(top.indexOf('code-agent')).toBeLessThan(top.indexOf('Explore'))
    expect(top.indexOf('Explore')).toBeLessThan(top.indexOf('test-runner'))
    expect(top).toContain('" 2"')
    expect(top).toContain('" 0"')
    // A built-in never spawned stays out.
    expect(top).not.toContain('Plan')
  }
})

test('PanePlan shows the plan; done steps green, current bold, rest pending', async ($, on) => {
  const tools = skillWorld(on)
  await startSession($)
  expect(tools).toEqual(['PanePlan'])

  const res = await $.tool.call({
    tool: 'mcp__tollasmode__PanePlan',
    steps: [
      { text: 'Back up mod', status: 'completed' },
      { text: 'Stage copy', status: 'in_progress' },
      { text: 'Swap folders', status: 'pending' },
    ],
  } as never)
  expect(String(res.result)).toBe('Plan shown in the pane: 1/3 done.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await mountPane($, surface)
    expect(await pane.find({ type: 'Text', text: 'Plan' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  │ Back up mod' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  • Stage copy' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  ○ Swap folders' })).toBeDefined()
  }
})

test('PanePlan rejects a step with an unknown status', async ($, on) => {
  skillWorld(on)
  const res = await $.tool.call({ tool: 'mcp__tollasmode__PanePlan', steps: [{ text: 'x', status: 'done' }] } as never)
  expect(res.isError).toBe(true)
  expect(String(res.result)).toContain('steps[0].status must be one of pending, in_progress, completed')
})
