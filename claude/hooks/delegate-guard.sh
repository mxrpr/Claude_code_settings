#!/bin/bash
# delegate-guard.sh — PreToolUse(Bash) hook.
#
# Goal: stop the expensive main-thread model from burning tokens on "no-brain"
# shell / build / test / git commands. On the MAIN thread these are routed to a
# permission prompt (soft "ask") that nudges delegation to the cheap Haiku
# subagents (os-agent / git-runner / test-runner). Bash calls made INSIDE those
# subagents always pass straight through, so the cheap workers never stall.
#
# Detection is harness-provided and model-proof:
#   * main thread   -> payload has NO agent_id / agent_type  -> guard applies
#   * any subagent  -> payload HAS agent_id / agent_type      -> always allow
#   (verified empirically against real PreToolUse payloads, CC 2.1.202)
#
# Escape hatch: put the marker  NODELEGATE  anywhere in the command to skip the
# prompt (for the rare genuine one-off that is faster inline).
#
# User `!` shell-mode commands bypass the tool pipeline entirely, so they are
# never affected by this hook.
#
# Wiring (~/.claude/settings.json):
#   "PreToolUse": [ { "matcher": "Bash",
#     "hooks": [ { "type": "command",
#                  "command": "/home/mixer/.claude/hooks/delegate-guard.sh" } ] } ]

IN=$(cat)

allow() { printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'; exit 0; }
ask()   { # $1 = reason shown in the permission prompt
  jq -nc --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

# --- inside a subagent? this IS the cheap worker -> never interfere ---
AGENT=$(printf '%s' "$IN" | jq -r '(.agent_id // .agent_type) // ""')
[ -n "$AGENT" ] && allow

CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')
[ -z "$CMD" ] && allow

# --- explicit override ---
case "$CMD" in *NODELEGATE*) allow ;; esac

# token must sit at a command position: start, or after ; & | ( ` newline or whitespace
pos='(^|[;&|(`]|[[:space:]])'
end='([[:space:]]|$)'

# --- git -> git-runner ---
if printf '%s' "$CMD" | grep -Eq "${pos}git${end}"; then
  ask "git command — delegate to the git-runner agent (Haiku) to save tokens instead of running it here. (Destructive/shared git — push, reset --hard, branch -D — still needs your explicit ok in the delegation prompt.) Approve only if an inline one-off is genuinely faster; or append  # NODELEGATE  to skip this prompt."
fi

# --- build / test / lint -> test-runner (suites) or os-agent ---
BUILD='dotnet|msbuild|npm|npx|yarn|pnpm|cargo|rustc|go|pytest|maven|mvn|gradle|make|cmake|ctest|tsc|vitest|jest|eslint|prettier|ruff|mypy|phpunit|rspec'
if printf '%s' "$CMD" | grep -Eq "${pos}(${BUILD})${end}"; then
  ask "build/test/lint command — delegate to the test-runner agent (existing suites) or os-agent (Haiku) to save tokens instead of running it here. Approve only if an inline one-off is genuinely faster; or append  # NODELEGATE  to skip this prompt."
fi

# --- os / text / http / scripts -> os-agent ---
OS='ls|ll|find|stat|cat|head|tail|less|more|grep|egrep|fgrep|rg|ag|ack|awk|sed|sort|uniq|cut|tr|wc|xargs|tee|tree|du|df|ps|top|htop|lsof|nl|column|curl|wget|http|scp|rsync|ssh|nc|ping|tar|gzip|gunzip|zip|unzip|jq|yq|xmllint|python|python3|node|deno|bun|ruby|perl|php|bash|sh|zsh|cp|mv|rm|mkdir|rmdir|ln|touch|chmod|chown|kill|pkill|fuser'
if printf '%s' "$CMD" | grep -Eq "${pos}(${OS})${end}"; then
  ask "OS/shell/HTTP command — delegate to the os-agent (Haiku) to save tokens. For pure file reads/search prefer the Read/Grep/Glob tools. (Destructive ops — rm, mv over existing, kill, chmod -R, POST/PUT/DELETE, sudo — still need your explicit ok in the delegation prompt.) Approve only if an inline one-off is genuinely faster; or append  # NODELEGATE  to skip this prompt."
fi

# --- harmless builtins (echo, cd, pwd, export, test, true, ...) pass ---
allow
