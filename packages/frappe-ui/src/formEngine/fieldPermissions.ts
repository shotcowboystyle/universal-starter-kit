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

import type { DocPermissionRule } from './doctypeMeta';

export interface LevelPerm {
  read: boolean;
  write: boolean;
}

/** Sparse array indexed by permlevel; missing entries mean "no rights". */
export type PermLevelMatrix = LevelPerm[];

export function buildPermLevelMatrix(
  permissions: DocPermissionRule[] | undefined,
  userRoles: string[] | undefined,
): PermLevelMatrix | undefined {
  if (!userRoles || !permissions || permissions.length === 0) {
    return undefined;
  }
  const roles = new Set(userRoles);
  const matrix: PermLevelMatrix = [];
  for (const rule of permissions) {
    if (!rule.role || !roles.has(rule.role)) {
      continue;
    }
    const level = Number(rule.permlevel ?? 0) || 0;
    const current = (matrix[level] ??= { read: false, write: false });
    // if_owner rows are unioned in like desk's get_role_permissions — the
    // owner check itself is enforced server-side (and via docinfo at level 0).
    if (rule.read) {
      current.read = true;
    }
    if (rule.write) {
      current.write = true;
    }
  }
  return matrix;
}

/**
 * Read access at a permlevel. Level 0 is implied by having the doc at all
 * (docinfo/doc-level perms govern it — including share/if_owner grants the
 * role matrix can't see), so only higher levels consult the matrix.
 */
export function canReadLevel(matrix: PermLevelMatrix | undefined, permlevel: number): boolean {
  if (!permlevel) {
    return true;
  }
  if (!matrix) {
    return true;
  } // caller falls back to the coarse read-only rule
  return !!matrix[permlevel]?.read;
}

/**
 * Write access at a permlevel. Level 0 defers to the doc-level write flag
 * (formReadOnly); higher levels require a granting role row — without a
 * matrix the coarse fallback keeps them read-only (desk-safe direction).
 */
export function canWriteLevel(matrix: PermLevelMatrix | undefined, permlevel: number): boolean {
  if (!permlevel) {
    return true;
  }
  if (!matrix) {
    return false;
  }
  return !!matrix[permlevel]?.write;
}
