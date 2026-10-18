// Pins the timeline's version-diff contract (desk parity: edits show
// `field: old → new`): parseVersionData extracts display-safe from/to values
// (HTML stripped, long values truncated, rich-only markup flagged) and
// versionSummary renders them for single AND multi-field changes with
// honest placeholders — never raw markup, never a bare field-name list
// that hides the values.
import { describe, expect, it } from 'vitest';

import { buildTimelineFeed, parseVersionData, versionSummary } from './timeline-entries';
import type { TimelineTranslate } from './timeline-entries';

/** Interpolating fake translate — applies the defaultValue template. */
const translate: TimelineTranslate = (_key, options) => {
  let out = options.defaultValue;
  for (const [key, value] of Object.entries(options)) {
    if (key === 'defaultValue') {
      continue;
    }
    out = out.split(`{{${key}}}`).join(String(value));
  }
  return out;
};

type Json = string | number | boolean | null | Json[] | JsonObject;
interface JsonObject {
  [key: string]: Json;
}

const data = (payload: Json) => JSON.stringify(payload);

describe(parseVersionData, () => {
  it('extracts from/to for changed fields', () => {
    const parsed = parseVersionData(data({ changed: [['status', 'Open', 'Closed']] }));
    expect(parsed?.changed).toStrictEqual([{ field: 'status', from: 'Open', to: 'Closed' }]);
  });

  it('strips HTML markup from rich-text values (never raw tags in the feed)', () => {
    const parsed = parseVersionData(
      data({ changed: [['description', '<p>old copy</p>', '<div>new <b>copy</b></div>']] }),
    );
    expect(parsed?.changed).toStrictEqual([{ field: 'description', from: 'old copy', to: 'new copy' }]);
  });

  it('flags rich markup with no extractable text instead of faking empty', () => {
    const parsed = parseVersionData(data({ changed: [['description', '<img src="x.png">', '<p>now text</p>']] }));
    expect(parsed?.changed).toStrictEqual([{ field: 'description', fromRich: true, to: 'now text' }]);
  });

  it('truncates long values with an ellipsis', () => {
    const long = 'x'.repeat(80);
    const parsed = parseVersionData(data({ changed: [['subject', long, 'short']] }));
    const from = parsed?.changed[0]?.from ?? '';
    expect(from).toHaveLength(50);
    expect(from.endsWith('…')).toBe(true);
  });

  it('treats null/undefined/empty as absent values', () => {
    const parsed = parseVersionData(data({ changed: [['middle_name', '', null]] }));
    expect(parsed?.changed).toStrictEqual([{ field: 'middle_name' }]);
  });

  it('keeps numeric and object values displayable', () => {
    const parsed = parseVersionData(
      data({
        changed: [
          ['priority', 0, 1],
          ['meta', { a: 1 }, 'b'],
        ],
      }),
    );
    expect(parsed?.changed[0]).toStrictEqual({ field: 'priority', from: '0', to: '1' });
    expect(parsed?.changed[1]).toStrictEqual({ field: 'meta', from: '{"a":1}', to: 'b' });
  });

  it('collects child-table field lists (deduped)', () => {
    const parsed = parseVersionData(
      data({
        changed: [],
        added: [
          ['items', {}],
          ['items', {}],
          ['taxes', {}],
        ],
        removed: [['items', {}]],
        row_changed: [['taxes', 0, 'x', []]],
      }),
    );
    expect(parsed?.added).toStrictEqual(['items', 'taxes']);
    expect(parsed?.removed).toStrictEqual(['items']);
    expect(parsed?.rowChanged).toStrictEqual(['taxes']);
  });

  it('returns undefined for malformed or empty payloads', () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; omitting it is TS2554
    expect(parseVersionData(undefined)).toBeUndefined();
    expect(parseVersionData('')).toBeUndefined();
    expect(parseVersionData('{not json')).toBeUndefined();
    expect(parseVersionData(data(['array-root']))).toBeUndefined();
    expect(parseVersionData(data({ changed: [] }))).toBeUndefined();
    expect(parseVersionData(data({ changed: [['', 'a', 'b']] }))).toBeUndefined();
  });
});

describe(versionSummary, () => {
  it('renders a single change as field from → to', () => {
    const parsed = parseVersionData(data({ changed: [['status', 'Open', 'Closed']] }));
    expect(versionSummary(parsed!, translate)).toBe('changed value of Status from Open to Closed');
  });

  it('renders (empty) placeholders for absent sides', () => {
    const parsed = parseVersionData(data({ changed: [['middle_name', '', 'ParityAudit']] }));
    expect(versionSummary(parsed!, translate)).toBe('changed value of Middle Name from (empty) to ParityAudit');
  });

  it("renders every field's old → new in multi-field changes (desk parity)", () => {
    const parsed = parseVersionData(
      data({
        changed: [
          ['description', '<p>alpha</p>', '<p>beta</p>'],
          ['status', 'Open', 'Closed'],
        ],
      }),
    );
    expect(versionSummary(parsed!, translate)).toBe(
      'changed values for Description from alpha to beta, Status from Open to Closed',
    );
  });

  it('renders the rich-content placeholder instead of raw markup', () => {
    const parsed = parseVersionData(data({ changed: [['description', '<img src="a.png">', '<p>text now</p>']] }));
    expect(versionSummary(parsed!, translate)).toBe(
      'changed value of Description from (formatted content) to text now',
    );
  });

  it('appends child-table sentences after value changes', () => {
    const parsed = parseVersionData(
      data({
        changed: [['status', 'Open', 'Closed']],
        added: [['items', {}]],
        removed: [['taxes', {}]],
        row_changed: [['items', 0, 'qty', []]],
      }),
    );
    expect(versionSummary(parsed!, translate)).toBe(
      'changed value of Status from Open to Closed, added rows for Items, ' +
        'removed rows for Taxes, changed rows for Items',
    );
  });
});

describe('buildTimelineFeed pending (optimistic) comments', () => {
  it('marks __optimistic overlay rows as pending; server rows stay unmarked', () => {
    const feed = buildTimelineFeed({
      comments: [
        {
          name: 'SRV-1',
          creation: '2026-08-13 10:00:00',
          content: '<div>confirmed</div>',
          owner: 'a@example.com',
        },
        {
          name: 'tmp_abc',
          creation: '2026-08-13 11:00:00',
          content: '<div>optimistic</div>',
          owner: 'a@example.com',
          __optimistic: true,
        },
      ],
    });
    expect(feed).toHaveLength(2);
    // Newest first: the pending row sorts by its client timestamp.
    expect(feed[0].docname).toBe('tmp_abc');
    expect(feed[0].pending).toBe(true);
    expect(feed[0].content).toBe('optimistic');
    expect(feed[1].docname).toBe('SRV-1');
    expect(feed[1].pending).toBeUndefined();
  });
});
