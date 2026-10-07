// Fixture meta in → expected view list out. The fixture shapes mirror real
// bench doctypes whose desk switcher was observed live (frappe 15.8.1,
// p-results/audit-view-switcher-meta.md): ToDo, Test Tree Node, Note, User,
// Pokemon, Activity Log.
import { describe, expect, it } from 'vitest';

import type { DoctypeMeta } from '../shared/useDoctypeMeta';

import { deriveAvailableViews, isViewSupported } from './viewAvailability';

function makeMeta(overrides: Partial<DoctypeMeta> = {}): DoctypeMeta {
  return { name: 'QaDoc', fields: [], ...overrides };
}

/** ToDo shape: Select fields + `__calendar_js` — kanban + calendar, no tree/image. */
const todoLike = makeMeta({
  name: 'ToDo',
  __calendar_js: "frappe.views.calendar['ToDo'] = {};",
  fields: [
    { fieldname: 'description', fieldtype: 'Small Text' },
    { fieldname: 'status', fieldtype: 'Select', options: 'Open\nClosed\nCancelled' },
    { fieldname: 'priority', fieldtype: 'Select', options: 'High\nMedium\nLow' },
    { fieldname: 'date', fieldtype: 'Date' },
  ],
});

/** Test Tree Node shape: is_tree and nothing else. */
const treeNodeLike = makeMeta({
  name: 'Test Tree Node',
  is_tree: 1,
  fields: [{ fieldname: 'tree_node_name', fieldtype: 'Data' }],
});

/** Note shape: a date field only — neither calendar (no `__calendar_js`)
 * nor kanban (no Select field). */
const noteLike = makeMeta({
  name: 'Note',
  fields: [
    { fieldname: 'title', fieldtype: 'Data' },
    { fieldname: 'expire_notification_on', fieldtype: 'Date' },
  ],
});

/** User shape: image_field + date + Select fields. No calendar asset. */
const userLike = makeMeta({
  name: 'User',
  image_field: 'user_image',
  fields: [
    { fieldname: 'user_image', fieldtype: 'Attach Image' },
    { fieldname: 'birth_date', fieldtype: 'Date' },
    { fieldname: 'desk_theme', fieldtype: 'Select', options: 'Light\nDark' },
  ],
});

/** Pokemon shape: image_field only — no date, no Select. */
const pokemonLike = makeMeta({
  name: 'Pokemon',
  image_field: 'sprite_front',
  fields: [
    { fieldname: 'pokemon_name', fieldtype: 'Data' },
    { fieldname: 'sprite_front', fieldtype: 'Attach Image' },
  ],
});

/** Activity Log: a Datetime + a Select, but no calendar config, not a
 * tree, no image_field. The date field used to leak Calendar into the
 * switcher (superset-of-desk bug). */
const activityLogLike = makeMeta({
  name: 'Activity Log',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data' },
    { fieldname: 'user', fieldtype: 'Link', options: 'User' },
    { fieldname: 'operation', fieldtype: 'Select', options: 'Login\nLogout\nImpersonate' },
    { fieldname: 'communication_date', fieldtype: 'Datetime' },
  ],
});

describe(deriveAvailableViews, () => {
  it('offers kanban + calendar for a ToDo-shaped doctype, never tree/image', () => {
    expect(deriveAvailableViews(todoLike)).toEqual(['list', 'report', 'kanban', 'calendar', 'dashboard']);
  });

  it('offers tree for an is_tree doctype', () => {
    expect(deriveAvailableViews(treeNodeLike)).toEqual(['list', 'report', 'tree', 'dashboard']);
  });

  it('offers tree when the meta ships __tree_js (desk treeview_settings source)', () => {
    const meta = makeMeta({ __tree_js: "frappe.treeview_settings['QaDoc'] = {};" });
    expect(deriveAvailableViews(meta)).toContain('tree');
  });

  it('hides calendar and kanban for a Note-shaped doctype (date field is not a calendar config)', () => {
    expect(deriveAvailableViews(noteLike)).toEqual(['list', 'report', 'dashboard']);
  });

  it('offers image for doctypes with meta.image_field', () => {
    expect(deriveAvailableViews(userLike)).toEqual(['list', 'report', 'kanban', 'image', 'dashboard']);
    expect(deriveAvailableViews(pokemonLike)).toEqual(['list', 'report', 'image', 'dashboard']);
  });

  it('does not offer image off a stray Attach Image field without meta.image_field', () => {
    const meta = makeMeta({
      fields: [{ fieldname: 'photo', fieldtype: 'Attach Image' }],
    });
    expect(deriveAvailableViews(meta)).not.toContain('image');
  });

  it('hides calendar/tree/image for Activity Log (date + Select, no calendar config)', () => {
    expect(deriveAvailableViews(activityLogLike)).toEqual(['list', 'report', 'kanban', 'dashboard']);
  });

  it('ignores hidden fields when detecting kanban / image support', () => {
    const meta = makeMeta({
      fields: [
        { fieldname: 'status', fieldtype: 'Select', options: 'A\nB', hidden: 1 },
        { fieldname: 'date', fieldtype: 'Date', hidden: 1 },
        { fieldname: 'photo', fieldtype: 'Attach Image', hidden: 1 },
      ],
    });
    expect(deriveAvailableViews(meta)).toEqual(['list', 'report', 'dashboard']);
  });

  it('treats a Select field without options as no kanban axis', () => {
    const meta = makeMeta({
      fields: [{ fieldname: 'status', fieldtype: 'Select', options: '' }],
    });
    expect(deriveAvailableViews(meta)).not.toContain('kanban');
  });

  it('offers only the unconditional views while meta is loading', () => {
    expect(deriveAvailableViews()).toEqual(['list', 'report', 'dashboard']);
  });

  it('always keeps the current view, even when unsupported (honest deep link)', () => {
    expect(deriveAvailableViews(noteLike, { current: 'tree' })).toEqual(['list', 'report', 'tree', 'dashboard']);
    expect(deriveAvailableViews(undefined, { current: 'kanban' })).toContain('kanban');
  });

  it('intersects with the host allowlist (current view still wins)', () => {
    expect(deriveAvailableViews(todoLike, { allow: ['list', 'kanban'] })).toEqual(['list', 'kanban']);
    expect(deriveAvailableViews(todoLike, { allow: [], current: 'report' })).toEqual(['report']);
  });
});

describe(isViewSupported, () => {
  it('list / report / dashboard are unconditional', () => {
    const bare = makeMeta();
    expect(isViewSupported('list', bare)).toBe(true);
    expect(isViewSupported('report', bare)).toBe(true);
    expect(isViewSupported('dashboard', bare)).toBe(true);
  });

  it('kanban is supported-but-unconfigured with a Select field and no board (stays visible)', () => {
    // Board existence is a config doc, not meta: it must never gate
    // availability — KanbanView offers the create-board dialog instead of
    // an empty board.
    expect(isViewSupported('kanban', todoLike)).toBe(true);
    expect(isViewSupported('kanban', noteLike)).toBe(false);
  });

  it('tree needs is_tree or __tree_js', () => {
    expect(isViewSupported('tree', treeNodeLike)).toBe(true);
    expect(isViewSupported('tree', todoLike)).toBe(false);
  });

  it('calendar needs __calendar_js, not merely a Date field', () => {
    expect(isViewSupported('calendar', todoLike)).toBe(true);
    expect(isViewSupported('calendar', noteLike)).toBe(false);
    expect(isViewSupported('calendar', activityLogLike)).toBe(false);
  });

  it('image needs meta.image_field', () => {
    expect(isViewSupported('image', userLike)).toBe(true);
    expect(isViewSupported('image', activityLogLike)).toBe(false);
  });
});
