import { bakedPublicConfig, readRuntimePublicConfig } from './runtimeConfig';
import type { IConfig } from './types';

export class Config implements IConfig {
  private _config: Record<string, string> = {};

  private _blacklist: Set<string> = new Set([]);

  private _lookupEnv(key: string): string | undefined {
    if (this._blacklist.has(key)) {
      return undefined;
    }
    // `process` is UNDECLARED in the browser, where `process?.env` throws a
    // ReferenceError rather than short-circuiting — this is why env lookup
    // could never be the browser's only path to config.
    if (typeof process === 'undefined') {
      return undefined;
    }
    return process.env?.[key];
  }

  private _resolveConfig() {
    return Object.keys(this._config).reduce<Record<string, string>>((config, key) => {
      const value = this._lookupEnv(key) || this._config[key];
      if (typeof value !== 'undefined') {
        config[key] = value;
      }
      return config;
    }, {});
  }

  private _reduceConfig(config: Record<string, string | undefined> = {}) {
    return Object.entries(config).reduce<Record<string, string>>(
      (config, [key, value]: [string, string | undefined]) => {
        if (typeof value !== 'undefined') {
          config[key] = value.toString();
        }
        return config;
      },
      {},
    );
  }

  constructor(config: Record<string, string | undefined> = {}) {
    this._config = {
      // 1. BUILD time: public config baked into the bundle via VITE_MP_CONFIG.
      //    Kept first (and kept working) so apps that bake their config in —
      //    native, GNOME, static web — are unchanged.
      ...this._reduceConfig(bakedPublicConfig()),
      // 2. RUNTIME: the public payload the SSR document published into the
      //    browser (see runtimeConfig.ts). Wins over the bake so a redeployed
      //    container overrides a stale build-time value, and so an image built
      //    with an EMPTY build environment can still be configured per
      //    deployment. `process.env` is not reachable here.
      ...this._reduceConfig(readRuntimePublicConfig()),
      // 3. Explicit values handed to the constructor always win.
      ...this._reduceConfig(config),
    };
  }

  get(): Record<string, string>;
  get(key: string): string | undefined;
  get(key: string, defaultValue: string): string;
  get(key?: string, defaultValue?: string): Record<string, string> | string | undefined {
    const config = this._resolveConfig();
    if (!key) {
      return config;
    }
    return config[key] || defaultValue;
  }

  set(key: string, value: string) {
    this._config[key] = value;
    return value;
  }

  add(value: Record<string, string>) {
    this._config = {
      ...this._config,
      ...value,
    };
    return this.get();
  }

  remove(key: string): string | undefined {
    const value = this.get(key);
    delete this._config[key];
    return value;
  }
}
