import { bakedPublicConfig, readRuntimePublicConfig } from './runtime-config';
import type { IConfig } from './types';

const reduceConfig = (source: Record<string, string | number | boolean | undefined> = {}): Record<string, string> => {
  const reduced = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      reduced.set(key, String(value));
    }
  }
  return Object.fromEntries(reduced);
};

export class Config implements IConfig {
  private _config: Record<string, string> = {};

  private readonly _blacklist = new Set<string>();

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
    const resolved = new Map<string, string>();
    for (const key of Object.keys(this._config)) {
      const fromEnv = this._lookupEnv(key);
      const value = fromEnv !== undefined && fromEnv !== '' ? fromEnv : this._config[key];
      if (value !== undefined) {
        resolved.set(key, value);
      }
    }
    return Object.fromEntries(resolved);
  }

  constructor(config: Record<string, string | undefined> = {}) {
    this._config = {
      // 1. BUILD time: public config baked into the bundle via VITE_MP_CONFIG.
      //    Kept first (and kept working) so apps that bake their config in —
      //    native, static web — are unchanged.
      ...reduceConfig(bakedPublicConfig()),
      // 2. RUNTIME: the public payload the SSR document published into the
      //    browser (see runtime-config.ts). Wins over the bake so a redeployed
      //    container overrides a stale build-time value, and so an image built
      //    with an EMPTY build environment can still be configured per
      //    deployment. `process.env` is not reachable here.
      ...reduceConfig(readRuntimePublicConfig()),
      // 3. Explicit values handed to the constructor always win.
      ...reduceConfig(config),
    };
  }

  get(): Record<string, string>;
  get(key: string): string | undefined;
  get(key: string, defaultValue: string): string;
  get(key?: string, defaultValue?: string): Record<string, string> | string | undefined {
    const config = this._resolveConfig();
    if (key === undefined || key === '') {
      return config;
    }
    const value = config[key];
    return value === undefined || value === '' ? defaultValue : value;
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
    this._config = Object.fromEntries(Object.entries(this._config).filter(([existing]) => existing !== key));
    return value;
  }
}
