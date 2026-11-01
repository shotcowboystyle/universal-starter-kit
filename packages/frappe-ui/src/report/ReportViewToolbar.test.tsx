/**
 * ReportToolbar DOM prop hygiene (LC-46 class).
 *
 * The Save As popover previously passed `elevate` to raw tamagui
 * Popover.Content, which has no such variant in tamagui 2.0 — the bare
 * boolean fell through to the DOM element and fired React's
 * non-boolean-attribute console.error on every popover open (and painted
 * no shadow: the "styling" was dead). The surface now rides the house
 * PopoverContent (elevatedSurface knob recipe). Render + open → zero
 * unknown-prop / non-boolean-attribute console errors.
 */
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { ReportColumnDef } from './report-view-model';
import { ReportViewToolbar as ReportToolbar } from './ReportViewToolbar';
import type { ReportViewToolbarProps as Props } from './ReportViewToolbar';

const DOM_PROP_LEAK = /does not recognize the `.+` prop on a DOM element|non-boolean attribute|Invalid DOM property/iu;

const columns: ReportColumnDef[] = [
  { fieldname: 'name', label: 'ID', fieldtype: 'Data', kind: 'text', width: 160, align: 'left' },
  {
    fieldname: 'status',
    label: 'Status',
    fieldtype: 'Select',
    kind: 'select',
    options: 'Open\nClosed',
    width: 120,
    align: 'left',
  },
];

const renderToolbar = () =>
  renderWithProviders(
    <ReportToolbar
      columns={columns}
      selected={['name', 'status']}
      onToggleColumn={vi.fn<NonNullable<Props['onToggleColumn']>>()}
      onResetColumns={vi.fn<NonNullable<Props['onResetColumns']>>()}
      groupBy={null}
      onGroupByChange={vi.fn<NonNullable<Props['onGroupByChange']>>()}
      baseFilters={[]}
      columnFilterCount={0}
      onClearColumnFilters={vi.fn<NonNullable<Props['onClearColumnFilters']>>()}
      savedReports={[]}
      currentReport={null}
      onSelectReport={vi.fn<NonNullable<Props['onSelectReport']>>()}
      onSaveReport={vi.fn<NonNullable<Props['onSaveReport']>>()}
      onDeleteReport={vi.fn<NonNullable<Props['onDeleteReport']>>()}
      onExport={vi.fn<NonNullable<Props['onExport']>>()}
    />,
  );

describe('ReportToolbar Save As popover (LC-46 DOM prop hygiene)', () => {
  let errorSpy: MockInstance<typeof console.error> | null = null;
  beforeEach(() => {
    // Strict local spy: the shared test setup filters known leak warnings
    // globally, but this arm must stay falsifiable — capture everything.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy?.mockRestore();
    errorSpy = null;
  });

  const leakMessages = (): string[] =>
    (errorSpy?.mock.calls ?? [])
      .map((args: unknown[]) => args.map(String).join(' '))
      .filter((message) => DOM_PROP_LEAK.test(message));

  it('opens the Save As popover without leaking non-DOM props', async () => {
    const result = renderToolbar();

    const saveAs = result.findTextElement('Save As…');
    expect(saveAs).toBeDefined();
    fireEvent.click(saveAs!);

    await waitFor(() => {
      expect(document.querySelector('input[placeholder="New report name"]')).toBeTruthy();
    });

    expect(leakMessages()).toStrictEqual([]);
    // Belt-and-braces: no leaked attribute rendered anywhere either.
    expect(document.querySelector('[elevate]')).toBeNull();
  });
});
