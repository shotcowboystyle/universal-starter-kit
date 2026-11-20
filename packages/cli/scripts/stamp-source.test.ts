import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.join(import.meta.dirname, 'stamp-source.mjs');

interface Stamp {
  cliVersion: string;
  sha?: string;
  url: string;
}

describe('stamp-source', () => {
  let repo: string;
  let cli: string;

  const git = (...args: string[]) =>
    // oxlint-disable-next-line sonarjs/no-os-command-from-path -- the fixture repo is driven by the developer's git
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const setVersion = (version: string) => {
    writeFileSync(
      path.join(cli, 'package.json'),
      `${JSON.stringify({ name: '@repo/cli', version, repository: { url: 'git+https://git.example.invalid/mpo.git' } })}\n`,
    );
  };
  const commit = (message: string) => {
    git('add', '-A');
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message);
  };
  const stamp = (): Stamp => {
    execFileSync(process.execPath, [path.join(cli, 'scripts/stamp-source.mjs')], {
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '' },
      stdio: 'ignore',
    });
    return JSON.parse(readFileSync(path.join(cli, 'lib/source.json'), 'utf-8')) as Stamp;
  };
  const cliVersionAt = (sha: string) =>
    (JSON.parse(git('show', `${sha}:packages/cli/package.json`)) as { version: string }).version;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'mpo-stamp-'));
    cli = path.join(repo, 'packages/cli');
    mkdirSync(path.join(cli, 'scripts'), { recursive: true });
    writeFileSync(path.join(cli, 'scripts/stamp-source.mjs'), readFileSync(script));
    writeFileSync(path.join(repo, '.gitignore'), 'lib/\n');
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
    expect(written.sha === undefined ? undefined : cliVersionAt(written.sha)).toBeUndefined();
  });

  it('names the version commit once it exists', () => {
    setVersion('8.0.0');
    commit('chore(release): version packages');
    const written = stamp();
    expect(written).toStrictEqual({
      cliVersion: '8.0.0',
      url: 'https://git.example.invalid/mpo.git',
      sha: git('rev-parse', 'HEAD'),
    });
    expect(cliVersionAt(written.sha!)).toBe('8.0.0');
  });
});
