---
description: Run the plan→implement→review→test pipeline iteratively, part by part
argument-hint: [plan or feature description]
model: claude-opus-4-8
---

User-provided plan: $ARGUMENTS

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
