import { AuthModule } from './auth';
import { CallModule } from './call';
import { HttpClient } from './core/http';
import type { AuthConfig, CustomEndpoints, FrappeLiveConfig } from './core/types';
import { DbModule } from './db';
import { FileModule } from './file';
import { RealtimeModule } from './realtime';
import type { RealtimeConfig } from './realtime';
import { SyncModule } from './sync/index';

export type FrappeConfig = AuthConfig & {
  sessionId?: string;
  credentials?: RequestCredentials;
  realtimeOptions?: Partial<RealtimeConfig>;
  /** Configuration for frappe_live extension endpoints */
  frappeLive?: FrappeLiveConfig;
  /**
   * Raw cookie string forwarded on every HTTP request.
   * Use this in SSR / Node.js where the browser cookie jar is unavailable.
   *
   * @example `"sid=abc123; system_user=yes"`
   */
  cookie?: string;
};

/** Map FrappeApp auth into the subset RealtimeModule understands. */
const toRealtimeAuth = (auth: FrappeConfig): AuthConfig | undefined => {
  const hasToken = auth.useToken === true && auth.token !== undefined && auth.token !== '';
  const hasSession = auth.sessionId !== undefined && auth.sessionId !== '';
  const hasCookie = auth.cookie !== undefined && auth.cookie !== '';
  if (!hasToken && !hasSession && !hasCookie) {
    return undefined;
  }
  return {
    useToken: auth.useToken,
    token: auth.token,
    type: auth.type,
    sessionId: auth.sessionId,
    cookie: auth.cookie,
  };
};

/**
 * Main entry point for Frappe SDK
 * Orchestrates all modules and provides unified API
 */
export class FrappeApp {
  private readonly http: HttpClient;
  private readonly _db: DbModule;
  private readonly _auth: AuthModule;
  private readonly _call: CallModule;
  private readonly _file: FileModule;
  private readonly _realtime: RealtimeModule;
  private readonly _sync: SyncModule;

  constructor(baseURL: string, auth: FrappeConfig = {}, customEndpoints: CustomEndpoints = {}) {
    this.http = new HttpClient(baseURL, auth);
    // Merge constructor customEndpoints with auth.frappeLive (frappeLive wins on overlap)
    const frappeLiveConfig: FrappeLiveConfig = {
      appName: auth.frappeLive?.appName,
      writeStrategy: auth.frappeLive?.writeStrategy,
      customEndpoints: {
        ...customEndpoints,
        ...auth.frappeLive?.customEndpoints,
      },
    };
    this._db = new DbModule(this.http, frappeLiveConfig);
    this._auth = new AuthModule(this.http);
    this._call = new CallModule(this.http);
    this._file = new FileModule(this.http);

    // Configure RealtimeModule with the same credentials HTTP uses (token and/or sessionId).
    const realtimeConfig: RealtimeConfig = {
      baseURL,
      auth: toRealtimeAuth(auth),
      ...auth.realtimeOptions,
    };
    this._realtime = new RealtimeModule(realtimeConfig);

    // Initialize sync module with default options
    this._sync = new SyncModule(this._db, this._realtime, {
      pageSize: 20,
      persistKey: 'frappe-sync',
      onMutationError: (info) => {
        console.error('Mutation error:', info);
      },
      onConflict: (info) => {
        console.warn('Conflict detected:', info);
      },
    });
  }

  // Module accessors
  db() {
    return this._db;
  }
  auth() {
    return this._auth;
  }
  call() {
    return this._call;
  }
  file() {
    return this._file;
  }
  realtime() {
    return this._realtime;
  }
  sync() {
    return this._sync;
  }

  // Cleanup
  async dispose() {
    this._realtime.disconnect();
    await this._sync.dispose();
  }

  // Config management
  getConfig(): FrappeConfig {
    // SAFETY: the client was constructed with (and updateAuth only ever stores) a FrappeConfig.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return this.http.getAuthConfig() as FrappeConfig;
  }

  async updateAuth(auth: FrappeConfig) {
    this.http.updateAuth(auth);
    await this._realtime.updateAuth(toRealtimeAuth(auth) ?? {});
  }
}
