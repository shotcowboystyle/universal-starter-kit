#!/usr/bin/env bash
# Claude Code WorktreeRemove hook — cleans up when a worktree is deleted.
#
# Contract:
#   - Receives JSON on stdin with 'worktree_path' field
#   - Exit 0 = success
#
# Usage: Add to .claude/settings.json (see settings.json template)
set -euo pipefail

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path')

[ ! -d "$WORKTREE_PATH" ] && exit 0

# Kill any process running on the worktree's dev port
if [ -f "${WORKTREE_PATH}/.env.local" ]; then
  # sed, not `grep -oP`: -P is a GNU extension and BSD grep on macOS has no such flag,
  # so the port lookup silently returned nothing and the process was never killed.
  DEV_PORT=$(sed -n 's/^DEV_PORT=\([0-9][0-9]*\).*/\1/p' "${WORKTREE_PATH}/.env.local" 2>/dev/null | tail -1 || true)
  if [ -n "$DEV_PORT" ]; then
    lsof -ti :"$DEV_PORT" | xargs kill 2>/dev/null || true
  fi
fi

# Remove the git worktree and delete worktree-specific branches
BRANCH=$(git -C "$WORKTREE_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
if [ -n "$BRANCH" ] && [[ "$BRANCH" == worktree-* ]]; then
  git branch -D "$BRANCH" 2>/dev/null || true
fi

# Add any other cleanup here, e.g.:
#   - Drop a per-worktree database
#   - Remove temp files
#   - Deregister from a service
