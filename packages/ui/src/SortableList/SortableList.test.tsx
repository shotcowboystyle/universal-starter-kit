import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SortableList } from './index';

const here = dirname(fileURLToPath(import.meta.url));

const ITEMS = [
  { id: 'mon', label: 'Monday standup' },
  { id: 'tue', label: 'Tuesday review' },
  { id: 'dep', label: 'Deploy window' },
  { id: 'ret', label: 'Retro notes' },
];

function Harness({
  onChange = vi.fn(),
  readOnly,
  disabled,
  compact,
  canReorder,
}: {
  onChange?: (next: typeof ITEMS) => void;
  readOnly?: boolean;
  disabled?: boolean;
  compact?: boolean;
  canReorder?: (item: (typeof ITEMS)[number], index: number) => boolean;
}) {
  const [items, setItems] = useState(ITEMS);
  return (
    <SortableList
      items={items}
      getId={(item) => item.id}
      getLabel={(item) => item.label}
      canReorder={canReorder}
      readOnly={readOnly}
      disabled={disabled}
      compact={compact}
      onChange={(next) => {
        setItems(next);
        onChange(next);
      }}
    />
  );
}

function liveRegion() {
  return document.querySelector('[data-sortable-live="true"]');
}

describe('SortableList', () => {
  it('completes a keyboard-only reorder and announces each step', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<Harness onChange={onChange} />);
    const rows = container.querySelectorAll('[data-sortable-row]');
    expect(rows).toHaveLength(4);

    const tuesday = container.querySelector('[data-sortable-row="tue"]') as HTMLElement;
    tuesday.focus();
    fireEvent.keyDown(tuesday, { key: ' ' });
    expect(liveRegion()?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion()?.textContent).toBe(
      'Lifted “Tuesday review”, position 2 of 4. Use arrow keys to move, space to drop, escape to cancel.',
    );

    fireEvent.keyDown(tuesday, { key: 'ArrowDown' });
    expect(liveRegion()?.textContent).toBe('Moved “Tuesday review”, position 3 of 4.');

    fireEvent.keyDown(tuesday, { key: 'ArrowDown' });
    expect(liveRegion()?.textContent).toBe('Moved “Tuesday review”, position 4 of 4.');

    const beforeBoundary = liveRegion()?.textContent;
    fireEvent.keyDown(tuesday, { key: 'ArrowDown' });
    expect(liveRegion()?.textContent).toBe(beforeBoundary);

    fireEvent.keyDown(tuesday, { key: ' ' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((r: { id: string }) => r.id)).toEqual(['mon', 'dep', 'ret', 'tue']);
    expect(liveRegion()?.textContent).toBe('Dropped “Tuesday review”, position 4 of 4.');
    expect(document.activeElement?.getAttribute('data-sortable-row')).toBe('tue');
  });

  it('cancels a lift with Escape and leaves the list unchanged', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<Harness onChange={onChange} />);
    const tuesday = container.querySelector('[data-sortable-row="tue"]') as HTMLElement;
    tuesday.focus();
    fireEvent.keyDown(tuesday, { key: ' ' });
    fireEvent.keyDown(tuesday, { key: 'ArrowDown' });
    fireEvent.keyDown(tuesday, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(liveRegion()?.textContent).toBe('Reorder cancelled. “Tuesday review” returned to position 2.');
    expect(container.querySelectorAll('[data-sortable-row]')[1].getAttribute('data-sortable-row')).toBe('tue');
  });

  it('paints the grab handle as a focusable with a 2px offset-0 ring well', () => {
    const { container } = renderWithProviders(<Harness />);
    const handle = container.querySelector('[data-sortable-handle="tue"]') as HTMLElement;
    expect(handle.getAttribute('role')).toBe('button');
    expect(handle.getAttribute('aria-label')).toMatch(/Tuesday review/);
    expect(handle.tabIndex).toBe(0);
    handle.focus();
    expect(handle.style.outlineWidth === '2px' || handle.getAttribute('data-focus-ring') === '2/0').toBe(true);
  });

  it('omits the handle on a row that cannot drag and reserves the well', () => {
    const { container } = renderWithProviders(<Harness canReorder={(item) => item.id !== 'tue'} />);
    expect(container.querySelector('[data-sortable-handle="tue"]')).toBeNull();
    expect(container.querySelector('[data-sortable-well="tue"]')).toBeTruthy();
    expect(container.querySelector('[data-sortable-row="tue"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders no handles when readOnly', () => {
    const { container } = renderWithProviders(<Harness readOnly />);
    expect(container.querySelectorAll('[data-sortable-handle]')).toHaveLength(0);
  });

  it('renders no handles when disabled (board 04)', () => {
    const { container } = renderWithProviders(<Harness disabled />);
    expect(container.querySelectorAll('[data-sortable-handle]')).toHaveLength(0);
  });

  it('renders emptyMessage when there are no rows (board 04)', () => {
    const { container } = renderWithProviders(
      <SortableList<{ id: string; label: string }>
        items={[]}
        getId={(item) => item.id}
        getLabel={(item) => item.label}
        emptyMessage="No rows yet"
      />,
    );
    expect(container.textContent).toContain('No rows yet');
    expect(container.querySelectorAll('[data-sortable-row]')).toHaveLength(0);
  });

  it('compact still renders grab handles (density does not drop controls)', () => {
    const { container } = renderWithProviders(<Harness compact />);
    expect(container.querySelectorAll('[data-sortable-handle]')).toHaveLength(4);
    expect(container.querySelector('[role="list"]')).toBeTruthy();
  });

  it('spreads the outer radius fragment on the list frame, not the nested alias', () => {
    const src = readFileSync(join(here, 'index.tsx'), 'utf8');
    expect(src).toContain('{...knobProps.borderRadius}');
    expect(src).not.toContain('knobProps.borderRadiusOuter');
  });
});
