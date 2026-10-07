// The session's doc-level rights from getdoctype's DocPerm rows and the
// session roles (MPO-390), against frappe/permissions.py
// get_role_permissions: permlevel 0 only, OR across the user's roles,
// if_owner rows scoped to the user's own records except create.
import { describe, expect, it } from 'vitest';

import { allDocRights, docinfoRights, fixtureDocRights, resolveDocRights, sessionDocRights } from './docPermissions';
import type { DocRights } from './docPermissions';
import type { DocPermissionRule } from './doctypeMeta';

const pokeMove: DocPermissionRule[] = [
  { role: 'System Manager', read: 1, write: 1, create: 1, delete: 1, export: 1 },
  { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
  { role: 'Guest', read: 1 },
  { role: 'Move Author', read: 1, write: 1, create: 1, delete: 1, if_owner: 1 },
  { role: 'Move Curator', permlevel: 1, read: 1, write: 1 },
];

function granted(rights: DocRights): string[] {
  return Object.entries(rights)
    .filter(([, value]) => value)
    .map(([right]) => right)
    .sort();
}

describe(resolveDocRights, () => {
  it('grants a reader only what the Guest row grants', () => {
    const rights = resolveDocRights({ permissions: pokeMove, roles: ['Guest', 'All'] });
    expect(granted(rights)).toEqual(['read']);
  });

  it('grants create, write and delete through Pokemon Editor', () => {
    const rights = resolveDocRights({
      permissions: pokeMove,
      roles: ['Pokemon Editor', 'Guest', 'All'],
      user: 'editor@pokemon.test',
      owner: 'Administrator',
    });
    expect(rights.create).toBe(true);
    expect(rights.write).toBe(true);
    expect(rights.delete).toBe(true);
    expect(rights.export).toBe(false);
  });

  it('ORs the rights of every role the user holds', () => {
    const rights = resolveDocRights({
      permissions: pokeMove,
      roles: ['Pokemon Editor', 'System Manager'],
    });
    expect(rights.export).toBe(true);
    expect(rights.delete).toBe(true);
  });

  it('ignores rows above permlevel 0', () => {
    const rights = resolveDocRights({ permissions: pokeMove, roles: ['Move Curator'] });
    expect(granted(rights)).toEqual([]);
  });

  it("scopes if_owner write and delete to the user's own records but keeps create", () => {
    const base = { permissions: pokeMove, roles: ['Move Author'], user: 'author@pokemon.test' };
    const own = resolveDocRights({ ...base, owner: 'author@pokemon.test' });
    expect([own.create, own.read, own.write, own.delete]).toEqual([true, true, true, true]);

    const others = resolveDocRights({ ...base, owner: 'Administrator' });
    expect([others.create, others.read, others.write, others.delete]).toEqual([true, false, false, false]);

    const doctype = resolveDocRights(base);
    expect([doctype.create, doctype.read, doctype.write, doctype.delete]).toEqual([true, true, false, false]);
  });

  it('lets a plain row lift the if_owner scope for the same right', () => {
    const rights = resolveDocRights({
      permissions: pokeMove,
      roles: ['Move Author', 'Pokemon Editor'],
      user: 'author@pokemon.test',
      owner: 'Administrator',
    });
    expect(rights.write).toBe(true);
    expect(rights.delete).toBe(true);
  });

  it('gives Administrator every right, rows or not', () => {
    expect(resolveDocRights({ permissions: [], roles: [], user: 'Administrator' })).toEqual(allDocRights(true));
  });

  it('adds read and write from a share for the user or for everyone, never delete', () => {
    const reader = {
      permissions: pokeMove,
      roles: ['Guest'],
      user: 'reader@pokemon.test',
      owner: 'Administrator',
    };
    const shared = resolveDocRights({
      ...reader,
      shares: [{ user: 'reader@pokemon.test', read: 1, write: 1 }],
    });
    expect([shared.write, shared.delete]).toEqual([true, false]);

    const everyone = resolveDocRights({ ...reader, shares: [{ everyone: 1, write: 1 }] });
    expect(everyone.write).toBe(true);

    const someoneElse = resolveDocRights({
      ...reader,
      shares: [{ user: 'other@pokemon.test', write: 1 }],
    });
    expect(someoneElse.write).toBe(false);
  });
});

describe(sessionDocRights, () => {
  const meta = { permissions: pokeMove };

  it('withholds nothing on a fixtures connection', () => {
    expect(sessionDocRights({ fixtures: true, meta: undefined, roles: undefined })).toEqual(allDocRights(true));
  });

  it("grants nothing on a live connection without meta (Guest's getdoctype 403)", () => {
    expect(sessionDocRights({ fixtures: false, meta: undefined, roles: ['Guest'] })).toEqual(allDocRights(false));
  });

  it('grants nothing on a live connection whose roles are loading or unreadable', () => {
    expect(sessionDocRights({ fixtures: false, meta, roles: undefined })).toEqual(allDocRights(false));
  });

  it("resolves the session's roles once both are known", () => {
    const rights = sessionDocRights({ fixtures: false, meta, roles: ['Pokemon Editor'] });
    expect([rights.create, rights.write, rights.delete]).toEqual([true, true, true]);
  });
});

describe(docinfoRights, () => {
  it("takes the bench's per-record answer as it is", () => {
    const rights = docinfoRights({ read: 1, write: 1, submit: 0, print: 1 });
    expect(rights && granted(rights)).toEqual(['print', 'read', 'write']);
  });

  it('is no answer when the payload carries no read key (token-auth {null: 0})', () => {
    expect(docinfoRights({ null: 0 })).toBeUndefined();
    expect(docinfoRights()).toBeUndefined();
  });
});

describe(fixtureDocRights, () => {
  it("grants what any permlevel-0 row grants, never a higher level's rights", () => {
    const rights = fixtureDocRights({ permissions: pokeMove });
    expect(granted(rights)).toEqual(['create', 'delete', 'export', 'read', 'write']);
  });

  it('keeps write, create, email and print for a doctype without rows', () => {
    expect(granted(fixtureDocRights({ permissions: [] }))).toEqual(['create', 'email', 'print', 'write']);
  });
});
