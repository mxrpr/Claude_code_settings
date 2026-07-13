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
- **dev-pipeline** (this repo, `dev-pipeline-plugin/`) — plan → implement → review → test loop with dedicated subagents. Install:
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

/dev-pipeline: starts the development process with agents. The process:

1. Use the planning subagent to break the user-provided plan into small, ordered parts (each a self-contained unit of work), written to the plan the user provided as a checklist.
No not start the implementation subagent, always wait the user to give command. After planning allow the user to review the plan, ask you questions, refine the plan.

2. For each part, in order:
   a. Use the implementation subagent to implement just that part
   b. Use the review subagent to review the change
      - If it flags problems: send notes back to the implementation subagent and repeat, up to 2 more times
      - If it passes: mark the part done in plan.md and continue
   c. Use the test-planner subagent to write a test plan scoped to that part
   d. Use the test-writer subagent to write tests from that plan
   e. Use the test-executor subagent to run them and report pass/fail
   f. If tests fail: send the failure back to the implementation subagent for a fix, then re-run from step b for this part
   g. The plan document contains the truth. Whenver the session is reseted, when the client restarts the development, you have to know where the implemenetation process has stopped.
   h. After a part is finished, ask user to continue with the next part.

3. After all parts are done, report a summary of what was implemented and tested

Stop and report status if any part fails after retries, rather than continuing to the next part.

