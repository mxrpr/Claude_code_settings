#!/usr/bin/env bash
# Install the Copilot agents, skills and prompt files from this repo.
#
# Usage:
#   install.sh [--global | --project [DIR]] [--ref REF] [--force]
#
#   --global         (default) install for the current user:
#                      ~/.copilot/{agents,skills,copilot-instructions.md}   (Copilot CLI, VS Code skills)
#                      <VS Code user dir>/prompts/{*.agent.md,*.prompt.md} (VS Code)
#   --project [DIR]  install into DIR/.github (DIR defaults to the current directory)
#   --ref REF        branch or tag to download when not run from a clone (default: main)
#   --force          overwrite an existing copilot-instructions.md
#
# Run from a clone, or straight from GitHub:
#   curl -fsSL https://raw.githubusercontent.com/mxrpr/tollas-agent-kit/main/copilot/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/mxrpr/tollas-agent-kit/main/copilot/install.sh | bash -s -- --project
set -euo pipefail

REPO="${COPILOT_SETTINGS_REPO:-mxrpr/tollas-agent-kit}"
REF="main"
MODE="global"
PROJECT_DIR="$PWD"
FORCE=0

usage() { sed -n '2,17p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; }
die() { echo "error: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --global)  MODE="global" ;;
    --project)
      MODE="project"
      if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then PROJECT_DIR="$2"; shift; fi ;;
    --ref)     [ $# -gt 1 ] || die "--ref needs a value"; REF="$2"; shift ;;
    --force)   FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *)         die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

# --- locate source: local clone next to this script, else download ---
SRC=""
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/agents" ] && [ -d "$SCRIPT_DIR/skills" ]; then
  SRC="$SCRIPT_DIR"
else
  command -v curl >/dev/null || die "curl is required"
  command -v tar  >/dev/null || die "tar is required"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "Downloading $REPO@$REF ..."
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP" \
    || die "download failed for $REPO@$REF"
  SRC="$(find "$TMP" -mindepth 2 -maxdepth 2 -type d -name copilot | head -n 1)"
  [ -n "$SRC" ] || die "no copilot/ directory in $REPO@$REF"
fi

copy_dir() { # $1 = source dir, $2 = target dir
  mkdir -p "$2"
  cp -R "$1"/. "$2"/
  echo "  $2"
}

copy_instructions() { # $1 = target file
  if [ -e "$1" ] && [ "$FORCE" -ne 1 ]; then
    echo "  skipped $1 (exists; use --force to overwrite, or merge by hand)"
  else
    mkdir -p "$(dirname "$1")"
    cp "$SRC/copilot-instructions.md" "$1"
    echo "  $1"
  fi
}

vscode_user_dir() {
  case "$(uname -s)" in
    Darwin) echo "$HOME/Library/Application Support/Code/User" ;;
    *)      echo "${XDG_CONFIG_HOME:-$HOME/.config}/Code/User" ;;
  esac
}

if [ "$MODE" = "project" ]; then
  [ -d "$PROJECT_DIR" ] || die "project directory not found: $PROJECT_DIR"
  DEST="$(cd "$PROJECT_DIR" && pwd)/.github"
  echo "Installing into project: $DEST"
  copy_dir "$SRC/agents"  "$DEST/agents"
  copy_dir "$SRC/skills"  "$DEST/skills"
  copy_dir "$SRC/prompts" "$DEST/prompts"
  copy_instructions "$DEST/copilot-instructions.md"
else
  echo "Installing for user $USER"
  copy_dir "$SRC/agents" "$HOME/.copilot/agents"
  copy_dir "$SRC/skills" "$HOME/.copilot/skills"
  copy_instructions "$HOME/.copilot/copilot-instructions.md"
  VSC="$(vscode_user_dir)"
  if [ -d "$VSC" ]; then
    mkdir -p "$VSC/prompts"
    cp "$SRC"/agents/*.agent.md "$SRC"/prompts/*.prompt.md "$VSC/prompts/"
    echo "  $VSC/prompts"
  else
    echo "  skipped VS Code (no user dir at $VSC)"
  fi
fi

echo "Done. In VS Code Copilot Chat (Agent mode) run: /feature <plan.md | issue #>"
