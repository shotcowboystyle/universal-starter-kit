/**
 * Query-report filter bar: apply-on-change for discrete controls, Apply for
 * text, LC-49 (per-filter × is not a tab stop), LC-50 (Apply activates),
 * disabled/read_only filters open nothing.
 */
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  QueryReportFilterBar,
  queryReportFilterAppliesOnChange,
  queryReportSelectOptions,
} from './queryReportFilterBar';
import type { QueryReportFilterMeta } from './reportShapes';

const selectFilter: QueryReportFilterMeta = {
  fieldname: 'status',
  label: 'Status',
  fieldtype: 'Select',
  options: 'Open\nClosed',
};
const ownerFilter: QueryReportFilterMeta = {
  fieldname: 'owner',
  label: 'Owner',
  fieldtype: 'Data',
  mandatory: 1,
};
const checkFilter: QueryReportFilterMeta = {
  fieldname: 'show_permissions',
  label: 'Show Permissions',
  fieldtype: 'Check',
};
const lockedFilter: QueryReportFilterMeta = {
  fieldname: 'company',
  label: 'Company',
  fieldtype: 'Select',
  options: 'Acme\nGlobex',
  read_only: 1,
};

describe(queryReportFilterAppliesOnChange, () => {
  it('commits select/link/date/check immediately and leaves text for Apply', () => {
    expect(queryReportFilterAppliesOnChange(selectFilter)).toBe(true);
    expect(queryReportFilterAppliesOnChange(checkFilter)).toBe(true);
    expect(queryReportFilterAppliesOnChange({ fieldname: 'user', fieldtype: 'Link', options: 'User' })).toBe(true);
    expect(queryReportFilterAppliesOnChange({ fieldname: 'from_date', fieldtype: 'Date' })).toBe(true);
    expect(queryReportFilterAppliesOnChange(ownerFilter)).toBe(false);
    expect(queryReportFilterAppliesOnChange({ fieldname: 'limit', fieldtype: 'Int' })).toBe(false);
  });
});

describe(QueryReportFilterBar, () => {
  it('applies a Check immediately (Desk/Metabase auto-apply)', () => {
    const onApply = vi.fn();
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[checkFilter]}
        filters={{}}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /show permissions/i }));
    expect(onApply).toHaveBeenCalledWith({ show_permissions: 1 });
  });

  it('keeps text drafts local until Apply', () => {
    const onApply = vi.fn();
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[ownerFilter]}
        filters={{}}
        onApply={onApply}
      />,
    );
    const owner = screen.getByRole('textbox', { name: /owner/i });
    fireEvent.change(owner, { target: { value: 'jane@example.com' } });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ owner: 'jane@example.com' });
  });

  it('in-box text clear commits the empty value immediately', () => {
    const onApply = vi.fn();
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[ownerFilter]}
        filters={{ owner: 'jane@example.com' }}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('query-report-clear-owner'));
    expect(onApply).toHaveBeenCalledWith({});
  });

  it('text-filter clear sits inside the input box (LC-71), not a sibling tab stop', () => {
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[ownerFilter]}
        filters={{ owner: 'jane@example.com' }}
        onApply={vi.fn()}
      />,
    );
    const clear = screen.getByTestId('query-report-clear-owner');
    expect(clear.getAttribute('tabindex')).toBe('-1');
    const field = screen.getByRole('textbox', { name: /owner/i });
    const box = field.closest('.mp-composite-ring');
    expect(box).toBeTruthy();
    expect(box?.contains(clear)).toBe(true);
  });

  it('optional Select prepends All so clearing does not need a sibling ×', () => {
    expect(queryReportSelectOptions('Open\nClosed', 'All')).toEqual([
      { label: 'All', value: '' },
      { label: 'Open', value: 'Open' },
      { label: 'Closed', value: 'Closed' },
    ]);
  });

  it('disabled/read_only filter is an inert value and opens nothing', () => {
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[lockedFilter]}
        filters={{ company: 'Acme' }}
        onApply={vi.fn()}
      />,
    );
    const field = screen.getByLabelText(/company/i);
    fireEvent.click(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: ' ' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByTestId('select-dropdown')).toBeNull();
  });

  it('exposes the band as a toolbar named Filters', () => {
    renderWithProviders(
      <QueryReportFilterBar
        filterMeta={[ownerFilter]}
        filters={{}}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByRole('toolbar', { name: 'Filters' })).toBeTruthy();
  });
});
