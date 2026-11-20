import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// frappe-bootstrap.sh writes this script's output into sites/apps.txt and
// uses it for apps/<name> dirs and bench --app args, so it must always be
// the importable python module name (frappe_mcp), never the hyphenated
// repo/distribution name (frappe-mcp).
const SCRIPT = path.join(import.meta.dirname, 'frappe-app-name.py');

const derive = (appPath: string, fallback?: string) => {
  // oxlint-disable-next-line sonarjs/no-os-command-from-path -- the script under test runs on the developer's python3, as frappe-bootstrap.sh does
  const result = spawnSync('python3', [SCRIPT, appPath, ...(fallback === undefined ? [] : [fallback])], {
    encoding: 'utf-8',
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
};

interface Case {
  name: string;
  /** Relative file path -> contents. Paths ending in "/" create bare dirs. */
  files: Record<string, string>;
  fallback?: string;
  expected: string;
}

const pyproject = (name: string) => `[project]\nname = "${name}"\n`;

const cases: Case[] = [
  {
    name: 'classic app: hyphenated distribution, underscored module with hooks',
    files: {
      'pyproject.toml': pyproject('frappe-mcp'),
      'frappe_mcp/__init__.py': '',
      'frappe_mcp/hooks.py': 'app_name = "frappe_mcp"\n',
    },
    fallback: 'mcp',
    expected: 'frappe_mcp',
  },
  {
    name: 'matching distribution and module names (plus stray root __init__.py)',
    files: {
      'pyproject.toml': pyproject('core'),
      '__init__.py': '',
      'core/__init__.py': '',
      'core/hooks.py': 'app_name = "core"\n',
    },
    fallback: 'core',
    expected: 'core',
  },
  {
    name: 'hookless package with hyphenated distribution (frappe/mcp shape)',
    files: {
      'pyproject.toml': pyproject('frappe-mcp'),
      'frappe_mcp/__init__.py': '',
      'frappe_mcp/server/__init__.py': '',
    },
    fallback: 'mcp',
    expected: 'frappe_mcp',
  },
  {
    name: 'layout only: hooks package without any metadata',
    files: {
      'my_app/__init__.py': '',
      'my_app/hooks.py': '',
    },
    fallback: 'my-app',
    expected: 'my_app',
  },
  {
    name: 'nested module dirs and decoy packages do not confuse the hooks rule',
    files: {
      'pyproject.toml': pyproject('myapp'),
      'myapp/__init__.py': '',
      'myapp/hooks.py': '',
      'myapp/sub/__init__.py': '',
      'myapp/sub/hooks.py': '',
      'tests/__init__.py': '',
    },
    fallback: 'myapp-repo',
    expected: 'myapp',
  },
  {
    name: 'multiple hookless packages: distribution name picks the module',
    files: {
      'pyproject.toml': pyproject('cool-app'),
      'cool_app/__init__.py': '',
      'tests/__init__.py': '',
    },
    fallback: 'cool-app-repo',
    expected: 'cool_app',
  },
  {
    name: 'multiple hooks packages: distribution name breaks the tie',
    files: {
      'pyproject.toml': pyproject('b-app'),
      'a_app/__init__.py': '',
      'a_app/hooks.py': '',
      'b_app/__init__.py': '',
      'b_app/hooks.py': '',
    },
    expected: 'b_app',
  },
  {
    name: 'setup.py name is normalized and matched against the layout',
    files: {
      'setup.py': 'from setuptools import setup\nsetup(name="legacy-app")\n',
      'legacy_app/__init__.py': '',
      'tests/__init__.py': '',
    },
    fallback: 'legacy',
    expected: 'legacy_app',
  },
  {
    name: 'metadata only: distribution name is normalized (dots and hyphens)',
    files: {
      'pyproject.toml': pyproject('universal-starter-kit-app'),
    },
    fallback: 'repo',
    expected: 'universal_starter_kit_app',
  },
  {
    name: 'fallback only: repo basename is normalized',
    files: {},
    fallback: 'repo-name',
    expected: 'repo_name',
  },
];

describe('frappe-app-name.py', () => {
  let sandbox: string;

  beforeAll(() => {
    // oxlint-disable-next-line sonarjs/no-os-command-from-path -- probes the same python3 the script under test needs
    const python = spawnSync('python3', ['--version'], { encoding: 'utf-8' });
    if (python.status !== 0) {
      throw new Error('python3 is required to run the frappe-app-name derivation specs');
    }
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-frappe-app-name-'));
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const makeApp = (name: string, files: Record<string, string>): string => {
    const root = path.join(sandbox, name.replaceAll(/[^a-z0-9]+/giu, '-'));
    mkdirSync(root, { recursive: true });
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(root, relative);
      if (relative.endsWith('/')) {
        mkdirSync(target, { recursive: true });
        continue;
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    return root;
  };

  it.each(cases.map((spec, index) => ({ ...spec, index })))('$name', (spec) => {
    const root = makeApp(`case-${spec.index}`, spec.files);
    const result = derive(root, spec.fallback);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(spec.expected);
  });

  it('fails loudly when nothing can be derived', () => {
    const root = makeApp('case-underivable', {});
    const result = derive(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('could not determine app name');
  });

  it('rejects a missing app path argument', () => {
    const result = derive('');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
  });
});
