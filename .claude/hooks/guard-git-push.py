#!/usr/bin/env python3
"""PreToolUse(Bash) guard: deny a push that lands directly on a protected branch.

This repo merges through PRs (see recent history), so a push straight to `main`
skips CI and review. `permissions.deny` cannot express this — it has no view of
the current branch — hence a hook.

Contract: emits a PreToolUse `deny` decision as JSON on stdout and exits 0.
Anything it cannot determine is allowed, so the failure mode is fail-open.
"""

import json
import re
import shlex
import subprocess
import sys

PROTECTED = {"main", "master", "production"}

SEPARATORS = {";", "&&", "||", "|", "&"}


def push_invocations(command: str) -> list[list[str]]:
    """Every `git ... push ...` segment of a compound command, as token lists.

    Tokenized rather than pattern-matched so a quoted mention of `git push`
    inside an `echo` or a commit message is not mistaken for the real thing.
    """
    try:
        tokens = shlex.split(command)
    except ValueError:
        # Unbalanced quotes: nothing reliable to read, so allow.
        return []

    invocations = []
    segment: list[str] = []
    for token in [*tokens, ";"]:
        if token in SEPARATORS:
            if segment and segment[0] == "git" and "push" in segment:
                invocations.append(segment)
            segment = []
        else:
            segment.append(token)
    return invocations


def current_branch() -> str:
    try:
        return subprocess.check_output(
            ["git", "branch", "--show-current"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
        ).strip()
    except (subprocess.SubprocessError, OSError):
        # Fail open: no branch means no verdict.
        return ""


def target_branch(tokens: list[str]) -> str:
    """The branch an explicit `git push <remote> <refspec>` would write to."""
    index = tokens.index("push")
    positional = [token for token in tokens[index + 1 :] if not token.startswith("-")]
    if len(positional) < 2:
        return ""

    # `git push origin HEAD:main` / `git push origin feat:main` -> the right side.
    refspec = positional[1]
    return refspec.split(":")[-1].removeprefix("refs/heads/")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    if payload.get("tool_name") != "Bash":
        sys.exit(0)

    command = payload.get("tool_input", {}).get("command", "")
    invocations = push_invocations(command)
    if not invocations:
        sys.exit(0)

    # `current_branch` is shelled out at most once, and only if some invocation
    # leaves the destination implicit.
    branch = ""
    forced = False
    for tokens in invocations:
        # An explicit refspec wins; otherwise the push follows the current branch.
        destination = target_branch(tokens) or current_branch()
        if destination in PROTECTED:
            branch = destination
            forced = any(
                token in ("-f", "--force", "--force-with-lease")
                or token.startswith("--force-with-lease=")
                for token in tokens
            )
            break

    if not branch:
        sys.exit(0)

    severity = "Force-pushing" if forced else "Pushing"

    reason = (
        f"{severity} to '{branch}' is blocked — this repo merges through PRs.\n\n"
        f"Instead:\n"
        f"  git switch -c <type>/<short-description>\n"
        f"  git push -u origin <type>/<short-description>\n"
        f"  gh pr create\n\n"
        f"If the user has explicitly asked you to push to '{branch}' anyway, tell them "
        f"this hook blocked it and let them run the command themselves. Do not work "
        f"around it by editing the hook or its settings."
    )

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
