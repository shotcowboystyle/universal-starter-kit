/**
 * Native storage twin — backend priority: MMKV (react-native-mmkv v4,
 * synchronous JSI/Nitro) → AsyncStorage (environments without Nitro, e.g.
 * Expo Go) → in-memory Map (nothing survives a restart).
 *
 * react-native-mmkv v4 exports `MMKV` as a TYPE only — the runtime API is
 * the `createMMKV()` factory. The previous implementation destructured the
 * non-existent `MMKV` class (v3 API) and threw `undefined is not a
 * constructor` on every launch, silently landing all native persistence on
 * the in-memory fallback (favorites lost on restart — 2026-08-13 iOS smoke
 * test). Resolution is therefore
 * factored into a pure, loader-injectable function (spec-covered) and the
 * chosen backend is logged once in dev — a degraded backend can never be
 * silent again.
 */

import type { Storage } from '../persist';

export type NativeStorageBackend = 'mmkv' | 'async-storage' | 'memory';

/** Runtime subset of react-native-mmkv v4's MMKV HybridObject. */
interface MMKVLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Module loaders, injectable so specs can drive every resolution branch. */
export interface NativeStorageLoaders {
  /** Load react-native-mmkv (throws when unavailable). */
  loadMMKV(): unknown;
  /** Load @react-native-async-storage/async-storage (throws when unavailable). */
  loadAsyncStorage(): unknown;
}

export interface NativeStorageResolution {
  storage: Storage;
  backend: NativeStorageBackend;
  /** Why higher-priority backends were skipped (surfaced by the dev log). */
  errors: { mmkv?: unknown; asyncStorage?: unknown };
}

const defaultLoaders: NativeStorageLoaders = {
  // Literal require(...) calls on purpose: metro resolves them natively and
  // vxrn/rolldown rewrites literal requires into bundled module inits (a
  // passed-around `require` reference would survive as a bare identifier and
  // crash). Lazy so a genuinely missing native module throws HERE — inside
  // the try/catch — instead of at bundle evaluation.
  loadMMKV: () => require('react-native-mmkv'),
  loadAsyncStorage: () => require('@react-native-async-storage/async-storage'),
};

export function resolveNativeStorage(loaders: NativeStorageLoaders = defaultLoaders): NativeStorageResolution {
  const errors: NativeStorageResolution['errors'] = {};

  try {
    const mmkvModule = loaders.loadMMKV() as {
      createMMKV?: (configuration?: unknown) => MMKVLike;
    };
    if (typeof mmkvModule?.createMMKV !== 'function') {
      // v3 shipped an `MMKV` class; v4 only ships the factory. Anything
      // without createMMKV() is not a usable react-native-mmkv module.
      throw new Error('no createMMKV() export (react-native-mmkv v4 API expected)');
    }
    const mmkv = mmkvModule.createMMKV();
    return {
      backend: 'mmkv',
      errors,
      storage: {
        getItem: (name: string) => mmkv.getString(name) ?? null,
        setItem: (name: string, value: string) => {
          mmkv.set(name, value);
        },
        removeItem: (name: string) => {
          mmkv.remove(name);
        },
      },
    };
  } catch (err) {
    errors.mmkv = err;
  }

  try {
    const asyncStorageModule = loaders.loadAsyncStorage() as { default?: AsyncStorageLike };
    const asyncStorage = asyncStorageModule?.default;
    if (!asyncStorage || typeof asyncStorage.getItem !== 'function') {
      throw new Error('no usable default export on @react-native-async-storage/async-storage');
    }
    return {
      backend: 'async-storage',
      errors,
      storage: {
        getItem: (name: string) => asyncStorage.getItem(name),
        setItem: (name: string, value: string) => asyncStorage.setItem(name, value),
        removeItem: (name: string) => asyncStorage.removeItem(name),
      },
    };
  } catch (err) {
    errors.asyncStorage = err;
  }

  const map = new Map<string, string>();
  return {
    backend: 'memory',
    errors,
    storage: {
      getItem: (name: string) => map.get(name) ?? null,
      setItem: (name: string, value: string) => {
        map.set(name, value);
      },
      removeItem: (name: string) => {
        map.delete(name);
      },
    },
  };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * One dev-mode line naming the winning backend — a console.warn when
 * persistence degraded, so a broken storage twin is loud instead of silent.
 */
export function logNativeStorageResolution(
  resolution: NativeStorageResolution,
  logger: Pick<Console, 'info' | 'warn'> = console,
): void {
  if (resolution.backend === 'mmkv') {
    logger.info('[@repo/store] native storage backend: mmkv');
    return;
  }
  const causes = [`react-native-mmkv unavailable: ${describeError(resolution.errors.mmkv)}`];
  if (resolution.backend === 'memory') {
    causes.push(`async-storage unavailable: ${describeError(resolution.errors.asyncStorage)}`);
  }
  logger.warn(
    `[@repo/store] native storage fell back to ${resolution.backend}` +
      (resolution.backend === 'memory' ? ' — persisted state will NOT survive app restarts' : '') +
      ` (${causes.join('; ')})`,
  );
}

const resolution = resolveNativeStorage();
// NODE_ENV !== "test" keeps vitest imports of this module quiet; specs cover
// the log contract by calling logNativeStorageResolution directly.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  logNativeStorageResolution(resolution);
}

export const storage: Storage = resolution.storage;
