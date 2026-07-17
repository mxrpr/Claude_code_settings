# Plugins
## Caveman
https://github.com/juliusbrussee/caveman

## code security review
https://github.com/anthropics/claude-code-security-review

Usage:
`/plugin install comprehensive-review@claude-code-workflows`

## code-simplifier
Source: Anthropic official — github.com/anthropics/claude-plugins-official

`/plugin marketplace add anthropics/claude-plugins-official`
`/plugin install code-simplifier@claude-plugins-official`
AI moves fast and writes faster. The code it produces works but accumulates complexity quickly — nested ternaries, functions doing three things at once, abstractions that made sense in the moment and don’t six weeks later.

The code-simplifier skill is focused on one thing: take recently modified code and make it cleaner without changing what it does. It follows your project’s conventions from CLAUDE.md, applies them consistently, and flags clarity issues like nested conditionals and overly compact logic in favour of explicit, readable alternatives.

The rule it enforces that I appreciate most: never change behaviour, only how behaviour is expressed. It won’t refactor your logic or suggest architecture changes — it cleans up the code you just wrote and moves on. That constraint is what makes it trustworthy.


## dev-pipeline
Source: this repo — `dev-pipeline-plugin/`

`/plugin marketplace add mxrpr/Claude_code_settings`
`/plugin install dev-pipeline@dev-pipeline-marketplace`

Runs a plan → implement → review → test loop, one part of `plan.md` at a time, instead of one big agent doing everything in a single unstructured pass. Each stage is a dedicated subagent so each one stays narrowly scoped and the context of one stage doesn't pollute another.

Usage: `/dev-pipeline <plan or feature description>`

Flow:
1. **planning** subagent breaks the request into small, ordered, self-contained parts, written into `plan.md` as a checklist. It then stops — nothing implements until you say go. Review and refine the plan here.
2. For each part, in order:
   - **implementation** subagent implements just that part.
   - **code-review** subagent reviews the diff. Problems go back to implementation, up to 2 retries, before moving on.
   - **test-planner** subagent scopes a test plan to that part, **test-writer** writes the tests, **test-executor** runs them and reports pass/fail.
   - Failing tests go back to implementation, then re-review.
   - `plan.md`'s checklist is the source of truth for where the pipeline stopped — it survives session resets even if agent memory doesn't.
   - Pauses after each completed part for your go-ahead to continue.
3. Once every part is done, reports a summary of what was implemented and tested.

If a part fails after retries, the pipeline stops and reports status rather than pushing on to the next part.

Example:
```
/dev-pipeline Add rate limiting to the public API
```
Planning subagent writes `plan.md`:
```markdown
# Plan: Add rate limiting to the public API

- [ ] Part 1: Add token-bucket limiter middleware (per-IP)
- [ ] Part 2: Wire middleware into the API router
- [ ] Part 3: Return 429 with Retry-After header on limit exceeded
- [ ] Part 4: Add config for limit/window (env vars)
```
It stops there. You review/edit the parts, then say "go" (or similar) to start. For Part 1, it then runs implementation → code-review → test-planner/writer/executor, checks the box, and pauses before Part 2.


## Karpathy-Inspired Claude Code Guidelines
https://github.com/multica-ai/andrej-karpathy-skills/tree/main

### Installation
/plugin marketplace add forrestchang/andrej-karpathy-skills


