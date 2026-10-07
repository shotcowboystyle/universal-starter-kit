import { describe, expect, it } from 'vitest';

import { deskDocUrl, deskViewUrl } from './deskLinks';

const BASE = 'http://127.0.0.1:8000';

describe(deskDocUrl, () => {
  it('builds the desk form route from doctype + name', () => {
    expect(deskDocUrl(BASE, 'Pokemon', 'pikachu')).toBe(`${BASE}/app/pokemon/pikachu`);
  });

  it('slugs multi-word doctypes like frappe.router.slug', () => {
    expect(deskDocUrl(BASE, 'Kanban Board', 'Test Board')).toBe(`${BASE}/app/kanban-board/Test%20Board`);
  });

  it('encodes reserved characters in doc names', () => {
    expect(deskDocUrl(BASE, 'ToDo', 'a/b?c#d')).toBe(`${BASE}/app/todo/a%2Fb%3Fc%23d`);
  });

  it('trims trailing slashes off the base URL', () => {
    expect(deskDocUrl(`${BASE}/`, 'User', 'test@example.com')).toBe(`${BASE}/app/user/test%40example.com`);
  });
});

describe(deskViewUrl, () => {
  it("list view is desk's bare slug route", () => {
    expect(deskViewUrl(BASE, 'ToDo')).toBe(`${BASE}/app/todo`);
    expect(deskViewUrl(BASE, 'ToDo', 'list')).toBe(`${BASE}/app/todo`);
  });

  it('alternate views ride /view/<view>', () => {
    expect(deskViewUrl(BASE, 'ToDo', 'kanban')).toBe(`${BASE}/app/todo/view/kanban`);
    expect(deskViewUrl(BASE, 'Sales Order', 'report')).toBe(`${BASE}/app/sales-order/view/report`);
  });
});
