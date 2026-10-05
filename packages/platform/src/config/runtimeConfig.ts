/**
 * Build-time and runtime public config, with no `import.meta` anywhere.
 *
 * Why no `import.meta`: two bundles execute mpo as a CLASSIC script rather
 * than an ES module, and in a classic script `import.meta` is a PARSE-time
 * SyntaxError, so no `typeof import.meta` guard ever runs: the vxrn/rolldown
 * native bundle for Hermes, and any Metro bundle for platform=web, which is
 * what an Expo DOM component (`'use dom'`) and Expo web are (a
 * knob-driven component inside a DOM component blanked the whole WebView with
 * no diagnostics). A `.web.ts` / `.native.ts` twin is not a way out either:
 * One's web build and tamagui-build both resolve `.web.ts` exactly as Metro
 * does, so a web twin replaced this module in the Vite web build too and the
 * bake vanished there. One file, one behaviour.
 *
 * Baking: `createViteConfig` sets `VITE_MP_CONFIG` (values) and
 * `VITE_MP_PUBLIC_CONFIG_KEYS` (names) on `process.env` and defines both as
 * `process.env.<KEY>` for the bundle; `bakedEnv` below reads exactly those two
 * static expressions. The SSR document path (`readRuntimePublicConfig`) is
 * unchanged: the node process resolves the allowlisted names from its own
 * environment at request time and publishes them under
 * `globalThis.__mp_public_config__`.
 *
 * Safety: `resolvePublicConfig` walks the BUILD-TIME PUBLIC ALLOWLIST, never
 * the environment, so a private key present in `env` can not reach the
 * returned object.
 */

/** Global the SSR document publishes the resolved public config under. */
export const runtimePublicConfigKey = '__mp_public_config__';

/**
 * Build-time env key carrying the JSON array of PUBLIC config key names. Names
 * only, never a value: the SSR node process resolves values from its own
 * environment at request time, so one build deploys to every environment.
 */
export const publicConfigKeysEnvKey = 'VITE_MP_PUBLIC_CONFIG_KEYS';

/**
 * Build-time env key carrying the JSON object of public config values
 * resolved from the BUILD environment. Still honored so apps that bake their
 * config in (native, GNOME, static web) keep working unchanged.
 */
export const bakedConfigEnvKey = 'VITE_MP_CONFIG';

/**
 * The two baked keys, read as STATIC `process.env.<KEY>` member expressions.
 * That exact spelling is what every bundler on the way to a browser inlines:
 * `createViteConfig` defines both keys (like `process.env.VITE_FRAPPE_ENABLED`),
 * vxrn's loadEnv under One defines every public key the same way, and Metro's
 * babel does the same for `EXPO_PUBLIC_*`. A dynamic `env[key]` read is never
 * inlined, and One's client build folds `typeof process` to "undefined", so
 * anything that consults the environment first returns `{}` before the bake
 * is ever seen. Where nothing defined the keys and `process` does not exist,
 * the reads throw and the catch returns `{}`.
 */
function bakedEnv(): Record<string, string | undefined> {
  try {
    return {
      VITE_MP_CONFIG: process.env.VITE_MP_CONFIG,
      VITE_MP_PUBLIC_CONFIG_KEYS: process.env.VITE_MP_PUBLIC_CONFIG_KEYS,
    };
  } catch {
    return {};
  }
}

function processEnv(): Record<string, string | undefined> {
  try {
    // `process` is undefined in the browser; a bare `process?.env` would
    // still throw ReferenceError on an undeclared identifier.
    if (typeof process === 'undefined') {
      return {};
    }
    return (process.env || {}) as Record<string, string | undefined>;
  } catch {
    return {};
  }
}

function readBuildEnv(key: string): string | undefined {
  return bakedEnv()[key] ?? processEnv()[key];
}

function parseJson(raw: string | undefined): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function stringifyValues(source: Record<string, unknown>): Record<string, string> {
  return Object.entries(source).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value !== 'undefined' && value !== null) {
      acc[key] = String(value);
    }
    return acc;
  }, {});
}

/**
 * The PUBLIC key allowlist baked at build time. Empty when the app was not
 * built through `createViteConfig` (tests, storybook, plain node), in which
 * case nothing is publishable and the payload stays empty, which is the safe
 * direction to fail.
 */
export function publicConfigKeys(): string[] {
  const parsed = parseJson(readBuildEnv(publicConfigKeysEnvKey));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((key): key is string => typeof key === 'string' && key.length > 0);
}

/** Public config values baked into the bundle at BUILD time. */
export function bakedPublicConfig(): Record<string, string> {
  const parsed = parseJson(readBuildEnv(bakedConfigEnvKey));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return stringifyValues(parsed as Record<string, unknown>);
}

/**
 * Resolve the public config the SSR document should publish.
 *
 * Iterates the ALLOWLIST, never the environment, so a private key present in
 * `env` can not reach the returned object. Runtime env wins over the
 * build-time bake, so a redeployed container overrides a stale baked value.
 */
export function resolvePublicConfig(env: Record<string, string | undefined> = processEnv()): Record<string, string> {
  const baked = bakedPublicConfig();
  return publicConfigKeys().reduce<Record<string, string>>((acc, key) => {
    const value = env[key] ?? baked[key];
    if (typeof value === 'string' && value.length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

/** The config the served document published, when there is one. */
export function readRuntimePublicConfig(): Record<string, string> | undefined {
  const raw = (globalThis as unknown as Record<string, unknown>)[runtimePublicConfigKey];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  return stringifyValues(raw as Record<string, unknown>);
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value ?? {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** The inline script the SSR document carries so the client can read the config. */
export function serializeRuntimePublicConfig(config: Record<string, string> = resolvePublicConfig()): string {
  return `globalThis[${JSON.stringify(runtimePublicConfigKey)}]=${safeJsonStringify(config)};`;
}
