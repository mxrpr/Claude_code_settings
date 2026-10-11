---
name: model-selector
description: >
  Pick the right custom agent (and with it the Claude model: Haiku / Sonnet / Opus / Fable) for a task.
  Use when delegating work to a subagent, when planning multi-step work that can be split
  across cheap and strong models, or when the user asks "which model should I use",
  "pick a model", "use a cheaper model", "is this worth Opus".
  Also use to tell the user when the session model is a poor fit and they should switch it.
---

# Model selector

Match model strength to task difficulty. Cheap models for mechanical work, strong models
for judgment. Wrong in either direction costs: too weak → bad output and rework; too strong
→ wasted tokens and premium requests.

---

## What this skill can and cannot do

- **Can:** choose which custom agent runs a task as a subagent. In Copilot the model is set
  by the `model:` field of the custom agent file (`*.agent.md`), not per call, so **picking
  the agent is picking the model**. This is the main lever.
- **Can:** recommend the user switch the session model (model picker in VS Code, `/model`
  in Copilot CLI).
- **Cannot:** switch the model of the current session, or pass a model when starting a
  subagent. Never claim to have done either.
- Agents and their fixed models: `git-runner`, `os-agent`, `test-runner`,
  `test-implementer`, `test-writer`, `test-executor` → Haiku; `planning`, `code-agent`,
  `code-review`, `test-planner` → Opus. Use those agents for their job.
- To escalate (e.g. an Opus `code-agent` attempt failed), do not edit the agent file
  silently: tell the user and suggest running the task in the main session on a stronger
  model (Fable).
- **Production code is written and reviewed on Opus** (user rule). Never drop
  implementation or code review of production code below Opus, even when the plan is precise.
  Exception: purely mechanical edits that cannot change behaviour (rename, typo, format)
  may use a Haiku agent.

## Step 1 (required): pick the agent

First matching row wins.

| Task | Agent | Model |
|---|---|---|
| Locate code, map a directory, "where is X" | search inline (read/search tools are cheap) | session model |
| Any git command (status, log, diff, commit, branch) | `git-runner` | Haiku |
| Shell / filesystem / install / lint / build / HTTP | `os-agent` | Haiku |
| Run existing tests, report pass/fail | `test-runner` | Haiku |
| Decide what tests to write | `test-planner` | Opus |
| Write tests from a plan | `test-implementer` | Haiku |
| Implement one part of an existing plan | `code-agent` | Opus |
| Review a diff | `code-review` | Opus |
| Break a plan into parts | `planning` | Opus |
| Nothing above fits | do it in the main session, or a plain subagent (inherits the session model) | per rules below |

A plain subagent is the last resort. Using it requires a one-line reason why no row fits,
and the session model must fit the rules below; if it does not, give the model hint.

## Models

| Tier | Copilot model | Strength |
|---|---|---|
| 1 | Claude Haiku 4.5 | Fast, cheap. Mechanical, well-specified work. |
| 2 | Claude Sonnet 5.5 | Solid default. Most coding with a clear goal. |
| 3 | Claude Opus 5.5 | Deep reasoning, ambiguity, cross-cutting design. |
| 4 | Claude Fable 5.1 | Most capable. Hardest problems, high stakes, previous tier failed. |

Model names must match the Copilot model picker exactly; if one is not offered to the
account, use the nearest available tier.

## Decision rules

Evaluate in order. First match wins.

**→ Haiku** when the task is fully specified and needs no judgment:
- Run commands, tests, builds, git operations; report results.
- Rename, typo, format, comment removal, mechanical find/replace — allowed in
  production code ONLY if behaviour cannot change (no logic, signature, or
  control-flow edits). Anything else in production code → Opus.
- Locate code ("where is X defined", "list callers of Y").
- Write tests from an existing test plan.
- Summarize or extract from a given file or log.

**→ Fable** when ANY:
- An Opus attempt already failed or produced wrong results.
- High stakes and hard: security-critical logic, concurrency / memory-model bugs,
  data-migration correctness, cryptography.
- Novel algorithm or research-grade problem with no known pattern.

**→ Opus** when ANY:
- Write or modify production code (any size) — user rule.
- Design / architecture / API shape decisions.
- Root-cause analysis of a non-obvious bug ("why does…", intermittent, cross-module).
- Refactor or feature spanning 3+ files or several layers.
- Ambiguous or open-ended request needing tradeoff judgment.
- Code review or security review, test planning (what is worth covering).
- Planning work that other agents will execute.

**→ Sonnet** (default): everything else that is NOT production code — docs,
explanations of existing code, throwaway/non-production scripts, drafting text.

## Adjusters

- **Escalate one tier** if the prior attempt at this tier failed, the code is unfamiliar
  and poorly structured, or a mistake would be costly to undo.
- **Drop one tier** if the work is a repeat of a pattern already established in the
  codebase, or the prompt you will pass is so precise the agent only executes — but never
  below Opus for production code or its review.
- **Split mixed tasks.** Keep judgment on a strong model, push mechanics to a cheap one:
  e.g. Opus plans, implements and reviews → Haiku writes planned tests and runs them. Don't
  send a whole mixed task to the strongest model it needs at its hardest point.

## Delegating

When starting the subagent, state the agent, its model and the reason in one line, e.g.:

> Delegating to `git-runner` (Haiku): mechanical git status/diff.

The weaker the model, the more precise the prompt must be: give exact files, the exact
change, and the expected output format. Subagents start with a fresh context: pass
everything they need in the prompt.

## Session-model mismatch

If the user's request clearly mismatches the current session model, say so once at the
start, then proceed:

> Model hint: this is mechanical work — switch to Claude Haiku to save premium requests.
> Model hint: this needs deep design work — consider Claude Opus (or Fable).

Don't repeat the hint every turn, and don't block on it.
