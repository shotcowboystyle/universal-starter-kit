#!/usr/bin/env python3
"""PreToolUse(Write|Edit) guard: block writing a credential to disk.

Complements `betterleaks` in lefthook pre-push, which only sees commits. This
sees the content before it ever lands in the working tree.

Contract: exit 2 blocks the tool call and feeds stderr back to Claude.
Anything else allows it, so the failure mode is fail-open by design.
"""

import json
import os
import re
import sys

# (pattern, label, remediation). Patterns are matched against the content the
# tool is about to write, so they must tolerate arbitrary surrounding code.
SECRET_PATTERNS = [
    (
        r'(?i)\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["\'][A-Za-z0-9_\-]{20,}["\']',
        "API key / access token",
        "Read it from the central config module instead of inlining the literal",
    ),
    (
        r"(?i)\bbearer\s+[A-Za-z0-9_\-.]{20,}",
        "Bearer token",
        "Read it from the central config module instead of inlining the literal",
    ),
    (
        r"\bghp_[A-Za-z0-9]{36}\b",
        "GitHub personal access token",
        "Store in the environment; never commit a GitHub token",
    ),
    (
        r"\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b",
        "GitHub fine-grained PAT",
        "Store in the environment; never commit a GitHub token",
    ),
    (
        r"\bsk-(?:proj-)?[A-Za-z0-9_\-]{32,}\b",
        "OpenAI API key",
        "Store in the environment; never commit an OpenAI key",
    ),
    (
        r"\bsk-ant-[A-Za-z0-9_\-]{32,}\b",
        "Anthropic API key",
        "Store in the environment; never commit an Anthropic key",
    ),
    (
        r"\bsbp_[a-f0-9]{40}\b",
        "Supabase access token",
        "Store in the environment; never commit a Supabase token",
    ),
    (
        r"\bey[A-Za-z0-9_\-]{10,}\.ey[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
        "JWT (possible Supabase service_role key)",
        "Service-role keys must never reach the client bundle or the repo",
    ),
    (
        r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
        "Private key",
        "Store in a secrets manager; never commit a private key",
    ),
    (
        r"(?i)\baws[_-]?secret[_-]?access[_-]?key\b\s*[:=]\s*[\"']?[A-Za-z0-9/+=]{40}",
        "AWS secret access key",
        "Store in the environment; never commit AWS credentials",
    ),
    (
        r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
        "AWS access key id",
        "Store in the environment; never commit AWS credentials",
    ),
]

# A quoted password literal. Deliberately narrower than the other patterns: an
# app full of auth forms has many innocent `password`-adjacent strings, and a
# false block is far more annoying here than anywhere else. Requires a value
# with no whitespace, and placeholders are filtered out below.
PASSWORD_PATTERN = (
    r"(?i)\b(?:password|passwd|pwd|secret)\b\s*[:=]\s*[\"']([^\"'\s]{8,})[\"']"
)

# Values that look like a password literal but are not one.
PLACEHOLDER = re.compile(
    r"(?i)^(?:"
    r"\$\{.*|"  # ${VAR} interpolation
    r"process\.env\..*|"
    r"<.*>|"  # <your-password-here>
    r"x{3,}|\*{3,}|\.{3,}|"
    r"(?:your|my|the)[-_]?.*|"
    r".*(?:placeholder|example|sample|dummy|changeme|redacted|hunter2|password|todo).*"
    r")$"
)

# Basenames that legitimately carry credential-shaped strings.
SKIP_BASENAMES = {
    ".env.example",
    ".env.template",
    ".env.sample",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
}

# Path segments whose files are fixtures, not production code. Matched as whole
# segments so `src/latest-config.ts` is not mistaken for a test.
SKIP_SEGMENTS = {
    "__tests__",
    "__mocks__",
    "__fixtures__",
    "test",
    "tests",
    "e2e",
    "fixtures",
    "mocks",
    "node_modules",
}

TEST_FILE = re.compile(r"\.(?:test|spec)\.[cm]?[jt]sx?$")


def should_skip(file_path: str) -> bool:
    """True when the file is a fixture or a lock file rather than real source."""
    basename = os.path.basename(file_path)
    if basename in SKIP_BASENAMES or TEST_FILE.search(basename):
        return True
    segments = {segment for segment in file_path.split(os.sep) if segment}
    return bool(segments & SKIP_SEGMENTS)


def find_secrets(content: str) -> list[str]:
    """Return one message per distinct credential type found in `content`."""
    issues = []

    for pattern, label, remediation in SECRET_PATTERNS:
        if re.search(pattern, content):
            issues.append(f"{label} — {remediation}")

    for value in re.findall(PASSWORD_PATTERN, content):
        if not PLACEHOLDER.match(value):
            issues.append(
                "Hardcoded password/secret literal — "
                "read it from the central config module instead"
            )
            break

    return issues


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        # Fail open: a malformed payload must not wedge every edit.
        sys.exit(0)

    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    content = tool_input.get("content") or tool_input.get("new_string") or ""

    if not content or should_skip(file_path):
        sys.exit(0)

    issues = find_secrets(content)
    if not issues:
        sys.exit(0)

    print(f"BLOCKED — credential detected in {file_path or '<unknown file>'}:", file=sys.stderr)
    for issue in issues:
        print(f"  - {issue}", file=sys.stderr)
    print(
        "\nDo not retry this write as-is. Move the value into the environment and "
        "reference it through the config module. If this is a false positive, say so "
        "and let the user decide — do not edit security-check.py to get past it.",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
