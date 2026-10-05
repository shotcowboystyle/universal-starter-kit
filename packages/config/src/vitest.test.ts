/**
 * createVitestConfig — resolve.extensions must never prefer a .test.* sibling,
 * and dedupeReact aliases must bind one physical React.
 *
 * Regression guard: the defaults listed ".test.ts" / ".test.tsx"
 * first, so vite resolved an extensionless `import "./foo"` to foo.test.ts
 * whenever both files existed. That pulled the test file's own imports into the
 * module graph and killed the lookout unit job with "Cannot bundle Node.js
 * built-in node:test imported from src/format.test.ts".
 *
 * Regression guard: aliasing react at the hoisted root directory
 * while Vite realpath'd a package-local symlink put two copies in one graph.
 * Render specs then died on `Cannot read properties of null (reading 'useEffect')`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer, type ViteDevServer } from 'vite';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createVitestConfig } from './vitest.js';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/extensionless-resolve',
);

const servers: ViteDevServer[] = [];

afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
});

/**
 * Resolve a specifier through a real vite pipeline built from the produced
 * config, so the assertion exercises vite's own extension probing rather than
 * re-implementing it.
 */
async function resolveThroughVite(specifier: string, importer: string) {
  const config = createVitestConfig({ tamaguiConfig: false, dedupeReact: false });
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    root: fixtureDir,
    server: { middlewareMode: true },
    resolve: config.resolve,
  });
  servers.push(server);
  const environment = server.environments?.client ?? server.environments?.ssr;
  const container = environment ? environment.pluginContainer : (server as any).pluginContainer;
  const resolved = await container.resolveId(specifier, importer);
  return resolved?.id ?? null;
}

describe('resolve.extensions', () => {
  it('does not list any .test.* extension', () => {
    const extensions = createVitestConfig().resolve?.extensions ?? [];
    expect(extensions.filter((extension) => extension.startsWith('.test.'))).toEqual([]);
  });

  it('still resolves platform-specific and plain source extensions, web first', () => {
    const extensions = createVitestConfig().resolve?.extensions ?? [];
    expect(extensions).toEqual(['.web.ts', '.web.tsx', '.web.js', '.web.jsx', '.ts', '.tsx', '.js', '.jsx']);
    expect(extensions.indexOf('.web.ts')).toBeLessThan(extensions.indexOf('.ts'));
  });
});

describe('dedupeReact aliases', () => {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const componentsDir = path.resolve(configDir, '../../components');
  const componentsReact = path.join(componentsDir, 'node_modules/react');
  const componentsReactDom = path.join(componentsDir, 'node_modules/react-dom');

  function aliasMap() {
    return createVitestConfig({ tamaguiConfig: false }).resolve?.alias as Record<string, string>;
  }

  it('binds react-dom/client and jsx-runtime to the same physical copies as the packages', () => {
    const aliases = aliasMap();
    expect(aliases['react-dom/client']).toBe(path.join(aliases['react-dom'], 'client'));
    expect(aliases['react-dom/server']).toBe(path.join(aliases['react-dom'], 'server'));
    expect(aliases['react/jsx-runtime']).toBe(path.join(aliases.react, 'jsx-runtime'));
    expect(aliases['react/jsx-dev-runtime']).toBe(path.join(aliases.react, 'jsx-dev-runtime'));
    expect(aliases.react).not.toBe(aliases['react-dom']);
  });

  it('canonicalizes each alias through realpath so Vite cannot see two copies', () => {
    const aliases = aliasMap();
    for (const pkg of ['react', 'react-dom', 'scheduler'] as const) {
      expect(fs.existsSync(aliases[pkg])).toBe(true);
      expect(aliases[pkg]).toBe(fs.realpathSync(aliases[pkg]));
    }
  });

  it.skipIf(!fs.existsSync(componentsReact) || !fs.existsSync(componentsReactDom))(
    'prefers the package-under-test physical copy over the hoisted root',
    () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(componentsDir);
      try {
        const aliases = aliasMap();
        expect(aliases.react).toBe(fs.realpathSync(componentsReact));
        expect(aliases['react-dom']).toBe(fs.realpathSync(componentsReactDom));
      } finally {
        cwdSpy.mockRestore();
      }
    },
  );

  it('does not also dedupe react to the hoisted root copy', () => {
    const dedupe = createVitestConfig({ tamaguiConfig: false }).resolve?.dedupe ?? [];
    expect(dedupe).not.toContain('react');
    expect(dedupe).not.toContain('react-dom');
  });

  it('inlines React consumers that Node would otherwise load from the hoisted root', () => {
    const config = createVitestConfig({ tamaguiConfig: false }) as {
      test?: { server?: { deps?: { inline?: unknown[]; external?: unknown[] } } };
    };
    const inline = config.test?.server?.deps?.inline ?? [];
    expect(inline.some((entry) => entry instanceof RegExp && String(entry).includes('@tanstack'))).toBe(true);
    expect(inline).toContain('use-sync-external-store');
    expect(inline).toContain('react-i18next');
  });

  it("installs a worker setup that pins CJS require('react') to the same copy", () => {
    const config = createVitestConfig({ tamaguiConfig: false }) as {
      test?: { setupFiles?: string[]; server?: { deps?: { external?: unknown[] } } };
    };
    const files = config.test?.setupFiles ?? [];
    expect(files.some((file) => file.endsWith('pinReactRequire.cjs'))).toBe(true);
    const external = config.test?.server?.deps?.external ?? [];
    expect(external.some((entry) => String(entry).endsWith('pinReactRequire.cjs'))).toBe(true);
  });
});
