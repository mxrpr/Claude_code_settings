# Copilot settings

GitHub Copilot port of the Claude Code settings in [`../claude`](../claude): same skills, agents
and pipelines, usable from VS Code agent mode and Copilot CLI.

## Layout

| Path | Copilot feature | Ported from |
|---|---|---|
| `agents/*.agent.md` | Custom agents | `claude/agents/*.md` |
| `skills/<name>/SKILL.md` | Agent Skills | `claude/skills/*` |
| `prompts/*.prompt.md` | Prompt files (`/feature`, `/dev-pipeline`) | `claude/skills/feature`, `claude/commands/dev-pipeline.md` |
| `copilot-instructions.md` | Custom instructions | `claude/CLAUDE.md` |
| `plugin.json` | Copilot CLI plugin manifest (plugin root = this directory) | — |
| `cli-skills/` | `/feature`, `/dev-pipeline` as skills for Copilot CLI (plugin only) | `prompts/*.prompt.md` |

## Install

### Copilot CLI plugin (easiest)

```bash
copilot plugin install mxrpr/Claude_code_settings:copilot
```

Installs the agents, all skills and the `/feature` and `/dev-pipeline` skills. Update by running the
same command again; remove with `copilot plugin uninstall dev-agents`. Test a local checkout with
`copilot plugin install ./copilot`. The plugin does not carry `copilot-instructions.md`; copy it to
`~/.copilot/` yourself if you want the global guidelines.

In the CLI: `/feature docs/plans/login-rework.md` or `/feature 142`.

### Manual copy

Per repository (shared with the team):

```bash
mkdir -p <repo>/.github
cp -r agents skills prompts <repo>/.github/
cp copilot-instructions.md <repo>/.github/
```

Personal, for all repositories:

```bash
# Copilot CLI (skills are also picked up by VS Code)
mkdir -p ~/.copilot
cp -r agents skills ~/.copilot/
cp copilot-instructions.md ~/.copilot/

# VS Code user-level agents and prompt files (Linux path; use the profile folder on other OSes)
mkdir -p ~/.config/Code/User/prompts
cp agents/*.agent.md prompts/*.prompt.md ~/.config/Code/User/prompts/
```

## Differences from the Claude version

- **Models.** Each agent's model is fixed in its `model:` field (Copilot model picker names:
  `Claude Opus 5.5 (copilot)`, `Claude Haiku 4.5 (copilot)`, …). Copilot cannot choose a model
  per subagent call, so `model-selector` picks the *agent* and, through it, the model. If a
  name is not offered to your account, edit the `model:` line to the nearest available tier.
- **Tools.** Claude tool names map to Copilot aliases: `Read` → `read`, `Edit`/`Write` → `edit`,
  `Grep`/`Glob` → `search`, `Bash` → `execute`, `WebFetch` → `web`, `Agent` → `agent`.
  `code-review` gets `execute` (Copilot has no `Bash(git diff:*)` restriction); its prompt
  limits it to read-only git commands.
- **Preloaded skills.** Claude's `skills:` frontmatter does not exist; `code-agent` and
  `code-review` are told to load `quality-bar` themselves.
- **No resumable subagents.** Claude's `SendMessage` to a saved agentId has no Copilot
  equivalent. `/feature` and `/dev-pipeline` carry context between calls through per-agent
  status/notes files instead. `/feature` keeps its state in `.github/feature/` (was `.claude/feature/`).
- **Manual-only `feature`.** Claude's `disable-model-invocation` skill became a prompt file, so it
  only runs when you type `/feature <plan.md | issue #>`.

## Not ported

- `claude/hooks/delegate-guard.sh` — relies on Claude Code's `PreToolUse` payload telling main
  thread and subagents apart; Copilot hooks have no such field, so the guard would also block
  the delegated agents.
- `claude/mods/*` (`featuremode`, `tollasmode`) — Claude Code UI plugins with no Copilot API.
