import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import spawn from 'nano-spawn';
import { afterEach, describe, expect, it } from 'vitest';

import { gitOut, mergeScaffolds, threeWayMergePackageJson } from './merge';
import type { JsonValue } from './pieces';

const json = (value: JsonValue) => JSON.stringify(value, null, 2);

describe(threeWayMergePackageJson, () => {
  it('resolves dependency-range drift to the newer minimum', () => {
    const base = json({ dependencies: { '@repo/ui': '^6.3.0' } });
    const ours = json({ dependencies: { '@repo/ui': '^6.4.2' } });
    const theirs = json({ dependencies: { '@repo/ui': '^6.4.3' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toStrictEqual({
      dependencies: { '@repo/ui': '^6.4.3' },
    });
    // Symmetric: the project may be AHEAD of the scaffold.
    expect(threeWayMergePackageJson(base, theirs, ours)).toStrictEqual({
      dependencies: { '@repo/ui': '^6.4.3' },
    });
  });

  it('prefers the scaffold spelling on equal minimums', () => {
    const base = json({ dependencies: { react: '^19.0.0' } });
    const ours = json({ dependencies: { react: '19.2.0' } });
    const theirs = json({ dependencies: { react: '~19.2.0' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toStrictEqual({
      dependencies: { react: '~19.2.0' },
    });
  });

  it('keeps project-added dependencies alongside scaffold bumps', () => {
    const base = json({ dependencies: { one: '^1.0.0' } });
    const ours = json({ dependencies: { one: '^1.0.0', '@repo/keycloak': '^6.4.2' } });
    const theirs = json({ dependencies: { one: '^1.1.0' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toStrictEqual({
      dependencies: { one: '^1.1.0', '@repo/keycloak': '^6.4.2' },
    });
  });

  it('applies scaffold deletions the project did not touch', () => {
    const base = json({ scripts: { postinstall: 'patch-package', build: 'vite build' } });
    const ours = json({ scripts: { postinstall: 'patch-package', build: 'vite build' } });
    const theirs = json({ scripts: { build: 'vite build' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toStrictEqual({
      scripts: { build: 'vite build' },
    });
  });

  it('resolves nested override maps', () => {
    const base = json({ pnpm: { overrides: { 'react-dom': '19.2.4' } } });
    const ours = json({ pnpm: { overrides: { 'react-dom': '19.2.5' } } });
    const theirs = json({ pnpm: { overrides: { 'react-dom': '19.2.6' } } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toStrictEqual({
      pnpm: { overrides: { 'react-dom': '19.2.6' } },
    });
  });

  it('returns undefined for genuine two-sided conflicts', () => {
    const base = json({ scripts: { build: 'vite build' } });
    const ours = json({ scripts: { build: 'vite build --mode ours' } });
    const theirs = json({ scripts: { build: 'vite build --mode theirs' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toBeUndefined();
  });

  it('returns undefined for non-range dependency divergence', () => {
    const base = json({ dependencies: { local: '^1.0.0' } });
    const ours = json({ dependencies: { local: 'workspace:*' } });
    const theirs = json({ dependencies: { local: '^2.0.0' } });
    expect(threeWayMergePackageJson(base, ours, theirs)).toBeUndefined();
  });

  it('returns undefined on unparseable input', () => {
    expect(threeWayMergePackageJson('{}', 'not json', '{}')).toBeUndefined();
  });

  it('treats a missing base as empty (add/add merges)', () => {
    const ours = json({ dependencies: { a: '^1.0.0' } });
    const theirs = json({ dependencies: { b: '^2.0.0' } });
    expect(threeWayMergePackageJson(undefined, ours, theirs)).toStrictEqual({
      dependencies: { a: '^1.0.0', b: '^2.0.0' },
    });
  });
});

describe('mergeScaffolds on git 2.38 and 2.39, whose merge-tree has no --merge-base', () => {
  const scratch: string[] = [];
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
    for (const dir of scratch.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const tempDir = (files: Record<string, string> = {}): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mpo-merge-spec-'));
    scratch.push(dir);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), content);
    }
    return dir;
  };

  it("merges the scaffold's change into the project through history alone", async () => {
    const shim = tempDir({
      git: `#!/bin/sh\nfor arg in "$@"; do\n  case $arg in --merge-base*) exit 129 ;; esac\ndone\nPATH='${originalPath}' exec git "$@"\n`,
    });
    chmodSync(path.join(shim, 'git'), 0o755);

    const project = tempDir({ 'a.txt': 'one\n', 'b.txt': 'b\n', 'mine.txt': 'mine\n' });
    await spawn('git', ['init', '--quiet'], { cwd: project });
    await spawn('git', ['config', 'user.email', 'spec@example.com'], { cwd: project });
    await spawn('git', ['config', 'user.name', 'Spec'], { cwd: project });
    await spawn('git', ['add', '-A'], { cwd: project });
    await spawn('git', ['commit', '--quiet', '-m', 'project'], { cwd: project });

    process.env.PATH = `${shim}:${originalPath}`;
    await expect(
      spawn('git', ['merge-tree', '--write-tree', '--merge-base=HEAD', 'HEAD', 'HEAD'], {
        cwd: project,
      }),
    ).rejects.toMatchObject({ exitCode: 129 });

    const outcome = await mergeScaffolds({
      projectDir: project,
      baseDir: tempDir({ 'a.txt': 'one\n', 'b.txt': 'b\n' }),
      theirsDir: tempDir({ 'a.txt': 'two\n', 'b.txt': 'b\n' }),
      baseLabel: 'scaffold 1',
      theirsLabel: 'scaffold 2',
    });

    expect(outcome.conflicts).toStrictEqual([]);
    expect(outcome.changed).toBe(true);
    await expect(gitOut(project, ['show', `${outcome.mergedTree}:a.txt`])).resolves.toBe('two');
    await expect(gitOut(project, ['show', `${outcome.mergedTree}:mine.txt`])).resolves.toBe('mine');
  });
});
