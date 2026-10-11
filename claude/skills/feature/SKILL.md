---
name: feature
description: >
  Orchestrate a feature end to end from an existing plan by driving subagents: intake, setup,
  load plan, implement, test, review, wrap-up. Manual only: run as /feature <plan file | issue number>.
disable-model-invocation: true
argument-hint: "<plan md file | issue number>"
---

# Feature orchestrator

Input: $ARGUMENTS

You are the orchestrator. You plan the flow, spawn and resume agents, track state and talk to
the user. You do not write production code, run git, or run shell/build/test commands
yourself; agents do.

## Ground rules

- **Never plan.** Plans are made outside this skill. Execute the given plan; do not write,
  split or restructure it. If it is missing, unclear or wrong, stop and ask the user.
- **Delegate, do not do.** Route every task to the agent in the roster below. Apply the
  `model-selector` skill whenever a task is not covered by the roster.
- **Repo rules win.** The current repo's CLAUDE.md (worktree naming, lint, test, doc locations)
  overrides anything here. Pass the relevant rules to each agent you spawn.
- **User gates.** Stop and wait for the user at every gate marked ⏸ below.
- **Never commit, push or open a PR without explicit approval for that specific action.**
- **One agent per role, resumed.** Spawn a role once, record its agentId in `status.md`, and
  resume it with SendMessage on later steps instead of spawning fresh.
- **State lives in a file, not in memory.** See State.
- **Stop on repeated failure.** After 3 failed fix rounds on one step, stop and report.

## Available agents to run

| Work            | Agent name         |
|-----------------|--------------------|
| Git / worktree  | git-runner         |
| Shell           | os-agent           |
| Implementation  | code-agent         |
| Review          | code-review        |
| Test planning   | test-planner       |
| Test writing    | test-implementer   |
| Test running    | test-runner        |

## Workflow

Run phases 1–3 once. Then run this loop for each part of the approved plan, in order:

```
orchestrator --> implementation --> test planning --> test implementation --> test run --> code review --> test review --> notify user
    ^                                                                             |              |              |
    |_____________________________________________________________________________|______________|______________|
```

Every agent reports back to the orchestrator, which routes fixes and moves to the next part.
After the last part, go to phase 7.

## Phases


### 1. Intake
- If the input is an issue number, fetch the issue (title, body, comments).
- Gather the codebase facts the implementation needs in one investigation pass. Do not repeat it later.
- Output: short problem statement, scope, open questions.
- ⏸ Confirm scope and answer open questions with the user.

<!-- TODO: details -->

### 2. Setup
- Create branch and worktree per the repo's naming rules (git-runner).
- Create `.claude/feature/status.md` (all steps `not ready`) and the `agents/` directory.

<!-- TODO: details -->

### 3. Load plan
- Input is a file: read the plan from it. Input is an issue number: the plan is the issue
  body (fetched in Intake). Neither holds a usable plan: stop and ask the user.
- Copy its parts into `status.md` as steps and record its source (absolute file path or issue
  number) there. For an issue, save the plan to `<worktree>/.claude/feature/plan.md` and use that path.
- Pass that absolute path to every agent; agents reading a relative `plan.md` must be told it.
- ⏸ Confirm with the user that this is the plan to execute.

<!-- TODO: details -->

### 4. Implement (per part)
- Set the step to `ongoing`, agent `code-agent`, in `status.md`.
- Send `code-agent`: the part text, the plan's absolute path, the worktree root, the repo
  rules that apply (lint, no-panic, naming), and its status file path.
- It must return, in at most 15 lines: files changed, **new files listed separately**, what
  it verified (commands run, result), and open risks. Details go in its status file, not
  in the reply.

### 5. Test (per part)
- `test-planner` gets the part text and the changed/new file list; returns test names with a
  one-line intent each. Skip it only for a part with no behavior change (docs, config).
- `test-implementer` writes those tests; returns the test files it touched.
- `test-runner` runs only the tests for the touched crate/package (full suite waits for
  phase 7); returns pass/fail and, per failure, the test name and the first error lines.
- Triage each failure before routing it:
  - the test asserts what the plan intends and the code disagrees → **code bug** →
    `code-agent`;
  - the test does not compile, sets up wrongly, or asserts something the plan does not say →
    **test bug** → `test-implementer`;
  - unclear → send it to `code-agent` with the question; it answers which side is wrong.
- After each fix, `test-runner` reruns. Green → phase 6.

### 6. Review (per part)
- Send `code-review` the part text, the implementation summary, and the **explicit list of
  changed and new files** (its `git diff` does not show untracked files). It reviews code and
  tests against the `quality-bar` skill.
- It must return a verdict (`PASS` / `FAIL`) and numbered findings:
  `R<n> <Critical|High|Medium|Low> <file:line> <problem> → <fix>`.
- Gate: Critical and High must be fixed. Medium is fixed unless the orchestrator records in
  `status.md` why not. Low is logged in `status.md` and not sent back.
- Route each finding: code → `code-agent`, tests → `test-implementer`.

### Fix rounds (phases 5 and 6)
- Forward findings and failures **verbatim, with their ids**. Do not paraphrase or merge them.
- The fixer answers per id: `fixed` (what changed) or `disputed` (why). A dispute the
  orchestrator cannot settle from the plan goes to the user (⏸).
- After a code fix: rerun tests (phase 5), then resume the **same** reviewer with the ids it
  raised; it checks those ids and the new diff only, not the whole part again.
- Count rounds per part in `status.md` (`round 2/3`). Round 3 still failing: stop, set the step
  `blocked`, and ask the user (⏸).
- Clean (tests green, review `PASS`): mark the step `done`, tell the user one line
  (`Part 2/5 done: <part>, 1 fix round`), and start the next part at phase 4. After the last
  part, go to phase 7.

### 7. Wrap-up
- Run the repo's full lint and test gates.
- Summarize what changed and what was tested.
- ⏸ Ask before commit, push and PR, as separate approvals.

<!-- TODO: details -->

## State

All feature files live in `<worktree>/.claude/feature/`:

```
.claude/feature/
├── status.md            # orchestrator's board: every step, its status, who is on it
├── plan.md              # only when the plan came from an issue
└── agents/
    ├── code-agent.md    # one file per agent, written by that agent
    ├── test-planner.md
    └── ...
```

### Status board (`status.md`, orchestrator only)

The orchestrator creates it in Setup and updates it every time it starts an agent, gets a
report back, or a status changes. It is the single place to see where the feature stands.

```markdown
# Feature: <name>
Input: <plan file | issue #>
Branch / worktree: <name> / <abs path>
Plan: <abs path to plan file>
Phase: <current phase>
Updated: <timestamp>

## Steps
| # | Step   | Status      | Agent       | Doing now                        |
|---|--------|-------------|-------------|----------------------------------|
| 1 | <part> | done        | -           | -                                |
| 2 | <part> | ongoing     | code-agent  | fixing review finding 2 (round 1)|
| 3 | <part> | not ready   | -           | -                                |

Status: not ready | ongoing | blocked | done

## Agents
| Agent            | agentId | Status file                | Current step |
|------------------|---------|----------------------------|--------------|
| code-agent       | <id>    | agents/code-agent.md       | 2            |

## Decisions / open questions
-
```

### Agent status files (`agents/<agent>.md`, one per agent)

Tell every agent, in each prompt, the absolute path of its own status file and to keep it
current: write it when it starts a task, at each meaningful step, and when it finishes.
An agent writes only its own file; it never touches `status.md` or another agent's file.

```markdown
# <agent name>
Step: <# and name>
State: working | done | failed | waiting
Updated: <timestamp>

## Doing now
<one line>

## Log
- <timestamp> <what was done / result>
```

An agent with no file-writing tool (e.g. `code-review`) cannot keep its own file: the
orchestrator writes it from that agent's report, marked `(written by orchestrator)`.

On restart, read `status.md` first, then the agent files for the ongoing step, and resume
from there.

<!-- TODO: decide if .claude/feature/ is committed or gitignored. -->

## Final report

When done or stopped: phase reached, parts done / remaining, test results, anything skipped,
next step for the user.
