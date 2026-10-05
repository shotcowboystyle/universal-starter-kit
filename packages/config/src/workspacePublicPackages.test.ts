import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  discoverPublicPackageRoots,
  packageSubpathSourceAliases,
  resolveExportSource,
  resolvePackageMainSource,
  publicPackageViteSourceAliases,
} from './workspacePublicPackages';

const workspaceRoot = path.resolve(__dirname, '../../..');
const pub = (p: string) => path.join(workspaceRoot, 'public', p);

describe('discoverPublicPackageRoots', () => {
  it('returns a Map of package names to their directories', () => {
    const roots = discoverPublicPackageRoots(workspaceRoot);
    expect(roots).toBeInstanceOf(Map);
    expect(roots.size).toBeGreaterThan(0);
  });

  it('includes known packages', () => {
    const roots = discoverPublicPackageRoots(workspaceRoot);
    expect(roots.has('@repo/platform')).toBe(true);
    expect(roots.has('@repo/theme')).toBe(true);
  });

  it('maps package names to paths within packages/', () => {
    const roots = discoverPublicPackageRoots(workspaceRoot);
    const platformPath = roots.get('@repo/platform');
    expect(platformPath).toBeDefined();
    expect(platformPath).toContain(path.join('packages', 'platform'));
  });

  it('returns empty Map for non-existent directory', () => {
    const roots = discoverPublicPackageRoots('/nonexistent/path');
    expect(roots.size).toBe(0);
  });
});

describe('resolvePackageMainSource', () => {
  it('resolves the main source file for a known package', () => {
    const roots = discoverPublicPackageRoots(workspaceRoot);
    const platformDir = roots.get('@repo/platform');
    expect(platformDir).toBeDefined();

    const main = resolvePackageMainSource(platformDir!);
    expect(main).toBeDefined();
    expect(main).toMatch(/index\.(ts|tsx)$/);
  });

  it('returns undefined for a directory with no index file', () => {
    const main = resolvePackageMainSource('/nonexistent/pkg');
    expect(main).toBeUndefined();
  });
});

describe('publicPackageViteSourceAliases', () => {
  it('returns an object mapping package names to source files', () => {
    const aliases = publicPackageViteSourceAliases(workspaceRoot);
    expect(typeof aliases).toBe('object');
    expect(Object.keys(aliases).length).toBeGreaterThan(0);
  });

  it('each bare package alias points to a .ts or .tsx file', () => {
    const aliases = publicPackageViteSourceAliases(workspaceRoot);
    for (const name of discoverPublicPackageRoots(workspaceRoot).keys()) {
      if (aliases[name]) {
        expect(aliases[name]).toMatch(/\.(ts|tsx)$/);
      }
    }
  });

  it('every alias value exists on disk', () => {
    const aliases = publicPackageViteSourceAliases(workspaceRoot);
    for (const [, target] of Object.entries(aliases)) {
      expect(fs.existsSync(target)).toBe(true);
    }
  });

  it('orders every subpath alias before every bare package alias', () => {
    const keys = Object.keys(publicPackageViteSourceAliases(workspaceRoot));
    const roots = discoverPublicPackageRoots(workspaceRoot);
    const firstBare = keys.findIndex((k) => roots.has(k));
    const lastSubpath = keys.reduce((last, k, i) => (roots.has(k) ? last : i), -1);
    expect(firstBare).toBeGreaterThan(lastSubpath);
  });

  it("resolves every exported subpath specifier to a real file under Vite's first-match prefix rule", () => {
    const aliases = Object.entries(publicPackageViteSourceAliases(workspaceRoot));
    const viteResolve = (spec: string) => {
      const hit = aliases.find(([find]) => spec === find || spec.startsWith(`${find}/`));
      return hit ? spec.replace(hit[0], hit[1]) : undefined;
    };
    for (const [name, dir] of discoverPublicPackageRoots(workspaceRoot)) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (!pkg.exports || typeof pkg.exports !== 'object') {
        continue;
      }
      for (const [key, target] of Object.entries(pkg.exports)) {
        if (key === '.' || key === './package.json' || key.includes('*')) {
          continue;
        }
        const typesOnly = typeof target === 'object' && target !== null && Object.keys(target).join() === 'types';
        if (typesOnly) {
          continue;
        }
        const spec = `${name}/${key.slice(2)}`;
        const resolved = viteResolve(spec);
        if (resolved === undefined) {
          continue;
        }
        const isFile = fs.existsSync(resolved) && fs.statSync(resolved).isFile();
        expect({ spec, isFile }).toEqual({ spec, isFile: true });
      }
    }
  });

  it('includes known package aliases', () => {
    const aliases = publicPackageViteSourceAliases(workspaceRoot);
    expect(aliases['@repo/platform']).toBeDefined();
  });
});

describe('packageSubpathSourceAliases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-subpath-'));
  const touch = (p: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), '');
  };
  touch('src/index.ts');
  touch('src/signer.ts');
  touch('src/one.ts');
  touch('src/deep/entry.tsx');
  touch('css/theme.css');
  touch('dist/esm/signer.mjs');
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('maps a subpath to its source condition, not its dist import', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, {
      '.': { source: './src/index.ts', import: './dist/esm/index.mjs' },
      './signer': {
        source: './src/signer.ts',
        types: './types/signer.d.ts',
        import: './dist/esm/signer.mjs',
      },
    });
    expect(aliases).toEqual({ '@x/pkg/signer': path.join(dir, 'src/signer.ts') });
  });

  it('falls back to a TypeScript file among the web conditions when there is no source', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, {
      './one': { types: './types/one.d.ts', import: './src/one.ts', require: './src/one.ts' },
    });
    expect(aliases['@x/pkg/one']).toBe(path.join(dir, 'src/one.ts'));
  });

  it('ignores the react-native branch on the web', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, {
      './deep': {
        'react-native': { import: './src/one.ts' },
        default: './src/deep/entry.tsx',
      },
    });
    expect(aliases['@x/pkg/deep']).toBe(path.join(dir, 'src/deep/entry.tsx'));
  });

  it('keeps a non-source subpath on its real file so the bare alias cannot swallow it', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, {
      './css/theme.css': { import: './css/theme.css' },
    });
    expect(aliases['@x/pkg/css/theme.css']).toBe(path.join(dir, 'css/theme.css'));
  });

  it('maps a directory wildcard to the directory', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, { './src/*': './src/*' });
    expect(aliases['@x/pkg/src']).toBe(path.join(dir, 'src'));
  });

  it('skips types-only and missing targets', () => {
    const aliases = packageSubpathSourceAliases('@x/pkg', dir, {
      './types-only': { types: './src/overrides.d.ts' },
      './missing': { source: './src/nope.ts', import: './dist/esm/nope.mjs' },
    });
    expect(aliases).toEqual({});
  });

  it('returns nothing for a string or absent exports field', () => {
    expect(packageSubpathSourceAliases('@x/pkg', dir, './src/index.ts')).toEqual({});
    expect(packageSubpathSourceAliases('@x/pkg', dir, undefined)).toEqual({});
  });

  it('resolveExportSource prefers TypeScript over an existing dist file', () => {
    expect(resolveExportSource(dir, { import: './dist/esm/signer.mjs', default: './src/signer.ts' })).toBe(
      path.join(dir, 'src/signer.ts'),
    );
  });
});
