---
name: model-selector
description: >
  Pick the right subagent type and Claude model (Haiku / Sonnet / Opus / Fable) for a task.
  Use when delegating work to a subagent (choose the Agent tool `subagent_type` and `model`), when planning
  multi-step work that can be split across cheap and strong models, or when the user asks
  "which model should I use", "pick a model", "use a cheaper model", "is this worth Opus".
  Also use to tell the user when the main-thread model is a poor fit and they should `/model`.
---

# Model selector

Match model strength to task difficulty. Cheap models for mechanical work, strong models
for judgment. Wrong in either direction costs: too weak → bad output and rework; too strong
→ wasted tokens and latency.

---

## What this skill can and cannot do

- **Can:** choose `model` when spawning a subagent via the Agent tool (`haiku`, `sonnet`,
  `opus`, `fable`). This is the main lever.
- **Can:** recommend the user switch the main-thread model with `/model <name>`.
- **Cannot:** switch the model of the current conversation. `/model` is a user command;
  never claim to have switched it.
- Agents with a fixed model in their frontmatter (`git-runner`, `os-agent`, `test-runner`,
  `test-implementer`, `test-writer`, `test-executor` → Haiku; `planning`, `code-agent`,
  `code-review`, `test-planner` → Opus) already choose for themselves. Prefer those agents
  for their job instead of overriding. Override a fixed-model agent only to escalate
  (e.g. pass `model: "fable"` to `code-agent` after an Opus attempt failed) — never to
  downgrade.
- **Production code is written and reviewed on Opus** (user rule). Never drop
  implementation or code review of production code below Opus, even when the plan is precise.
  Exception: purely mechanical edits that cannot change behaviour (rename, typo, format)
  may use Haiku.

## Step 1 (required): pick the agent type

Before choosing a model, pick `subagent_type` from this table. First matching row wins.
Never omit `subagent_type`: omitting it silently means `general-purpose`.

| Task | `subagent_type` | Model |
|---|---|---|
| Locate code, map a directory, "where is X" | `Explore` (`model: "haiku"`) or `caveman:cavecrew-investigator` | Haiku |
| Any git command (status, log, diff, commit, branch) | `git-runner` | fixed Haiku |
| Shell / filesystem / install / lint / build / HTTP | `os-agent` | fixed Haiku |
| Run existing tests, report pass/fail | `test-runner` | fixed Haiku |
| Decide what tests to write | `test-planner` | fixed Opus |
| Write tests from a plan | `test-implementer` | fixed Haiku |
| Implement one part of an existing plan | `code-agent` | fixed Opus |
| Review a diff | `code-review` or `caveman:cavecrew-reviewer` | Opus |
| Design / architecture plan | `Plan` (`model: "opus"`) | Opus |
| Nothing above fits | `general-purpose`, **always with explicit `model`** | per rules below |

`general-purpose` is the last resort. Using it requires a one-line reason why no row fits.

## Step 2: pick the model

Only needed for agents without a fixed model (`Explore`, `Plan`, `general-purpose`, the
cavecrew agents) or to escalate a fixed-model agent.

## Models

| Tier | Agent `model` | Model ID | Strength |
|---|---|---|---|
| 1 | `haiku` | `claude-haiku-4-5-20251001` | Fast, cheap. Mechanical, well-specified work. |
| 2 | `sonnet` | `claude-sonnet-5-5` | Solid default. Most coding with a clear goal. |
| 3 | `opus` | `claude-opus-5-5` | Deep reasoning, ambiguity, cross-cutting design. |
| 4 | `fable` | `claude-fable-5-1` | Most capable. Hardest problems, high stakes, previous tier failed. |

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
  e.g. Opus plans, implements and reviews → Haiku writes planned tests and runs them. Don't send a whole mixed task to the strongest
  model it needs at its hardest point.

## Delegating

When spawning the subagent, state the agent type, the model and the reason in one line, then
pass `subagent_type` always, and `model` whenever the agent has no fixed model:

```
Agent(description: "Locate auth callers", subagent_type: "Explore", model: "haiku", prompt: ...)
```

The weaker the model, the more precise the prompt must be: give exact files, the exact
change, and the expected output format.

## Main-thread mismatch

If the user's request clearly mismatches the current session model, say so once at the
start, then proceed:

> Model hint: this is mechanical work — `/model haiku` would be cheaper.
> Model hint: this needs deep design work — consider `/model opus` (or `fable`).

Don't repeat the hint every turn, and don't block on it.
