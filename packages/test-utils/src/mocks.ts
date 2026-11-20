/**
 * Shared mock factories for workspace packages.
 *
 * Provides a mock Keycloak auth context for testing.
 *
 * @example
 * ```ts
 * import { createMockKeycloakContext } from "@repo/test-utils/mocks";
 * ```
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';

// Resolves to undefined, like the real async auth calls.
const resolveVoid = async (): Promise<void> => {
  // Intentionally empty: resolves to undefined.
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
