/**
 * Session user's role list for backoffice surfaces, read off the ambient
 * FrappeProvider. The fetch itself lives in frappe-ui's form engine
 * (`useFrappeSession`) so FrappeForm and the desk resolve permlevel and doc
 * rights from one source; `roles` and `user` stay undefined while loading,
 * in fixture mode, or when the RPC fails.
 */

import { useFrappeConfig, useFrappeSession } from '@repo/frappe-ui';

export function useUserRoles(): { roles?: string[]; user?: string } {
  const config = useFrappeConfig();
  const { roles, user } = useFrappeSession(config);
  return { roles, user };
}
