---
name: commit-clean
description: >
  Write git commit messages without AI attribution. Use when creating a commit, writing
  a commit message, or invoked before `git commit`. Strips any Claude/Anthropic
  co-author or "generated with" trailers.
---

# Clean commit messages

Commit messages must contain **no AI attribution**.

---

## Rules

1. **Never** add `Co-Authored-By: Claude` or any Claude/Anthropic co-author trailer.
2. **Never** add "Generated with Claude Code" or similar generator lines.
3. No emoji robot tags, no tool self-promotion.

The message is the author's — write it as if a human wrote it.

## Format

Conventional Commits:

```
<type>(<scope>): <subject>

<body — the "why", only when not obvious from the subject>
```

- `type`: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`
- Subject: imperative mood, lower-case, ≤ ~50 chars, no trailing period
- Body: wrap ~72 cols; explain *why*, not *what* (diff shows what)

## Example

```
fix(auth): use <= for token expiry boundary

Off-by-one let tokens expiring exactly at the check time pass.
```

No trailers. No attribution. Done.
