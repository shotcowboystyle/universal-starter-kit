import { useMemo } from 'react';

import { sessionDocRights } from './docPermissions';
import type { DocRights, DocShareGrant } from './docPermissions';
import type { DoctypeMeta } from './doctypeMeta';
import { useFrappeSession } from './useSessionRoles';
import type { SessionConnection } from './useSessionRoles';

export interface DocRightsOptions {
  /** Roles to resolve against instead of the session's, on a fixtures connection too. */
  roles?: string[];
  /** The record's owner; omitted for the doctype's rights. */
  owner?: string;
  shares?: readonly DocShareGrant[];
}

export interface DocRightsResult {
  rights: DocRights;
  /** The session's roles are still loading, so `rights` withholds what they may grant. */
  pending: boolean;
  user?: string;
  roles?: string[];
}

/**
 * The session's rights on a doctype, or on one record of it, from the
 * doctype's DocPerm rows (`meta.permissions`) and the session's roles.
 * See `sessionDocRights` for the fixtures and unknown-session rules.
 */
export function useDocRights(
  connection: SessionConnection | undefined,
  meta: DoctypeMeta | undefined,
  { roles: rolesOverride, owner, shares }: DocRightsOptions = {},
): DocRightsResult {
  const fixtures = Boolean(connection?.fixtures);
  const session = useFrappeSession(meta && !fixtures ? connection : undefined);
  const roles = rolesOverride ?? session.roles;
  const rights = useMemo(
    () =>
      sessionDocRights({
        fixtures: fixtures && !rolesOverride,
        meta,
        roles,
        user: session.user,
        owner,
        shares,
      }),
    [fixtures, rolesOverride, meta, roles, session.user, owner, shares],
  );
  const pending = !fixtures && Boolean(meta) && !rolesOverride && session.state === 'loading';
  return { rights, pending, user: session.user, roles };
}
