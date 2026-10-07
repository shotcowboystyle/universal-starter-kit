/**
 * formLayout — desk layout-engine parity specs. Ground truth:
 * frappe/public/js/frappe/form/layout.js (+ section.js, tab.js) and
 * frappe/public/js/frappe/model/perm.js get_field_display_status.
 */
import { describe, expect, it } from 'vitest';

import type { DocFieldMeta } from './doctypeMeta';
import { buildPermLevelMatrix } from './fieldPermissions';
import { buildCreateDefaults, buildFormTabs } from './formLayout';
import type { BuildTabsOptions } from './formLayout';

function field(overrides: Partial<DocFieldMeta> & { fieldname: string }): DocFieldMeta {
  return { fieldtype: 'Data', label: overrides.fieldname, ...overrides };
}

function build(fields: DocFieldMeta[], overrides: Partial<BuildTabsOptions> = {}): ReturnType<typeof buildFormTabs> {
  return buildFormTabs({
    fields,
    doc: {},
    docstatus: 0,
    formReadOnly: false,
    isCreate: false,
    detailsLabel: 'Details',
    ...overrides,
  });
}

function flatFieldNames(tabs: ReturnType<typeof buildFormTabs>): string[] {
  return tabs.flatMap((tab) => tab.schema.fields.map((f) => f.name));
}

function findField(tabs: ReturnType<typeof buildFormTabs>, name: string) {
  for (const tab of tabs) {
    const hit = tab.schema.fields.find((f) => f.name === name);
    if (hit) {
      return hit;
    }
  }
  return;
}

describe('tab / section / column grouping', () => {
  it('groups fields under Tab Breaks with an implicit Details tab', () => {
    const tabs = build([
      field({ fieldname: 'a' }),
      field({ fieldname: 'tab1', fieldtype: 'Tab Break', label: 'More' }),
      field({ fieldname: 'b' }),
    ]);
    expect(tabs.map((t) => t.key)).toEqual(['__details', 'tab1']);
    expect(tabs[0].label).toBe('Details');
    expect(tabs[0].schema.fields.map((f) => f.name)).toEqual(['a']);
    expect(tabs[1].schema.fields.map((f) => f.name)).toEqual(['b']);
  });

  it('drops the implicit Details tab when the doctype starts with a Tab Break (User)', () => {
    const tabs = build([
      field({ fieldname: 'details_tab', fieldtype: 'Tab Break', label: 'User Details' }),
      field({ fieldname: 'email' }),
    ]);
    expect(tabs.map((t) => t.key)).toEqual(['details_tab']);
  });

  it('splits Section Breaks into sections and Column Breaks into columns', () => {
    const tabs = build([
      field({ fieldname: 'a' }),
      field({ fieldname: 'sec1', fieldtype: 'Section Break', label: 'Second' }),
      field({ fieldname: 'b' }),
      field({ fieldname: 'col1', fieldtype: 'Column Break' }),
      field({ fieldname: 'c' }),
    ]);
    const { sections } = tabs[0].schema;
    expect(sections).toHaveLength(2);
    expect(sections[1].label).toBe('Second');
    expect(sections[1].columns).toHaveLength(2);
    expect(sections[1].columns[0].fields[0].name).toBe('b');
    expect(sections[1].columns[1].fields[0].name).toBe('c');
  });
});

describe('hidden + depends_on visibility', () => {
  it('drops hidden fields', () => {
    const tabs = build([field({ fieldname: 'a' }), field({ fieldname: 'b', hidden: 1 })]);
    expect(flatFieldNames(tabs)).toEqual(['a']);
  });

  it('auto-hides a section when all its fields hide (desk empty-section)', () => {
    const tabs = build([
      field({ fieldname: 'a' }),
      field({ fieldname: 'sec1', fieldtype: 'Section Break', label: 'Hidden Section' }),
      field({ fieldname: 'b', hidden: 1 }),
      field({ fieldname: 'c', depends_on: 'eval:doc.missing' }),
    ]);
    expect(tabs[0].schema.sections).toHaveLength(1);
  });

  it('auto-hides a tab when all its sections hide', () => {
    const tabs = build([
      field({ fieldname: 'a' }),
      field({ fieldname: 'tab1', fieldtype: 'Tab Break', label: 'Empty' }),
      field({ fieldname: 'b', hidden: 1 }),
    ]);
    expect(tabs.map((t) => t.key)).toEqual(['__details']);
  });

  it('hides a whole section when its Section Break depends_on is false', () => {
    const tabs = build(
      [
        field({ fieldname: 'a' }),
        field({
          fieldname: 'sec1',
          fieldtype: 'Section Break',
          depends_on: 'eval:doc.show_more',
        }),
        field({ fieldname: 'b' }),
      ],
      { doc: { show_more: 0 } },
    );
    expect(flatFieldNames(tabs)).toEqual(['a']);
  });

  it('re-resolves depends_on against the live doc', () => {
    const fields = [
      field({ fieldname: 'channel', fieldtype: 'Select', options: 'Email\nSlack' }),
      field({
        fieldname: 'slack_webhook_url',
        depends_on: "eval:doc.channel=='Slack'",
        mandatory_depends_on: "eval:doc.channel=='Slack'",
      }),
    ];
    expect(flatFieldNames(build(fields, { doc: { channel: 'Email' } }))).toEqual(['channel']);
    const slackTabs = build(fields, { doc: { channel: 'Slack' } });
    expect(flatFieldNames(slackTabs)).toEqual(['channel', 'slack_webhook_url']);
    expect(findField(slackTabs, 'slack_webhook_url')?.required).toBe(true);
  });
});

describe('read_only / read_only_depends_on / set_only_once', () => {
  it('marks read_only fields readOnly', () => {
    const tabs = build([field({ fieldname: 'a', read_only: 1 })]);
    expect(findField(tabs, 'a')?.readOnly).toBe(true);
  });

  it('resolves read_only_depends_on per doc state', () => {
    const fields = [field({ fieldname: 'a', read_only_depends_on: 'eval:doc.locked' })];
    expect(findField(build(fields, { doc: { locked: 1 } }), 'a')?.readOnly).toBe(true);
    expect(findField(build(fields, { doc: { locked: 0 } }), 'a')?.readOnly).toBe(false);
  });

  it('set_only_once: editable on new docs, read-only on saved docs (perm.js:261)', () => {
    const fields = [field({ fieldname: 'a', set_only_once: 1 })];
    expect(findField(build(fields, { isCreate: true }), 'a')?.readOnly).toBe(false);
    expect(findField(build(fields, { isCreate: false }), 'a')?.readOnly).toBe(true);
  });
});

describe('docstatus lifecycle locking', () => {
  const fields = [field({ fieldname: 'locked_field' }), field({ fieldname: 'open_field', allow_on_submit: 1 })];

  it('docstatus 1 locks everything except allow_on_submit', () => {
    const tabs = build(fields, { docstatus: 1 });
    expect(findField(tabs, 'locked_field')?.readOnly).toBe(true);
    expect(findField(tabs, 'open_field')?.readOnly).toBe(false);
  });

  it('docstatus 2 locks allow_on_submit fields too', () => {
    const tabs = build(fields, { docstatus: 2 });
    expect(findField(tabs, 'open_field')?.readOnly).toBe(true);
  });
});

describe('permlevel gating (perm.js get_field_display_status)', () => {
  const permissions = [
    { role: 'System Manager', permlevel: 0, read: 1 as const, write: 1 as const },
    { role: 'System Manager', permlevel: 1, read: 1 as const, write: 1 as const },
    { role: 'Auditor', permlevel: 1, read: 1 as const, write: 0 as const },
    { role: 'Desk User', permlevel: 0, read: 1 as const, write: 1 as const },
  ];
  const fields = [field({ fieldname: 'plain' }), field({ fieldname: 'restricted', permlevel: 1 })];

  it('write at the level → editable (fixes the coarse always-read-only rule)', () => {
    const matrix = buildPermLevelMatrix(permissions, ['System Manager']);
    const tabs = build(fields, { permLevels: matrix });
    expect(findField(tabs, 'restricted')?.readOnly).toBe(false);
  });

  it('read without write at the level → read-only', () => {
    const matrix = buildPermLevelMatrix(permissions, ['Auditor']);
    const tabs = build(fields, { permLevels: matrix });
    expect(findField(tabs, 'restricted')?.readOnly).toBe(true);
  });

  it('no read at the level → field hidden (desk status None)', () => {
    const matrix = buildPermLevelMatrix(permissions, ['Desk User']);
    const tabs = build(fields, { permLevels: matrix });
    expect(findField(tabs, 'restricted')).toBeUndefined();
    expect(findField(tabs, 'plain')).toBeDefined();
  });

  it('without a matrix falls back to coarse permlevel>0 read-only, never hidden', () => {
    const tabs = build(fields);
    expect(findField(tabs, 'restricted')?.readOnly).toBe(true);
  });

  it('hides a Tab Break the user cannot read (tab.js:41)', () => {
    const matrix = buildPermLevelMatrix(permissions, ['Desk User']);
    const tabs = build(
      [
        field({ fieldname: 'a' }),
        field({ fieldname: 'sec_tab', fieldtype: 'Tab Break', label: 'Secret', permlevel: 1 }),
        field({ fieldname: 'b' }),
      ],
      { permLevels: matrix },
    );
    expect(tabs.map((t) => t.key)).toEqual(['__details']);
  });
});

describe('section collapse state (layout.js refresh_section_collapse)', () => {
  it('collapsible sections start collapsed', () => {
    const tabs = build([
      field({ fieldname: 'sec1', fieldtype: 'Section Break', label: 'S', collapsible: 1 }),
      field({ fieldname: 'a' }),
    ]);
    expect(tabs[0].schema.sections[0].collapsed).toBe(true);
  });

  it('collapsible_depends_on truthy → expanded (Notification print settings)', () => {
    const fields = [
      field({
        fieldname: 'sec1',
        fieldtype: 'Section Break',
        label: 'S',
        collapsible: 1,
        collapsible_depends_on: 'attach_print',
      }),
      field({ fieldname: 'a' }),
    ];
    expect(build(fields, { doc: { attach_print: 1 } })[0].schema.sections[0].collapsed).toBe(false);
    expect(build(fields, { doc: { attach_print: 0 } })[0].schema.sections[0].collapsed).toBe(true);
  });

  it('a missing mandatory value forces the section open (section.js has_missing_mandatory)', () => {
    const fields = [
      field({ fieldname: 'sec1', fieldtype: 'Section Break', label: 'S', collapsible: 1 }),
      field({ fieldname: 'a', required: 1 }),
    ];
    expect(build(fields, { doc: {} })[0].schema.sections[0].collapsed).toBe(false);
    // Desk checks `value == null` — an empty string counts as present.
    expect(build(fields, { doc: { a: '' } })[0].schema.sections[0].collapsed).toBe(true);
  });

  it('non-collapsible sections have no collapse state', () => {
    const tabs = build([
      field({ fieldname: 'sec1', fieldtype: 'Section Break', label: 'S' }),
      field({ fieldname: 'a' }),
    ]);
    expect(tabs[0].schema.sections[0].collapsed).toBeUndefined();
    expect(tabs[0].schema.sections[0].collapsible).toBe(false);
  });

  it('forwards hide_border and description', () => {
    const tabs = build([
      field({
        fieldname: 'sec1',
        fieldtype: 'Section Break',
        label: 'S',
        hide_border: 1,
        description: 'About this group',
      }),
      field({ fieldname: 'a' }),
    ]);
    expect(tabs[0].schema.sections[0].hideBorder).toBe(true);
    expect(tabs[0].schema.sections[0].description).toBe('About this group');
  });
});

describe('fetch_from read-only lock', () => {
  const fields = [
    field({ fieldname: 'customer', fieldtype: 'Link', options: 'Customer' }),
    field({ fieldname: 'customer_name', fetch_from: 'customer.customer_name' }),
    field({
      fieldname: 'note',
      fetch_from: 'customer.note',
      fetch_if_empty: 1,
    }),
  ];

  it('locks a fetch target while its source link is set (base_input.js:56)', () => {
    const tabs = build(fields, { doc: { customer: 'CUST-1' } });
    expect(findField(tabs, 'customer_name')?.readOnly).toBe(true);
  });

  it('keeps the target editable when the source is empty or fetch_if_empty is set', () => {
    const emptyTabs = build(fields, { doc: {} });
    expect(findField(emptyTabs, 'customer_name')?.readOnly).toBe(false);
    const setTabs = build(fields, { doc: { customer: 'CUST-1' } });
    expect(findField(setTabs, 'note')?.readOnly).toBe(false);
  });
});

describe('field property pass-through', () => {
  it('forwards description, precision, and length', () => {
    const tabs = build([field({ fieldname: 'a', description: 'help', precision: '3', length: 20 })]);
    const schema = findField(tabs, 'a');
    expect(schema?.description).toBe('help');
    expect(schema?.precision).toBe(3);
    expect(schema?.maxLength).toBe(20);
  });
});

describe('buildCreateDefaults (create_new.js get_default_value)', () => {
  it('seeds static, Today, and __user defaults', () => {
    const doc = buildCreateDefaults(
      [
        field({
          fieldname: 'status',
          fieldtype: 'Select',
          options: 'Open\nClosed',
          default: 'Open',
        }),
        field({ fieldname: 'date', fieldtype: 'Date', default: 'Today' }),
        field({ fieldname: 'owner_field', fieldtype: 'Link', options: 'User', default: '__user' }),
        field({ fieldname: 'count', fieldtype: 'Int', default: '5' }),
      ],
      'admin@example.com',
    );
    expect(doc.status).toBe('Open');
    expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.owner_field).toBe('admin@example.com');
    expect(doc.count).toBe(5);
  });

  it('seeds `user` alias on Link/Data only and `now` per fieldtype', () => {
    const doc = buildCreateDefaults(
      [
        field({ fieldname: 'who', fieldtype: 'Link', options: 'User', default: 'user' }),
        field({ fieldname: 'sel', fieldtype: 'Select', options: 'user\nrole', default: 'user' }),
        field({ fieldname: 'at_time', fieldtype: 'Time', default: 'now' }),
        field({ fieldname: 'at_dt', fieldtype: 'Datetime', default: 'now' }),
      ],
      'admin@example.com',
    );
    expect(doc.who).toBe('admin@example.com');
    expect(doc.sel).toBe('user'); // Select keeps its literal option
    expect(doc.at_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(doc.at_dt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('seeds the first Select option when no default exists (create_new.js:107)', () => {
    const doc = buildCreateDefaults([
      field({ fieldname: 'kind', fieldtype: 'Select', options: 'Small\nLarge' }),
      field({ fieldname: 'empty_first', fieldtype: 'Select', options: '\nA\nB' }),
      field({ fieldname: 'placeholder', fieldtype: 'Select', options: '[Select]' }),
    ]);
    expect(doc.kind).toBe('Small');
    expect(doc.empty_first).toBe('');
    expect(doc.placeholder).toBeUndefined();
  });

  it('leaves server-resolved tokens unset', () => {
    const doc = buildCreateDefaults([
      field({ fieldname: 'company', fieldtype: 'Link', options: 'Company', default: ':Company' }),
      field({ fieldname: 'fullname', fieldtype: 'Data', default: 'user_fullname' }),
    ]);
    expect(doc.company).toBeUndefined();
    expect(doc.fullname).toBeUndefined();
  });
});
