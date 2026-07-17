# Claude_code_settings
Contains plugins, settings used by me for Claude code

## Skills
Located in `claude/skills/`.

- **commit-clean** — writes git commit messages with no AI attribution (no `Co-Authored-By: Claude`, no "Generated with" lines), Conventional Commits format.
- **create-worktree** — creates git worktrees under `worktrees/` inside the project root, never as sibling directories.
- **csharp-style** — C# conventions: explicit types (no `var`), XML doc comments on public/internal members, braces on all `if`/loops, explicit created types (no `new()`).
- **model-selector** — picks Haiku/Sonnet/Opus per task complexity before each response; announces the choice and reason.

## Plugins
See [plugins.md](plugins.md) for install commands and details.

- **[caveman](https://github.com/juliusbrussee/caveman)** — ultra-compressed communication mode plus `cavecrew-*` subagents (investigator/builder/reviewer) for token-efficient delegation.
- **[code security review](https://github.com/anthropics/claude-code-security-review)** — `comprehensive-review@claude-code-workflows` (architect-review, code-reviewer, security-auditor agents).
- **code-simplifier** — Anthropic official plugin; cleans up recently modified code for clarity without changing behavior.
- **[dev-pipeline](plugins.md#dev-pipeline)** (this repo, `dev-pipeline-plugin/`) — plan → implement → review → test loop with dedicated subagents. Install:
  ```
  /plugin marketplace add mxrpr/Claude_code_settings
  /plugin install dev-pipeline@dev-pipeline-marketplace
  ```

## Hooks
- `claude/prehooks/settings.json` — `PreToolUse` hook on `Bash`: blocks direct Bash calls from the main thread, forcing delegation to `os-agent` (general shell), `git-runner` (git ops), or `test-runner` (test commands); also blocks `os-agent` from running git/test commands directly.

## Agents
Located in `claude/agents/` (all run on Haiku unless noted):

- **git-runner** — executes git commands; read-only ops run freely, destructive/shared-state ops (push, reset --hard, etc.) need explicit authorization.
- **os-agent** — executes shell/OS ops; read-only ops run freely, destructive ops need explicit authorization; never starts long-running servers.
- **test-planner** (Sonnet) — plans test coverage without writing code.
- **test-implementer** — writes and runs tests from a plan.
- **test-runner** — runs existing test suites and reports pass/fail only, never fixes.

## Commands

### Usage
```
/dev-pipeline <plan or feature description>
```
Run it with a plan or feature description as argument. It plans first and stops for your review — nothing gets implemented until you tell it to continue. After that it works through the plan.md checklist one part at a time (implement → review → test), pausing between parts for you to say go-ahead.

/dev-pipeline: starts the plan → implement → review → test loop. Planning subagent breaks the request into ordered parts in `plan.md` and stops for your review. Then, per part: implementation → code-review (up to 2 retries on flagged issues) → test-planner/test-writer/test-executor, pausing after each part for the go-ahead. `plan.md`'s checklist is the source of truth for where it stopped across session resets. See [plugins.md](plugins.md) for the full flow.

