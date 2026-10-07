/**
 * DataTableCardControls specs — the control row's OWN contract.
 *
 * cardLayout.spec.tsx already drives the sort menu through the card list and
 * proves the cycle reorders cards. What nothing pinned is the row itself: that
 * it is a labelled toolbar, that it disappears entirely when neither affordance
 * is enabled (rather than rendering an empty bar), that each affordance can be
 * turned off independently, and that the trigger reports the ACTIVE sort so a
 * card list is never sorted invisibly.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn } from '../../types';

import { DataTable } from './index';

interface Person {
  id: number;
  firstName: string;
  age: number;
  email: string;
}

const people: Person[] = [
  { id: 1, firstName: 'John', age: 28, email: 'john@example.com' },
  { id: 2, firstName: 'Jane', age: 32, email: 'jane@example.com' },
  { id: 3, firstName: 'Bob', age: 45, email: 'bob@example.com' },
];

const columns: DataTableColumn<Person>[] = [
  { accessorKey: 'firstName', header: 'First Name' },
  { accessorKey: 'age', header: 'Age' },
];

function renderCards(props: Record<string, any> = {}) {
  return renderWithProviders(
    <DataTable
      data={people}
      columns={columns}
      layout="cards"
      onStateChange={vi.fn()}
      {...props}
    />,
  );
}

describe('DataTableCardControls', () => {
  it('is a labelled toolbar above the card list', () => {
    renderCards({ enableSorting: true, enableFiltering: true });
    const toolbar = screen.getByRole('toolbar', { name: 'Table toolbar' });
    expect(toolbar).toBeTruthy();
    expect(screen.getByLabelText('Sort rows')).toBeTruthy();
  });

  it('renders no toolbar at all when neither sorting nor filtering is enabled', () => {
    renderCards({ enableSorting: false, enableFiltering: false });
    expect(screen.queryByRole('toolbar', { name: 'Card list controls' })).toBeNull();
  });

  it('sorting only: the sort menu is there, the filter chrome is not', () => {
    renderCards({ enableSorting: true, enableFiltering: false });
    expect(screen.getByLabelText('Sort rows')).toBeTruthy();
    expect(screen.queryByText('Add Filter')).toBeNull();
  });

  it('filtering only: the filter chrome is there, the sort menu is not', () => {
    renderCards({ enableSorting: false, enableFiltering: true });
    expect(screen.queryByLabelText('Sort rows')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
    expect(screen.queryByText('Add Filter')).toBeNull();
  });

  it('with no sort applied the trigger reads the neutral label', () => {
    renderCards({ enableSorting: true });
    expect(screen.getByLabelText('Sort rows').textContent).toContain('Sort');
    expect(screen.getByLabelText('Sort rows').textContent).not.toContain('Age');
  });

  it('an active ascending sort is named on the trigger, arrow and all', () => {
    renderCards({ enableSorting: true, initialState: { sorting: [{ id: 'age', desc: false }] } });
    expect(screen.getByLabelText('Sort rows').textContent).toContain('Age ↑');
  });

  it('an active descending sort flips the arrow on the trigger', () => {
    renderCards({ enableSorting: true, initialState: { sorting: [{ id: 'age', desc: true }] } });
    expect(screen.getByLabelText('Sort rows').textContent).toContain('Age ↓');
  });

  it('picking a column from the menu updates the trigger label', async () => {
    renderCards({ enableSorting: true });
    fireEvent.click(screen.getByLabelText('Sort rows'));
    fireEvent.click(await screen.findByLabelText('Sort by Age'));
    await waitFor(() => {
      expect(screen.getByLabelText('Sort rows').textContent).toContain('Age ↑');
    });
  });

  it('offers one menu entry per sortable column and no more', async () => {
    renderCards({ enableSorting: true });
    fireEvent.click(screen.getByLabelText('Sort rows'));
    await expect(screen.findByLabelText('Sort by First Name')).resolves.toBeTruthy();
    expect(screen.getByLabelText('Sort by Age')).toBeTruthy();
    expect(screen.queryByLabelText('Sort by Email')).toBeNull();
  });
});
