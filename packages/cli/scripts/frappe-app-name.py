#!/usr/bin/env python3
"""Resolve a frappe app's python MODULE name from its source tree.

sites/apps.txt entries, bench app directory names, and `bench --app`
arguments must be importable python module names (frappe_mcp), while git
repo basenames and pyproject/setup.py distribution names are often
hyphenated (frappe-mcp, github.com/frappe/mcp). A hyphenated entry in
sites/apps.txt breaks every bench boot, so the module name is derived
from the most authoritative source available:

1. the package directory containing hooks.py (classic frappe app layout)
2. the package directory matching the normalized distribution name
3. the sole package directory at the app root
4. the package directory matching the normalized fallback name
5. the normalized distribution name (pyproject [project].name, setup.py name=)
6. the normalized fallback (repo/dir basename)

Usage: frappe-app-name.py <app-path> [fallback]
Prints the module name on stdout; exits non-zero if none can be derived.
"""

import ast
import re
import sys
from pathlib import Path


def normalize(name: str) -> str:
    """Map a distribution/repo name to module-name form (PEP 503 runs of
    `-_.` and whitespace become single underscores, lowercased)."""
    return re.sub(r"[-_.\s]+", "_", name.strip().lower())


def distribution_name(app_path: Path) -> str:
    pyproject = app_path / "pyproject.toml"
    if pyproject.is_file():
        import tomllib

        try:
            with pyproject.open("rb") as f:
                name = tomllib.load(f).get("project", {}).get("name", "")
        except (tomllib.TOMLDecodeError, OSError):
            name = ""
        if isinstance(name, str) and name:
            return name
    setup_py = app_path / "setup.py"
    if setup_py.is_file():
        try:
            tree = ast.parse(setup_py.read_text(encoding="utf-8"))
        except (SyntaxError, OSError):
            return ""
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            for kw in node.keywords:
                if (
                    kw.arg == "name"
                    and isinstance(kw.value, ast.Constant)
                    and isinstance(kw.value.value, str)
                ):
                    return kw.value.value
    return ""


def package_dirs(app_path: Path) -> "list[Path]":
    """Direct child directories importable as python packages."""
    try:
        children = sorted(app_path.iterdir())
    except OSError:
        return []
    return [
        child
        for child in children
        if child.is_dir()
        and child.name.isidentifier()
        and (child / "__init__.py").is_file()
    ]


def derive_module_name(app_path: Path, fallback: str = "") -> str:
    dist = distribution_name(app_path)
    packages = package_dirs(app_path)
    hooks = [p for p in packages if (p / "hooks.py").is_file()]
    if hooks:
        if len(hooks) > 1:
            for want in filter(None, (normalize(dist), normalize(fallback))):
                for package in hooks:
                    if package.name == want:
                        return package.name
        return hooks[0].name
    if dist:
        want = normalize(dist)
        for package in packages:
            if package.name == want:
                return package.name
    if len(packages) == 1:
        return packages[0].name
    if fallback:
        want = normalize(fallback)
        for package in packages:
            if package.name == want:
                return package.name
    if dist:
        return normalize(dist)
    if fallback:
        return normalize(fallback)
    return ""


def main(argv: "list[str]") -> int:
    if len(argv) < 2 or not argv[1]:
        print("usage: frappe-app-name.py <app-path> [fallback]", file=sys.stderr)
        return 2
    app_path = Path(argv[1])
    fallback = argv[2] if len(argv) > 2 else ""
    name = derive_module_name(app_path, fallback)
    if not name:
        print(f"could not determine app name from {app_path}", file=sys.stderr)
        return 1
    print(name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
