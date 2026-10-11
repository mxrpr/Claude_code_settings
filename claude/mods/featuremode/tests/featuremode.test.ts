import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

const PANE = {
  title: 'Feature',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const WORKTREE = '/repo/.worktrees/42-demo'
const STATUS = `${WORKTREE}/.claude/feature/status.md`

const BOARD = `# Feature: demo-feature
Input: plan.md
Branch / worktree: 42-demo / ${WORKTREE}
Plan: ${WORKTREE}/plan.md
Phase: 5 Test
Updated: 2026-10-11 14:02

## Steps
| # | Step         | Status    | Agent        | Doing now                 |
|---|--------------|-----------|--------------|---------------------------|
| 1 | Add parser   | done      | -            | -                         |
| 2 | Wire handler | ongoing   | test-runner  | running parser tests      |
| 3 | Update docs  | not ready | -            | -                         |

Status: not ready | ongoing | blocked | done

## Agents
| Agent        | agentId | Status file           | Current step |
|--------------|---------|-----------------------|--------------|
| code-agent   | a1      | agents/code-agent.md  | -            |
| test-runner  | a2      | agents/test-runner.md | 2            |
`

// A fake disk holding only the given files; cwd is a subfolder of the worktree.
function disk(on: On, files: Record<string, string>, cwd = `${WORKTREE}/src`) {
  const open = new Set<string>()
  on('session.cwd', () => ({ value: cwd }))
  on('fs.exists', (_$, e) => ({ value: (e as { path: string }).path in files }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)
  on('fs.read', (_$, e) => ({ value: files[(e as { path: string }).path] ?? '' }) as never)
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id })) }) as never)
  on('ui.open', (_$, e) => (open.add(e.id), { value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e) => (open.delete(e.id), { value: undefined }))
  return open
}

const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'featuremode', surface, component: 'Pane', props: PANE, requestId: 'featuremode' })

test('status.md found from a subfolder: steps, statuses and agents drawn', async ($, on) => {
  disk(on, { [STATUS]: BOARD })
  await $.command.run({ command: 'featuremode', args: '' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await mount($, surface)
    expect(await pane.find({ type: 'Text', text: 'demo-feature' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Phase 5 Test · 1/3 done · updated 2026-10-11 14:02' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '✓ 1. Add parser' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '• 2. Wire handler [test-runner]' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '  ↳ running parser tests' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '○ 3. Update docs' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'test-runner → step 2' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'code-agent idle' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'No feature running (.claude/feature/status.md not found)' })).toBeUndefined()
  }
})

test('blocked step drawn with a red cross', async ($, on) => {
  disk(on, { [STATUS]: BOARD.replace('| ongoing   |', '| blocked   |') })
  await $.command.run({ command: 'featuremode', args: '' } as never)
  const pane = await mount($)
  expect(await pane.find({ type: 'Text', text: '✗', color: 'red' } as never)).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '•', color: 'yellow' } as never)).toBeUndefined()
})

test('no status.md: says no feature is running, no steps', async ($, on) => {
  disk(on, {})
  await $.command.run({ command: 'featuremode', args: '' } as never)
  const pane = await mount($)
  expect(await pane.find({ type: 'Text', text: 'No feature running (.claude/feature/status.md not found)' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '✓ 1. Add parser' })).toBeUndefined()
})

test('/featuremode toggles the pane: shown, then hidden', async ($, on) => {
  const open = disk(on, { [STATUS]: BOARD })
  const shown = await $.command.run({ command: 'featuremode', args: '' } as never)
  expect(open.has('featuremode')).toBe(true)
  expect(shown.text).toBe('Feature pane shown.')
  const hidden = await $.command.run({ command: 'featuremode', args: '' } as never)
  expect(open.has('featuremode')).toBe(false)
  expect(hidden.text).toBe('Feature pane hidden.')
})

test('top skills come from tollasmode counts, most used first', async ($, on) => {
  disk(on, {})
  // tollasmode owns the counts; answer its state read as if it held these.
  on('state.get', async (_$, e, next) => {
    const ref = e as unknown as { plugin: string; key: string }
    if (ref.plugin === 'tollasmode' && ref.key === 'skillCounts') {
      return { value: { value: { feature: 7, 'caveman:caveman': 2 }, version: 1 } } as never
    }
    return next(e)
  })
  const pane = await mount($)
  expect(await pane.find({ type: 'Text', text: 'Top skills' })).toBeDefined()
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn.indexOf('feature ')).toBeGreaterThan(-1)
  expect(drawn.indexOf('feature ')).toBeLessThan(drawn.indexOf('caveman '))
  expect(drawn).toContain(' 7')
})
