/**
 * DM-1 correctness proof (spec 09 §4.3): for every builder in
 * `createBackofficePaths`, `resolveDeskPath(paths.x(...))` returns the
 * address that built it — both halves are pure, so the round-trip is the
 * whole contract.
 */
import { describe, expect, it } from 'vitest';

import { parseBackofficeHref } from '../navigation/navigator';
import { BACKOFFICE_VIEWS, createBackofficePaths } from '../navigation/paths';

import { resolveDeskPath } from './resolve-desk-path';
import type { DeskAddress } from './resolve-desk-path';

const BASE_PATHS = ['/backoffice', '/admin', '/', '/nested/desk'] as const;

/** Split a built href the way the navigator does, then resolve it. */
const resolve = (href: string, basePath: string): DeskAddress => {
  const { path, params } = parseBackofficeHref(href);
  return resolveDeskPath(path, basePath, params);
};

describe.each(BASE_PATHS)('resolveDeskPath round-trips createBackofficePaths at %s', (basePath) => {
  const paths = createBackofficePaths(basePath);

  it('home() → home', () => {
    expect(resolve(paths.home(), basePath)).toStrictEqual({ kind: 'home' });
  });

  it('workspace() → slug (ambiguity is data, resolved downstream)', () => {
    expect(resolve(paths.workspace('Accounting'), basePath)).toStrictEqual({
      kind: 'slug',
      slug: 'accounting',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual: the resolver emits this key with an undefined value
      filtersParam: undefined,
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual: the resolver emits this key with an undefined value
      sortParam: undefined,
    });
  });

  it('list() → slug', () => {
    expect(resolve(paths.list('Sales Order'), basePath)).toMatchObject({
      kind: 'slug',
      slug: 'sales-order',
    });
  });

  it.each(BACKOFFICE_VIEWS.filter((view) => view !== 'list'))('view(%s) → slug-view', (view) => {
    expect(resolve(paths.view('Sales Order', view), basePath)).toStrictEqual({
      kind: 'slug-view',
      slug: 'sales-order',
      view,
    });
  });

  it("view('list') → the list surface, exactly like list()", () => {
    expect(resolve(paths.view('Sales Order', 'list'), basePath)).toMatchObject({
      kind: 'slug',
      slug: 'sales-order',
    });
  });

  it('newDoc() → slug-new, without and with ?d= defaults', () => {
    expect(resolve(paths.newDoc('Sales Order'), basePath)).toStrictEqual({
      kind: 'slug-new',
      slug: 'sales-order',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual: the resolver emits this key with an undefined value
      defaults: undefined,
    });
    const defaults = { customer: 'ACME & Sons', qty: 2 };
    expect(resolve(paths.newDoc('Sales Order', defaults), basePath)).toStrictEqual({
      kind: 'slug-new',
      slug: 'sales-order',
      defaults,
    });
  });

  it('form() → slug-name, decoding encoded document names', () => {
    expect(resolve(paths.form('Sales Order', 'SO-0001'), basePath)).toStrictEqual({
      kind: 'slug-name',
      slug: 'sales-order',
      name: 'SO-0001',
    });
    expect(resolve(paths.form('File', 'a b/c#1'), basePath)).toStrictEqual({
      kind: 'slug-name',
      slug: 'file',
      name: 'a b/c#1',
    });
  });

  it("a document literally named 'new' still resolves as create mode (desk parity)", () => {
    expect(resolve(paths.form('Task', 'new'), basePath)).toMatchObject({ kind: 'slug-new' });
  });

  it('queryReport() → report, decoding encoded report names', () => {
    expect(resolve(paths.queryReport('Accounts Receivable'), basePath)).toStrictEqual({
      kind: 'report',
      reportName: 'Accounts Receivable',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual: the resolver emits this key with an undefined value
      filtersParam: undefined,
    });
  });
});

describe('resolveDeskPath search params', () => {
  const paths = createBackofficePaths('/backoffice');

  it('carries ?f=/?sort= on the list address', () => {
    const address = resolveDeskPath('/backoffice/todo', '/backoffice', {
      f: '[["status","=","Open"]]',
      sort: 'modified.desc',
    });
    expect(address).toStrictEqual({
      kind: 'slug',
      slug: 'todo',
      filtersParam: '[["status","=","Open"]]',
      sortParam: 'modified.desc',
    });
  });

  it('carries ?board=/?field=/?f= on the view address', () => {
    const address = resolveDeskPath(paths.view('ToDo', 'kanban'), '/backoffice', {
      board: 'My Board',
      field: 'date',
    });
    expect(address).toStrictEqual({
      kind: 'slug-view',
      slug: 'todo',
      view: 'kanban',
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- toStrictEqual: the resolver emits this key with an undefined value
      params: { board: 'My Board', field: 'date', filtersParam: undefined },
    });
  });

  it('carries ?filters= on the report address', () => {
    const address = resolveDeskPath('/backoffice/query-report/Accounts%20Receivable', '/backoffice', {
      filters: '{"company":"ACME"}',
    });
    expect(address).toStrictEqual({
      kind: 'report',
      reportName: 'Accounts Receivable',
      filtersParam: '{"company":"ACME"}',
    });
  });
});

describe('resolveDeskPath rejections', () => {
  it('paths outside basePath are not-found', () => {
    expect(resolveDeskPath('/elsewhere/todo', '/backoffice')).toStrictEqual({
      kind: 'not-found',
      path: '/elsewhere/todo',
    });
    // Prefix must match on a segment boundary.
    expect(resolveDeskPath('/backofficex/todo', '/backoffice')).toMatchObject({
      kind: 'not-found',
    });
  });

  it('malformed shapes are not-found', () => {
    expect(resolveDeskPath('/backoffice/todo/view/nope', '/backoffice')).toMatchObject({
      kind: 'not-found',
    });
    expect(resolveDeskPath('/backoffice/todo/view/kanban/extra', '/backoffice')).toMatchObject({
      kind: 'not-found',
    });
    expect(resolveDeskPath('/backoffice/query-report', '/backoffice')).toMatchObject({
      kind: 'not-found',
    });
  });

  it('trailing slashes normalize', () => {
    expect(resolveDeskPath('/backoffice/', '/backoffice')).toStrictEqual({ kind: 'home' });
    expect(resolveDeskPath('/backoffice/todo/', '/backoffice')).toMatchObject({
      kind: 'slug',
      slug: 'todo',
    });
  });
});
