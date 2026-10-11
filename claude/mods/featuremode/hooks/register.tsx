import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, BoardAgent, BoardStep } from '../types'

const NAME = 'featuremode'
const PANE = NAME
const TITLE = 'Feature'
// Where the /feature skill keeps its board, relative to the worktree root.
const STATUS_REL = '.claude/feature/status.md'
const POLL_MS = 2000
const TOP_SKILLS = 5

const path = atom({ plugin: 'featuremode', key: 'path' } as const, '')
const board = atom({ plugin: 'featuremode', key: 'board' } as const, null)
const mtime = atom({ plugin: 'featuremode', key: 'mtime' } as const, 0)
// Owned and persisted by tollasmode; read only here.
const skillCounts = atom({ plugin: 'tollasmode', key: 'skillCounts' } as const, {})
const skillNames = atom({ plugin: 'tollasmode', key: 'skillNames' } as const, [])

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
const shortName = (n: string) => n.slice(n.lastIndexOf(':') + 1)

// Cells of a Markdown table row, outer pipes dropped.
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())

const isSeparator = (line: string) => /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes('-')

// Rows of the first table under `## <heading>`, header and separator skipped.
function tableUnder(lines: string[], heading: string): string[][] {
  const start = lines.findIndex(l => l.trim().toLowerCase() === `## ${heading}`)
  if (start < 0) return []
  const rows: string[][] = []
  let inTable = false
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    if (!line.trim().startsWith('|')) {
      if (inTable) break
      continue
    }
    if (!inTable) {
      inTable = true // header row
      continue
    }
    if (isSeparator(line)) continue
    rows.push(cells(line))
  }
  return rows
}

const field = (lines: string[], label: string) => {
  const hit = lines.find(l => l.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return hit === undefined ? '' : hit.slice(label.length + 1).trim()
}

export function parseBoard(text: string): Board {
  const lines = text.split(/\r?\n/)
  const title = lines.find(l => l.startsWith('# '))
  const steps: BoardStep[] = tableUnder(lines, 'steps').map(([num = '', step = '', status = '', agent = '', doing = '']) => ({
    num,
    step,
    status: status.toLowerCase(),
    agent: agent === '-' ? '' : agent,
    doing: doing === '-' ? '' : doing,
  }))
  const agents: BoardAgent[] = tableUnder(lines, 'agents').map(([agent = '', , , step = '']) => ({
    agent,
    step: step === '-' ? '' : step,
  }))
  return {
    feature: title === undefined ? '' : title.replace(/^# (Feature:\s*)?/, '').trim(),
    phase: field(lines, 'Phase'),
    updated: field(lines, 'Updated'),
    steps,
    agents,
  }
}

// Nearest status.md walking up from the session's directory, so a session
// started in a subfolder of the worktree still finds it.
async function locate($: EngineInterface): Promise<string> {
  let dir = await $.session.cwd()
  for (;;) {
    const candidate = `${dir.replace(/\/$/, '')}/${STATUS_REL}`
    if (await $.fs.exists(candidate)) return candidate
    const parent = dir.replace(/\/[^/]+\/?$/, '')
    if (parent === dir || parent === '') return ''
    dir = parent
  }
}

async function refresh($: EngineInterface) {
  const found = await locate($)
  if (found === '') {
    if ((await read($, path)) !== '') {
      await update($, path, () => '')
      await update($, board, () => null)
      await update($, mtime, () => 0)
    }
    return
  }
  const stat = await $.fs.stat(found)
  if (found === (await read($, path)) && stat.mtimeMs === (await read($, mtime))) return
  const text = await $.fs.read(found)
  const first = (await read($, path)) === ''
  await update($, board, () => parseBoard(text))
  await update($, path, () => found)
  await update($, mtime, () => stat.mtimeMs)
  // A board showing up opens the pane once; /featuremode hides it again.
  if (first) void $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: NAME, description: 'Show/hide the /feature status pane' })
    await refresh($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: NAME }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      return { text: 'Feature pane hidden.' }
    }
    await refresh($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Feature pane shown.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(24, e.props.bodyColumns)
    const b: Board | null = await read($, board)
    const counts: Record<string, number> = await read($, skillCounts)
    const names: string[] = await read($, skillNames)

    const icon = (status: string) =>
      status === 'done' ? (
        <Text color="green">✓</Text>
      ) : status === 'ongoing' ? (
        <Text color="yellow">•</Text>
      ) : status === 'blocked' ? (
        <Text color="red">✗</Text>
      ) : (
        <Text dimColor>○</Text>
      )

    const boardView =
      b === null ? (
        <Text dimColor>{cut(`No feature running (${STATUS_REL} not found)`, cols)}</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold>{cut(b.feature || 'Feature', cols)}</Text>
          <Text dimColor>
            {cut(
              [
                b.phase && `Phase ${b.phase}`,
                `${b.steps.filter(s => s.status === 'done').length}/${b.steps.length} done`,
                b.updated && `updated ${b.updated}`,
              ]
                .filter(Boolean)
                .join(' · '),
              cols,
            )}
          </Text>
          {b.steps.map(s => {
            const label = `${s.num}. ${s.step}`
            const who = s.agent !== '' ? ` [${s.agent}]` : ''
            return (
              <Box key={`step-${s.num}-${s.step}`} flexDirection="column">
                <Text bold={s.status === 'ongoing'} dimColor={s.status === 'done' || s.status === 'not ready'}>
                  {icon(s.status)} {cut(label, cols - who.length - 3)}
                  <Text dimColor>{who}</Text>
                </Text>
                {s.status !== 'done' && s.doing !== '' && <Text dimColor>{`  ↳ ${cut(s.doing, cols - 4)}`}</Text>}
              </Box>
            )
          })}
          {b.agents.length > 0 && <Text bold>Agents</Text>}
          {b.agents.map(a => (
            <Text key={`agent-${a.agent}`} dimColor={a.step === ''}>
              {cut(`${a.agent}${a.step !== '' ? ` → step ${a.step}` : ' idle'}`, cols)}
            </Text>
          ))}
        </Box>
      )

    // Same ranking as tollasmode: every known skill, most used first.
    const top = [...new Set([...names, ...Object.keys(counts)])]
      .map(n => [n, counts[n] ?? 0] as const)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, TOP_SKILLS)
    const maxUses = Math.max(1, top[0]?.[1] ?? 0)
    const countW = String(maxUses).length
    const inner = cols - 4
    const nameW = Math.min(Math.floor(inner * 0.4), Math.max(...top.map(([n]) => shortName(n).length), 4))
    const barW = Math.max(3, inner - nameW - countW - 2)

    return (
      <Box flexDirection="column">
        {boardView}
        {top.length > 0 && (
          <Box flexDirection="column" borderStyle="single" paddingX={1}>
            <Text bold>Top skills</Text>
            {top.map(([n, c]) => {
              const filled = c === 0 ? 0 : Math.max(1, Math.round((c / maxUses) * barW))
              return (
                <Text key={`skill-${n}`}>
                  {`${cut(shortName(n), nameW).padEnd(nameW)} `}
                  <Text color="cyan">{'█'.repeat(filled)}</Text>
                  <Text dimColor>{'░'.repeat(barW - filled)}</Text>
                  {` ${String(c).padStart(countW)}`}
                </Text>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
