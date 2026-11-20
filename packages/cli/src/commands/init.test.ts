import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { init } from './init';

// init reads THIS checkout at HEAD (resolveSource finds the monorepo around
// packages/cli), so this runs the real scaffold.sh.
const heavy = 300_000;

describe('mpo init --into', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-init-spec-'));

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  }, heavy);

  it(
    "leaves an existing repository's files byte for byte and names every one it kept",
    async () => {
      const target = path.join(sandbox, 'wealthflow-repo');
      const existing = {
        'pyproject.toml': '[project]\nname = "wealthflow"\n',
        'uv.lock': 'version = 1\n',
        Makefile: '.POSIX:\nbuild:\n\tuv build\n',
        'README.md': '# WealthFlow\n',
        'src/wealthflow/__init__.py': 'print("hi")\n',
        'tests/test_x.py': 'def test_x():\n    assert True\n',
        'docs/index.md': '# docs\n',
      };
      for (const [file, content] of Object.entries(existing)) {
        mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
        writeFileSync(path.join(target, file), content);
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
        expect(readFileSync(path.join(target, file), 'utf-8'), file).toBe(content);
      }
      expect(existsSync(path.join(target, 'apps/wealthflow/package.json'))).toBe(true);
      expect(output).toMatch(/Kept \d+ path\(s\) already here, pinned in \.updateignore:/u);
      const updateignore = readFileSync(path.join(target, '.updateignore'), 'utf-8');
      for (const kept of ['Makefile', 'README.md']) {
        expect(output).toContain(`  ${kept}`);
        expect(updateignore).toContain(`${kept}\n`);
      }
    },
    heavy,
  );
});
