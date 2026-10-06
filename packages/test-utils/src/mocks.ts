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
 * mockDocList(mockApp, "Note", [{ name: "NOTE-001", description: "Buy milk" }]);
 * ```
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';

// ─── Frappe API Mocks ────────────────────────────────────────────────────────

type DocValue = string | number | boolean | null | undefined | DocValue[] | DocData;
interface DocData {
  [field: string]: DocValue;
}

// Wraps a sync impl so it returns a Promise (throws become rejections), like the real async Frappe API.
const toAsync =
  <Args extends unknown[], Result>(impl: (...args: Args) => Result) =>
  async (...args: Args) =>
    impl(...args);

const resolveVoid = toAsync(() => {
  // Intentionally empty: resolves to undefined.
});

export interface MockDbModule {
  getDocList: Mock;
  getDoc: Mock;
  createDoc: Mock;
  updateDoc: Mock;
  deleteDoc: Mock;
  getCount: Mock;
  getValue: Mock;
  setValue: Mock;
  exists: Mock;
}

export interface MockCallModule {
  get: Mock;
  post: Mock;
}

export interface MockAuthModule {
  getLoggedInUser: Mock;
  login: Mock;
  logout: Mock;
}

export interface MockFileModule {
  uploadFile: Mock;
  deleteFile: Mock;
  getFileURL: Mock;
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
export const createMockFrappeApp = (): MockFrappeApp => ({
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
});

/**
 * Mock `db.getDocList` to return specific data for a doctype.
 */
export const mockDocList = (mockApp: MockFrappeApp, doctype: string, data: DocData[]) => {
  mockApp.db.getDocList.mockImplementation(toAsync((dt: string) => (dt === doctype ? data : [])));
};

/**
 * Mock `db.getDoc` to return specific data for a doctype + name.
 */
export const mockGetDoc = (mockApp: MockFrappeApp, doctype: string, name: string, data: DocData) => {
  mockApp.db.getDoc.mockImplementation(
    toAsync((dt: string, n: string) => (dt === doctype && n === name ? data : null)),
  );
};

/**
 * Mock `db.createDoc` to return the created document data.
 */
export const mockCreateDoc = (mockApp: MockFrappeApp, doctype: string, returnData: DocData) => {
  mockApp.db.createDoc.mockImplementation(
    toAsync((dt: string, doc: DocData) => (dt === doctype ? { ...doc, ...returnData } : {})),
  );
};

/**
 * Mock `db.updateDoc` to return the updated document data.
 */
export const mockUpdateDoc = (mockApp: MockFrappeApp, doctype: string, name: string, returnData: DocData) => {
  mockApp.db.updateDoc.mockImplementation(
    toAsync((dt: string, n: string, doc: DocData) =>
      dt === doctype && n === name ? { name: n, ...doc, ...returnData } : {},
    ),
  );
};

/**
 * Mock `db.deleteDoc` to succeed for a specific doctype + name.
 */
export const mockDeleteDoc = (mockApp: MockFrappeApp, doctype: string, name: string) => {
  mockApp.db.deleteDoc.mockImplementation(
    toAsync((dt: string, n: string) => {
      if (dt === doctype && n === name) {
        return { message: 'ok' };
      }
      throw new Error(`Document ${dt}/${n} not found`);
    }),
  );
};

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
  login: Mock;
  logout: Mock;
  hasRealmRole: (role: string) => boolean;
  hasResourceRole: (role: string, resource?: string) => boolean;
}

const orDefault = (value: string | undefined, fallback: string | undefined) =>
  value === undefined || value === '' ? fallback : value;

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
export const createMockKeycloakContext = (options: MockKeycloakOptions = {}): MockKeycloakContext => {
  const {
    authenticated = false,
    roles = [],
    token = authenticated ? 'mock-jwt-token' : undefined,
    user = {},
  } = options;

  const sub = user.sub === undefined || user.sub === '' ? 'mock-user-id' : user.sub;
  const email = orDefault(user.email, authenticated ? 'test@example.com' : undefined);
  const name = orDefault(user.name, authenticated ? 'Test User' : undefined);

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
    login: vi.fn().mockImplementation(resolveVoid),
    logout: vi.fn().mockImplementation(resolveVoid),
    hasRealmRole: (role: string) => roles.includes(role),
    hasResourceRole: (_role: string, _resource?: string) => false,
  };
};
