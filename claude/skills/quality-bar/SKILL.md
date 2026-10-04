---
name: quality-bar
description: Shared code quality standard (security, correctness, error handling, concurrency, performance, architecture, tests, docs, tooling) with Critical/High/Medium/Low severity definitions. Use when implementing or reviewing code changes, self-reviewing a diff, or checking whether code would pass a comprehensive review.
---

# Quality Bar

Shared standard for the dev pipeline. The implementation agent (code-agent) builds to it; the review agent (code-review) judges against it. It mirrors the dimensions and severities used by the comprehensive-review plugin, so code that meets this bar should not produce Critical or High findings there.

Scope: apply it to the code you added or changed and to the code paths it directly affects. Pre-existing issues outside that scope are reported as "pre-existing", not fixed silently and not counted against the change.

## Severity definitions

- **Critical**: exploitable security hole, data loss or corruption, crash or outage on a normal path, broken core functionality.
- **High**: security weakness needing specific conditions, incorrect behaviour on a realistic edge case, unhandled failure of an external dependency, serious performance problem on a hot path, missing tests for security-critical or core logic.
- **Medium**: maintainability problems, minor edge cases, inconsistent conventions, missing tests for non-critical paths.
- **Low**: style, naming, small readability improvements.

Critical and High must be zero before a change is handed off. Medium should be fixed unless there is a stated reason not to.

## 1. Security (OWASP Top 10, CWE)

Critical/High if violated:
- [ ] All untrusted input (user, network, file, env, IPC, deserialized data) is validated for type, length, range and format at the trust boundary.
- [ ] No injection: SQL/NoSQL use parameterized queries; shell commands use argument arrays, never string concatenation; no `eval` of untrusted data; output is encoded for its context (HTML, JS, URL, log).
- [ ] File paths built from input are canonicalized and confined to an allowed root (no path traversal).
- [ ] Every operation that reads or changes protected data checks authentication AND authorization (who is calling, and may they touch THIS resource).
- [ ] No secrets, keys, tokens or passwords in code, logs, error messages or test fixtures committed to the repo.
- [ ] Cryptography uses vetted libraries and current algorithms; no homemade crypto, no MD5/SHA1 for security, no fixed IVs or salts; random values for security use a CSPRNG.
- [ ] Deserialization of untrusted data uses safe formats/settings (no arbitrary type instantiation).
- [ ] Errors returned to callers do not leak stack traces, internal paths, queries or secrets.
- [ ] No insecure defaults: debug mode off, permissive CORS off, TLS verification on, least-privilege permissions.
- [ ] New dependencies are maintained, pinned, and free of known CVEs.

## 2. Correctness and error handling

Critical/High if violated:
- [ ] Behaviour matches the task's definition of done, including stated edge cases.
- [ ] Edge cases handled: empty, null/None, zero, negative, max size, unicode, duplicate, missing key, concurrent call.
- [ ] Every fallible call (I/O, network, parse, DB, external API) has its failure handled: no swallowed exceptions, no empty catch blocks, no ignored error returns, no `unwrap`/`!`/bare `.Result` on fallible values outside tests.
- [ ] Error messages say what failed and why, with enough context to debug, and without sensitive data.
- [ ] Resources (files, connections, locks, handles, subscriptions) are released on every path, including error paths.
- [ ] Partial failures leave data consistent (transactions, rollback, or idempotent retry).
- [ ] Timeouts on all network and external calls.

## 3. Concurrency and performance

Critical/High if violated:
- [ ] Shared mutable state is protected; no race conditions, no check-then-act without a lock or atomic operation.
- [ ] No deadlock risk: consistent lock order, no lock held across await/I/O when avoidable.
- [ ] No blocking calls on async/event-loop/UI threads.
- [ ] No N+1 queries or calls inside loops that could be batched.
- [ ] Collections, caches, queues and buffers are bounded; large results are paginated or streamed.
- [ ] No needless quadratic work on inputs that can grow.

## 4. Code quality and architecture

High if seriously violated, otherwise Medium:
- [ ] Follows the project's existing patterns, layering and module boundaries; no new dependency direction that inverts the architecture.
- [ ] No circular dependencies; no tight coupling to concrete implementations where the project uses abstractions.
- [ ] Functions do one thing; deep nesting and long functions are split.
- [ ] No duplicated logic where a helper already exists in the codebase.
- [ ] No dead code, commented-out code, debug prints, or TODOs without an issue reference.
- [ ] Public API changes are backward compatible, or the break is intentional and documented.
- [ ] No over-engineering: no abstractions, options or features beyond the task.

## 5. Tests

High if violated for security-critical or core logic, otherwise Medium:
- [ ] New behaviour has tests; bug fixes have a regression test that fails without the fix.
- [ ] Tests cover the error paths and edge cases from sections 1-3, not only the happy path.
- [ ] Tests assert behaviour, not implementation details; assertions are specific.
- [ ] Tests are isolated and deterministic (no real network, no sleep-based timing, no order dependence).

## 6. Documentation

Medium unless it hides a breaking change (then High):
- [ ] Non-obvious logic, invariants and security assumptions are commented (why, not what).
- [ ] Public functions/types follow the project's doc comment convention.
- [ ] README, API docs, config docs and changelog updated when behaviour, setup or interfaces change.

## 7. Tooling

High if violated:
- [ ] The project builds with no new warnings.
- [ ] The project's linters, formatters and static analyzers pass on changed files (e.g. clippy, eslint, ruff, mypy, semgrep, `dotnet build -warnaserror`, `go vet`), when the project has them.
