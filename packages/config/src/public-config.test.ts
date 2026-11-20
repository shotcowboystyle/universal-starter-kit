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
import type { Mock } from 'vitest';

import { publicConfigPlugin, readPublicConfigKeys } from './public-config.js';

const bakedKeys = 'VITE_MP_PUBLIC_CONFIG_KEYS';
const bakedValues = 'VITE_MP_CONFIG';

let dir: string;
let file: string;

type ConfigJson = string | number | boolean | null | ConfigJson[];

const writeConfig = (publicKeys: ConfigJson, extra: Record<string, ConfigJson> = {}) => {
  fs.writeFileSync(file, JSON.stringify({ private: ['SECRET'], public: publicKeys, ...extra }));
};

interface FakeModule {
  id: string;
}

interface FakeEnvironment {
  modules: Map<string, FakeModule>;
  moduleGraph: {
    getModuleById: (id: string) => FakeModule | undefined;
    invalidateModule: Mock<(mod: FakeModule) => void>;
  };
  hot: { send: Mock<(payload: { type: string; path: string }) => void> };
}

const fakeEnvironment = (): FakeEnvironment => {
  const modules = new Map<string, FakeModule>();
  return {
    modules,
    moduleGraph: {
      getModuleById: (id: string) => modules.get(id),
      invalidateModule: vi.fn<(mod: FakeModule) => void>(),
    },
    hot: { send: vi.fn<(payload: { type: string; path: string }) => void>() },
  };
};

const fakeServer = () => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- stands in for the chokidar watcher, an EventEmitter whose `on`/`emit` the plugin calls
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn<(file: string) => void>() });
  const environments = { client: fakeEnvironment(), ssr: fakeEnvironment() };
  const logger = {
    info: vi.fn<(message: string, options?: { timestamp: boolean }) => void>(),
    warn: vi.fn<(message: string, options?: { timestamp: boolean }) => void>(),
  };
  const server = { watcher, environments, config: { logger } };
  return { server: server as unknown as ViteDevServer, watcher, environments, logger };
};

interface TransformEnvironment {
  name: string;
  config: { consumer: 'client' | 'server' };
  depsOptimizer?: { isOptimizedDepFile: (id: string) => boolean };
}

const inEnvironment = (name: 'client' | 'ssr'): TransformEnvironment => ({
  name,
  config: { consumer: name === 'ssr' ? 'server' : 'client' },
});

const transform = async (plugin: Plugin, environment: TransformEnvironment, code: string, id: string) => {
  const hook = plugin.transform as (
    this: { environment: TransformEnvironment },
    code: string,
    id: string,
  ) => Promise<{ code: string } | undefined>;
  return await hook.call({ environment }, code, id);
};

const configureServer = (plugin: Plugin, server: ViteDevServer) => {
  (plugin.configureServer as (server: ViteDevServer) => void)(server);
};

describe('public config', () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-public-config-'));
    file = path.join(dir, 'config.json');
    delete process.env.VITE_MP_PUBLIC_CONFIG_KEYS;
    delete process.env.VITE_MP_CONFIG;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.MPO_SPEC_FOO;
    delete process.env.MPO_SPEC_BAR;
  });

  describe(readPublicConfigKeys, () => {
    it('returns the public key names', () => {
      writeConfig(['ANALYTICS_ENABLED', 'ANALYTICS_URL']);
      expect(readPublicConfigKeys(file)).toStrictEqual(['ANALYTICS_ENABLED', 'ANALYTICS_URL']);
    });

    it('drops anything that is not a key name and tolerates a missing list', () => {
      writeConfig(['A', 1, '', null, 'B']);
      expect(readPublicConfigKeys(file)).toStrictEqual(['A', 'B']);
      fs.writeFileSync(file, JSON.stringify({ private: ['SECRET'] }));
      expect(readPublicConfigKeys(file)).toStrictEqual([]);
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
      expect(viaRead?.config.define).toStrictEqual({ keys: ['A'] });
    });
  });

  describe(publicConfigPlugin, () => {
    it('bakes on construction and inlines exactly the two baked expressions', async () => {
      writeConfig(['MPO_SPEC_FOO']);
      process.env.MPO_SPEC_FOO = 'bar';
      const plugin = publicConfigPlugin({ file, projectRoot: dir, keys: ['INLINE'] });
      expect(plugin.apply).toBe('serve');
      expect(JSON.parse(process.env[bakedKeys]!)).toStrictEqual(['INLINE', 'MPO_SPEC_FOO']);
      const out = await transform(
        plugin,
        inEnvironment('client'),
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
      await expect(
        transform(plugin, inEnvironment('client'), 'const d = process.env.OTHER;', '/app/other.ts'),
      ).resolves.toBeUndefined();
      await expect(
        transform(plugin, inEnvironment('client'), '{"x":"process.env.VITE_MP_CONFIG"}', '/app/data.json'),
      ).resolves.toBeUndefined();
    });

    it('replaces only real reads: strings, assignment targets and globalThis reads stay as written', async () => {
      writeConfig(['MPO_SPEC_FOO']);
      process.env.MPO_SPEC_FOO = 'bar';
      const plugin = publicConfigPlugin({ file, projectRoot: dir });
      const out = await transform(
        plugin,
        inEnvironment('ssr'),
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
      await expect(transform(plugin, inEnvironment('client'), code, installed)).resolves.toBeUndefined();
      const ssrOut = await transform(plugin, inEnvironment('ssr'), code, installed);
      expect(ssrOut?.code).toBe(inlined);
      const optimizer = { isOptimizedDepFile: (id: string) => id === optimized };
      await expect(
        transform(
          plugin,
          { name: 'client', config: { consumer: 'client' }, depsOptimizer: optimizer },
          code,
          optimized,
        ),
      ).resolves.toBeUndefined();
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
      await transform(plugin, inEnvironment('client'), code, '/app/runtimeConfig.ts');
      await transform(plugin, inEnvironment('ssr'), code, '/app/runtimeConfig.ts');
      const clientModule = { id: '/app/runtimeConfig.ts' };
      const ssrModule = { id: '/app/runtimeConfig.ts' };
      environments.client.modules.set(clientModule.id, clientModule);
      environments.ssr.modules.set(ssrModule.id, ssrModule);

      fs.writeFileSync(path.join(dir, '.env'), 'MPO_SPEC_BAR=from-dotenv\n');
      writeConfig(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
      watcher.emit('change', file);

      expect(JSON.parse(process.env[bakedKeys]!)).toStrictEqual(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
      expect(JSON.parse(process.env[bakedValues]!)).toStrictEqual({
        MPO_SPEC_FOO: 'bar',
        MPO_SPEC_BAR: 'from-dotenv',
      });
      expect(environments.client.moduleGraph.invalidateModule).toHaveBeenCalledWith(clientModule);
      expect(environments.ssr.moduleGraph.invalidateModule).toHaveBeenCalledWith(ssrModule);
      expect(environments.client.hot.send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
      expect(environments.ssr.hot.send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
      expect(logger.info).toHaveBeenCalledOnce();
      const rebaked = await transform(plugin, inEnvironment('client'), code, '/app/runtimeConfig.ts');
      expect(rebaked?.code).toBe(
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
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(JSON.parse(process.env[bakedKeys]!)).toStrictEqual(['MPO_SPEC_FOO']);
      expect(environments.client.hot.send).not.toHaveBeenCalled();
      writeConfig(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
      watcher.emit('add', file);
      expect(JSON.parse(process.env[bakedKeys]!)).toStrictEqual(['MPO_SPEC_FOO', 'MPO_SPEC_BAR']);
      expect(environments.client.hot.send).toHaveBeenCalledOnce();
    });
  });
});
