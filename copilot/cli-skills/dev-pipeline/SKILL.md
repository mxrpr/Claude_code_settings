---
name: dev-pipeline
description: 'Run the plan→implement→review→test pipeline iteratively, part by part. Manual only: run as /dev-pipeline <plan or feature description>.'
disable-model-invocation: true
---

User-provided plan: the text the user passed after `/dev-pipeline` (if empty, ask for the plan or feature description before doing anything else)

0a. Routing rule: this pipeline orchestrates subagents (custom agents run via the `agent` tool), but it does not replace the global command-routing rule. Never run git commands (status/diff/log/add/commit) or shell/build/test commands (cargo/npm/make/…) directly in the orchestrator — delegate to `git-runner` and `os-agent`/`test-runner` respectively, same as outside the pipeline. The only exception is commands a pipeline stage (test-executor, implementation) already runs as part of its own defined job.

0b. Investigation-dedup rule: if ground-truth facts about the codebase are needed before planning (current state, what's already done, what's dead vs live), gather them ONCE — either inline via search/read or one investigation subagent pass — and feed the findings directly into the planning agent's prompt. Do not run a separate research agent and the planning agent in parallel/independently on the same question; that duplicates the search work and wastes tokens re-deriving the same facts twice.

0c. Context-reuse rule (applies to every step below): Copilot subagents start with a fresh context on every call and cannot be resumed. Carry context forward through files instead. A "track" is a maximal run of parts that depend on each other in sequence (the common case: one track for the whole plan). For each pipeline role (implementation, review, test-planner, test-writer, test-executor) keep one notes file per track, `.github/pipeline/<track>/<role>.md`, holding established conventions, key file locations, decisions and the last result. Tell each agent to read its notes file first and update it before returning (agents without an edit tool, such as code-review, get theirs written by the orchestrator from the agent's report).
   - Keep each prompt terse: reference what the notes file already records ("your Part 2 approach in the notes file", "the golden-fixture convention recorded there") rather than re-explaining ground truth, file locations, or conventions. Only spell things out in full the first time a role works in a track.
   - Do not let a review agent silently accept its own prior mistakes: it may reuse its notes, but each review pass must still independently check the diff, not just confirm its earlier verdict.
   - Checkpoint rule: every ~5 parts, have the role condense its notes file to a short state summary (established conventions, key file locations/line numbers, decisions made) so it does not grow for the whole plan.

0d. Doc/decision-only fast path: if a part touches no production code (pure documentation edit, a recorded keep/remove decision, drafted issue text, a plan-doc update) — check the part's own "files:" list in the checklist — skip the review and test stages for it entirely. Make the edit directly (inline, or via a single implementation-agent call if the edit is nontrivial), mark it done in the plan checklist, and move to the next part. Reserve full implementation→review→test for parts that change behavior or production/test code.

1. Use the `planning` agent to break the user-provided plan into small, ordered parts (each a self-contained unit of work), written to the plan the user provided as a checklist.
Do not start the implementation agent, always wait for the user to give the command. After planning, allow the user to review the plan, ask questions, refine it.

2. For each part, in order:
   a. Run the `code-agent` to implement just that part.
   b. Run the `code-review` agent to review the change.
      - If it flags problems: send the findings back to `code-agent` (with its notes file) and repeat, up to 2 more times.
      - If it passes: mark the part done in plan.md and continue.
   c. If the part is small (roughly 1-3 files) and the plan already specifies what to test, skip test-planner and test-writer/test-executor as separate runs — have `code-agent` write and run the tests inline as part of step (a), and only send its result to the review agent. Otherwise: run `test-planner` for a test plan scoped to this part, then `test-writer` to write tests from it, then `test-executor` to run them and report pass/fail.
   d. If tests fail: send the failure back to `code-agent` for a fix, then re-run from step (b) for this part.
   e. The plan document contains the truth. Whenever the session is reset, or the client restarts development, the plan's checklist state is how you know where the implementation process has stopped — not agent memory (the plan doc and notes files survive a session reset; subagents do not).
   f. When two or more upcoming parts are independent of each other (neither depends on the other's output), treat each as its own track with its own notes files, and run their agents in parallel where the client supports parallel subagents; merge back to a single track only once the independent parts are both done.
   g. After a part is finished, ask the user to continue with the next part.

3. After all parts are done, report a summary of what was implemented and tested.

Stop and report status if any part fails after retries, rather than continuing to the next part.
