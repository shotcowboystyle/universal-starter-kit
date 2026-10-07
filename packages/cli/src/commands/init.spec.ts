import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { init } from './init';

// init reads THIS checkout at HEAD (resolveSource finds the monorepo around
// public/cli), so this runs the real scaffold.sh.
const heavy = 300_000;

describe('mpo init --into', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'mpo-init-spec-'));

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  }, heavy);

  it(
    "leaves an existing repository's files byte for byte and names every one it kept",
    async () => {
      const target = join(sandbox, 'wealthflow-repo');
      const existing: Record<string, string> = {
        'pyproject.toml': '[project]\nname = "wealthflow"\n',
        'uv.lock': 'version = 1\n',
        Makefile: '.POSIX:\nbuild:\n\tuv build\n',
        'README.md': '# WealthFlow\n',
        'src/wealthflow/__init__.py': 'print("hi")\n',
        'tests/test_x.py': 'def test_x():\n    assert True\n',
        'docs/index.md': '# docs\n',
      };
      for (const [file, content] of Object.entries(existing)) {
        mkdirSync(dirname(join(target, file)), { recursive: true });
        writeFileSync(join(target, file), content);
      }
      const lines: string[] = [];
      const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
        lines.push(args.join(' '));
      });
      try {
        await init(target, {
          into: true,
          apps: ['wealthflow'],
          services: [],
          skipInstall: true,
          skipGit: true,
          yes: true,
        });
      } finally {
        log.mockRestore();
      }
      const output = lines.join('\n');

      for (const [file, content] of Object.entries(existing)) {
        expect(readFileSync(join(target, file), 'utf-8'), file).toBe(content);
      }
      expect(existsSync(join(target, 'apps/wealthflow/package.json'))).toBe(true);
      expect(output).toMatch(/Kept \d+ path\(s\) already here, pinned in \.updateignore:/);
      const updateignore = readFileSync(join(target, '.updateignore'), 'utf-8');
      for (const kept of ['Makefile', 'README.md']) {
        expect(output).toContain(`  ${kept}`);
        expect(updateignore).toContain(`${kept}\n`);
      }
    },
    heavy,
  );
});
