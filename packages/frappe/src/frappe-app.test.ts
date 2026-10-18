import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModule } from './auth';
import { CallModule } from './call';
import { HttpClient } from './core/http';
import { AuthType } from './core/types';
import type { AuthConfig } from './core/types';
import { DbModule } from './db';
import { FileModule } from './file';
import { FrappeApp } from './frappe-app';
import { RealtimeModule } from './realtime';
import { SyncModule } from './sync';

// Mock all dependencies
vi.mock(import('./core/http'));
vi.mock(import('./db'));
vi.mock(import('./auth'));
vi.mock(import('./call'));
vi.mock(import('./file'));
vi.mock(import('./realtime'));
vi.mock(import('./sync'));

class MockHttpClient {
  getAuthConfig = vi.fn<() => AuthConfig>();
  updateAuth = vi.fn<(auth: AuthConfig) => void>();
}

class MockRealtimeModule {
  disconnect = vi.fn<() => void>();
  updateAuth = vi.fn<(auth: AuthConfig) => Promise<void>>();
}

class MockSyncModule {
  dispose = vi.fn<() => Promise<void>>();
}

const MockModule = function MockModule(this: any) {
  return this;
};

describe(FrappeApp, () => {
  let app: FrappeApp;
  const baseURL = 'https://api.example.com';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock constructors - must be constructible (classes or function
    // expressions), not arrow functions
    vi.mocked(HttpClient).mockImplementation(MockHttpClient as any);
    vi.mocked(DbModule).mockImplementation(MockModule as any);
    vi.mocked(AuthModule).mockImplementation(MockModule as any);
    vi.mocked(CallModule).mockImplementation(MockModule as any);
    vi.mocked(FileModule).mockImplementation(MockModule as any);
    vi.mocked(RealtimeModule).mockImplementation(MockRealtimeModule as any);
    vi.mocked(SyncModule).mockImplementation(MockSyncModule as any);
  });

  describe('constructor', () => {
    it('should initialize with base URL only', () => {
      app = new FrappeApp(baseURL);

      expect(HttpClient).toHaveBeenCalledWith(baseURL, {});
      expect(DbModule).toHaveBeenCalledWith(
        expect.any(Object),
        // oxlint-disable-next-line sonarjs/no-undefined-assignment -- asserts the option is passed through unset
        expect.objectContaining({ appName: undefined, customEndpoints: {} }),
      );
      expect(AuthModule).toHaveBeenCalledWith(expect.any(Object));
      expect(CallModule).toHaveBeenCalledWith(expect.any(Object));
      expect(FileModule).toHaveBeenCalledWith(expect.any(Object));
      expect(RealtimeModule).toHaveBeenCalledWith(expect.objectContaining({ baseURL }));
      expect(SyncModule).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          pageSize: 20,
          persistKey: 'frappe-sync',
        }),
      );
    });

    it('should initialize with auth config', () => {
      const auth = {
        sessionId: 'session-123',
        credentials: 'include' as RequestCredentials,
      };

      app = new FrappeApp(baseURL, auth);

      expect(HttpClient).toHaveBeenCalledWith(baseURL, auth);
      expect(RealtimeModule).toHaveBeenCalledWith(expect.objectContaining({ baseURL }));
    });

    it('should initialize with custom endpoints', () => {
      const customEndpoints = {
        createDoc: '/custom/create-doc',
        backfill: '/custom/backfill',
      };

      app = new FrappeApp(baseURL, {}, customEndpoints);

      expect(DbModule).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ customEndpoints }));
    });

    it('should initialize with all parameters', () => {
      const auth = {
        sessionId: 'session-123',
        token: 'bearer-token',
      };
      const customEndpoints = {
        createDoc: '/custom/create-doc',
      };

      app = new FrappeApp(baseURL, auth, customEndpoints);

      expect(HttpClient).toHaveBeenCalledWith(baseURL, auth);
      expect(DbModule).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ customEndpoints }));
      expect(RealtimeModule).toHaveBeenCalledWith(expect.objectContaining({ baseURL }));
    });

    it('should pass sync options with default callbacks', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      app = new FrappeApp(baseURL);

      const syncOptions = vi.mocked(SyncModule).mock.lastCall?.[2];

      // Test error callback
      syncOptions?.onMutationError?.({ error: 'test error' } as any);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Mutation error:', {
        error: 'test error',
      });

      // Test conflict callback
      syncOptions?.onConflict?.({ conflict: 'test conflict' } as any);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Conflict detected:', {
        conflict: 'test conflict',
      });

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('module accessors', () => {
    beforeEach(() => {
      app = new FrappeApp(baseURL);
    });

    it('should return db module', () => {
      const db = app.db();
      expect(db).toBeDefined();
      expect(DbModule).toHaveBeenCalledOnce();
    });

    it('should return auth module', () => {
      const auth = app.auth();
      expect(auth).toBeDefined();
      expect(AuthModule).toHaveBeenCalledOnce();
    });

    it('should return call module', () => {
      const call = app.call();
      expect(call).toBeDefined();
      expect(CallModule).toHaveBeenCalledOnce();
    });

    it('should return file module', () => {
      const file = app.file();
      expect(file).toBeDefined();
      expect(FileModule).toHaveBeenCalledOnce();
    });

    it('should return realtime module', () => {
      const realtime = app.realtime();
      expect(realtime).toBeDefined();
      expect(RealtimeModule).toHaveBeenCalledOnce();
    });

    it('should return sync module', () => {
      const sync = app.sync();
      expect(sync).toBeDefined();
      expect(SyncModule).toHaveBeenCalledOnce();
    });

    it('should always return the same module instances', () => {
      const db1 = app.db();
      const db2 = app.db();
      expect(db1).toBe(db2);

      const auth1 = app.auth();
      const auth2 = app.auth();
      expect(auth1).toBe(auth2);

      const call1 = app.call();
      const call2 = app.call();
      expect(call1).toBe(call2);

      const file1 = app.file();
      const file2 = app.file();
      expect(file1).toBe(file2);

      const realtime1 = app.realtime();
      const realtime2 = app.realtime();
      expect(realtime1).toBe(realtime2);

      const sync1 = app.sync();
      const sync2 = app.sync();
      expect(sync1).toBe(sync2);
    });
  });

  describe('dispose', () => {
    it('should disconnect realtime and dispose sync', async () => {
      app = new FrappeApp(baseURL);

      const realtimeModule = app.realtime() as unknown as MockRealtimeModule;
      const syncModule = app.sync() as unknown as MockSyncModule;

      await app.dispose();

      expect(realtimeModule.disconnect).toHaveBeenCalledWith();
      expect(syncModule.dispose).toHaveBeenCalledWith();
    });

    it('should handle dispose errors gracefully', async () => {
      app = new FrappeApp(baseURL);

      const syncModule = app.sync() as unknown as MockSyncModule;
      syncModule.dispose.mockRejectedValue(new Error('Disposal failed'));

      await expect(app.dispose()).rejects.toThrow('Disposal failed');
    });
  });

  describe('getConfig', () => {
    it('should return auth config from http client', () => {
      app = new FrappeApp(baseURL);

      const mockConfig = {
        sessionId: 'session-456',
        token: 'token-789',
      };

      const httpClient = (app as any).http;
      vi.mocked(httpClient.getAuthConfig).mockReturnValue(mockConfig);

      const config = app.getConfig();

      expect(config).toStrictEqual(mockConfig);
      expect(httpClient.getAuthConfig).toHaveBeenCalledWith();
    });

    it('should return empty config when no auth set', () => {
      app = new FrappeApp(baseURL);

      const httpClient = (app as any).http;
      vi.mocked(httpClient.getAuthConfig).mockReturnValue({});

      const config = app.getConfig();

      expect(config).toStrictEqual({});
    });
  });

  describe('updateAuth', () => {
    it('should update auth in http client and realtime', async () => {
      app = new FrappeApp(baseURL);

      const newAuth = {
        useToken: true,
        token: 'new-token',
        type: AuthType.Bearer,
      };

      const httpClient = (app as any).http;
      const realtimeModule = app.realtime() as unknown as MockRealtimeModule;

      await app.updateAuth(newAuth);

      expect(httpClient.updateAuth).toHaveBeenCalledWith(newAuth);
      expect(realtimeModule.updateAuth).toHaveBeenCalledWith({
        useToken: true,
        token: 'new-token',
        type: AuthType.Bearer,
      });
    });

    it('should handle partial auth updates', async () => {
      app = new FrappeApp(baseURL);

      const partialAuth = {
        token: 'updated-token',
      };

      const httpClient = (app as any).http;
      const realtimeModule = app.realtime() as unknown as MockRealtimeModule;

      await app.updateAuth(partialAuth);

      expect(httpClient.updateAuth).toHaveBeenCalledWith(partialAuth);
      // Without useToken, realtime gets empty auth
      expect(realtimeModule.updateAuth).toHaveBeenCalledWith({});
    });

    it('should handle empty auth update', async () => {
      app = new FrappeApp(baseURL);

      const httpClient = (app as any).http;
      const realtimeModule = app.realtime() as unknown as MockRealtimeModule;

      await app.updateAuth({});

      expect(httpClient.updateAuth).toHaveBeenCalledWith({});
      expect(realtimeModule.updateAuth).toHaveBeenCalledWith({});
    });
  });

  describe('integration scenarios', () => {
    it('should properly wire modules together', () => {
      app = new FrappeApp(baseURL);

      // Verify DbModule received HttpClient instance and FrappeLiveConfig
      expect(DbModule).toHaveBeenCalledWith(
        expect.objectContaining({
          getAuthConfig: expect.any(Function),
          updateAuth: expect.any(Function),
        }),
        expect.objectContaining({
          // oxlint-disable-next-line sonarjs/no-undefined-assignment -- asserts the option is passed through unset
          appName: undefined,
          customEndpoints: {},
        }),
      );

      // Verify AuthModule received HttpClient instance
      expect(AuthModule).toHaveBeenCalledWith(
        expect.objectContaining({
          getAuthConfig: expect.any(Function),
          updateAuth: expect.any(Function),
        }),
      );

      // Verify SyncModule received DbModule and RealtimeModule instances
      // Arguments: DbModule instance, RealtimeModule instance, options.
      expect(SyncModule).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          disconnect: expect.any(Function),
          updateAuth: expect.any(Function),
        }),
        expect.any(Object),
      );
    });

    it('should create independent instances', () => {
      const app1 = new FrappeApp(baseURL);
      const app2 = new FrappeApp('https://other.example.com');

      expect(app1).not.toBe(app2);
      expect(app1.db()).not.toBe(app2.db());
      expect(app1.auth()).not.toBe(app2.auth());
      expect(app1.sync()).not.toBe(app2.sync());
    });

    it('should handle different auth configurations for different instances', () => {
      expect(new FrappeApp(baseURL, { sessionId: 'session1' })).toBeInstanceOf(FrappeApp);
      expect(new FrappeApp(baseURL, { token: 'token2' })).toBeInstanceOf(FrappeApp);

      expect(HttpClient).toHaveBeenNthCalledWith(1, baseURL, {
        sessionId: 'session1',
      });
      expect(HttpClient).toHaveBeenNthCalledWith(2, baseURL, {
        token: 'token2',
      });
    });
  });
});
