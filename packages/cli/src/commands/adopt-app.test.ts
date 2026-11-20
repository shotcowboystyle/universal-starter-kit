import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import spawn from 'nano-spawn';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { adoptApp } from './adopt-app';
import { cliVersion, readProvenance, writeProvenance } from './provenance';

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf-8'));

const gitOut = async (cwd: string, args: string[]): Promise<string> => {
  const result = await spawn('git', args, { cwd });
  return result.stdout.trim();
};

/** git repo fixture with an identity, the given files, and one commit. */
const makeRepo = async (dir: string, files: Record<string, string>): Promise<void> => {
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  await spawn('git', ['init', '--quiet'], { cwd: dir });
  await spawn('git', ['config', 'user.email', 'spec@example.com'], { cwd: dir });
  await spawn('git', ['config', 'user.name', 'Spec'], { cwd: dir });
  await spawn('git', ['add', '-A'], { cwd: dir });
  await spawn('git', ['commit', '--quiet', '-m', 'chore: fixture'], { cwd: dir });
};

describe(adoptApp, () => {
  let sandbox: string;
  let previousCwd: string;
  let fixtureCount = 0;

  const fixtureDir = () => {
    fixtureCount += 1;
    return path.join(sandbox, `fixture-${fixtureCount}`);
  };

  beforeAll(() => {
    sandbox = mkdtempSync(path.join(tmpdir(), 'mpo-adopt-spec-'));
    previousCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(previousCwd);
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('writes adopted provenance, seeds .updateignore, and commits both', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, {
      'package.json': JSON.stringify({ name: '@easel/repo', private: true }),
      'apps/repo/webext/manifest.ts': '// hand-copied\n',
    });
    process.chdir(dir);
    // Intentionally unsorted — provenance must sort.
    await adoptApp({ pieces: ['webext', 'gnome'], yes: true });

    const provenance = readJson(path.join(dir, '.mpo.json'));
    expect(provenance).toStrictEqual({
      template: 'none',
      cliVersion: cliVersion(),
      // scope stripped from package.json name
      name: 'repo',
      mpoVersion: `^${cliVersion()}`,
      pieces: ['gnome', 'webext'],
      reconciled: false,
    });
    expect(readProvenance(dir)?.reconciled).toBe(false);

    const updateignore = readFileSync(path.join(dir, '.updateignore'), 'utf-8');
    expect(updateignore).toMatch(/^#/u);
    expect(updateignore).toContain('mpo update');

    // Adoption changed NO project files and left the tree clean (committed).
    expect(readFileSync(path.join(dir, 'apps/repo/webext/manifest.ts'), 'utf-8')).toBe('// hand-copied\n');
    await expect(gitOut(dir, ['status', '--porcelain'])).resolves.toBe('');
    await expect(gitOut(dir, ['log', '-1', '--format=%s'])).resolves.toContain('mpo adopt');
  });

  it('honors --name and preserves an existing .updateignore', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, {
      'package.json': JSON.stringify({ name: '@easel/repo' }),
      '.updateignore': 'docs/\n',
    });
    process.chdir(dir);
    await adoptApp({ pieces: ['webext'], name: 'easel', yes: true });
    expect(readProvenance(dir)?.name).toBe('easel');
    expect(readFileSync(path.join(dir, '.updateignore'), 'utf-8')).toBe('docs/\n');
  });

  it('refuses outside a git repository', async () => {
    const dir = path.join(sandbox, 'not-a-repo');
    mkdirSync(dir, { recursive: true });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/inside a git repository/u);
  });

  it('refuses a repo without commits', async () => {
    const dir = fixtureDir();
    mkdirSync(dir, { recursive: true });
    await spawn('git', ['init', '--quiet'], { cwd: dir });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/at least one commit/u);
  });

  it('refuses a dirty working tree (unstaged and staged)', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, { 'package.json': JSON.stringify({ name: 'dirty-demo' }) });
    process.chdir(dir);
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dirty-demo', changed: true }));
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/unstaged changes present/u);
    await spawn('git', ['add', '-A'], { cwd: dir });
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/staged changes present/u);
  });

  it('refuses to adopt nothing', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, { 'package.json': JSON.stringify({ name: 'no-pieces' }) });
    process.chdir(dir);
    await expect(adoptApp({ yes: true })).rejects.toThrow(/at least one piece/u);
    await expect(adoptApp({ pieces: [], yes: true })).rejects.toThrow(/at least one piece/u);
  });

  it('rejects unknown pieces', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, { 'package.json': JSON.stringify({ name: 'bogus' }) });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['solana' as never], yes: true })).rejects.toThrow(/Unknown piece "solana"/u);
  });

  it('refuses when provenance already exists', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, {
      'package.json': JSON.stringify({ name: 'scaffolded' }),
      '.mpo.json': JSON.stringify({
        template: 'universal',
        cliVersion: '6.5.0',
        name: 'scaffolded',
      }),
    });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/already has scaffold provenance/u);
  });

  it('refuses inside the universal-starter-kit monorepo (or a fork)', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, {
      'package.json': JSON.stringify({ name: 'root' }),
      'packages/cli/package.json': JSON.stringify({ name: '@repo/cli' }),
    });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(
      /cannot run inside the universal-starter-kit monorepo/u,
    );
  });

  it('requires a usable project name', async () => {
    const dir = fixtureDir();
    await makeRepo(dir, { 'package.json': JSON.stringify({ name: 'Bad_Name' }) });
    process.chdir(dir);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/--name/u);
    const noPkg = fixtureDir();
    await makeRepo(noPkg, { 'README.md': 'no package.json here\n' });
    process.chdir(noPkg);
    await expect(adoptApp({ pieces: ['webext'], yes: true })).rejects.toThrow(/--name/u);
  });

  it('round-trips the reconciled flag through provenance', () => {
    const dir = fixtureDir();
    mkdirSync(dir, { recursive: true });
    writeProvenance(dir, {
      template: 'none',
      cliVersion: '6.6.0',
      name: 'flagged',
      mpoVersion: '^6.6.0',
      apps: [],
      services: [],
      pieces: ['webext'],
      reconciled: false,
    });
    expect(readJson(path.join(dir, '.mpo.json')).reconciled).toBe(false);
    expect(readProvenance(dir)?.reconciled).toBe(false);
    // Cleared flag serializes to NO field (scaffolded provenance stays lean).
    writeProvenance(dir, {
      template: 'none',
      cliVersion: '6.6.0',
      name: 'flagged',
      mpoVersion: '^6.6.0',
      apps: [],
      services: [],
      pieces: ['webext'],
    });
    expect('reconciled' in readJson(path.join(dir, '.mpo.json'))).toBe(false);
    expect(readProvenance(dir)?.reconciled).toBeUndefined();
  });
});
