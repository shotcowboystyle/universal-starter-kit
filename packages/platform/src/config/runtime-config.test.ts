import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bakedConfigEnvKey,
  publicConfigKeysEnvKey,
  readRuntimePublicConfig,
  resolvePublicConfig,
  runtimePublicConfigKey,
  serializeRuntimePublicConfig,
} from './runtime-config';

const stubAllowlist = (keys: string[]) => {
  vi.stubEnv(publicConfigKeysEnvKey, JSON.stringify(keys));
};

const stubBaked = (config: Record<string, string>) => {
  vi.stubEnv(bakedConfigEnvKey, JSON.stringify(config));
};

const clearRuntimePayload = () => {
  Reflect.deleteProperty(globalThis, runtimePublicConfigKey);
};

describe('runtime public config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearRuntimePayload();
  });

  describe(resolvePublicConfig, () => {
    it('resolves a public key from the RUNTIME environment, not the build', () => {
      stubAllowlist(['MARKETPLACE_API_URL']);
      expect(resolvePublicConfig({ MARKETPLACE_API_URL: 'https://api.marketplace.example.org' })).toStrictEqual({
        MARKETPLACE_API_URL: 'https://api.marketplace.example.org',
      });
    });

    it('lets the runtime environment override a stale baked value', () => {
      stubAllowlist(['MARKETPLACE_API_URL']);
      stubBaked({ MARKETPLACE_API_URL: 'https://stale.example.org' });
      expect(resolvePublicConfig({ MARKETPLACE_API_URL: 'https://fresh.example.org' })).toStrictEqual({
        MARKETPLACE_API_URL: 'https://fresh.example.org',
      });
    });

    it('falls back to the baked value when the runtime environment is empty', () => {
      stubAllowlist(['MARKETPLACE_API_URL']);
      stubBaked({ MARKETPLACE_API_URL: 'https://baked.example.org' });
      expect(resolvePublicConfig({})).toStrictEqual({
        MARKETPLACE_API_URL: 'https://baked.example.org',
      });
    });

    it('resolves nothing when the build baked no public allowlist', () => {
      expect(resolvePublicConfig({ MARKETPLACE_API_URL: 'https://api.example.org' })).toStrictEqual({});
    });
  });

  describe('public allowlist enforcement', () => {
    it('never resolves a key that is absent from the build-time public allowlist', () => {
      stubAllowlist(['MARKETPLACE_API_URL']);
      const resolved = resolvePublicConfig({
        MARKETPLACE_API_URL: 'https://api.example.org',
        SECRET: 'hunter2',
        DATABASE_PASSWORD: 'hunter2', // gitleaks:allow -- test fixture
      });
      expect(resolved).toStrictEqual({ MARKETPLACE_API_URL: 'https://api.example.org' });
      expect(resolved).not.toHaveProperty('SECRET');
      expect(resolved).not.toHaveProperty('DATABASE_PASSWORD');
    });

    it('never serializes a private key into the document payload', () => {
      stubAllowlist(['MARKETPLACE_API_URL', 'ANALYTICS_ENABLED']);
      const payload = serializeRuntimePublicConfig(
        resolvePublicConfig({
          MARKETPLACE_API_URL: 'https://api.example.org',
          ANALYTICS_ENABLED: '1',
          SECRET: 'hunter2',
        }),
      );
      expect(payload).toContain('MARKETPLACE_API_URL');
      expect(payload).toContain('ANALYTICS_ENABLED');
      expect(payload).not.toContain('SECRET');
      expect(payload).not.toContain('hunter2');
    });
  });

  describe(serializeRuntimePublicConfig, () => {
    it('assigns the payload to the runtime global key', () => {
      stubAllowlist(['ANALYTICS_ENABLED']);
      expect(serializeRuntimePublicConfig(resolvePublicConfig({ ANALYTICS_ENABLED: '1' }))).toBe(
        `globalThis["${runtimePublicConfigKey}"]={"ANALYTICS_ENABLED":"1"};`,
      );
    });

    it('escapes characters that could break out of the inline script', () => {
      stubAllowlist(['BASE_URL']);
      const payload = serializeRuntimePublicConfig(
        resolvePublicConfig({ BASE_URL: '</script><script>alert(1)</script>' }),
      );
      expect(payload).not.toContain('</script>');
      expect(payload).toContain('\\u003c');
    });

    it('emits an empty object rather than throwing when nothing resolves', () => {
      expect(serializeRuntimePublicConfig({})).toBe(`globalThis["${runtimePublicConfigKey}"]={};`);
    });
  });

  describe(readRuntimePublicConfig, () => {
    it('reads the payload the SSR document published', () => {
      globalThis[runtimePublicConfigKey] = {
        MARKETPLACE_API_URL: 'https://api.example.org',
      };
      expect(readRuntimePublicConfig()).toStrictEqual({
        MARKETPLACE_API_URL: 'https://api.example.org',
      });
    });

    it('returns undefined when no document published a payload', () => {
      expect(readRuntimePublicConfig()).toBeUndefined();
    });

    it('ignores a payload that is not a plain object', () => {
      globalThis[runtimePublicConfigKey] = ['nope'];
      expect(readRuntimePublicConfig()).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Twin parity
// ---------------------------------------------------------------------------
describe('runtimeConfig has no import.meta and bakes through static process.env reads', () => {
  // vitest runs this package with cwd at its root and a browser-like
  // environment where import.meta.url is not a file: URL, so anchor on cwd.
  const here = path.resolve(process.cwd(), 'src/config');
  const source = readFileSync(`${here}/runtime-config.ts`, 'utf-8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

  it('contains no import.meta token, because a classic script (Expo DOM component, Hermes) cannot even parse one', () => {
    expect(source).not.toMatch(/import\.meta/u);
  });

  it('reads each baked key as a static process.env member expression, the only spelling bundlers inline', () => {
    expect(source).toMatch(/process\.env\.VITE_MP_CONFIG\b/u);
    expect(source).toMatch(/process\.env\.VITE_MP_PUBLIC_CONFIG_KEYS\b/u);
  });

  it("has no platform twin, because One's web build and tamagui-build resolve .web.ts like Metro and a twin replaced the bake once", () => {
    const twins = ['runtime-config.web.ts', 'runtime-config.native.ts', 'runtime-config.classic.ts'];
    expect(twins.filter((twin) => existsSync(`${here}/${twin}`))).toStrictEqual([]);
  });
});
