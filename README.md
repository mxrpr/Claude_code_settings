# tollas-agent-kit
Skills, agents, hooks and mods I use with Claude Code, plus a port of the same skills and agents
for GitHub Copilot.

```
claude/     Claude Code: skills, agents, hooks, mods
copilot/    GitHub Copilot port (custom agents, Agent Skills, prompt files, CLI plugin)
plugins.md  third-party Claude Code plugins I use
```

## What's inside

### Skills
Located in `claude/skills/`. Each skill is a `SKILL.md` that Claude loads when its description matches the task, or when you call it by name (`/<skill>`).

| Skill | Trigger | What it does |
|---|---|---|
| **feature** | manual only: `/feature <plan.md \| issue #>` | Orchestrates a whole feature from an existing plan by driving subagents (see below). |
| **model-selector** | before delegating any work | Picks the subagent type first (`git-runner`, `os-agent`, `test-runner`, `code-agent`, `code-review`, …), then the model tier (Haiku → Sonnet → Opus → Fable). Production code is always written and reviewed on Opus. Hints `/model` when the main-thread model is a poor fit. |
| **quality-bar** | implementing or reviewing code | Shared quality standard (security, correctness, error handling, concurrency, performance, architecture, tests, docs) with Critical/High/Medium/Low severities. `code-agent` builds to it, `code-review` judges against it. Critical and High must be zero before hand-off. |
| **commit-clean** | writing a commit message | Git commit messages with no AI attribution (no `Co-Authored-By: Claude`, no "Generated with" lines), Conventional Commits format. |
| **create-worktree** | "create a worktree", isolated work | Creates git worktrees under `worktrees/` inside the project root, never as sibling directories. |
| **csharp-style** | writing or editing C# | Explicit types (no `var`), XML doc comments on public/internal members, braces on all `if`/loops, explicit created types (no `new()`). |

### `/feature` — the feature orchestrator

`/feature` takes a plan someone already wrote (a Markdown file or a GitHub issue) and executes it part by part. The main thread acts only as **orchestrator**: it routes work, tracks state and talks to you. It never plans, writes production code, or runs git/shell/test commands itself; every task goes to a dedicated subagent.

```
/feature docs/plans/login-rework.md
/feature 142
```

#### Ground rules
- **Never plan.** The plan is input. If it is missing, unclear or wrong, the orchestrator stops and asks.
- **Delegate, do not do.** Each role has one agent; tasks outside the roster go through `model-selector`.
- **Repo rules win.** The repo's `CLAUDE.md` (worktree naming, lint, tests) overrides the skill and is passed to every agent.
- **One agent per role, resumed.** Each agent is spawned once, its id is saved in `status.md`, and later steps resume it with `SendMessage`, so it keeps its context.
- **State lives in files.** Everything is on disk, so a session reset resumes where it stopped.
- **User gates (⏸).** It stops for your confirmation at fixed points and never commits, pushes or opens a PR without a separate approval for each.
- **Stop on repeated failure.** 3 failed fix rounds on one part: the step goes `blocked` and you decide.

#### Agent roster

| Work | Agent | Model |
|---|---|---|
| Git / worktree | `git-runner` | Haiku |
| Shell | `os-agent` | Haiku |
| Implementation | `code-agent` | Opus |
| Review | `code-review` | Opus |
| Test planning | `test-planner` | Opus |
| Test writing | `test-implementer` | Haiku |
| Test running | `test-runner` | Haiku |

#### Phases

```mermaid
flowchart TD
    IN(["/feature plan.md or issue number"]) --> P1
    P1["1 · Intake<br/>fetch issue, one codebase investigation,<br/>scope + open questions"] --> G1{{⏸ confirm scope}}
    G1 --> P2["2 · Setup<br/>branch + worktree (git-runner)<br/>create .claude/feature/status.md"]
    P2 --> P3["3 · Load plan<br/>copy plan parts into status.md as steps"]
    P3 --> G2{{⏸ confirm this is the plan}}
    G2 --> LOOP

    subgraph LOOP [" per plan part "]
        direction TB
        P4["4 · Implement<br/>code-agent"] --> P5a["5 · Test plan<br/>test-planner"]
        P5a --> P5b["test-implementer<br/>writes tests"]
        P5b --> P5c["test-runner<br/>runs touched package only"]
        P5c -->|green| P6["6 · Review<br/>code-review vs quality-bar"]
        P5c -->|red: code bug| P4
        P5c -->|red: test bug| P5b
        P6 -->|"FAIL: code finding"| P4
        P6 -->|"FAIL: test finding"| P5b
        P6 -->|PASS| DONE["step done<br/>'Part 2/5 done: …'"]
    end

    DONE -->|more parts| P4
    DONE -->|last part| P7["7 · Wrap-up<br/>full lint + test suite, summary"]
    P7 --> G3{{⏸ commit? ⏸ push? ⏸ PR?<br/>separate approvals}}
    LOOP -. "round 3 still failing" .-> BL{{⏸ blocked: ask user}}
```

Same loop, as the orchestrator sees it: every agent reports back to the orchestrator, which routes the fix or moves on.

```
                ┌──────────────────────── orchestrator (main thread) ────────────────────────┐
                │   reads status.md · routes work · forwards findings verbatim · gates ⏸     │
                └──┬───────────┬──────────────┬──────────────┬──────────────┬────────────────┘
                   │ part      │ part+files   │ test list    │ run          │ part+files
                   ▼           ▼              ▼              ▼              ▼
             ┌───────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌─────────────┐
             │code-agent │ │test-planner│ │test-implement│ │test-runner│ │ code-review │
             │  (Opus)   │ │  (Opus)    │ │   (Haiku)    │ │  (Haiku)  │ │   (Opus)    │
             └─────┬─────┘ └─────┬──────┘ └──────┬───────┘ └─────┬─────┘ └──────┬──────┘
                   │ files,      │ test names    │ test files    │ pass/fail     │ PASS/FAIL +
                   │ risks       │ + intent      │               │ + errors      │ R<n> findings
                   └─────────────┴───────────────┴───────────────┴───────────────┘
                                               ▼
                                   back to orchestrator → next step
```

#### Fix rounds
- **Test failure triage:** test matches the plan but code disagrees → `code-agent`; test broken or asserts something the plan does not say → `test-implementer`; unclear → `code-agent` decides which side is wrong.
- **Review findings** come as `R<n> <Critical|High|Medium|Low> <file:line> <problem> → <fix>`. Critical and High must be fixed; Medium is fixed or its skip is justified in `status.md`; Low is only logged.
- Findings are forwarded **verbatim with their ids**. The fixer answers per id: `fixed` or `disputed` (disputes the orchestrator can't settle go to you).
- After a fix: tests rerun, then the **same** reviewer re-checks only its ids and the new diff.
- Rounds are counted per part (`round 2/3`); round 3 still failing → `blocked`, ask the user.

#### State on disk

```
<worktree>/.claude/feature/
├── status.md            # orchestrator's board: every step, its status, who is on it
├── plan.md              # only when the plan came from an issue
└── agents/
    ├── code-agent.md    # one file per agent, written only by that agent
    ├── test-planner.md
    └── ...
```

- `status.md` — written only by the orchestrator: input, branch/worktree, plan path, current phase, a **Steps** table (`not ready | ongoing | blocked | done`, agent, "doing now"), an **Agents** table (agentId, status file, current step) and decisions/open questions.
- `agents/<agent>.md` — each agent's own log (`working | done | failed | waiting`, doing now, timestamped log). Agents without a write tool (`code-review`) get theirs written by the orchestrator.
- On restart the orchestrator reads `status.md`, then the agent files of the ongoing step, and resumes.

#### Live pane: `featuremode` mod
`claude/mods/featuremode/` adds a terminal pane that polls `.claude/feature/status.md` every 2 s and shows the feature name, phase, progress, each step with its status (`✓` done, `•` ongoing, `✗` blocked, `○` not ready) and the agent on it, plus the top skills used (counts from the `tollasmode` mod). The pane opens on its own the first time a board appears; `/featuremode` shows/hides it.

```
┌ Feature ───────────────────────────┐
│ login-rework                       │
│ Phase 5 · 1/4 done · updated 14:02 │
│ ✓ 1. Token model                   │
│ • 2. Refresh flow      code-agent  │
│ ✗ 3. Session store                 │
│ ○ 4. Logout endpoint               │
│                                    │
│ Top skills                         │
│ feature        ████████████   12   │
│ quality-bar    ██████          6   │
└────────────────────────────────────┘
```

### Agents
Located in `claude/agents/` (Copilot: `copilot/agents/*.agent.md`). Each runs on a fixed model.

| Agent | Model | What it does |
|---|---|---|
| **code-agent** | Opus | Implements one part of a plan to the `quality-bar` standard, with a risk analysis and self-review. |
| **code-review** | Opus | Read-only review of a change against `quality-bar`; returns PASS/FAIL with severity-ranked findings. |
| **planning** | Opus | Breaks a plan into small, ordered, self-contained parts in `plan.md`. |
| **test-planner** | Opus | Plans test coverage (file, test names, intent) without writing code. |
| **test-implementer** | Haiku | Writes tests from a test plan and runs them for the touched package. |
| **test-writer** | Haiku | Writes test code from a test plan (no running). |
| **test-runner** | Haiku | Runs existing test suites and reports pass/fail only, never fixes. |
| **test-executor** | Haiku | Runs the tests relevant to a part and reports failures in detail. |
| **git-runner** | Haiku | Executes git commands; destructive/shared-state ops (push, reset --hard, …) need explicit authorization. |
| **os-agent** | Haiku | Executes shell/OS ops; destructive ops need explicit authorization; never starts long-running servers. |

### Hooks
- `claude/hooks/delegate-guard.sh` — `PreToolUse` hook on `Bash`. On the main thread it turns git, build/test/lint and shell commands into a permission prompt that nudges delegation to `git-runner`, `test-runner` or `os-agent` (Haiku). Bash calls inside subagents always pass. Add `NODELEGATE` to a command to skip the prompt. Needs `jq`.

### Mods
Claude Code UI mods in `claude/mods/`:
- **tollasmode** — compact pane: model picker, activity bullets, plan steps, parallel subagents with live action and elapsed time, top skills and agents charts.
- **featuremode** — live `/feature` status board pane (see above). Depends on `tollasmode`.

### External plugins
Third-party Claude Code plugins I use; install commands in [plugins.md](plugins.md).

- **[caveman](https://github.com/juliusbrussee/caveman)** — ultra-compressed communication mode plus `cavecrew-*` subagents (investigator/builder/reviewer) for token-efficient delegation.
- **[code security review](https://github.com/anthropics/claude-code-security-review)** — `comprehensive-review@claude-code-workflows` (architect-review, code-reviewer, security-auditor agents).
- **code-simplifier** — Anthropic official plugin; cleans up recently modified code for clarity without changing behavior.

## Installation

### Claude Code

Clone the repo:
```bash
git clone https://github.com/mxrpr/tollas-agent-kit
cd tollas-agent-kit
```

Skills and agents, for all projects:
```bash
mkdir -p ~/.claude/skills ~/.claude/agents
cp -r claude/skills/* ~/.claude/skills/
cp claude/agents/*.md ~/.claude/agents/
```
For one project only, copy them into `<project>/.claude/skills/` and `<project>/.claude/agents/` instead.
Run `/feature <plan.md | issue #>` in Claude Code to start the orchestrator.

Hook (optional, needs `jq`):
```bash
mkdir -p ~/.claude/hooks
cp claude/hooks/delegate-guard.sh ~/.claude/hooks/ && chmod +x ~/.claude/hooks/delegate-guard.sh
```
then add to `~/.claude/settings.json`:
```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash",
      "hooks": [ { "type": "command", "command": "~/.claude/hooks/delegate-guard.sh" } ] }
  ]
}
```

Mods (optional; `featuremode` needs `tollasmode`):
```bash
mkdir -p ~/.claude/mods
cp -r claude/mods/tollasmode claude/mods/featuremode ~/.claude/mods/
```
Restart Claude Code to load them; `/featuremode` shows/hides the feature pane.

External plugins: see [plugins.md](plugins.md).

### GitHub Copilot

`copilot/` holds the Copilot port of the agents, skills and the `/feature` and `/dev-pipeline`
orchestrators. Details and the differences from the Claude version: [copilot/README.md](copilot/README.md).

#### Copilot CLI (plugin)

Install (once per machine):
```bash
copilot plugin install mxrpr/tollas-agent-kit:copilot
copilot plugin list                 # shows: dev-agents (v1.0.0)
```

Optional: the global guidelines are not part of the plugin; copy them yourself:
```bash
curl -fsSL https://raw.githubusercontent.com/mxrpr/tollas-agent-kit/main/copilot/copilot-instructions.md \
  -o ~/.copilot/copilot-instructions.md
```

Use it (run `copilot` in your project):

| Goal | How |
|---|---|
| Run a feature from a plan | `/feature docs/plans/login-rework.md` or `/feature 142` |
| Plan → implement → review → test loop | `/dev-pipeline <plan or description>` |
| List skills | `/skills` |
| List / pick an agent | `/agent` |
| Start a session as one agent | `copilot --agent code-review` |
| One-off prompt to an agent | `copilot --agent test-runner -p "run the tests in ./api"` |

Update: rerun the install command. Remove: `copilot plugin uninstall dev-agents`.

#### VS Code (agent mode)

VS Code does not use the CLI plugin; copy the files instead.

Per repository (shared with the team):
```bash
git clone https://github.com/mxrpr/tollas-agent-kit /tmp/ccs
mkdir -p .github
cp -r /tmp/ccs/copilot/{agents,skills,prompts} .github/
cp /tmp/ccs/copilot/copilot-instructions.md .github/   # skip if you already have one; merge by hand
```

For all repositories (Linux; on macOS use `~/Library/Application Support/Code/User/prompts`):
```bash
mkdir -p ~/.copilot ~/.config/Code/User/prompts
cp -r /tmp/ccs/copilot/skills ~/.copilot/
cp /tmp/ccs/copilot/agents/*.agent.md /tmp/ccs/copilot/prompts/*.prompt.md ~/.config/Code/User/prompts/
```

Windows (PowerShell), all repositories:
```powershell
git clone https://github.com/mxrpr/tollas-agent-kit $env:TEMP\ccs
New-Item -ItemType Directory -Force "$HOME\.copilot", "$env:APPDATA\Code\User\prompts" | Out-Null
Copy-Item -Recurse -Force "$env:TEMP\ccs\copilot\skills" "$HOME\.copilot\"
Copy-Item -Force "$env:TEMP\ccs\copilot\agents\*.agent.md", "$env:TEMP\ccs\copilot\prompts\*.prompt.md" "$env:APPDATA\Code\User\prompts\"
```

Then in Copilot Chat (Agent mode): `/feature <plan.md | issue #>` or `/dev-pipeline <plan>`. Agents
appear in the agent picker. Agent skills and subagents may need enabling in VS Code settings
(search "skills" and "subagent").

#### Models

Agents pin their model in the `model:` line (`Claude Opus 5.5 (copilot)`, `Claude Haiku 4.5 (copilot)`).
If your account does not offer one, edit that line to an available model (`/model` in the CLI, the
model picker in VS Code, shows what you have).
