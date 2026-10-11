---
description: Run the plan→implement→review→test pipeline iteratively, part by part
argument-hint: [plan or feature description]
model: claude-sonnet-4-6
---

User-provided plan: $ARGUMENTS

0a. Routing rule: this pipeline orchestrates subagents, but it does not replace the global command-routing rule. Never run git commands (status/diff/log/add/commit) or shell/build/test commands (cargo/npm/make/…) directly in the orchestrator — delegate to `git-runner` and `os-agent`/`test-runner` respectively, same as outside the pipeline. The only exception is commands a pipeline stage (test-executor, implementation) already runs as part of its own defined job.

0b. Investigation-dedup rule: if ground-truth facts about the codebase are needed before planning (current state, what's already done, what's dead vs live), gather them ONCE — either inline via Grep/Read or one investigation-agent pass — and feed the findings directly into the planning agent's prompt. Do not run a separate research agent and the planning agent in parallel/independently on the same question; that duplicates the grep work and wastes tokens re-deriving the same facts twice.

0c. Context-reuse rule (applies to every step below): each pipeline role (implementation, review, test-planner, test-writer, test-executor) is spawned via Agent ONCE PER TRACK, on the first part that role touches in that track. A "track" is a maximal run of parts that depend on each other in sequence (the common case: one track for the whole plan). Record each role's agentId per track. On every later part in the same track, resume that SAME agent via SendMessage(to: agentId) instead of spawning fresh — this carries the plan, ground-truth findings, and established conventions forward instead of re-deriving them from files every time. Only spawn a brand-new agent for a role if the existing one errors out, the user asks to reset it, or a new independent track starts (see step 2f) — a fresh agent there is correct, not a violation.
   - When resuming, keep the message terse: reference what the agent already established ("your Part 2 approach", "the golden-fixture convention you used") rather than re-explaining ground truth, file locations, or conventions it already read. Only spell things out in full the first time a role is spawned in a track.
   - Do not let a review agent silently accept its own prior mistakes: it's fine for it to reuse context, but each review pass must still independently check the diff, not just confirm its earlier verdict from memory.
   - Checkpoint rule: every ~5 parts resumed by the same agent, ask it for a short condensed state summary (established conventions, key file locations/line numbers, decisions made) instead of resuming indefinitely. Start a fresh agent for that role seeded with the summary, and record the new agentId as the track's current one. This caps context growth on long tracks instead of letting one agent's history grow for the whole plan.

0d. Doc/decision-only fast path: if a part touches no production code (pure documentation edit, a recorded keep/remove decision, drafted issue text, a plan-doc update) — check the part's own "files:" list in the checklist — skip the review and test stages for it entirely. Make the edit directly (inline, or via a single implementation-agent call if the edit is nontrivial), mark it done in the plan checklist, and move to the next part. Reserve full implementation→review→test for parts that change behavior or production/test code.

1. Use the planning subagent to break the user-provided plan into small, ordered parts (each a self-contained unit of work), written to the plan the user provided as a checklist.
Do not start the implementation subagent, always wait for the user to give the command. After planning, allow the user to review the plan, ask questions, refine it.

2. For each part, in order:
   a. Resume (or, on the first part, spawn) the implementation agent to implement just that part.
   b. Resume (or, on the first part, spawn) the review agent to review the change.
      - If it flags problems: send the findings back to the SAME implementation agent (SendMessage, not a new spawn) and repeat, up to 2 more times.
      - If it passes: mark the part done in plan.md and continue.
   c. If the part is small (roughly 1-3 files) and the plan already specifies what to test, skip test-planner and test-writer/test-executor as separate spawns — have the implementation agent write and run the tests inline as part of step (a), and only send its result to the review agent. Otherwise: resume (or spawn) the test-planner subagent for a test plan scoped to this part, then resume (or spawn) the test-writer subagent to write tests from it, then resume (or spawn) the test-executor subagent to run them and report pass/fail.
   d. If tests fail: send the failure back to the SAME implementation agent for a fix, then re-run from step (b) for this part.
   e. The plan document contains the truth. Whenever the session is reset, or the client restarts development, the plan's checklist state is how you know where the implementation process has stopped — not agent memory (agents may not survive a session reset, the plan doc must).
   f. When two or more upcoming parts are independent of each other (neither depends on the other's output), treat each as its own track: spawn a dedicated implementation agent (and, if needed, dedicated review/test agents) per track, launched in parallel (single message, multiple Agent calls), instead of funneling both through one shared agent sequentially. Each track then follows its own resume-in-place chain per step (a); merge back to a single track only once the independent parts are both done.
   g. After a part is finished, ask the user to continue with the next part.

3. After all parts are done, report a summary of what was implemented and tested.

Stop and report status if any part fails after retries, rather than continuing to the next part.
