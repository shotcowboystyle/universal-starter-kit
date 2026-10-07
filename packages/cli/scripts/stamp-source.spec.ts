import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'stamp-source.mjs');

interface Stamp {
  cliVersion: string;
  sha?: string;
  url: string;
}

describe('stamp-source', () => {
  let repo: string;
  let cli: string;

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const setVersion = (version: string) => {
    writeFileSync(
      join(cli, 'package.json'),
      `${JSON.stringify({ name: '@repo/cli', version, repository: { url: 'git+https://git.example.invalid/mpo.git' } })}\n`,
    );
  };
  const commit = (message: string) => {
    git('add', '-A');
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message);
  };
  const stamp = (): Stamp => {
    execFileSync(process.execPath, [join(cli, 'scripts/stamp-source.mjs')], {
      env: { PATH: process.env.PATH },
      stdio: 'ignore',
    });
    return JSON.parse(readFileSync(join(cli, 'lib/source.json'), 'utf-8')) as Stamp;
  };
  const cliVersionAt = (sha: string) =>
    (JSON.parse(git('show', `${sha}:public/cli/package.json`)) as { version: string }).version;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mpo-stamp-'));
    cli = join(repo, 'public/cli');
    mkdirSync(join(cli, 'scripts'), { recursive: true });
    writeFileSync(join(cli, 'scripts/stamp-source.mjs'), readFileSync(script));
    writeFileSync(join(repo, '.gitignore'), 'lib/\n');
    setVersion('7.14.1');
    git('init', '-q');
    commit('7.14.1');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('never names a commit whose CLI carries another version than the one it stamps', () => {
    setVersion('7.14.2');
    const written = stamp();
    expect(written.cliVersion).toBe('7.14.2');
    expect(written.sha && cliVersionAt(written.sha)).toBeUndefined();
  });

  it('names the version commit once it exists', () => {
    setVersion('8.0.0');
    commit('chore(release): version packages');
    const written = stamp();
    expect(written).toEqual({
      cliVersion: '8.0.0',
      url: 'https://git.example.invalid/mpo.git',
      sha: git('rev-parse', 'HEAD'),
    });
    expect(cliVersionAt(written.sha!)).toBe('8.0.0');
  });
});
