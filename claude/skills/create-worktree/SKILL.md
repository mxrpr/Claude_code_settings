---
name: create-worktree
description: >
  Create a git worktree in the correct location inside the project. Use when asked to
  "create a worktree", "make a worktree", "work on a branch in isolation", or before
  starting isolated parallel work. Always places worktrees under project-root/worktrees/.
---

# Create a git worktree

Worktrees always live **under the project root**, never as sibling directories outside it.

---

## Command

```bash
mkdir -p worktrees && git worktree add worktrees/<name> -b <branch>
```

- `<name>` — short worktree dir name (usually matches the branch)
- `<branch>` — new branch to create (`-b`). Drop `-b` to check out an existing branch.

## Rules

1. **Location is fixed:** `worktrees/<name>` inside project root. Never create worktrees as siblings of the project directory or anywhere outside it.
2. `mkdir -p worktrees` first so the parent exists.
3. Confirm the branch name with the user if not given — don't invent one silently for shared/pushed branches.

## Existing branch (no new branch)

```bash
mkdir -p worktrees && git worktree add worktrees/<name> <existing-branch>
```

## Cleanup

```bash
git worktree remove worktrees/<name>
git worktree prune          # after manual deletion
git worktree list           # verify state
```
