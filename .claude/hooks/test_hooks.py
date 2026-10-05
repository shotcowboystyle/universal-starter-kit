#!/usr/bin/env python3
"""Self-check for the two blocking hooks. Run: python3 .claude/hooks/scripts/test_hooks.py

No framework on purpose — these run outside the repo's vitest setup and must
stay runnable with a bare `python3`.
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
SECURITY = HERE / "security-check.py"
PUSH = HERE / "guard-git-push.py"

# A JWT-shaped string assembled at runtime so this file is not itself a hit.
FAKE_JWT = "ey" + "J" * 20 + ".ey" + "J" * 20 + "." + "s" * 20


def run(script: Path, payload: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(script)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=15,
    )


def write(file_path: str, content: str) -> dict:
    return {
        "tool_name": "Write",
        "tool_input": {"file_path": file_path, "content": content},
    }


def bash(command: str) -> dict:
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def denied(result: subprocess.CompletedProcess) -> bool:
    """True when guard-git-push.py emitted a `deny` decision."""
    if not result.stdout.strip():
        return False
    decision = json.loads(result.stdout)["hookSpecificOutput"]
    return decision["permissionDecision"] == "deny"


def main() -> int:
    failures = []

    def check(name: str, condition: bool) -> None:
        if not condition:
            failures.append(name)

    # --- security-check.py: blocks (exit 2) ---
    blocked = {
        "github pat": 'const t = "ghp_' + "a" * 36 + '";',
        "anthropic key": 'const k = "sk-ant-' + "a" * 40 + '";',
        "openai key": 'const k = "sk-proj-' + "a" * 40 + '";',
        "supabase token": 'const t = "sbp_' + "0" * 40 + '";',
        "service_role jwt": f'const k = "{FAKE_JWT}";',
        "aws key id": 'const id = "AKIA' + "A" * 16 + '";',
        "private key": "-----BEGIN RSA PRIVATE KEY-----",
        "api key literal": 'const c = { apiKey: "' + "a" * 30 + '" };',
        "bearer token": 'headers: { Authorization: "Bearer ' + "a" * 30 + '" }',
        # Fixture: the literal this suite asserts is blocked.
        "real password": 'const creds = { password: "Tr0ub4dor&3xK" };',  # betterleaks:allow
    }
    for name, content in blocked.items():
        result = run(SECURITY, write("apps/web/src/client.ts", content))
        check(f"security blocks {name}", result.returncode == 2)
        check(f"security explains {name}", "BLOCKED" in result.stderr)

    # --- security-check.py: allows (exit 0) ---
    allowed = {
        "env indirection": 'const k = config.apiKey; // process.env.API_KEY',
        "password placeholder": 'placeholder: "your-password-here"',
        # Fixture: an interpolation, asserted to be allowed.
        "password from env": 'const p = { password: "${DB_PASSWORD}" };',  # betterleaks:allow
        "zod schema": "const s = z.object({ password: z.string().min(8) });",
        "form label": 'const label = { password: "Password" };',  # betterleaks:allow
        "short value": 'const p = { password: "abc" };',
        "no file path": "just some prose about an api key",
    }
    for name, content in allowed.items():
        result = run(SECURITY, write("apps/web/src/form.ts", content))
        check(f"security allows {name}", result.returncode == 0)

    # Fixtures and lock files are exempt even with a real-looking secret.
    secret = 'const t = "ghp_' + "a" * 36 + '";'
    for path in (
        "apps/mobile/app/__tests__/sign-up.test.tsx",
        "packages/core/src/auth.spec.ts",
        "tests/integration/flow.ts",
        "apps/web/e2e/login.ts",
        "pnpm-lock.yaml",
        ".env.example",
    ):
        result = run(SECURITY, write(path, secret))
        check(f"security skips {path}", result.returncode == 0)

    # The old substring skip exempted any path containing "test"/"spec".
    result = run(SECURITY, write("packages/core/src/latest-config.ts", secret))
    check("security does not skip 'latest-config.ts'", result.returncode == 2)

    # Edit payloads carry new_string rather than content.
    result = run(
        SECURITY,
        {"tool_name": "Edit", "tool_input": {"file_path": "a.ts", "new_string": secret}},
    )
    check("security reads new_string", result.returncode == 2)

    # Fail open on junk input rather than wedging every edit.
    result = subprocess.run(
        [sys.executable, str(SECURITY)], input="not json", capture_output=True, text=True
    )
    check("security fails open on bad json", result.returncode == 0)

    # --- guard-git-push.py: denies ---
    for command in (
        "git push origin main",
        "git push origin HEAD:main",
        "git push origin feat/x:refs/heads/main",
        "git push --force origin main",
        "git push --force-with-lease origin master",
        "git -C /tmp/wt push origin production",
    ):
        check(f"push denied: {command}", denied(run(PUSH, bash(command))))

    # --- guard-git-push.py: allows ---
    for command in (
        "git push origin feat/hooks",
        "git push -u origin fix/auth",
        "git push --follow-tags origin release/1.2",
        "git status",
        "echo 'git push origin main is blocked'",
        'git commit -m "note: git push origin main is blocked"',
        "git push origin feat/x && echo done",
    ):
        result = run(PUSH, bash(command))
        check(f"push allowed: {command}", not denied(result))

    # A non-Bash tool must never be inspected.
    check(
        "push guard ignores Write",
        not denied(run(PUSH, write("a.ts", "git push origin main"))),
    )

    if failures:
        print(f"FAIL ({len(failures)}):", file=sys.stderr)
        for name in failures:
            print(f"  - {name}", file=sys.stderr)
        return 1

    print("hooks self-check: all assertions passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
