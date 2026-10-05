/**
 * publicConfigFile: config.json is read, not imported, so an edit
 * never restarts the dev server; the plugin inlines the bake, watches the file
 * and reloads clients with the new keys instead.
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfigFromFile } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicConfigPlugin, readPublicConfigKeys } from './publicConfig.js';

const bakedKeys = 'VITE_MP_PUBLIC_CONFIG_KEYS';
const bakedValues = 'VITE_MP_CONFIG';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-public-config-'));
  file = path.join(dir, 'config.json');
  delete process.env[bakedKeys];
  delete process.env[bakedValues];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.MPO_SPEC_FOO;
  delete process.env.MPO_SPEC_BAR;
});

function writeConfig(publicKeys: unknown, extra: Record<string, unknown> = {}) {
  fs.writeFileSync(file, JSON.stringify({ private: ['SECRET'], public: publicKeys, ...extra }));
}

interface FakeEnvironment {
  modules: Map<string, { id: string }>;
  moduleGraph: {
    getModuleById: (id: string) => unknown;
    invalidateModule: ReturnType<typeof vi.fn>;
  };
  hot: { send: ReturnType<typeof vi.fn> };
}

function fakeServer() {
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
  const environment = (): FakeEnvironment => {
    const modules = new Map<string, { id: string }>();
    return {
      modules,
      moduleGraph: { getModuleById: (id: string) => modules.get(id), invalidateModule: vi.fn() },
      hot: { send: vi.fn() },
    };
  };
  const environments = { client: environment(), ssr: environment() };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const server = { watcher, environments, config: { logger } };
  return { server: server as unknown as ViteDevServer, watcher, environments, logger };
}

interface TransformEnvironment {
  name: string;
  config: { consumer: 'client' | 'server' };
  depsOptimizer?: { isOptimizedDepFile: (id: string) => boolean };
}

async function transform(plugin: Plugin, environment: string | TransformEnvironment, code: string, id: string) {
  const hook = plugin.transform as (
    this: { environment: TransformEnvironment },
    code: string,
    id: string,
  ) => Promise<{ code: string } | undefined>;
  const context =
    typeof environment === 'string'
      ? {
          name: environment,
          config: { consumer: environment === 'ssr' ? ('server' as const) : ('client' as const) },
        }
      : environment;
  return hook.call({ environment: context }, code, id);
}

function configureServer(plugin: Plugin, server: ViteDevServer) {
  (plugin.configureServer as (server: ViteDevServer) => void)(server);
}

describe('readPublicConfigKeys', () => {
  it('returns the public key names', () => {
    writeConfig(['FRAPPE_ENABLED', 'FRAPPE_URL']);
    expect(readPublicConfigKeys(file)).toEqual(['FRAPPE_ENABLED', 'FRAPPE_URL']);
  });

  it('drops anything that is not a key name and tolerates a missing list', () => {
    writeConfig(['A', 1, '', null, 'B']);
    expect(readPublicConfigKeys(file)).toEqual(['A', 'B']);
    fs.writeFileSync(file, JSON.stringify({ private: ['SECRET'] }));
    expect(readPublicConfigKeys(file)).toEqual([]);
  });
});

describe('config.json as a vite config dependency', () => {
  it('an imported config.json restarts the server on edit; a read one is not tracked at all', async () => {
    writeConfig(['A']);
    const imported = path.join(dir, 'imported.config.mjs');
    const read = path.join(dir, 'read.config.mjs');
    fs.writeFileSync(
      imported,
      'import config from "./config.json" with { type: "json" };\n' +
        'export default { define: { keys: config.public } };\n',
    );
    fs.writeFileSync(
      read,
      'import fs from "node:fs";\n' +
        'const config = JSON.parse(fs.readFileSync(new URL("./config.json", import.meta.url), "utf-8"));\n' +
        'export default { define: { keys: config.public } };\n',
    );
    const env = { command: 'serve', mode: 'development' } as const;
    const viaImport = await loadConfigFromFile(env, imported, dir);
    const viaRead = await loadConfigFromFile(env, read, dir);
    expect(viaImport?.dependencies.some((dep) => dep.endsWith('config.json'))).toBe(true);
    expect(viaRead?.dependencies.some((dep) => dep.endsWith('config.json'))).toBe(false);
    expect(viaRead?.config.define).toEqual({ keys: ['A'] });
  });
});

describe('publicConfigPlugin', () => {
  it('bakes on construction and inlines exactly the two baked expressions', async () => {
    writeConfig(['MPO_SPEC_FOO']);
    process.env.MPO_SPEC_FOO = 'bar';
    const plugin = publicConfigPlugin({ file, projectRoot: dir, keys: ['INLINE'] });
    expect(plugin.apply).toBe('serve');
    expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['INLINE', 'MPO_SPEC_FOO']);
    const out = await transform(
      plugin,
      'client',
      'const a = process.env.VITE_MP_CONFIG;\n' +
        'const b = process.env.VITE_MP_PUBLIC_CONFIG_KEYS;\n' +
        'const c = process.env.VITE_MP_CONFIGX + process.env.OTHER;\n',
      '/app/runtimeConfig.ts',
    );
    expect(out?.code).toBe(
      `const a = ${JSON.stringify(JSON.stringify({ MPO_SPEC_FOO: 'bar' }))};\n` +
        `const b = ${JSON.stringify(JSON.stringify(['INLINE', 'MPO_SPEC_FOO']))};\n` +
        'const c = process.env.VITE_MP_CONFIGX + process.env.OTHER;\n',
    );
    expect(await transform(plugin, 'client', 'const d = process.env.OTHER;', '/app/other.ts')).toBe(undefined);
    expect(await transform(plugin, 'client', '{"x":"process.env.VITE_MP_CONFIG"}', '/app/data.json')).toBe(undefined);
  });

  it('replaces only real reads: strings, assignment targets and globalThis reads stay as written', async () => {
    writeConfig(['MPO_SPEC_FOO']);
    process.env.MPO_SPEC_FOO = 'bar';
    const plugin = publicConfigPlugin({ file, projectRoot: dir });
    const out = await transform(
      plugin,
      'ssr',
      'const hint = "set process.env.VITE_MP_CONFIG first";\n' +
        'globalThis.process.env.VITE_MP_CONFIG ??= "{}";\n' +
        'process.env.VITE_MP_PUBLIC_CONFIG_KEYS = "[]";\n' +
        'export const a = process?.env?.VITE_MP_CONFIG;\n',
      '/app/runtimeConfig.ts',
    );
    expect(out?.code).toContain('"set process.env.VITE_MP_CONFIG first"');
    expect(out?.code).toContain('globalThis.process.env.VITE_MP_CONFIG ??=');
    expect(out?.code).toContain('process.env.VITE_MP_PUBLIC_CONFIG_KEYS =');
    expect(out?.code).toContain(`export const a = ${JSON.stringify(JSON.stringify({ MPO_SPEC_FOO: 'bar' }))};`);
  });

  it("leaves browser-cached client files to vite's injected define and still inlines them for ssr", async () => {
    writeConfig(['MPO_SPEC_FOO']);
    const plugin = publicConfigPlugin({ file, projectRoot: dir });
    const code = 'export const keys = process.env.VITE_MP_PUBLIC_CONFIG_KEYS;';
    const inlined = `export const keys = ${JSON.stringify(JSON.stringify(['MPO_SPEC_FOO']))};\n`;
    const installed = '/proj/node_modules/@repo/platform/lib/config/runtimeConfig.js';
    const optimized = '/proj/.cache/vite/deps/@multiplatform__one_platform.js';
    expect(await transform(plugin, 'client', code, installed)).toBeUndefined();
    expect((await transform(plugin, 'ssr', code, installed))?.code).toBe(inlined);
    const optimizer = { isOptimizedDepFile: (id: string) => id === optimized };
    expect(
      await transform(
        plugin,
        { name: 'client', config: { consumer: 'client' }, depsOptimizer: optimizer },
        code,
        optimized,
      ),
    ).toBeUndefined();
    const source = await transform(
      plugin,
      { name: 'client', config: { consumer: 'client' }, depsOptimizer: optimizer },
      code,
      '/proj/apps/web/runtimeConfig.ts',
    );
    expect(source?.code).toBe(inlined);
  });

  it('watches the file and, when the keys change, rebakes, invalidates the inlined modules and reloads', async () => {
    writeConfig(['MPO_SPEC_FOO']);
    process.env.MPO_SPEC_FOO = 'bar';
    const plugin = publicConfigPlugin({ file, projectRoot: dir });
    const { server, watcher, environments, logger } = fakeServer();
    configureServer(plugin, server);
    expect(watcher.add).toHaveBeenCalledWith(file);

    const code = 'export const keys = process.env.VITE_MP_PUBLIC_CONFIG_KEYS;';
    await transform(plugin, 'client', code, '/app/runtimeConfig.ts');
    await transform(plugin, 'ssr', code, '/app/runtimeConfig.ts');
    const clientModule = { id: '/app/runtimeConfig.ts' };
    const ssrModule = { id: '/app/runtimeConfig.ts' };
    environments.client.modules.set(clientModule.id, clientModule);
    environments.ssr.modules.set(ssrModule.id, ssrModule);

    fs.writeFileSync(path.join(dir, '.env'), 'MPO_SPEC_BAR=from-dotenv\n');
    writeConfig(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
    watcher.emit('change', file);

    expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
    expect(JSON.parse(process.env[bakedValues]!)).toEqual({
      MPO_SPEC_FOO: 'bar',
      MPO_SPEC_BAR: 'from-dotenv',
    });
    expect(environments.client.moduleGraph.invalidateModule).toHaveBeenCalledWith(clientModule);
    expect(environments.ssr.moduleGraph.invalidateModule).toHaveBeenCalledWith(ssrModule);
    expect(environments.client.hot.send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
    expect(environments.ssr.hot.send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect((await transform(plugin, 'client', code, '/app/runtimeConfig.ts'))?.code).toBe(
      `export const keys = ${JSON.stringify(JSON.stringify(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']))};\n`,
    );
  });

  it('stays quiet when an edit leaves the public keys as they were', () => {
    writeConfig(['MPO_SPEC_FOO']);
    const plugin = publicConfigPlugin({ file, projectRoot: dir });
    const { server, watcher, environments } = fakeServer();
    configureServer(plugin, server);
    writeConfig(['MPO_SPEC_FOO'], { private: ['SECRET', 'OTHER_SECRET'] });
    watcher.emit('change', file);
    watcher.emit('change', path.join(dir, 'unrelated.json'));
    expect(environments.client.hot.send).not.toHaveBeenCalled();
    expect(environments.ssr.hot.send).not.toHaveBeenCalled();
  });

  it('keeps the previous keys through a half-written file and picks up the finished one', () => {
    writeConfig(['MPO_SPEC_FOO']);
    const plugin = publicConfigPlugin({ file, projectRoot: dir });
    const { server, watcher, environments, logger } = fakeServer();
    configureServer(plugin, server);
    fs.writeFileSync(file, '{ "public": ["MPO_SPEC_FOO", ');
    watcher.emit('change', file);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['MPO_SPEC_FOO']);
    expect(environments.client.hot.send).not.toHaveBeenCalled();
    writeConfig(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
    watcher.emit('add', file);
    expect(JSON.parse(process.env[bakedKeys]!)).toEqual(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
    expect(environments.client.hot.send).toHaveBeenCalledTimes(1);
  });
});
