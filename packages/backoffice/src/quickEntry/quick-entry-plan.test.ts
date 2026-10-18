/**
 * quickEntryPlan — desk-parity quick-entry planning, defaults seeding,
 * schema building, and server response/error parsing. Fixtures follow the
 * bench-probed shapes in p-results/backoffice/integration-notes.md:
 * the stock to-do doctype (description required-only, date quick-entry-flagged) motivates
 * the required|bold|allow_in_quick_entry union; create_doc responses arrive in
 * a {message: {...}} envelope; MandatoryError exceptions look like
 * "frappe.exceptions.MandatoryError: [Task, xxx]: field_a, field_b".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';

import {
  PROMPT_NAME_FIELD,
  buildQuickEntryDefaults,
  buildQuickEntrySchema,
  isEmptyFieldValue,
  parseServerError,
  planQuickEntry,
  resolveCreatedName,
} from './quick-entry-plan';

const field = (partial: Partial<DocFieldMeta> & { fieldname: string }): DocFieldMeta =>
  ({ fieldtype: 'Data', ...partial }) as DocFieldMeta;

const makeMeta = (partial: Partial<DoctypeMeta>): DoctypeMeta =>
  ({ name: 'ToDo', fields: [], ...partial }) as DoctypeMeta;

describe(planQuickEntry, () => {
  it('defers to the full form when quick entry is disabled on the meta', () => {
    expect(planQuickEntry(makeMeta({ quick_entry: 0 }))).toStrictEqual({
      kind: 'full-form',
      reason: 'quick-entry-disabled',
    });
    expect(planQuickEntry(makeMeta({}))).toStrictEqual({
      kind: 'full-form',
      reason: 'quick-entry-disabled',
    });
  });

  it('selects the union of required | bold | allow_in_quick_entry fields (stock ToDo case)', () => {
    const meta = makeMeta({
      quick_entry: 1,
      fields: [
        field({ fieldname: 'description', fieldtype: 'Text Editor', required: 1 }),
        field({ fieldname: 'date', fieldtype: 'Date', allow_in_quick_entry: 1 }),
        field({ fieldname: 'priority', fieldtype: 'Select', bold: 1 }),
        field({ fieldname: 'status', fieldtype: 'Select' }),
      ],
    });
    const plan = planQuickEntry(meta);
    expect(plan.kind).toBe('fields');
    if (plan.kind !== 'fields') {
      return;
    }
    // required-only description MUST be included or server-side validation
    // would always fail (the union regression the notes call out).
    expect(plan.fields.map((f) => f.fieldname)).toStrictEqual(['description', 'date', 'priority']);
    expect(plan.promptName).toBe(false);
  });

  it('excludes hidden, read-only, virtual, and layout fields even when flagged', () => {
    const meta = makeMeta({
      quick_entry: 1,
      fields: [
        field({ fieldname: 'keep', required: 1 }),
        field({ fieldname: 'secret', required: 1, hidden: 1 }),
        field({ fieldname: 'frozen', bold: 1, read_only: 1 }),
        field({ fieldname: 'computed', required: 1, is_virtual: 1 } as Partial<DocFieldMeta> & {
          fieldname: string;
        }),
        field({ fieldname: 'sec', fieldtype: 'Section Break', allow_in_quick_entry: 1 }),
        field({ fieldname: 'col', fieldtype: 'Column Break', required: 1 }),
        field({ fieldname: 'tab', fieldtype: 'Tab Break', bold: 1 }),
        field({ fieldname: 'fold', fieldtype: 'Fold', required: 1 }),
      ],
    });
    const plan = planQuickEntry(meta);
    expect(plan.kind).toBe('fields');
    if (plan.kind !== 'fields') {
      return;
    }
    expect(plan.fields.map((f) => f.fieldname)).toStrictEqual(['keep']);
  });

  it('defers to the full form when no usable field remains', () => {
    const meta = makeMeta({
      quick_entry: 1,
      fields: [field({ fieldname: 'plain' }), field({ fieldname: 'hidden_required', required: 1, hidden: 1 })],
    });
    expect(planQuickEntry(meta)).toStrictEqual({ kind: 'full-form', reason: 'no-fields' });
  });

  it('defers to the full form when a selected field is a child Table', () => {
    const meta = makeMeta({
      quick_entry: 1,
      fields: [
        field({ fieldname: 'title', required: 1 }),
        field({ fieldname: 'items', fieldtype: 'Table', required: 1, options: 'Item Row' }),
      ],
    });
    expect(planQuickEntry(meta)).toStrictEqual({ kind: 'full-form', reason: 'child-table' });
  });

  it('flags prompt-autonamed doctypes (case-insensitive)', () => {
    const fields = [field({ fieldname: 'title', required: 1 })];
    const prompt = planQuickEntry(makeMeta({ quick_entry: 1, autoname: 'Prompt', fields }));
    expect(prompt.kind === 'fields' && prompt.promptName).toBe(true);
    const lower = planQuickEntry(makeMeta({ quick_entry: 1, autoname: 'prompt', fields }));
    expect(lower.kind === 'fields' && lower.promptName).toBe(true);
    const hash = planQuickEntry(makeMeta({ quick_entry: 1, autoname: 'hash', fields }));
    expect(hash.kind === 'fields' && hash.promptName).toBe(false);
  });

  it('exposes the synthetic prompt-name fieldname', () => {
    expect(PROMPT_NAME_FIELD).toBe('__newname');
  });
});

describe(buildQuickEntryDefaults, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves Today for Date and Datetime fields', () => {
    vi.useFakeTimers();
    // local 2026-08-12
    vi.setSystemTime(new Date(2026, 7, 12, 10, 30));
    const draft = buildQuickEntryDefaults([
      field({ fieldname: 'date', fieldtype: 'Date', default: 'Today' }),
      field({ fieldname: 'at', fieldtype: 'Datetime', default: 'Today' }),
    ]);
    expect(draft).toStrictEqual({ date: '2026-08-12', at: '2026-08-12' });
  });

  it('keeps a literal Today on non-date fields', () => {
    const draft = buildQuickEntryDefaults([field({ fieldname: 'note', fieldtype: 'Data', default: 'Today' })]);
    expect(draft).toStrictEqual({ note: 'Today' });
  });

  it('coerces numeric fieldtype defaults (incl. Check 0/1)', () => {
    const draft = buildQuickEntryDefaults([
      field({ fieldname: 'qty', fieldtype: 'Int', default: '5' }),
      field({ fieldname: 'rate', fieldtype: 'Float', default: '2.5' }),
      field({ fieldname: 'enabled', fieldtype: 'Check', default: '1' }),
      field({ fieldname: 'disabled', fieldtype: 'Check', default: '0' }),
      field({ fieldname: 'stars', fieldtype: 'Rating', default: '0.4' }),
    ]);
    expect(draft).toStrictEqual({ qty: 5, rate: 2.5, enabled: 1, disabled: 0, stars: 0.4 });
  });

  it('coerces unparseable numeric defaults to 0', () => {
    const draft = buildQuickEntryDefaults([field({ fieldname: 'qty', fieldtype: 'Int', default: 'abc' })]);
    expect(draft).toStrictEqual({ qty: 0 });
  });

  it('keeps literal string defaults on non-numeric fields', () => {
    const draft = buildQuickEntryDefaults([field({ fieldname: 'status', fieldtype: 'Select', default: 'Open' })]);
    expect(draft).toStrictEqual({ status: 'Open' });
  });

  it('uses pre-coerced non-string defaults as-is', () => {
    const draft = buildQuickEntryDefaults([
      field({ fieldname: 'qty', fieldtype: 'Int', default: 7 as unknown as string }),
    ]);
    expect(draft).toStrictEqual({ qty: 7 });
  });

  it('skips empty defaults and server-resolved tokens', () => {
    const draft = buildQuickEntryDefaults([
      field({ fieldname: 'a' }),
      field({ fieldname: 'b', default: '' }),
      field({ fieldname: 'owner', default: '__user' }),
      field({ fieldname: 'linked', default: ':customer' }),
      field({ fieldname: 'company', default: "frappe.defaults.get_user_default('Company')" }),
    ]);
    expect(draft).toStrictEqual({});
  });

  it('merges extra defaults over meta defaults', () => {
    const draft = buildQuickEntryDefaults([field({ fieldname: 'status', fieldtype: 'Select', default: 'Open' })], {
      status: 'Closed',
      priority: 'High',
    });
    expect(draft).toStrictEqual({ status: 'Closed', priority: 'High' });
  });
});

describe(buildQuickEntrySchema, () => {
  it('builds a single-section single-column schema with mapped fields', () => {
    const schema = buildQuickEntrySchema([
      field({
        fieldname: 'description',
        fieldtype: 'Text Editor',
        label: 'Description',
        required: 1,
        depends_on: "eval:doc.status != 'Closed'",
      }),
      field({ fieldname: 'rate', fieldtype: 'Float', precision: '2', read_only: 1 }),
    ]);
    expect(schema.sections).toHaveLength(1);
    expect(schema.sections?.[0]?.columns).toHaveLength(1);
    expect(schema.sections?.[0]?.columns?.[0]?.fields).toBe(schema.fields);

    const [description, rate] = schema.fields ?? [];
    expect(description).toMatchObject({
      type: 'Text Editor',
      fieldtype: 'Text Editor',
      name: 'description',
      fieldname: 'description',
      label: 'Description',
      required: true,
      readOnly: false,
      depends_on: "eval:doc.status != 'Closed'",
    });
    expect(rate).toMatchObject({ required: false, readOnly: true, precision: 2 });
  });

  it('leaves precision undefined when meta omits it', () => {
    const schema = buildQuickEntrySchema([field({ fieldname: 'x', precision: '' })]);
    expect(schema.fields?.[0]?.precision).toBeUndefined();
  });
});

describe(isEmptyFieldValue, () => {
  it('treats nullish, blank strings, and empty arrays as empty', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(isEmptyFieldValue(undefined)).toBe(true);
    expect(isEmptyFieldValue(null)).toBe(true);
    expect(isEmptyFieldValue('')).toBe(true);
    expect(isEmptyFieldValue('   ')).toBe(true);
    expect(isEmptyFieldValue([])).toBe(true);
  });

  it('treats 0 and false as VALUES (valid Check state), not empty', () => {
    expect(isEmptyFieldValue(0)).toBe(false);
    expect(isEmptyFieldValue(false)).toBe(false);
  });

  it('treats real content as non-empty', () => {
    expect(isEmptyFieldValue('x')).toBe(false);
    expect(isEmptyFieldValue([1])).toBe(false);
    expect(isEmptyFieldValue({})).toBe(false);
  });
});

describe(resolveCreatedName, () => {
  it('reads the name from a direct doc payload (fixture providers)', () => {
    expect(resolveCreatedName({ name: '07mrhbtku7', doctype: 'ToDo' })).toBe('07mrhbtku7');
  });

  it('reads the name from the {message} envelope (live create_doc)', () => {
    expect(resolveCreatedName({ message: { name: 'TODO-0001', doctype: 'ToDo' } })).toBe('TODO-0001');
  });

  it('prefers the direct name over the envelope', () => {
    expect(resolveCreatedName({ name: 'outer', message: { name: 'inner' } })).toBe('outer');
  });

  it('falls through an empty direct name to the envelope', () => {
    expect(resolveCreatedName({ name: '', message: { name: 'inner' } })).toBe('inner');
  });

  it('returns empty string for unusable payloads', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
    expect(resolveCreatedName(undefined)).toBe('');
    expect(resolveCreatedName(null)).toBe('');
    expect(resolveCreatedName('string')).toBe('');
    expect(resolveCreatedName(42)).toBe('');
    expect(resolveCreatedName({})).toBe('');
    expect(resolveCreatedName({ message: 'not a doc' })).toBe('');
    expect(resolveCreatedName({ message: { name: 5 } })).toBe('');
  });
});

describe(parseServerError, () => {
  const FALLBACK = 'Could not create the document.';

  it('extracts missing fieldnames from a MandatoryError exception', () => {
    const err = {
      data: {
        exc_type: 'MandatoryError',
        exception: 'frappe.exceptions.MandatoryError: [ToDo, new-todo-aaa]: description',
      },
    };
    expect(parseServerError(err, FALLBACK)).toStrictEqual({ missingFields: ['description'] });
  });

  it('splits multiple missing fields on commas', () => {
    const err = {
      exc_type: 'MandatoryError',
      exception: 'frappe.exceptions.MandatoryError: [Note, new-note-bbb]: title, content',
    };
    expect(parseServerError(err, FALLBACK)).toStrictEqual({ missingFields: ['title', 'content'] });
  });

  it('parses _server_messages (JSON array of JSON strings) and strips HTML', () => {
    const err = {
      data: {
        _server_messages: JSON.stringify([
          JSON.stringify({ message: '<b>Value missing</b> for Priority', title: 'Message' }),
        ]),
      },
    };
    expect(parseServerError(err, FALLBACK)).toStrictEqual({
      general: 'Value missing for Priority',
      missingFields: [],
    });
  });

  it('joins multiple server messages with newlines and keeps raw string entries', () => {
    const err = {
      _server_messages: JSON.stringify([JSON.stringify({ message: 'First problem' }), 'Second raw problem']),
    };
    expect(parseServerError(err, FALLBACK)).toStrictEqual({
      general: 'First problem\nSecond raw problem',
      missingFields: [],
    });
  });

  it('keeps the human part of a ValidationError exception string', () => {
    const err = {
      data: {
        exc_type: 'ValidationError',
        exception: 'frappe.exceptions.ValidationError: Date must be in the future',
      },
    };
    expect(parseServerError(err, FALLBACK)).toStrictEqual({
      general: 'Date must be in the future',
      missingFields: [],
    });
  });

  it('uses a short plain error message when nothing frappe-shaped exists', () => {
    expect(parseServerError(new Error('Network request failed'), FALLBACK)).toStrictEqual({
      general: 'Network request failed',
      missingFields: [],
    });
  });

  it('never surfaces tracebacks or oversized messages', () => {
    expect(parseServerError(new Error('Traceback (most recent call last): ...'), FALLBACK)).toStrictEqual({
      general: FALLBACK,
      missingFields: [],
    });
    expect(parseServerError(new Error('x'.repeat(301)), FALLBACK)).toStrictEqual({
      general: FALLBACK,
      missingFields: [],
    });
  });

  it('falls back for empty or non-object errors', () => {
    expect(parseServerError(undefined, FALLBACK)).toStrictEqual({
      general: FALLBACK,
      missingFields: [],
    });
    expect(parseServerError('boom', FALLBACK)).toStrictEqual({ general: FALLBACK, missingFields: [] });
    expect(parseServerError({}, FALLBACK)).toStrictEqual({ general: FALLBACK, missingFields: [] });
  });
});
