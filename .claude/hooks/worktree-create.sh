#!/usr/bin/env bash
# Claude Code WorktreeCreate hook — creates the worktree and runs setup.
#
# Contract:
#   - Receives JSON on stdin with 'name' field
#   - Must print the absolute worktree path on stdout (nothing else!)
#   - Progress output goes to /dev/tty
#
# Customize the sections below for your project:
#   - ENV_FILES: which env files to copy from the main repo
#   - COPY_DIRS: which directories to copy
#   - "Install dependencies": your package manager commands
#
# Usage: Add to .claude/settings.json (see settings.json template)
set -euo pipefail

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
REPO_PATH="$CLAUDE_PROJECT_DIR"
# Absolute, and one directory per worktree: the contract is an absolute path on
# stdout, and a shared path would collide on the second `create`.
WORKTREE_PATH="${REPO_PATH}/.claude/worktrees/${NAME}"
BRANCH="worktree-${NAME}"

# Progress goes to /dev/tty — stdout is reserved for Claude.
# Resolve the target once: `> /dev/tty` with no controlling terminal fails at
# redirection time, and bash prints that error before any `2>/dev/null` applies.
if [ -w /dev/tty ]; then TTY=/dev/tty; else TTY=/dev/null; fi
log() { echo "$*" > "$TTY" 2>/dev/null || true; }

# cksum is POSIX; md5sum is GNU-only and absent on a stock macOS.
hash_port() {
  local hash
  hash=$(echo -n "$1" | cksum | cut -d' ' -f1)
  echo $(( (hash % 6900) + 3100 ))
}
DEV_PORT=$(hash_port "$BRANCH")

log "Creating worktree (branch: $BRANCH, port: $DEV_PORT)..."

# --- Create the git worktree ---
# IMPORTANT: redirect git output away from stdout — Claude parses stdout for the path
mkdir -p "${REPO_PATH}/.claude/worktrees"
if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git worktree add "$WORKTREE_PATH" "$BRANCH" >/dev/null 2>&1
else
  git worktree add -b "$BRANCH" "$WORKTREE_PATH" HEAD >/dev/null 2>&1
fi

# --- Copy env files from main repo ---
log "  Copying env files..."
ENV_FILES=(".env" ".env.local")
for f in "${ENV_FILES[@]}"; do
  [ -f "${REPO_PATH}/$f" ] && cp "${REPO_PATH}/$f" "${WORKTREE_PATH}/$f"
done

# --- Copy directories ---
# Useful for data dirs, fixtures, or other non-gittracked content.
COPY_DIRS=()  # e.g., ("data" "fixtures" "secrets")
for d in "${COPY_DIRS[@]}"; do
  if [ -d "${REPO_PATH}/$d" ]; then
    mkdir -p "${WORKTREE_PATH}/$d"
    cp -rT "${REPO_PATH}/$d" "${WORKTREE_PATH}/$d"
  fi
done

# --- Append a deterministic dev port ---
# Append, never truncate: .env.local may have just been copied from the main repo.
printf '\nDEV_PORT=%s\n' "${DEV_PORT}" >> "${WORKTREE_PATH}/.env.local"

# --- Install dependencies ---
# Customize for your stack. Verbose output goes to a log file.
LOGFILE="${WORKTREE_PATH}/.worktree-setup.log"
SETUP_ERRORS=()

log "  Installing dependencies (pnpm install)..."
(cd "${WORKTREE_PATH}" && pnpm install) >> "$LOGFILE" 2>&1 \
  || SETUP_ERRORS+=("'pnpm install' failed")

# --- Done ---
if [ ${#SETUP_ERRORS[@]} -gt 0 ]; then
  log "Setup completed with errors:"
  printf '  - %s\n' "${SETUP_ERRORS[@]}" > "$TTY" 2>/dev/null || true
  log "See $LOGFILE for details."
else
  log "Worktree ready."
fi

# Tell Claude where the worktree is — THE ONLY THING ON STDOUT
echo "$WORKTREE_PATH"
