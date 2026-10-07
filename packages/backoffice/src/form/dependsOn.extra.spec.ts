/**
 * dependsOn — additional coverage on top of dependsOn.spec.ts (owned by the
 * form workstream; new cases live here so the two files never collide).
 * Focus: compileDependsOn API surface, nested doc paths, literals, strict
 * operators, operator precedence, tokenizer edges, and fallback semantics.
 */
import { describe, expect, it } from 'vitest';

import { compileDependsOn, evaluateDependsOn } from './dependsOn';

describe(compileDependsOn, () => {
  it('returns undefined for empty / blank expressions', () => {
    expect(compileDependsOn()).toBeUndefined();
    expect(compileDependsOn('')).toBeUndefined();
    expect(compileDependsOn('   ')).toBeUndefined();
  });

  it('returns a reusable evaluator', () => {
    const evaluator = compileDependsOn('eval:doc.status == "Open"');
    expect(evaluator).toBeTypeOf('function');
    expect(evaluator?.({ status: 'Open' })).toBe(true);
    expect(evaluator?.({ status: 'Closed' })).toBe(false);
  });

  it('caches compiled evaluators per expression + fallback', () => {
    const a = compileDependsOn('eval:doc.a && doc.b', true);
    const b = compileDependsOn('eval:doc.a && doc.b', true);
    expect(a).toBe(b);
    // Different fallback → different cache entry (behavior may differ).
    const c = compileDependsOn('eval:doc.a && doc.b', false);
    expect(c).toBeTypeOf('function');
  });
});

describe('nested doc paths', () => {
  it('resolves doc.a.b chains', () => {
    expect(
      evaluateDependsOn('eval:doc.customer.status == "Active"', {
        customer: { status: 'Active' },
      }),
    ).toBe(true);
    expect(
      evaluateDependsOn('eval:doc.customer.status == "Active"', {
        customer: { status: 'Blocked' },
      }),
    ).toBe(false);
  });

  it('treats missing intermediate objects as undefined (falsy, no throw)', () => {
    expect(evaluateDependsOn('eval:doc.customer.status', {})).toBe(false);
    expect(evaluateDependsOn('eval:doc.customer.status', { customer: null })).toBe(false);
  });
});

describe('literals', () => {
  it('evaluates boolean literals', () => {
    expect(evaluateDependsOn('eval:true', {})).toBe(true);
    expect(evaluateDependsOn('eval:false', {})).toBe(false);
  });

  it('compares against null (nullish match, empty string is NOT null)', () => {
    expect(evaluateDependsOn('eval:doc.parent == null', { parent: null })).toBe(true);
    expect(evaluateDependsOn('eval:doc.parent == null', {})).toBe(true);
    expect(evaluateDependsOn('eval:doc.parent == null', { parent: '' })).toBe(false);
    expect(evaluateDependsOn('eval:doc.parent != null', { parent: 'PROJ-1' })).toBe(true);
  });

  it('handles negative and decimal number literals', () => {
    expect(evaluateDependsOn('eval:doc.qty > -1', { qty: 0 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.rate >= 2.5', { rate: 2.5 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.rate >= 2.5', { rate: 2.49 })).toBe(false);
  });

  it('handles escaped quotes inside string literals', () => {
    expect(evaluateDependsOn('eval:doc.note == "say \\"hi\\""', { note: 'say "hi"' })).toBe(true);
  });
});

describe('strict equality', () => {
  it('=== does not coerce across types', () => {
    expect(evaluateDependsOn('eval:doc.qty === 1', { qty: 1 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.qty === 1', { qty: '1' })).toBe(false);
  });

  it('!== is the strict negation', () => {
    expect(evaluateDependsOn('eval:doc.qty !== 1', { qty: '1' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.qty !== 1', { qty: 1 })).toBe(false);
  });
});

describe('comparison coercion', () => {
  it("compares numeric strings numerically ('10' > '5')", () => {
    expect(evaluateDependsOn('eval:doc.qty > doc.min', { qty: '10', min: '5' })).toBe(true);
  });

  it('returns false for non-numeric ordering comparisons', () => {
    expect(evaluateDependsOn('eval:doc.status > 5', { status: 'abc' })).toBe(false);
    expect(evaluateDependsOn('eval:doc.status < 5', { status: 'abc' })).toBe(false);
  });
});

describe('operator precedence and grouping', () => {
  it('binds && tighter than ||', () => {
    // a || (b && c) — not (a || b) && c
    expect(evaluateDependsOn('eval:doc.a || doc.b && doc.c', { a: 1, b: 1, c: 0 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.a || doc.b && doc.c', { a: 0, b: 1, c: 0 })).toBe(false);
  });

  it('parens override precedence', () => {
    expect(evaluateDependsOn('eval:(doc.a || doc.b) && doc.c', { a: 1, b: 0, c: 0 })).toBe(false);
    expect(evaluateDependsOn('eval:(doc.a || doc.b) && doc.c', { a: 1, b: 0, c: 1 })).toBe(true);
  });

  it('negates parenthesized groups and membership calls', () => {
    expect(evaluateDependsOn('eval:!(doc.a && doc.b)', { a: 1, b: 0 })).toBe(true);
    expect(evaluateDependsOn('eval:!in_list(["A","B"], doc.s)', { s: 'C' })).toBe(true);
    expect(evaluateDependsOn('eval:!["A","B"].includes(doc.s)', { s: 'A' })).toBe(false);
  });

  it('tolerates extra whitespace', () => {
    expect(evaluateDependsOn('eval:  doc.a   &&doc.status=="Open"', { a: 1, status: 'Open' })).toBe(true);
  });
});

describe('membership coercion', () => {
  it('matches numeric doc values against numeric array literals loosely', () => {
    expect(evaluateDependsOn('eval:[1,2,3].includes(doc.idx)', { idx: '2' })).toBe(true);
    expect(evaluateDependsOn('eval:[1,2,3].includes(doc.idx)', { idx: 4 })).toBe(false);
  });
});

describe('frappe coercion helpers (cint/flt/cstr/cbool)', () => {
  it('cint coerces check-ish values (real usage: User.change_password)', () => {
    expect(
      evaluateDependsOn('eval:doc.enabled && (!doc.__islocal || !cint(doc.send_welcome_email))', {
        enabled: 1,
        __islocal: 1,
        send_welcome_email: '0',
      }),
    ).toBe(true);
    expect(
      evaluateDependsOn('eval:doc.enabled && (!doc.__islocal || !cint(doc.send_welcome_email))', {
        enabled: 1,
        __islocal: 1,
        send_welcome_email: '1',
      }),
    ).toBe(false);
  });

  it('cint truncates and defaults to 0', () => {
    expect(evaluateDependsOn('eval:cint(doc.qty) == 2', { qty: '2.9' })).toBe(true);
    expect(evaluateDependsOn('eval:cint(doc.qty) == 0', {})).toBe(true);
  });

  it('flt parses decimals', () => {
    expect(evaluateDependsOn('eval:flt(doc.rate) > 2.4', { rate: '2.5' })).toBe(true);
    expect(evaluateDependsOn('eval:flt(doc.rate) > 2.4', { rate: 'bad' })).toBe(false);
  });

  it('cstr stringifies nullish to empty', () => {
    expect(evaluateDependsOn('eval:cstr(doc.note) == ""', {})).toBe(true);
    expect(evaluateDependsOn('eval:cstr(doc.qty) == "3"', { qty: 3 })).toBe(true);
  });
});

describe('.length on doc values', () => {
  it('reads string length (real usage: User.bypass_restrict_ip_check…)', () => {
    expect(
      evaluateDependsOn('eval:doc.restrict_ip && doc.restrict_ip.length', {
        restrict_ip: '10.0.0.1',
      }),
    ).toBe(true);
    expect(evaluateDependsOn('eval:doc.restrict_ip && doc.restrict_ip.length', { restrict_ip: '' })).toBe(false);
  });

  it('reads array length', () => {
    expect(evaluateDependsOn('eval:doc.items.length > 1', { items: [1, 2] })).toBe(true);
    expect(evaluateDependsOn('eval:doc.items.length > 1', { items: [] })).toBe(false);
  });
});

describe('parent context (child tables)', () => {
  it('resolves parent.fieldname when a parent doc is provided', () => {
    expect(evaluateDependsOn('eval:parent.status == "Open"', { qty: 1 }, true, { status: 'Open' })).toBe(true);
    expect(evaluateDependsOn('eval:parent.status == "Open"', { qty: 1 }, true, { status: 'Closed' })).toBe(false);
  });

  it('mixes doc and parent references', () => {
    expect(evaluateDependsOn('eval:doc.qty > 0 && parent.enabled', { qty: 2 }, false, { enabled: 1 })).toBe(true);
  });

  it('falls back when parent is referenced but not in scope', () => {
    expect(evaluateDependsOn('eval:parent.status', { qty: 1 }, true)).toBe(true);
    expect(evaluateDependsOn('eval:parent.status', { qty: 1 }, false)).toBe(false);
  });
});

describe('frappe.session.user', () => {
  it('resolves from the injected __session_user key', () => {
    expect(
      evaluateDependsOn('eval:doc.owner == frappe.session.user', {
        owner: 'admin@example.com',
        __session_user: 'admin@example.com',
      }),
    ).toBe(true);
    expect(
      evaluateDependsOn('eval:doc.owner == frappe.session.user', {
        owner: 'someone@example.com',
        __session_user: 'admin@example.com',
      }),
    ).toBe(false);
  });

  it('falls back when the session user is not injected', () => {
    expect(evaluateDependsOn('eval:doc.owner == frappe.session.user', { owner: 'x' }, true)).toBe(true);
    expect(evaluateDependsOn('eval:doc.owner == frappe.session.user', { owner: 'x' }, false)).toBe(false);
  });
});

describe('__islocal ambient flag', () => {
  it('reads like any doc key (callers inject it)', () => {
    expect(evaluateDependsOn('eval:doc.__islocal', { __islocal: 1 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.__islocal', { __islocal: 0 })).toBe(false);
    expect(evaluateDependsOn('eval:!doc.__islocal', { __islocal: 0 })).toBe(true);
  });
});

describe('bare-fieldname array truthiness', () => {
  it('counts rows for array values (desk: array → !!length)', () => {
    expect(evaluateDependsOn('items', { items: [{}] })).toBe(true);
    expect(evaluateDependsOn('items', { items: [] })).toBe(false);
  });
});

describe('fallback semantics on unparseable expressions', () => {
  it('falls back on arithmetic (documented gap)', () => {
    expect(evaluateDependsOn('eval:doc.qty + 1 > 2', { qty: 5 }, true)).toBe(true);
    expect(evaluateDependsOn('eval:doc.qty + 1 > 2', { qty: 5 }, false)).toBe(false);
  });

  it('falls back on unterminated strings', () => {
    expect(evaluateDependsOn('eval:doc.status == "Open', { status: 'Open' }, true)).toBe(true);
    expect(evaluateDependsOn('eval:doc.status == "Open', { status: 'Open' }, false)).toBe(false);
  });

  it('falls back on trailing garbage after a valid expression', () => {
    expect(evaluateDependsOn('eval:doc.a doc.b', { a: 1, b: 1 }, false)).toBe(false);
  });

  it('falls back on method calls outside the safe subset', () => {
    expect(evaluateDependsOn('eval:doc.name.startsWith("SAL")', { name: 'SAL-1' }, false)).toBe(false);
  });

  it('falls back on empty eval: body', () => {
    expect(evaluateDependsOn('eval:', {}, true)).toBe(true);
    expect(evaluateDependsOn('eval:', {}, false)).toBe(false);
  });
});
