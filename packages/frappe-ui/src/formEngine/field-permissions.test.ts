/**
 * fieldPermissions — permlevel matrix parity with desk perm.js
 * get_role_permissions / get_field_display_status.
 */
import { describe, expect, it } from 'vitest';

import { buildPermLevelMatrix, canReadLevel, canWriteLevel } from './field-permissions';

const userDoctypePerms = [
  { role: 'System Manager', permlevel: 0, read: 1 as const, write: 1 as const },
  { role: 'System Manager', permlevel: 1, read: 1 as const, write: 1 as const },
  { role: 'Desk User', permlevel: 0, read: 0 as const, write: 0 as const },
];

describe(buildPermLevelMatrix, () => {
  it("unions rights across the user's matching roles", () => {
    const matrix = buildPermLevelMatrix(
      [
        { role: 'Blogger', permlevel: 1, read: 1 as const, write: 0 as const },
        { role: 'Website Manager', permlevel: 1, read: 1 as const, write: 1 as const },
      ],
      ['Blogger', 'Website Manager'],
    );
    expect(matrix?.[1]).toStrictEqual({ read: true, write: true });
  });

  it('ignores rows for roles the user does not hold (User doctype shape)', () => {
    const matrix = buildPermLevelMatrix(userDoctypePerms, ['Desk User']);
    expect(matrix?.[1]).toBeUndefined();
    expect(canReadLevel(matrix, 1)).toBe(false);
    expect(canWriteLevel(matrix, 1)).toBe(false);
  });

  it('returns undefined without roles or permission rows (fallback signal)', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(buildPermLevelMatrix(userDoctypePerms, undefined)).toBeUndefined();
    expect(buildPermLevelMatrix([], ['System Manager'])).toBeUndefined();
    expect(buildPermLevelMatrix(undefined, ['System Manager'])).toBeUndefined();
  });
});

describe('canReadLevel / canWriteLevel', () => {
  const matrix = buildPermLevelMatrix(userDoctypePerms, ['System Manager']);

  it('level 0 defers to doc-level perms (always true here)', () => {
    expect(canReadLevel(matrix, 0)).toBe(true);
    expect(canWriteLevel(matrix, 0)).toBe(true);
    expect(canReadLevel(undefined, 0)).toBe(true);
    expect(canWriteLevel(undefined, 0)).toBe(true);
  });

  it('higher levels resolve from the matrix', () => {
    expect(canReadLevel(matrix, 1)).toBe(true);
    expect(canWriteLevel(matrix, 1)).toBe(true);
    // Level with no rows at all → hidden (desk fills gaps with {}).
    expect(canReadLevel(matrix, 2)).toBe(false);
  });

  it('without a matrix: visible but read-only above level 0 (coarse fallback)', () => {
    expect(canReadLevel(undefined, 1)).toBe(true);
    expect(canWriteLevel(undefined, 1)).toBe(false);
  });
});
