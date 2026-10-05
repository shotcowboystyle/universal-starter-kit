/**
 * createViteConfig — absorbed consumer workarounds (ssr CJS externals +
 * native Hermes fixes). These used to live per-app (the main app and downstream
 * consumer vite configs); the spec pins the shared defaults and their
 * escape hatches.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createViteConfig } from './vite.js';

interface NativePlugin {
  name?: string;
  renderChunk?: (code: string) => { code: string; map: null };
}

const globalWithNativePlugins = globalThis as unknown as {
  __vxrnAddNativePlugins?: NativePlugin[];
};

function findPlugin(config: ReturnType<typeof createViteConfig>, name: string): Plugin | undefined {
  return (config.plugins as Plugin[]).flat().find((p) => p && p.name === name);
}

function runConfigResolved(
  plugin: Plugin,
  ssrExternal: string[] | boolean | undefined,
  command: 'build' | 'serve' = 'serve',
) {
  const fakeConfig = { command, ssr: { external: ssrExternal } } as any;
  (plugin.configResolved as any)(fakeConfig);
  return fakeConfig.ssr.external;
}

beforeEach(() => {
  // Native fix registration is global and deduped — reset between tests.
  delete globalWithNativePlugins.__vxrnAddNativePlugins;
});

describe('ssrCjsExternal', () => {
  it('does not duplicate ids already present', () => {
    const config = createViteConfig({ one: true });
    const plugin = findPlugin(config, 'multiplatform-ssr-cjs-external-fix');
    const external = runConfigResolved(plugin!, ['use-sync-external-store']) as string[];
    expect(external.filter((e) => e === 'use-sync-external-store')).toHaveLength(1);
  });

  it('extends the default list with consumer extras', () => {
    const config = createViteConfig({ one: true, ssrCjsExternal: ['my-cjs-dep'] });
    const plugin = findPlugin(config, 'multiplatform-ssr-cjs-external-fix');
    const external = runConfigResolved(plugin!, []) as string[];
    expect(external).toContain('my-cjs-dep');
    expect(external).toContain('use-sync-external-store');
  });

  it('bundles use-sync-external-store in a build, where React is bundled too', () => {
    const config = createViteConfig({ one: true });
    const plugin = findPlugin(config, 'multiplatform-ssr-cjs-external-fix');
    const external = runConfigResolved(plugin!, [], 'build') as string[];
    expect(external.filter((e) => e.startsWith('use-sync-external-store'))).toEqual([]);
    expect(external).toContain('hoist-non-react-statics');
    expect(external).toContain('turndown');
  });

  it('leaves ssr.external: true untouched (everything already external)', () => {
    const config = createViteConfig({ one: true });
    const plugin = findPlugin(config, 'multiplatform-ssr-cjs-external-fix');
    expect(runConfigResolved(plugin!, true)).toBe(true);
  });

  it('can be disabled with ssrCjsExternal: false', () => {
    const config = createViteConfig({ one: true, ssrCjsExternal: false });
    expect(findPlugin(config, 'multiplatform-ssr-cjs-external-fix')).toBeUndefined();
  });

  it('is not added without the one framework', () => {
    const config = createViteConfig({ one: false });
    expect(findPlugin(config, 'multiplatform-ssr-cjs-external-fix')).toBeUndefined();
  });
});

describe('nativeFixes.protoShadow', () => {
  it('registers the Hermes proto-shadow renderChunk fix by default', () => {
    createViteConfig({ one: true });
    const plugin = globalWithNativePlugins.__vxrnAddNativePlugins?.find((p) => p.name === 'vxrn-proto-shadow-fix');
    expect(plugin).toBeDefined();
    const result = plugin!.renderChunk!('var x = 1;');
    // The restore snippet is PREPENDED so it runs before any module code.
    expect(result.code.endsWith('var x = 1;')).toBe(true);
    expect(result.code).toContain('Object.prototype');
    expect(result.code).toContain('hasOwnProperty');
  });

  it('can be disabled with nativeFixes.protoShadow: false', () => {
    createViteConfig({ one: true, nativeFixes: { protoShadow: false } });
    expect(globalWithNativePlugins.__vxrnAddNativePlugins?.some((p) => p.name === 'vxrn-proto-shadow-fix')).toBeFalsy();
  });
});

describe('public config bake', () => {
  const bakedKeys = 'VITE_MP_PUBLIC_CONFIG_KEYS';
  const bakedValues = 'VITE_MP_CONFIG';

  beforeEach(() => {
    delete process.env[bakedKeys];
    delete process.env[bakedValues];
  });

  it('bakes the public key NAMES so the SSR server can resolve their values at runtime', () => {
    // Values stay out of the image (an environment-agnostic build); the names
    // travel instead, and double as the allowlist that keeps a private key out
    // of the served document (@repo/platform runtimeConfig).
    createViteConfig({ publicConfigKeys: ['MARKETPLACE_API_URL', 'FRAPPE_ENABLED'] });
    expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['MARKETPLACE_API_URL', 'FRAPPE_ENABLED']);
  });

  it('still bakes the build-environment VALUES so apps that bake keep working', () => {
    process.env.MPO_VITE_SPEC_PUBLIC = 'baked-in';
    createViteConfig({ publicConfigKeys: ['MPO_VITE_SPEC_PUBLIC'] });
    expect(JSON.parse(process.env[bakedValues]!)).toEqual({ MPO_VITE_SPEC_PUBLIC: 'baked-in' });
    delete process.env.MPO_VITE_SPEC_PUBLIC;
  });

  it('bakes nothing when the app declares no public keys', () => {
    createViteConfig({});
    expect(process.env[bakedKeys]).toBeUndefined();
    expect(process.env[bakedValues]).toBeUndefined();
  });

  it('reads the names from publicConfigFile and adds the dev watcher plugin', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-vite-spec-'));
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ private: ['SECRET'], public: ['FRAPPE_ENABLED'] }));
    try {
      const config = createViteConfig({ publicConfigFile: file, publicConfigKeys: ['INLINE'] });
      expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['INLINE', 'FRAPPE_ENABLED']);
      expect(findPlugin(config, 'multiplatform-public-config')?.apply).toBe('serve');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds no watcher plugin when the keys are declared inline', () => {
    const config = createViteConfig({ publicConfigKeys: ['INLINE'] });
    expect(findPlugin(config, 'multiplatform-public-config')).toBeUndefined();
  });
});

describe('One HMR ports', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('lets Vite use the actual listener when no proxy port is configured', () => {
    vi.stubEnv('ONE_PORT', '');
    const config = createViteConfig({ one: true, server: { port: 3456 } });
    expect(config.server?.hmr).toEqual({ path: '/__vxrnhmr' });
  });
  it('retains an explicitly configured proxy bypass port', () => {
    vi.stubEnv('ONE_PORT', '3000');
    const config = createViteConfig({ one: true });
    expect(config.server?.hmr).toEqual({ path: '/__vxrnhmr', clientPort: 3000 });
  });
  it('preserves an explicit consumer HMR override', () => {
    vi.stubEnv('ONE_PORT', '3000');
    const hmr = { path: '/custom-hmr', clientPort: 9000 };
    const config = createViteConfig({ one: true, server: { hmr } });
    expect(config.server?.hmr).toEqual(hmr);
  });
});

describe('clientBrokenEsm', () => {
  it("pre-bundles react's JSX runtimes for the client environment", () => {
    const config = createViteConfig({ one: true });
    const plugin = findPlugin(config, 'multiplatform-client-broken-esm');
    expect(plugin).toBeDefined();
    const fakeConfig = { environments: { client: { optimizeDeps: { include: ['react'] } } } };
    (plugin!.configResolved as any)(fakeConfig);
    const include = fakeConfig.environments.client.optimizeDeps.include;
    expect(include).toContain('react/jsx-runtime');
    expect(include).toContain('react/jsx-dev-runtime');
    expect(include.filter((d) => d === 'react')).toHaveLength(1);
  });

  it('pre-bundles tamagui for the client, which a deep src import reaches from inside node_modules', () => {
    const config = createViteConfig({ one: true });
    const plugin = findPlugin(config, 'multiplatform-client-broken-esm');
    const fakeConfig = { environments: { client: { optimizeDeps: {} as { include?: string[] } } } };
    (plugin!.configResolved as any)(fakeConfig);
    expect(fakeConfig.environments.client.optimizeDeps.include).toContain('tamagui');
  });
});
