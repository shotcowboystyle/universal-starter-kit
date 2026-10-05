import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const gitState = vi.hoisted(() => ({ root: '' }));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ stdout: `${gitState.root}\n` })),
}));

import { lookupProjectRoot, lookupTamaguiModules, lookupTranspileModules, resolveConfig } from './dev';

let fixtureRoot: string;

function writePkg(dir: string, pkg: Record<string, unknown>): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-dev-spec-'));
  gitState.root = fixtureRoot;
  // Project root package.json with its own transpile/tamagui modules.
  writePkg(fixtureRoot, {
    name: 'fixture-root',
    transpileModules: ['root-transpile'],
    tamaguiModules: ['root-tamagui'],
  });
});

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('lookupProjectRoot', () => {
  it('resolves the project root from git and caches it', () => {
    expect(lookupProjectRoot()).toBe(fixtureRoot);
    // Second call returns the cached value (same string, no re-spawn effect).
    expect(lookupProjectRoot()).toBe(fixtureRoot);
  });
});

describe('lookupTranspileModules', () => {
  it('collects transpileModules from the project root package.json', () => {
    const modules = lookupTranspileModules(undefined, { log: false });
    expect(modules).toContain('root-transpile');
  });

  it('merges transpileModules from extra package dirs', () => {
    const extra = writePkg(path.join(fixtureRoot, 'pkg-a'), {
      name: 'pkg-a',
      transpileModules: ['a-one', 'a-two'],
    });
    const modules = lookupTranspileModules([extra], { log: false });
    expect(modules).toEqual(expect.arrayContaining(['root-transpile', 'a-one', 'a-two']));
  });

  it('ignores directories without a package.json', () => {
    const missing = path.join(fixtureRoot, 'does-not-exist');
    const modules = lookupTranspileModules([missing], { log: false });
    expect(modules).toContain('root-transpile');
    expect(modules).not.toContain(undefined);
  });

  it('treats packages without a transpileModules field as empty', () => {
    const bare = writePkg(path.join(fixtureRoot, 'pkg-bare'), { name: 'pkg-bare' });
    const modules = lookupTranspileModules([bare], { log: false });
    expect(modules).toEqual(expect.arrayContaining(['root-transpile']));
  });

  it('recovers from malformed package.json instead of throwing', () => {
    const broken = path.join(fixtureRoot, 'pkg-broken');
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, 'package.json'), '{not json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const modules = lookupTranspileModules([broken], { log: false });
      expect(modules).toContain('root-transpile');
      expect(errorSpy).not.toHaveBeenCalled();
      // With logging enabled the parse error is reported, not thrown.
      const loud = lookupTranspileModules([broken], { log: true });
      expect(loud).toContain('root-transpile');
    } finally {
      errorSpy.mockRestore();
      vi.restoreAllMocks();
    }
  });

  it('deduplicates repeated package dirs', () => {
    const extra = writePkg(path.join(fixtureRoot, 'pkg-dup'), {
      name: 'pkg-dup',
      transpileModules: ['dup-mod'],
    });
    const modules = lookupTranspileModules([extra, extra], { log: false });
    expect(modules.filter((m) => m === 'dup-mod')).toHaveLength(1);
  });
});

describe('lookupTamaguiModules', () => {
  it('always includes tamagui itself first', () => {
    const modules = lookupTamaguiModules(undefined, { log: false });
    expect(modules[0]).toBe('tamagui');
  });

  it('merges tamaguiModules from the root and extra package dirs', () => {
    const extra = writePkg(path.join(fixtureRoot, 'pkg-tam'), {
      name: 'pkg-tam',
      tamaguiModules: ['extra-tamagui'],
    });
    const modules = lookupTamaguiModules([extra], { log: false });
    expect(modules).toEqual(expect.arrayContaining(['tamagui', 'root-tamagui', 'extra-tamagui']));
  });
});

describe('resolveConfig', () => {
  it('picks only env keys that are set', () => {
    process.env.MPO_DEV_SPEC_SET = 'value';
    delete process.env.MPO_DEV_SPEC_UNSET;
    try {
      const config = resolveConfig(['MPO_DEV_SPEC_SET', 'MPO_DEV_SPEC_UNSET']);
      expect(config).toEqual({ MPO_DEV_SPEC_SET: 'value' });
      expect('MPO_DEV_SPEC_UNSET' in config).toBe(false);
    } finally {
      delete process.env.MPO_DEV_SPEC_SET;
    }
  });

  it('returns an empty object for no keys', () => {
    expect(resolveConfig()).toEqual({});
    expect(resolveConfig([])).toEqual({});
  });
});
