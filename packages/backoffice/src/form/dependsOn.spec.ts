import { describe, expect, it } from 'vitest';

import { evaluateDependsOn } from './dependsOn';

describe(evaluateDependsOn, () => {
  it('returns true for empty expressions', () => {
    expect(evaluateDependsOn(undefined, {})).toBe(true);
    expect(evaluateDependsOn('', {})).toBe(true);
  });

  it('evaluates bare fieldname truthiness', () => {
    expect(evaluateDependsOn('status', { status: 'Open' })).toBe(true);
    expect(evaluateDependsOn('status', { status: '' })).toBe(false);
    expect(evaluateDependsOn('archived', { archived: 0 })).toBe(false);
    expect(evaluateDependsOn('archived', { archived: 1 })).toBe(true);
    expect(evaluateDependsOn('missing', {})).toBe(false);
  });

  it('evaluates eval: equality comparisons', () => {
    expect(evaluateDependsOn('eval:doc.status == "Open"', { status: 'Open' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.status == "Open"', { status: 'Closed' })).toBe(false);
    expect(evaluateDependsOn("eval:doc.status == 'Open'", { status: 'Open' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.status != "Open"', { status: 'Closed' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.status === "Open"', { status: 'Open' })).toBe(true);
  });

  it('coerces loosely like frappe (numbers vs strings, check fields)', () => {
    expect(evaluateDependsOn('eval:doc.qty == 1', { qty: '1' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.enabled == 1', { enabled: 1 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.enabled != 1', { enabled: 0 })).toBe(true);
  });

  it('evaluates numeric comparisons', () => {
    expect(evaluateDependsOn('eval:doc.qty > 5', { qty: 6 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.qty >= 5', { qty: 5 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.qty < 5', { qty: 6 })).toBe(false);
    expect(evaluateDependsOn('eval:doc.qty <= 4', { qty: 4 })).toBe(true);
  });

  it('evaluates boolean composition and negation', () => {
    expect(evaluateDependsOn('eval:doc.a && doc.b', { a: 1, b: 1 })).toBe(true);
    expect(evaluateDependsOn('eval:doc.a && doc.b', { a: 1, b: 0 })).toBe(false);
    expect(evaluateDependsOn('eval:doc.a || doc.b', { a: 0, b: 1 })).toBe(true);
    expect(evaluateDependsOn('eval:!doc.a', { a: 0 })).toBe(true);
    expect(
      evaluateDependsOn('eval:doc.a && (doc.b || doc.status == "X")', {
        a: 1,
        b: 0,
        status: 'X',
      }),
    ).toBe(true);
  });

  it('evaluates bare doc.field truthiness inside eval', () => {
    expect(evaluateDependsOn('eval:doc.priority', { priority: 'High' })).toBe(true);
    expect(evaluateDependsOn('eval:doc.priority', { priority: '' })).toBe(false);
  });

  it('evaluates membership forms', () => {
    expect(evaluateDependsOn('eval:["Open","Closed"].includes(doc.status)', { status: 'Open' })).toBe(true);
    expect(evaluateDependsOn('eval:["Open","Closed"].includes(doc.status)', { status: 'Other' })).toBe(false);
    expect(evaluateDependsOn('eval:in_list(["Open","Closed"], doc.status)', { status: 'Closed' })).toBe(true);
  });

  it('falls back on unparseable expressions', () => {
    expect(evaluateDependsOn('eval:frappe.session.user == doc.owner', {}, true)).toBe(true);
    expect(evaluateDependsOn('eval:frappe.session.user == doc.owner', {}, false)).toBe(false);
    expect(evaluateDependsOn('eval:cint(doc.qty) > 2', { qty: 5 }, true)).toBe(true);
  });
});
