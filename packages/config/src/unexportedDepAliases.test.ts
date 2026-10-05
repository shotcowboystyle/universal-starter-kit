import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { unexportedDepAliases } from './unexportedDepAliases';

/**
 * Builds a throwaway tree carrying the PUBLISHED @react-navigation/core exports
 * map — the one CI installs, before vxrn rewrites it in place. The real tree on
 * a dev machine is usually already patched, so asserting against it would prove
 * nothing about the state this alias exists for.
 */
function writePristineFixture(root: string, { withPackage = true } = {}) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-root' }));
  if (!withPackage) {
    return;
  }

  const pkgDir = path.join(root, 'node_modules', '@react-navigation', 'core');
  fs.mkdirSync(path.join(pkgDir, 'lib', 'module'), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@react-navigation/core',
      version: '7.17.2',
      main: './lib/module/index.js',
      // Verbatim shape of the published manifest: no ./lib/module/* entries.
      exports: { '.': { default: './lib/module/index.js' }, './package.json': './package.json' },
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'lib', 'module', 'EnsureSingleNavigator.js'),
    'export const SingleNavigatorContext = {};\n',
  );
  fs.writeFileSync(path.join(pkgDir, 'lib', 'module', 'index.js'), 'export const x = 1;\n');
}

describe('unexportedDepAliases', () => {
  // realpath: macOS /var is a symlink to /private/var, and require.resolve
  // reports the resolved path.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'unexported-dep-aliases-')));
  const deepSpecifier = '@react-navigation/core/lib/module/EnsureSingleNavigator';

  beforeAll(() => {
    writePristineFixture(root);
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('positive control: the published exports map really does reject the deep import', () => {
    // Without this, every assertion below could be green against a package that
    // resolves fine on its own — i.e. an alias guarding nothing.
    const requireFrom = createRequire(path.join(root, 'package.json'));
    expect(() => requireFrom.resolve(deepSpecifier)).toThrowError(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    );
  });

  it('maps the internals `one` deep-imports onto a directory that holds them', () => {
    const aliases = unexportedDepAliases(root);
    const target = aliases['@react-navigation/core/lib/module'];

    expect(target).toBe(path.join(root, 'node_modules', '@react-navigation', 'core', 'lib', 'module'));
    // The alias is only worth anything if rewriting the specifier lands on a
    // real file — Vite replaces the matched key and resolves the rest by path.
    const rewritten = deepSpecifier.replace('@react-navigation/core/lib/module', target);
    expect(fs.existsSync(`${rewritten}.js`)).toBe(true);
  });

  it('scopes the alias to the subtree, leaving the package entry on its exports map', () => {
    const keys = Object.keys(unexportedDepAliases(root));

    // Vite matches an alias key exactly or as a `key + "/"` prefix. A bare
    // "@react-navigation/core" key would swallow the package's own entry, and a
    // trailing slash would stop the key matching at all.
    expect(keys).toEqual(['@react-navigation/core/lib/module']);
    expect(keys[0]).not.toMatch(/\/$/);
  });

  it('emits nothing when the package is not installed', () => {
    const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'unexported-dep-aliases-bare-')));
    writePristineFixture(bare, { withPackage: false });
    try {
      expect(unexportedDepAliases(bare)).toEqual({});
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
