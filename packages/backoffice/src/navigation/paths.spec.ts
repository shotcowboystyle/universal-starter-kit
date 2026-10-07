/**
 * navigation — slug + path builder contracts.
 *
 * NOTE: newDocPath may concurrently gain an optional defaults argument
 * (`?d=<urlencoded JSON>` prefill). The no-arg form is the stable contract
 * pinned exactly; the with-arg form is asserted tolerantly (works both
 * before and after that change lands).
 */
import { describe, expect, it } from 'vitest';

import {
  BACKOFFICE_BASE,
  BACKOFFICE_VIEWS,
  createBackofficePaths,
  formPath,
  homePath,
  isBackofficeView,
  listPath,
  newDocPath,
  queryReportPath,
  slugToDisplayName,
  toSlug,
  viewPath,
  workspacePath,
} from './paths';

describe(toSlug, () => {
  it('lowercases and dashes spaces like frappe.router.slug', () => {
    expect(toSlug('Sales Order')).toBe('sales-order');
    expect(toSlug('ToDo')).toBe('todo');
    expect(toSlug('User')).toBe('user');
    expect(toSlug('Purchase Order Item')).toBe('purchase-order-item');
  });

  it('leaves already-slugged input unchanged', () => {
    expect(toSlug('sales-order')).toBe('sales-order');
  });
});

describe(slugToDisplayName, () => {
  it('title-cases dash-separated slugs', () => {
    expect(slugToDisplayName('sales-order')).toBe('Sales Order');
    expect(slugToDisplayName('user')).toBe('User');
  });

  it('is best-effort only for intra-word capitals (todo → Todo, not ToDo)', () => {
    // Real casing is resolved data-driven via useSlugTarget; this documents
    // the fallback (bench-verified: "todo" falls back to "Todo").
    expect(slugToDisplayName('todo')).toBe('Todo');
  });
});

describe('slug round-trips', () => {
  it('round-trips space-separated title-case names', () => {
    for (const name of ['Sales Order', 'User', 'Purchase Order Item', 'Note']) {
      expect(slugToDisplayName(toSlug(name))).toBe(name);
    }
  });

  it('round-trips any well-formed slug through the display name', () => {
    for (const slug of ['sales-order', 'todo', 'user', 'purchase-order-item']) {
      expect(toSlug(slugToDisplayName(slug))).toBe(slug);
    }
  });
});

describe('path builders', () => {
  it('homePath returns the base', () => {
    expect(homePath()).toBe('/backoffice');
    expect(BACKOFFICE_BASE).toBe('/backoffice');
  });

  it('workspacePath slugs the workspace name', () => {
    expect(workspacePath('Users')).toBe('/backoffice/users');
    expect(workspacePath('Reports & Masters')).toBe('/backoffice/reports-&-masters');
  });

  it('listPath slugs the doctype', () => {
    expect(listPath('Sales Order')).toBe('/backoffice/sales-order');
    expect(listPath('ToDo')).toBe('/backoffice/todo');
  });

  it('viewPath routes list to the plain list path and other views under /view/', () => {
    expect(viewPath('ToDo', 'list')).toBe('/backoffice/todo');
    expect(viewPath('ToDo', 'kanban')).toBe('/backoffice/todo/view/kanban');
    expect(viewPath('Sales Order', 'report')).toBe('/backoffice/sales-order/view/report');
    expect(viewPath('Event', 'calendar')).toBe('/backoffice/event/view/calendar');
  });

  it('newDocPath (no defaults) is the stable /new route', () => {
    expect(newDocPath('ToDo')).toBe('/backoffice/todo/new');
    expect(newDocPath('Sales Order')).toBe('/backoffice/sales-order/new');
  });

  it('newDocPath with a defaults argument still targets the /new route', () => {
    // Tolerant: before the prefill change extra args are ignored (exact
    // /new path); after it, defaults serialize into a ?d= query param.
    const result = (newDocPath as (doctype: string, defaults?: Record<string, unknown>) => string)('ToDo', {
      status: 'Open',
    });
    expect(result === '/backoffice/todo/new' || result.startsWith('/backoffice/todo/new?')).toBe(true);
  });

  it('formPath URI-encodes the document name', () => {
    expect(formPath('ToDo', 'abc123')).toBe('/backoffice/todo/abc123');
    expect(formPath('User', 'test@example.com')).toBe('/backoffice/user/test%40example.com');
    expect(formPath('Sales Order', 'SAL-ORD-2026-00001')).toBe('/backoffice/sales-order/SAL-ORD-2026-00001');
    // Names containing a slash must not create extra route segments.
    expect(formPath('Item', 'A/B')).toBe('/backoffice/item/A%2FB');
  });

  it('queryReportPath URI-encodes the report name', () => {
    expect(queryReportPath('Permitted Documents For User')).toBe(
      '/backoffice/query-report/Permitted%20Documents%20For%20User',
    );
  });

  it('createBackofficePaths binds every builder to the mount prefix', () => {
    const paths = createBackofficePaths('/desk');
    expect(paths.home()).toBe('/desk');
    expect(paths.workspace('Users')).toBe('/desk/users');
    expect(paths.list('Sales Order')).toBe('/desk/sales-order');
    expect(paths.view('ToDo', 'kanban')).toBe('/desk/todo/view/kanban');
    expect(paths.newDoc('ToDo')).toBe('/desk/todo/new');
    expect(paths.form('User', 'test@example.com')).toBe('/desk/user/test%40example.com');
    expect(paths.queryReport('My Report')).toBe('/desk/query-report/My%20Report');
  });
});

describe(isBackofficeView, () => {
  it('accepts every declared view', () => {
    expect(BACKOFFICE_VIEWS).toEqual(['list', 'report', 'kanban', 'calendar', 'tree', 'image', 'dashboard']);
    for (const view of BACKOFFICE_VIEWS) {
      expect(isBackofficeView(view)).toBe(true);
    }
  });

  it('rejects unknown or wrongly-cased values', () => {
    expect(isBackofficeView('grid')).toBe(false);
    expect(isBackofficeView('List')).toBe(false);
    expect(isBackofficeView('')).toBe(false);
    expect(isBackofficeView('kanban ')).toBe(false);
  });
});
