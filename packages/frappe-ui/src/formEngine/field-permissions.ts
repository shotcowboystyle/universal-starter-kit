/**
 * Field-level permission matrix — desk parity with
 * frappe/public/js/frappe/model/perm.js (`get_role_permissions` +
 * `get_field_display_status`):
 *
 *   perm[level] = OR of meta.permissions rows whose role the session user
 *   holds. A field at permlevel L then resolves to:
 *     - no read at L  → hidden   ("None")
 *     - read, no write → read-only ("Read")
 *     - write          → editable ("Write", subject to the other rules)
 *
 * Levels that appear on fields but have no granting rows resolve to
 * {read: false} — desk hides those fields (gap-filled `{}` in perm.js:153).
 * When the caller has no role list (fixtures, roles RPC unavailable) the
 * matrix is undefined and formLayout falls back to the conservative
 * "permlevel > 0 → read-only" rule (never hides, never unlocks).
 */

import type { DocPermissionRule } from './doctype-meta';

export interface LevelPerm {
  read: boolean;
  write: boolean;
}

/** Sparse array indexed by permlevel; missing entries mean "no rights". */
export type PermLevelMatrix = LevelPerm[];

export const buildPermLevelMatrix = (
  permissions: DocPermissionRule[] | undefined,
  userRoles: string[] | undefined,
): PermLevelMatrix | undefined => {
  if (!userRoles || !permissions || permissions.length === 0) {
    return undefined;
  }
  const roles = new Set(userRoles);
  const matrix: PermLevelMatrix = [];
  for (const rule of permissions) {
    if (rule.role === undefined || rule.role === '' || !roles.has(rule.role)) {
      continue;
    }
    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- the declared number type is not enforced on the wire; Number() keeps numeric-string levels working
    const parsedLevel = Number(rule.permlevel ?? 0);
    const level = Number.isNaN(parsedLevel) ? 0 : parsedLevel;
    matrix[level] ??= { read: false, write: false };
    const current = matrix[level];
    // if_owner rows are unioned in like desk's get_role_permissions — the
    // owner check itself is enforced server-side (and via docinfo at level 0).
    current.read ||= Boolean(rule.read);
    current.write ||= Boolean(rule.write);
  }
  return matrix;
};

/**
 * Read access at a permlevel. Level 0 is implied by having the doc at all
 * (docinfo/doc-level perms govern it — including share/if_owner grants the
 * role matrix can't see), so only higher levels consult the matrix.
 */
/** Level 0 (or an unparseable level, which the server reads as 0). */
const isBaseLevel = (permlevel: number): boolean => permlevel === 0 || Number.isNaN(permlevel);

export const canReadLevel = (matrix: PermLevelMatrix | undefined, permlevel: number): boolean => {
  if (isBaseLevel(permlevel)) {
    return true;
  }
  // Without a matrix the caller falls back to the coarse read-only rule.
  if (!matrix) {
    return true;
  }
  return matrix[permlevel]?.read ?? false;
};

/**
 * Write access at a permlevel. Level 0 defers to the doc-level write flag
 * (formReadOnly); higher levels require a granting role row — without a
 * matrix the coarse fallback keeps them read-only (desk-safe direction).
 */
export const canWriteLevel = (matrix: PermLevelMatrix | undefined, permlevel: number): boolean => {
  if (isBaseLevel(permlevel)) {
    return true;
  }
  if (!matrix) {
    return false;
  }
  return matrix[permlevel]?.write ?? false;
};
