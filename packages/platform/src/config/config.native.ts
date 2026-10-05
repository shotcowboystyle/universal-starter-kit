import constants from 'expo-constants';

import { resolveDevOrigin } from './devOrigin';
import type { IConfig } from './types';

export class Config implements IConfig {
  private _config: Record<string, string> = {};

  private _blacklist: Set<string> = new Set([]);

  private _lookupEnv(key: string): string | undefined {
    if (this._blacklist.has(key)) {
      return undefined;
    }
    return process?.env?.[key];
  }

  private _resolveConfig() {
    return Object.keys(this._config).reduce<Record<string, string>>((config, key) => {
      const value = this._lookupEnv(key) || this._config[key];
      if (typeof value !== 'undefined') {
        config[key] = resolveDevOrigin(value);
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
    let viteConfig: Record<string, string | undefined> = {};
    try {
      viteConfig = JSON.parse('{}');
    } catch {}
    this._config = {
      ...this._reduceConfig(typeof viteConfig === 'object' ? viteConfig : {}),
      ...this._reduceConfig(constants.expoConfig?.extra || {}),
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
