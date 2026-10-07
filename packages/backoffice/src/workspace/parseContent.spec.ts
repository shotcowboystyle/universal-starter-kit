/**
 * parseContent — workspace content-block JSON parsing, HTML stripping,
 * link grouping, and frappe filter-string normalization. Filter fixtures
 * are the bench-verified shapes documented in the module header and
 * p-results/backoffice/integration-notes.md (dicts for stats_filter /
 * quick_list_filter, doctype-prefixed quads for Number Card filters_json).
 */
import { getGroupPosition } from '@repo/theme';
import { describe, expect, it } from 'vitest';

import {
  collapseLinkRows,
  composeWorkspaceBlocks,
  filterLinkGroup,
  findLinkGroup,
  findShortcut,
  groupLinks,
  headerLevel,
  parseFrappeFilters,
  parseWorkspaceContent,
  stripHtml,
} from './parseContent';
import type { WorkspaceBlock, WorkspaceDoc, WorkspaceLinkRow } from './types';

describe(parseWorkspaceContent, () => {
  it('parses a desk-shaped block array', () => {
    const content = JSON.stringify([
      {
        id: 'abc123',
        type: 'header',
        data: { text: '<span class="h4"><b>Your Shortcuts</b></span>', col: 12 },
      },
      { id: 'def456', type: 'shortcut', data: { shortcut_name: 'User', col: 3 } },
      { id: 'ghi789', type: 'card', data: { card_name: 'Masters', col: 4 } },
    ]);
    const blocks = parseWorkspaceContent(content);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('header');
    expect(blocks[1].data.shortcut_name).toBe('User');
    expect(blocks[2].data.card_name).toBe('Masters');
  });

  it('drops entries that are not blocks (null, scalars, missing type)', () => {
    const content = JSON.stringify([
      null,
      'string',
      42,
      { id: 'x', data: {} },
      { id: 'y', type: 5, data: {} },
      { id: 'z', type: 'spacer', data: {} },
    ]);
    const blocks = parseWorkspaceContent(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('z');
  });

  it('returns [] for empty, malformed, or non-array content', () => {
    expect(parseWorkspaceContent()).toEqual([]);
    expect(parseWorkspaceContent(null)).toEqual([]);
    expect(parseWorkspaceContent('')).toEqual([]);
    expect(parseWorkspaceContent('{not json')).toEqual([]);
    expect(parseWorkspaceContent('{"type":"header"}')).toEqual([]);
  });
});

describe(stripHtml, () => {
  it('strips desk rich-text wrappers (documented example)', () => {
    expect(stripHtml('<span class="h4"><b>Reports &amp; Masters</b></span>')).toBe('Reports & Masters');
  });

  it('decodes named entities', () => {
    expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
    expect(stripHtml('&quot;quoted&quot; &apos;s&apos;')).toBe('"quoted" \'s\'');
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('decodes decimal and hex numeric entities', () => {
    expect(stripHtml('&#65;&#66;')).toBe('AB');
    expect(stripHtml('&#x41;&#x42;')).toBe('AB');
  });

  it('leaves unknown entities untouched', () => {
    expect(stripHtml('&unknown;')).toBe('&unknown;');
  });

  it('converts <br> variants to newlines', () => {
    expect(stripHtml('a<br>b')).toBe('a\nb');
    expect(stripHtml('a<br/>b')).toBe('a\nb');
    expect(stripHtml('a<br />b')).toBe('a\nb');
  });

  it('trims and handles empty input', () => {
    expect(stripHtml('  <b> x </b>  ')).toBe('x');
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml()).toBe('');
  });
});

describe(headerLevel, () => {
  it('reads the hN class from the wrapper', () => {
    expect(headerLevel('<span class="h1">t</span>')).toBe(1);
    expect(headerLevel('<span class="h2">t</span>')).toBe(2);
    expect(headerLevel('<span class="h6">t</span>')).toBe(6);
  });

  it('finds hN among multiple classes (word boundary)', () => {
    expect(headerLevel('<span class="ce-header h3 muted">t</span>')).toBe(3);
  });

  it('falls back to 4 for unclassed, styled, or missing input', () => {
    expect(headerLevel('<b>plain</b>')).toBe(4);
    expect(headerLevel('<span style="font-size: 18px">t</span>')).toBe(4);
    expect(headerLevel('<span class="h7">t</span>')).toBe(4);
    expect(headerLevel(null)).toBe(4);
    expect(headerLevel()).toBe(4);
  });
});

describe(groupLinks, () => {
  const row = (partial: Partial<WorkspaceLinkRow> & { type: string; label: string }) =>
    ({ name: partial.label, ...partial }) as WorkspaceLinkRow;

  it('groups Link rows under the preceding Card Break', () => {
    const groups = groupLinks([
      row({ type: 'Card Break', label: 'Masters', link_count: 2 }),
      row({ type: 'Link', label: 'User', link_type: 'DocType', link_to: 'User' }),
      row({ type: 'Link', label: 'Role', link_type: 'DocType', link_to: 'Role' }),
      row({ type: 'Card Break', label: 'Settings' }),
      row({ type: 'Link', label: 'System Settings', link_to: 'System Settings' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Masters');
    expect(groups[0].breakRow.link_count).toBe(2);
    expect(groups[0].links.map((l) => l.label)).toEqual(['User', 'Role']);
    expect(groups[1].label).toBe('Settings');
    expect(groups[1].links.map((l) => l.label)).toEqual(['System Settings']);
  });

  it('drops hidden rows', () => {
    const groups = groupLinks([
      row({ type: 'Card Break', label: 'Masters' }),
      row({ type: 'Link', label: 'Visible' }),
      row({ type: 'Link', label: 'Hidden', hidden: 1 }),
    ]);
    expect(groups[0].links.map((l) => l.label)).toEqual(['Visible']);
  });

  it('ignores Link rows before any Card Break (desk parity)', () => {
    const groups = groupLinks([
      row({ type: 'Link', label: 'Orphan' }),
      row({ type: 'Card Break', label: 'Masters' }),
      row({ type: 'Link', label: 'User' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].links.map((l) => l.label)).toEqual(['User']);
  });

  it('returns [] for undefined or empty links', () => {
    expect(groupLinks()).toEqual([]);
    expect(groupLinks([])).toEqual([]);
  });
});

describe('parseFrappeFilters (bench-verified shapes)', () => {
  it('normalizes a plain dict to = triples', () => {
    expect(parseFrappeFilters('{"status":"Open"}')).toEqual([['status', '=', 'Open']]);
    expect(parseFrappeFilters('{"enabled":1}')).toEqual([['enabled', '=', 1]]);
  });

  it('normalizes a dict of [op, value] tuples', () => {
    expect(parseFrappeFilters('{"status":["=","Open"]}')).toEqual([['status', '=', 'Open']]);
    expect(parseFrappeFilters('{"status":["in",["Open","Overdue"]]}')).toEqual([['status', 'in', ['Open', 'Overdue']]]);
  });

  it('treats non-operator array values as = values', () => {
    // 3-element array value is not an [op, value] tuple.
    expect(parseFrappeFilters('{"role":["a","b","c"]}')).toEqual([['role', '=', ['a', 'b', 'c']]]);
  });

  it('passes triples through as-is', () => {
    expect(parseFrappeFilters('[["enabled","=",1]]')).toEqual([['enabled', '=', 1]]);
  });

  it('strips the doctype element from quads (Number Card filters_json)', () => {
    expect(parseFrappeFilters('[["User","enabled","=",1]]')).toEqual([['enabled', '=', 1]]);
    expect(parseFrappeFilters('[["ToDo","status","=","Open"],["ToDo","priority","!=","Low"]]')).toEqual([
      ['status', '=', 'Open'],
      ['priority', '!=', 'Low'],
    ]);
  });

  it('handles mixed triples and quads, skipping malformed entries', () => {
    expect(parseFrappeFilters('[["status","=","Open"],["User","enabled","=",1],"junk",["short","="]]')).toEqual([
      ['status', '=', 'Open'],
      ['enabled', '=', 1],
    ]);
  });

  it('returns undefined for empty, malformed, or valueless input', () => {
    expect(parseFrappeFilters()).toBeUndefined();
    expect(parseFrappeFilters(null)).toBeUndefined();
    expect(parseFrappeFilters('')).toBeUndefined();
    expect(parseFrappeFilters('{not json')).toBeUndefined();
    expect(parseFrappeFilters('[]')).toBeUndefined();
    expect(parseFrappeFilters('{}')).toBeUndefined();
    expect(parseFrappeFilters('"scalar"')).toBeUndefined();
    expect(parseFrappeFilters('[1,2]')).toBeUndefined();
  });
});

describe('composeWorkspaceBlocks (dashboard-first, MOD-11)', () => {
  const block = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, data }) as WorkspaceBlock;

  it('reorders by class: data (cards → charts → quick lists), shortcuts, cards', () => {
    const composed = composeWorkspaceBlocks([
      block('header', { text: '<span class="h4"><b>Your Shortcuts</b></span>' }, 'h1'),
      block('shortcut', { shortcut_name: 'User' }, 's1'),
      block('spacer', {}, 'sp1'),
      block('header', { text: '<span class="h4"><b>Reports &amp; Masters</b></span>' }, 'h2'),
      block('card', { card_name: 'Users' }, 'c1'),
      block('quick_list', { quick_list_name: 'ToDo' }, 'q1'),
      block('chart', { chart_name: 'Signups' }, 'ch1'),
      block('number_card', { number_card_name: 'Enabled Users' }, 'n1'),
    ]);
    expect(composed.data.map((b) => b.id)).toEqual(['n1', 'ch1', 'q1']);
    expect(composed.shortcuts.map((b) => b.id)).toEqual(['s1']);
    expect(composed.cards.map((b) => b.id)).toEqual(['c1']);
    expect(composed.text).toEqual([]);
  });

  it('keeps authored order within each data class', () => {
    const composed = composeWorkspaceBlocks([
      block('chart', { chart_name: 'B' }, 'ch2'),
      block('number_card', { number_card_name: 'N1' }, 'n1'),
      block('chart', { chart_name: 'A' }, 'ch1'),
      block('number_card', { number_card_name: 'N2' }, 'n2'),
    ]);
    expect(composed.data.map((b) => b.id)).toEqual(['n1', 'n2', 'ch2', 'ch1']);
  });

  it('drops headers that label widget runs, keeps text-only headers', () => {
    const composed = composeWorkspaceBlocks([
      // Welcome-Workspace shape: header + paragraph only → both kept.
      block('header', { text: '<span class="h2">Hi,</span>' }, 'keep'),
      block('paragraph', { text: 'You can create a workspace.' }, 'p1'),
      // Section label directly over shortcuts → dropped.
      block('header', { text: '<b>Your Shortcuts</b>' }, 'drop1'),
      block('shortcut', { shortcut_name: 'User' }, 's1'),
      // Label separated from its cards by a spacer → still dropped.
      block('header', { text: '<b>Masters</b>' }, 'drop2'),
      block('spacer', {}, 'sp'),
      block('card', { card_name: 'Users' }, 'c1'),
    ]);
    expect(composed.text.map((b) => b.id)).toEqual(['keep', 'p1']);
  });

  it('keeps a trailing header with no following blocks', () => {
    const composed = composeWorkspaceBlocks([
      block('shortcut', { shortcut_name: 'User' }, 's1'),
      block('header', { text: '<b>Notes</b>' }, 'h1'),
    ]);
    expect(composed.text.map((b) => b.id)).toEqual(['h1']);
  });

  it('drops headers labeling onboarding/custom blocks (which never render)', () => {
    const composed = composeWorkspaceBlocks([
      block('header', { text: '<b>Getting Started</b>' }, 'h1'),
      block('onboarding', { onboarding_name: 'Setup' }, 'o1'),
    ]);
    expect(composed.text).toEqual([]);
    expect(composed.data).toEqual([]);
  });

  it('drops spacers and unknown block types', () => {
    const composed = composeWorkspaceBlocks([
      block('spacer', {}, 'sp1'),
      block('custom_block', {}, 'cb1'),
      block('paragraph', { text: 'kept' }, 'p1'),
    ]);
    expect(composed.text.map((b) => b.id)).toEqual(['p1']);
    expect(composed.data).toEqual([]);
    expect(composed.shortcuts).toEqual([]);
    expect(composed.cards).toEqual([]);
  });

  it('returns all-empty sections for empty input', () => {
    expect(composeWorkspaceBlocks([])).toEqual({
      data: [],
      shortcuts: [],
      cards: [],
      text: [],
    });
  });
});

describe('findShortcut / findLinkGroup', () => {
  const doc: WorkspaceDoc = {
    name: 'Users',
    doctype: 'Workspace',
    shortcuts: [
      { name: 's1', type: 'DocType', label: 'User', link_to: 'User' },
      { name: 's2', type: 'DocType', label: 'Role', link_to: 'Role' },
    ],
  };

  it("finds shortcut rows by the block's shortcut_name (label match)", () => {
    expect(findShortcut(doc, 'Role')?.link_to).toBe('Role');
    expect(findShortcut(doc, 'Missing')).toBeUndefined();
    expect(findShortcut(doc)).toBeUndefined();
  });

  it("finds link groups by the card block's card_name", () => {
    const groups = groupLinks([
      { name: 'b1', type: 'Card Break', label: 'Masters' },
      { name: 'l1', type: 'Link', label: 'User' },
    ]);
    expect(findLinkGroup(groups, 'Masters')?.links).toHaveLength(1);
    expect(findLinkGroup(groups, 'Nope')).toBeUndefined();
    expect(findLinkGroup(groups)).toBeUndefined();
  });
});

describe(filterLinkGroup, () => {
  const row = (partial: Partial<WorkspaceLinkRow> & { type: string; label: string }) =>
    ({ name: partial.label, ...partial }) as WorkspaceLinkRow;
  const users = {
    label: 'Users',
    breakRow: row({ type: 'Card Break', label: 'Users' }),
    links: [
      row({ type: 'Link', label: 'User', link_type: 'DocType', link_to: 'User' }),
      row({ type: 'Link', label: 'Role', link_type: 'DocType', link_to: 'Role' }),
      row({ type: 'Link', label: 'Role Profile', link_type: 'DocType', link_to: 'Role Profile' }),
    ],
  };

  it('returns the group unchanged for an empty query', () => {
    expect(filterLinkGroup(users, '  ')).toEqual(users);
  });

  it('keeps the whole card when the group label matches', () => {
    expect(filterLinkGroup(users, 'user')?.links).toHaveLength(3);
  });

  it('narrows to matching link labels', () => {
    const next = filterLinkGroup(users, 'role');
    expect(next?.links.map((l) => l.label)).toEqual(['Role', 'Role Profile']);
  });

  it('returns undefined when nothing matches', () => {
    expect(filterLinkGroup(users, 'zzzz')).toBeUndefined();
  });
});

describe('collapseLinkRows (desk +N more)', () => {
  const row = (label: string) =>
    ({
      name: label,
      type: 'Link',
      label,
      link_type: 'DocType',
      link_to: label,
    }) as WorkspaceLinkRow;
  const links = ['User', 'Role', 'Role Profile', 'User Type'].map(row);

  it('slices to link_count when collapsed', () => {
    const next = collapseLinkRows(links, 2, { collapse: true, expanded: false });
    expect(next.shown.map((l) => l.label)).toEqual(['User', 'Role']);
    expect(next.hiddenCount).toBe(2);
    expect(next.showMore).toBe(true);
  });

  it('shows every row when expanded', () => {
    const next = collapseLinkRows(links, 2, { collapse: true, expanded: true });
    expect(next.shown).toHaveLength(4);
    expect(next.showMore).toBe(true);
  });

  it('does not collapse when filtering (collapse=false)', () => {
    const next = collapseLinkRows(links, 2, { collapse: false, expanded: false });
    expect(next.shown).toHaveLength(4);
    expect(next.showMore).toBe(false);
  });

  it('treats missing or zero link_count as show-all', () => {
    expect(collapseLinkRows(links, undefined, { collapse: true, expanded: false }).showMore).toBe(false);
    expect(collapseLinkRows(links, 0, { collapse: true, expanded: false }).showMore).toBe(false);
  });
});

describe('link card stack positions (LC-72)', () => {
  const row = (label: string) => ({ name: label, type: 'Link', label }) as WorkspaceLinkRow;
  const links = ['User', 'Role', 'Role Profile', 'User Type'].map(row);

  it('more-row is last when the list is collapsed', () => {
    const { shown, showMore } = collapseLinkRows(links, 2, { collapse: true, expanded: false });
    const total = shown.length + (showMore ? 1 : 0);
    expect(getGroupPosition(0, total)).toBe('first');
    expect(getGroupPosition(1, total)).toBe('middle');
    expect(getGroupPosition(2, total)).toBe('last');
  });

  it('a lone link is only', () => {
    expect(getGroupPosition(0, 1)).toBe('only');
  });
});
