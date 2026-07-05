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

## Hooks
- `claude/prehooks/settings.json` — `PreToolUse` hook on `Bash`: blocks direct Bash calls from the main thread, forcing delegation to `os-agent` (general shell), `git-runner` (git ops), or `test-runner` (test commands); also blocks `os-agent` from running git/test commands directly.

## Agents
Located in `claude/agents/` (all run on Haiku unless noted):

- **git-runner** — executes git commands; read-only ops run freely, destructive/shared-state ops (push, reset --hard, etc.) need explicit authorization.
- **os-agent** — executes shell/OS ops; read-only ops run freely, destructive ops need explicit authorization; never starts long-running servers.
- **test-planner** (Sonnet) — plans test coverage without writing code.
- **test-implementer** — writes and runs tests from a plan.
- **test-runner** — runs existing test suites and reports pass/fail only, never fixes.
