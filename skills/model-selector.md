# Model Selector

Automatically select the appropriate Claude model based on task complexity before every response.

## When to apply

Apply this skill at the start of every response, before any other work.

## Models

| Model | ID | Use for |
|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Typo fixes, renames, formatting, single-line edits, quick lookups, yes/no questions |
| Sonnet 4.6 | `claude-sonnet-4-6` | Standard bug fixes, feature implementation, code review, moderate reasoning, most tasks |
| Opus 4.8 | `claude-opus-4-8` | Architecture design, security audits, complex multi-file refactors, test strategy, deep analysis, ambiguous open-ended problems |

## Scoring rules

Score the incoming message. First match wins.

**→ Haiku** if ALL of:
- Single file or no file touched
- AND action is: fix typo / rena quick lookup / yes-no / explainone thing

**→ Opus** if ANY of:
- Words: design, architect, audianalyze, investigate, research,why does, root cause, refactor across, test plan
- Scope: 3+ files, cross-cuttingratch, multi-phase
- Ambiguous open problem with no clear single answer

**→ Sonnet** (default): everything else

## Output format

Always start the response with one line:

> **Model: [Name]** — [one sentence reason]. Override: `/model haiku` · `/model sonnet` · `/model opus`

Then proceed with the actual res

## Auto-switch

Call the appropriate `/model` cog work. Do not ask forconfirmation — just announce and proceed. The user can override at any time.
