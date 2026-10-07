/**
 * Doc-level rights for the session, the permlevel-0 half of desk's
 * permission model (fieldPermissions.ts is the field-level half).
 *
 * Server parity with frappe/permissions.py `get_role_permissions`: a right is
 * granted when a permlevel-0 DocPerm row of one of the session's roles grants
 * it. When every granting row is `if_owner`, the right holds only on records
 * the session user owns, except `create`, which an `if_owner` row still
 * grants, and `read` / `select` at doctype level, which stay open so the list
 * can be read (the server narrows it to the user's own rows). Administrator
 * holds every right, as the server's `allow_everything()` does. A record's
 * DocShare rows for the user or for everyone add read, write and share, as
 * desk perm.js applies `docinfo.shared`.
 */

import type { DocPermissionRule, DoctypeMeta } from './doctypeMeta';

export const docRightNames = [
  'select',
  'read',
  'write',
  'create',
  'delete',
  'submit',
  'cancel',
  'amend',
  'print',
  'email',
  'report',
  'import',
  'export',
  'share',
] as const;

export type DocRight = (typeof docRightNames)[number];

export type DocRights = Record<DocRight, boolean>;

/** A DocShare row as the live collection or docinfo carries it. */
export interface DocShareGrant {
  user?: string | null;
  everyone?: number | boolean | null;
  read?: number | boolean | null;
  write?: number | boolean | null;
  share?: number | boolean | null;
}

export interface ResolveDocRightsInput {
  permissions: readonly DocPermissionRule[] | undefined;
  roles: readonly string[];
  user?: string;
  /** The record's owner. Omitted, the rights are the doctype's (a list, a new record). */
  owner?: string;
  shares?: readonly DocShareGrant[];
}

export function allDocRights(granted: boolean): DocRights {
  const rights = {} as DocRights;
  for (const right of docRightNames) {
    rights[right] = granted;
  }
  return rights;
}

const openAtDoctypeLevel = new Set<DocRight>(['read', 'select']);

export function resolveDocRights({ permissions, roles, user, owner, shares }: ResolveDocRightsInput): DocRights {
  if (user === 'Administrator') {
    return allDocRights(true);
  }
  const roleSet = new Set(roles);
  const rows = (permissions ?? []).filter(
    (row) => !!row.role && roleSet.has(row.role) && !(Number(row.permlevel ?? 0) || 0),
  );
  const isOwner = owner !== undefined && user !== undefined && owner === user;
  const rights = allDocRights(false);
  for (const right of docRightNames) {
    const granting = rows.filter((row) => !!row[right]);
    if (granting.length === 0) {
      continue;
    }
    const ownerOnly = granting.every((row) => !!row.if_owner);
    rights[right] =
      !ownerOnly || right === 'create' || isOwner || (owner === undefined && openAtDoctypeLevel.has(right));
  }
  if (user && owner !== undefined) {
    for (const share of shares ?? []) {
      if (share.user !== user && !share.everyone) {
        continue;
      }
      if (share.read) {
        rights.read = true;
      }
      if (share.write) {
        rights.write = true;
      }
      if (share.share) {
        rights.share = true;
      }
    }
  }
  return rights;
}

export interface SessionDocRightsInput {
  /** A fixtures-only connection: no session exists, so nothing is withheld. */
  fixtures: boolean;
  meta: Pick<DoctypeMeta, 'permissions'> | undefined;
  /** The session's roles; undefined while they load or when they can't be read. */
  roles: readonly string[] | undefined;
  user?: string;
  owner?: string;
  shares?: readonly DocShareGrant[];
}

/**
 * The rights a surface offers. A fixtures connection keeps every action; a
 * live one grants nothing until both the doctype's meta and the session's
 * roles are known, so a reader who can't load meta (Guest) or whose roles
 * can't be read is shown a read-only surface.
 */
export function sessionDocRights({ fixtures, meta, roles, user, owner, shares }: SessionDocRightsInput): DocRights {
  if (fixtures) {
    return allDocRights(true);
  }
  if (!meta || !roles) {
    return allDocRights(false);
  }
  return resolveDocRights({ permissions: meta.permissions, roles, user, owner, shares });
}

/**
 * A record's rights as the bench evaluated them for this user: docinfo's
 * `permissions` (desk `frm.perm[0]` from getdoc). A payload with no `read`
 * key is not an answer (a token-auth bench sends `{"null": 0}`), so it gives
 * undefined and the caller keeps the session's rights.
 */
export function docinfoRights(
  permissions: Readonly<Record<string, unknown>> | null | undefined,
): DocRights | undefined {
  if (!permissions || !('read' in permissions)) {
    return undefined;
  }
  const rights = allDocRights(false);
  for (const right of docRightNames) {
    rights[right] = !!permissions[right];
  }
  return rights;
}

/**
 * The desk's rights on a fixtures connection, where no session exists: what
 * any permlevel-0 DocPerm row of the doctype grants, so a story offers the
 * actions its meta allows. A doctype without rows keeps write, create,
 * email and print.
 */
export function fixtureDocRights(meta: Pick<DoctypeMeta, 'permissions'> | undefined): DocRights {
  const rows = (meta?.permissions ?? []).filter((row) => !(Number(row.permlevel ?? 0) || 0));
  const rights = allDocRights(false);
  for (const right of docRightNames) {
    rights[right] = rows.some((row) => !!row[right]);
  }
  if ((meta?.permissions ?? []).length === 0) {
    rights.write = true;
    rights.create = true;
    rights.email = true;
    rights.print = true;
  }
  return rights;
}
