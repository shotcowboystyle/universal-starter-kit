import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Config } from './config';
import { bakedConfigEnvKey, runtimePublicConfigKey } from './runtimeConfig';

function setRuntimePayload(payload: Record<string, string>) {
  (globalThis as unknown as Record<string, unknown>)[runtimePublicConfigKey] = payload;
}

function clearRuntimePayload() {
  delete (globalThis as unknown as Record<string, unknown>)[runtimePublicConfigKey];
}

describe('Config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    clearRuntimePayload();
  });

  afterEach(() => {
    clearRuntimePayload();
  });

  describe('constructor', () => {
    it('creates an empty config when no arguments are provided', () => {
      const c = new Config();
      expect(c.get()).toEqual({});
    });

    it('creates config from provided key-value pairs', () => {
      const c = new Config({ MY_URL: 'https://example.com', MY_PORT: '3000' });
      expect(c.get('MY_URL')).toBe('https://example.com');
      expect(c.get('MY_PORT')).toBe('3000');
    });

    it('filters out undefined values from initial config', () => {
      const c = new Config({ PRESENT: 'yes', MISSING: undefined });
      expect(c.get('PRESENT')).toBe('yes');
      expect(c.get('MISSING')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('returns the full config object when called without arguments', () => {
      const c = new Config({ A: '1', B: '2' });
      expect(c.get()).toEqual({ A: '1', B: '2' });
    });

    it('returns a specific value by key', () => {
      const c = new Config({ KEY: 'value' });
      expect(c.get('KEY')).toBe('value');
    });

    it('returns undefined for a missing key', () => {
      const c = new Config();
      expect(c.get('NONEXISTENT')).toBeUndefined();
    });

    it('returns defaultValue when key is missing', () => {
      const c = new Config();
      expect(c.get('MISSING', 'fallback')).toBe('fallback');
    });

    it('returns the actual value over defaultValue when key exists', () => {
      const c = new Config({ KEY: 'real' });
      expect(c.get('KEY', 'fallback')).toBe('real');
    });

    it('prefers process.env over config values', () => {
      vi.stubEnv('OVERRIDE_KEY', 'from-env');
      const c = new Config({ OVERRIDE_KEY: 'from-config' });
      expect(c.get('OVERRIDE_KEY')).toBe('from-env');
    });
  });

  describe('set', () => {
    it('sets a value and returns it', () => {
      const c = new Config();
      const result = c.set('NEW_KEY', 'new_value');
      expect(result).toBe('new_value');
      expect(c.get('NEW_KEY')).toBe('new_value');
    });

    it('overwrites an existing value', () => {
      const c = new Config({ KEY: 'old' });
      c.set('KEY', 'new');
      expect(c.get('KEY')).toBe('new');
    });
  });

  describe('add', () => {
    it('merges multiple key-value pairs into config', () => {
      const c = new Config({ A: '1' });
      c.add({ B: '2', C: '3' });
      expect(c.get('A')).toBe('1');
      expect(c.get('B')).toBe('2');
      expect(c.get('C')).toBe('3');
    });

    it('overwrites existing keys', () => {
      const c = new Config({ KEY: 'old' });
      c.add({ KEY: 'new' });
      expect(c.get('KEY')).toBe('new');
    });

    it('returns the full resolved config', () => {
      const c = new Config({ A: '1' });
      const result = c.add({ B: '2' });
      expect(result).toEqual({ A: '1', B: '2' });
    });
  });

  describe('remove', () => {
    it('removes a key and returns its value', () => {
      const c = new Config({ KEY: 'value' });
      const result = c.remove('KEY');
      expect(result).toBe('value');
      expect(c.get('KEY')).toBeUndefined();
    });

    it('returns undefined when removing a non-existent key', () => {
      const c = new Config();
      expect(c.remove('MISSING')).toBeUndefined();
    });
  });

  describe('env precedence', () => {
    it('process.env takes precedence even after set()', () => {
      vi.stubEnv('ENV_KEY', 'env-value');
      const c = new Config();
      c.set('ENV_KEY', 'config-value');
      expect(c.get('ENV_KEY')).toBe('env-value');
    });

    it('only resolves keys that exist in the config map', () => {
      vi.stubEnv('ORPHAN_ENV', 'exists-in-env');
      const c = new Config();
      expect(c.get('ORPHAN_ENV')).toBeUndefined();
    });

    it('resolves env for keys added via add()', () => {
      vi.stubEnv('ADDED_KEY', 'env-wins');
      const c = new Config();
      c.add({ ADDED_KEY: 'config-value' });
      expect(c.get('ADDED_KEY')).toBe('env-wins');
    });
  });

  describe('runtime public config published by the SSR document', () => {
    it('resolves MARKETPLACE_API_URL from the runtime payload with no build-time VITE_MP_CONFIG', () => {
      // The exact production shape: an image built by CI with an EMPTY build
      // environment (no VITE_MP_CONFIG baked), configured per deployment by
      // the container env, which the SSR document publishes to the browser.
      setRuntimePayload({ MARKETPLACE_API_URL: 'https://api.marketplace.example.org' });
      const c = new Config();
      expect(c.get('MARKETPLACE_API_URL')).toBe('https://api.marketplace.example.org');
    });

    it('resolves FRAPPE_ENABLED from the runtime payload so the frappe provider can mount', () => {
      // CreateApp.tsx gates FrappeProvider on config.get("FRAPPE_ENABLED") === "1".
      setRuntimePayload({ FRAPPE_ENABLED: '1' });
      const c = new Config();
      expect(c.get('FRAPPE_ENABLED')).toBe('1');
    });

    // These use MARKETPLACE_API_URL rather than BASE_URL on purpose: vite (and
    // therefore vitest) publishes its own BASE_URL="/" into process.env, and
    // _lookupEnv still outranks everything on the SERVER — so a BASE_URL
    // fixture would measure vite's value, not the precedence under test.
    it('prefers the runtime payload over a stale build-time baked value', () => {
      vi.stubEnv(bakedConfigEnvKey, JSON.stringify({ MARKETPLACE_API_URL: 'https://stale.example.org' }));
      setRuntimePayload({ MARKETPLACE_API_URL: 'https://fresh.example.org' });
      const c = new Config();
      expect(c.get('MARKETPLACE_API_URL')).toBe('https://fresh.example.org');
    });

    it('still resolves the build-time baked value when no runtime payload exists', () => {
      vi.stubEnv(bakedConfigEnvKey, JSON.stringify({ MARKETPLACE_API_URL: 'https://baked.example.org' }));
      const c = new Config();
      expect(c.get('MARKETPLACE_API_URL')).toBe('https://baked.example.org');
    });

    it('lets explicit constructor values win over the runtime payload', () => {
      setRuntimePayload({ MARKETPLACE_API_URL: 'https://runtime.example.org' });
      const c = new Config({ MARKETPLACE_API_URL: 'https://explicit.example.org' });
      expect(c.get('MARKETPLACE_API_URL')).toBe('https://explicit.example.org');
    });
  });
});
