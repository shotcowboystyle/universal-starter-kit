/**
 * FilterChip unit specs — the pill on its own, no DataTable around it.
 *
 * DataTableFilterChips.spec.tsx drives the chip through the compound table and
 * proves the bar's behaviour. This file pins the chip's OWN contract, which the
 * bar cannot state: the `onPress`/no-`onPress` split (an editable chip is a
 * button, a display-only chip is not), that dismiss does not also fire the edit
 * press, and that Enter/Space activate both focusables.
 */

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterChip } from './FilterChip';

describe(FilterChip, () => {
  it('renders the label and a dismiss button', () => {
    renderWithProviders(
      <FilterChip
        label="Email: contains corp"
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Email: contains corp')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    const fill = screen.getByRole('button', { name: 'Remove' }).querySelector('svg')?.getAttribute('fill');
    expect(fill).toBeTruthy();
    expect(fill?.startsWith('$')).toBe(false);
  });

  it('with onPress the pill is an edit button; both focusables are tab stops (LC-71)', () => {
    renderWithProviders(
      <FilterChip
        label="Email: contains corp"
        onPress={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const edit = screen.getByRole('button', { name: 'Edit filter Email: contains corp' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(edit.getAttribute('tabindex')).toBe('0');
    expect(remove.getAttribute('tabindex')).toBe('0');
    expect(remove.className).toMatch(/mp-chip-dismiss/);
  });

  it('without onPress the pill is display-only: no edit button, dismiss still works', () => {
    const onRemove = vi.fn();
    renderWithProviders(
      <FilterChip
        label="Department: is Engineering"
        onRemove={onRemove}
      />,
    );
    expect(screen.queryByRole('button', { name: /Edit filter/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('pressing the pill edits and does not remove', () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    renderWithProviders(
      <FilterChip
        label="Age: gt 30"
        onPress={onPress}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit filter Age: gt 30' }));
    expect(onPress).toHaveBeenCalledOnce();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("pressing dismiss removes without also firing the chip's edit press", () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    renderWithProviders(
      <FilterChip
        label="Age: gt 30"
        onPress={onPress}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Enter and Space activate the edit press', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <FilterChip
        label="Age: gt 30"
        onPress={onPress}
        onRemove={vi.fn()}
      />,
    );
    const edit = screen.getByRole('button', { name: 'Edit filter Age: gt 30' });
    fireEvent.keyDown(edit, { key: 'Enter' });
    fireEvent.keyDown(edit, { key: ' ' });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('Enter on the dismiss glyph removes and does not bubble into the edit press', () => {
    const onPress = vi.fn();
    const onRemove = vi.fn();
    renderWithProviders(
      <FilterChip
        label="Age: gt 30"
        onPress={onPress}
        onRemove={onRemove}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Remove' }), { key: 'Enter' });
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onPress).not.toHaveBeenCalled();
  });
});
