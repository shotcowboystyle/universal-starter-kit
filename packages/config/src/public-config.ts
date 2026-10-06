import fs from 'node:fs';
import path from 'node:path';

import { resolveConfig } from '@repo/utils/dev';
import dotenv from 'dotenv';
import { transformWithOxc } from 'vite';
import type { Environment, Plugin, ViteDevServer } from 'vite';

export const bakedConfigEnvKey = 'VITE_MP_CONFIG';
export const publicConfigKeysEnvKey = 'VITE_MP_PUBLIC_CONFIG_KEYS';

/**
 * The `public` key names of a config.json, read rather than imported: a
 * static import puts the file on Vite's configFileDependencies, and every
 * edit then restarts the dev server, re-optimizes deps and 504s each open tab.
 * A read keeps it off that list.
 */
export function readPublicConfigKeys(file: string): string[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const keys = parsed && typeof parsed === 'object' ? (parsed as { public?: unknown }).public : [];
  if (!Array.isArray(keys)) {
    return [];
  }
  return keys.filter((key): key is string => typeof key === 'string' && key.length > 0);
}

export function mergePublicConfigKeys(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

/**
 * Put the bake on process.env: the values resolved from the environment under
 * VITE_MP_CONFIG and the key NAMES under VITE_MP_PUBLIC_CONFIG_KEYS. Names,
 * never a value, is what lets the SSR node process resolve them from its own
 * environment at request time (@repo/platform runtimeConfig.ts).
 */
export function bakePublicConfig(keys: string[]): void {
  process.env[bakedConfigEnvKey] = JSON.stringify(resolveConfig(keys));
  process.env[publicConfigKeysEnvKey] = JSON.stringify(keys);
}

export interface PublicConfigPluginOptions {
  /** Absolute path of the config.json whose `public` array names the keys. */
  file: string;
  /** Directory holding the `.env` the values are resolved from. */
  projectRoot: string;
  /** Keys the config declares inline, kept alongside the file's. */
  keys?: string[];
}

const bakedExpression = /\bprocess\??\.env\??\.(?:VITE_MP_CONFIG|VITE_MP_PUBLIC_CONFIG_KEYS)\b/;
const nonScriptRequest = /\.(?:json|css|html)(?:$|\?)/;
const nodeModulesPath = /[\\/]node_modules[\\/]/;

/**
 * The same replacement vite:define makes, done through oxc so only real
 * `process.env.<KEY>` reads change: a string, an assignment target or a
 * `globalThis.process.env.<KEY>` is left as written.
 */
function bakedDefine(): Record<string, string> {
  return Object.fromEntries(
    [bakedConfigEnvKey, publicConfigKeysEnvKey].map((key) => [
      `process.env.${key}`,
      JSON.stringify(process.env[key] ?? ''),
    ]),
  );
}

/**
 * The browser caches node_modules files and optimized deps as immutable under
 * a ?v= hash that no define value feeds, so a value inlined there would
 * outlive every reload and restart. Those keep reading the defines vite
 * injects through /@vite/env instead.
 */
function browserCached(environment: Environment | undefined, id: string): boolean {
  if (!environment || environment.config.consumer === 'server') {
    return false;
  }
  if (nodeModulesPath.test(id)) {
    return true;
  }
  return 'depsOptimizer' in environment && !!environment.depsOptimizer?.isOptimizedDepFile(id);
}

/**
 * Dev-server half of `publicConfigFile`. vite:define freezes its replacement
 * table per environment when the server starts, so this plugin inlines the
 * two baked expressions itself (it runs ahead of vite:define), remembers the
 * modules that carried them, and when config.json changes rebakes,
 * invalidates those modules and reloads every environment. The server never
 * restarts, so the dep optimizer never runs again.
 */
export function publicConfigPlugin(options: PublicConfigPluginOptions): Plugin {
  const file = path.resolve(options.file);
  const envFile = path.resolve(options.projectRoot, '.env');
  const inlineKeys = options.keys ?? [];
  const bakedModules = new Map<string, Set<string>>();

  function readKeys(): string[] {
    return mergePublicConfigKeys(inlineKeys, readPublicConfigKeys(file));
  }

  function bake(next: string[]) {
    dotenv.config({ path: envFile, quiet: true });
    bakePublicConfig(next);
  }

  let keys = readKeys();
  bake(keys);

  function refresh(server: ViteDevServer) {
    const label = path.relative(process.cwd(), file);
    let next: string[];
    try {
      next = readKeys();
    } catch (err) {
      server.config.logger.warn(`${label}: ${(err as Error).message}; keeping the previous public keys`, {
        timestamp: true,
      });
      return;
    }
    if (next.length === keys.length && next.every((key, i) => key === keys[i])) {
      return;
    }
    keys = next;
    bake(keys);
    for (const [name, ids] of bakedModules) {
      const environment = server.environments[name];
      if (!environment) {
        continue;
      }
      for (const id of ids) {
        const mod = environment.moduleGraph.getModuleById(id);
        if (mod) {
          environment.moduleGraph.invalidateModule(mod);
        }
      }
    }
    for (const environment of Object.values(server.environments)) {
      environment.hot.send({ type: 'full-reload', path: '*' });
    }
    server.config.logger.info(`${label} changed, reloading with public keys ${keys.join(', ')}`, {
      timestamp: true,
    });
  }

  return {
    name: 'multiplatform-public-config',
    apply: 'serve',
    async transform(code, id) {
      if (nonScriptRequest.test(id) || !bakedExpression.test(code)) {
        return;
      }
      if (browserCached(this.environment, id)) {
        return;
      }
      let result: Awaited<ReturnType<typeof transformWithOxc>>;
      try {
        result = await transformWithOxc(code, id, {
          lang: 'js',
          sourceType: 'module',
          define: bakedDefine(),
          tsconfig: false,
        });
      } catch {
        return;
      }
      const name = this.environment?.name ?? 'client';
      let ids = bakedModules.get(name);
      if (!ids) {
        ids = new Set();
        bakedModules.set(name, ids);
      }
      ids.add(id);
      return { code: result.code, map: result.map };
    },
    configureServer(server) {
      server.watcher.add(file);
      const onChange = (changed: string) => {
        if (path.resolve(changed) === file) {
          refresh(server);
        }
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);
    },
  };
}
