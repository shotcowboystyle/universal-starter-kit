/**
 * Shared mock factories for workspace packages.
 *
 * Provides mock Frappe API and Keycloak auth context for testing.
 *
 * @example
 * ```ts
 * import { createMockFrappeApp, mockDocList, createMockKeycloakContext } from "@repo/test-utils/mocks";
 *
 * const mockApp = createMockFrappeApp();
 * mockDocList(mockApp, "ToDo", [{ name: "TODO-001", description: "Buy milk" }]);
 * ```
 */

import { vi } from 'vitest';

// ─── Frappe API Mocks ────────────────────────────────────────────────────────

export interface MockDbModule {
  getDocList: ReturnType<typeof vi.fn>;
  getDoc: ReturnType<typeof vi.fn>;
  createDoc: ReturnType<typeof vi.fn>;
  updateDoc: ReturnType<typeof vi.fn>;
  deleteDoc: ReturnType<typeof vi.fn>;
  getCount: ReturnType<typeof vi.fn>;
  getValue: ReturnType<typeof vi.fn>;
  setValue: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

export interface MockCallModule {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

export interface MockAuthModule {
  getLoggedInUser: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
}

export interface MockFileModule {
  uploadFile: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
  getFileURL: ReturnType<typeof vi.fn>;
}

export interface MockFrappeApp {
  db: MockDbModule;
  call: MockCallModule;
  auth: MockAuthModule;
  file: MockFileModule;
}

/**
 * Create a mock FrappeApp with all modules stubbed.
 * Each module method is a vi.fn() that can be configured with
 * the helper functions below.
 */
export function createMockFrappeApp(): MockFrappeApp {
  return {
    db: {
      getDocList: vi.fn().mockResolvedValue([]),
      getDoc: vi.fn().mockResolvedValue(null),
      createDoc: vi.fn().mockResolvedValue({}),
      updateDoc: vi.fn().mockResolvedValue({}),
      deleteDoc: vi.fn().mockResolvedValue({ message: 'ok' }),
      getCount: vi.fn().mockResolvedValue(0),
      getValue: vi.fn().mockResolvedValue(null),
      setValue: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(false),
    },
    call: {
      get: vi.fn().mockResolvedValue({ message: {} }),
      post: vi.fn().mockResolvedValue({ message: {} }),
    },
    auth: {
      getLoggedInUser: vi.fn().mockResolvedValue('Administrator'),
      login: vi.fn().mockResolvedValue({}),
      logout: vi.fn().mockResolvedValue({}),
    },
    file: {
      uploadFile: vi.fn().mockResolvedValue({ file_url: '/files/test.pdf' }),
      deleteFile: vi.fn().mockResolvedValue({ message: 'ok' }),
      getFileURL: vi.fn().mockReturnValue('/files/test.pdf'),
    },
  };
}

/**
 * Mock `db.getDocList` to return specific data for a doctype.
 */
export function mockDocList(mockApp: MockFrappeApp, doctype: string, data: Record<string, any>[]) {
  mockApp.db.getDocList.mockImplementation(async (dt: string) => {
    if (dt === doctype) {
      return data;
    }
    return [];
  });
}

/**
 * Mock `db.getDoc` to return specific data for a doctype + name.
 */
export function mockGetDoc(mockApp: MockFrappeApp, doctype: string, name: string, data: Record<string, any>) {
  mockApp.db.getDoc.mockImplementation(async (dt: string, n: string) => {
    if (dt === doctype && n === name) {
      return data;
    }
    return null;
  });
}

/**
 * Mock `db.createDoc` to return the created document data.
 */
export function mockCreateDoc(mockApp: MockFrappeApp, doctype: string, returnData: Record<string, any>) {
  mockApp.db.createDoc.mockImplementation(async (dt: string, doc: Record<string, any>) => {
    if (dt === doctype) {
      return { ...doc, ...returnData };
    }
    return {};
  });
}

/**
 * Mock `db.updateDoc` to return the updated document data.
 */
export function mockUpdateDoc(mockApp: MockFrappeApp, doctype: string, name: string, returnData: Record<string, any>) {
  mockApp.db.updateDoc.mockImplementation(async (dt: string, n: string, doc: Record<string, any>) => {
    if (dt === doctype && n === name) {
      return { name: n, ...doc, ...returnData };
    }
    return {};
  });
}

/**
 * Mock `db.deleteDoc` to succeed for a specific doctype + name.
 */
export function mockDeleteDoc(mockApp: MockFrappeApp, doctype: string, name: string) {
  mockApp.db.deleteDoc.mockImplementation(async (dt: string, n: string) => {
    if (dt === doctype && n === name) {
      return { message: 'ok' };
    }
    throw new Error(`Document ${dt}/${n} not found`);
  });
}

// ─── Keycloak Auth Mocks ─────────────────────────────────────────────────────

export interface MockKeycloakOptions {
  /** Whether the user is authenticated. Defaults to false. */
  authenticated?: boolean;
  /** Realm roles the user has. Defaults to []. */
  roles?: string[];
  /** JWT token string. Defaults to "mock-jwt-token". */
  token?: string;
  /** User information. */
  user?: {
    email?: string;
    name?: string;
    sub?: string;
  };
}

export interface MockKeycloakContext {
  authenticated: boolean;
  token: string | undefined;
  tokenParsed:
    | {
        email?: string;
        name?: string;
        preferred_username?: string;
        sub: string;
        realm_access?: { roles: string[] };
      }
    | undefined;
  idToken: string | undefined;
  refreshToken: string | undefined;
  realmAccess: { roles: string[] } | undefined;
  subject: string | undefined;
  email: string | undefined;
  username: string | undefined;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  hasRealmRole: (role: string) => boolean;
  hasResourceRole: (role: string, resource?: string) => boolean;
}

/**
 * Create a mock Keycloak context for testing components that depend on auth state.
 *
 * @example
 * ```ts
 * const mockCtx = createMockKeycloakContext({
 *   authenticated: true,
 *   roles: ["System Manager", "HR User"],
 *   token: "mock-jwt-token",
 *   user: { email: "admin@test.com", name: "Admin" },
 * });
 * ```
 */
export function createMockKeycloakContext(options: MockKeycloakOptions = {}): MockKeycloakContext {
  const {
    authenticated = false,
    roles = [],
    token = authenticated ? 'mock-jwt-token' : undefined,
    user = {},
  } = options;

  const sub = user.sub || 'mock-user-id';
  const email = user.email || (authenticated ? 'test@example.com' : undefined);
  const name = user.name || (authenticated ? 'Test User' : undefined);

  return {
    authenticated,
    token: authenticated ? token : undefined,
    tokenParsed: authenticated
      ? {
          email,
          name,
          preferred_username: email,
          sub,
          realm_access: { roles },
        }
      : undefined,
    idToken: authenticated ? `mock-id-token-${sub}` : undefined,
    refreshToken: authenticated ? `mock-refresh-token-${sub}` : undefined,
    realmAccess: authenticated ? { roles } : undefined,
    subject: authenticated ? sub : undefined,
    email: authenticated ? email : undefined,
    username: authenticated ? email : undefined,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    hasRealmRole: (role: string) => roles.includes(role),
    hasResourceRole: (_role: string, _resource?: string) => false,
  };
}
