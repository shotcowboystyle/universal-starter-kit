import { renderWithProviders } from '@repo/test-utils';
import { createEvent, fireEvent, screen, waitFor } from '@testing-library/react';
import { useTheme } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { ColumnHeaderFilter } from './index';
import type { ColumnFilterValue } from './index';

const renderTrigger = (props: Partial<Parameters<typeof ColumnHeaderFilter>[0]> = {}) =>
  renderWithProviders(
    <ColumnHeaderFilter
      columnId="status"
      columnLabel="Status"
      columnType="text"
      onFilterChange={() => {}}
      {...props}
    />,
  );

const trigger = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-label="Filter column Status"]')!;

const draftInput = () => screen.getByPlaceholderText<HTMLInputElement>('Enter value...');
const pressApply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
const sampleFilter = (filterValue?: { operator: string; value: unknown }) => (
  <ColumnHeaderFilter
    columnId="status"
    columnLabel="Status"
    columnType="text"
    filterValue={filterValue}
    isFiltered={filterValue !== undefined}
    onFilterChange={() => {}}
  />
);

describe('ColumnHeaderFilter trigger', () => {
  it.each(['Enter', ' '])('opens with %s without triggering header shortcuts', (key) => {
    const parentKeyDown = vi.fn<() => void>();
    const { container } = renderWithProviders(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- test-only ancestor that observes whether the trigger's keydown bubbles
      <div onKeyDown={parentKeyDown}>
        <ColumnHeaderFilter
          columnId="status"
          columnLabel="Status"
          columnType="text"
          onFilterChange={() => {}}
        />
      </div>,
    );
    const floor = trigger(container);
    expect(floor.tabIndex).toBe(0);
    const event = createEvent.keyDown(floor, { key, bubbles: true, cancelable: true });
    fireEvent(floor, event);
    expect(event.defaultPrevented).toBe(true);
    expect(parentKeyDown).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Filter: Status');
  });

  it('keeps ordinary typing out of the opener', () => {
    const { container } = renderTrigger();
    fireEvent.keyDown(trigger(container), { key: 'x' });
    expect(document.body.textContent).not.toContain('Filter: Status');
  });

  it('renders the funnel trigger with its column-scoped name', () => {
    const { container } = renderTrigger();
    expect(trigger(container)).not.toBeNull();
  });

  it('opens the filter editor from a press on the glyph ring', () => {
    const { container } = renderTrigger();
    const floor = trigger(container);
    // Real pointers land on the glyph-scale ring inside the grown target —
    // activation must bubble through it to the floor's press handler.
    const ring = (floor.firstElementChild ?? floor) as HTMLElement;
    fireEvent.click(ring);
    expect(document.body.textContent).toContain('Filter: Status');
  });

  it('applies the composed filter and closes', () => {
    const onFilterChange = vi.fn<(value?: ColumnFilterValue) => void>();
    const { container } = renderTrigger({ onFilterChange });
    fireEvent.click(trigger(container));
    const apply = [...document.querySelectorAll('[role="button"]')].find((node) =>
      node.textContent?.includes('Apply'),
    ) as HTMLElement;
    expect(apply).not.toBeNull();
    fireEvent.click(apply);
    expect(onFilterChange).toHaveBeenCalledWith({ operator: 'contains', value: '' });
  });
});

// LC-54 amendment (2026-08-13) VERIFY arm: in hover/press the element
// carrying the press-target outset keeps `background-color: transparent` —
// painted feedback lives on the glyph-scale ring inside it. jsdom never
// applies :hover, but tamagui compiles state backgrounds into value-carrying
// atomic classes (`_bg-0hover-color4`), so the paint channel is asserted
// through the atoms each node carries — red on the old anatomy (the floor
// carried the hover AND press fills), green only when the floor is
// paint-free in every state.
describe('ColumnHeaderFilter press-floor paint (LC-54 amendment)', () => {
  const paintedStateAtom = /_bg-0(?:hover|active)-(?!transparent)/u;

  it('floor node carries no hover/press background paint', () => {
    const { container } = renderTrigger();
    const floor = trigger(container);
    expect(floor.className).not.toMatch(paintedStateAtom);
    expect(floor.className).toContain('mp-chip-dismiss');
    expect(floor.firstElementChild?.className).toContain('mp-chip-dismiss-ring');
  });

  it('positive control: the glyph-scale ring is where the hover fill lives', () => {
    const { container } = renderTrigger();
    const floor = trigger(container);
    const ring = floor.firstElementChild as HTMLElement;
    expect(ring).not.toBeNull();
    // Proves the atom detector can see hover paint in this harness (the
    // no-paint assert above is meaningless without this arm), and pins the
    // fill to the ring: icon + one space token, never the 44px floor.
    expect(ring.className).toMatch(/_bg-0hover-color4/u);
    expect(ring.querySelector('svg')).not.toBeNull();
  });

  it.each([false, true])('keeps enabled glyph ink at full rest opacity (filtered=%s)', (isFiltered) => {
    let expectedInk = '';
    const Sample = () => {
      const theme = useTheme();
      // This provider has no accent ramp; the active hook uses readable ink.
      // oxlint-disable-next-line react/globals -- the test captures the rendered theme ink to compare against the painted glyph
      expectedInk = String(isFiltered ? theme.color12?.val : theme.color11?.val);
      return (
        <ColumnHeaderFilter
          columnId="status"
          columnLabel="Status"
          columnType="text"
          onFilterChange={() => {}}
          isFiltered={isFiltered}
        />
      );
    };
    const { container } = renderWithProviders(<Sample />);
    const svg = trigger(container).querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe(expectedInk);
    expect(svg.getAttribute('fill')).not.toContain('var(');
    for (let node = svg.parentElement; node && node !== document.body; node = node.parentElement) {
      expect(Number(getComputedStyle(node).opacity || 1)).toBe(1);
    }
  });
});

describe('ColumnHeaderFilter applied draft', () => {
  it('opens with the supplied operator and value', () => {
    const { container } = renderTrigger({ filterValue: { operator: 'is', value: 'corp' } });
    fireEvent.click(trigger(container));
    expect(draftInput().value).toBe('corp');
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Is');
  });

  it('keeps an open draft when an external filter update arrives', () => {
    const result = renderWithProviders(sampleFilter({ operator: 'contains', value: 'corp' }));
    fireEvent.click(trigger(result.container));
    fireEvent.change(draftInput(), { target: { value: 'draft' } });
    result.rerender(sampleFilter({ operator: 'is', value: 'external' }));
    expect(draftInput().value).toBe('draft');
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Contains');
  });

  it('reads the latest external filter when reopened', async () => {
    const result = renderWithProviders(sampleFilter({ operator: 'contains', value: 'corp' }));
    fireEvent.click(trigger(result.container));
    pressApply();
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Enter value...')).toBeNull();
    });
    result.rerender(sampleFilter({ operator: 'is', value: 'external' }));
    fireEvent.click(trigger(result.container));
    expect(draftInput().value).toBe('external');
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Is');
  });

  it('clears without closing, then applies the newly composed draft', () => {
    const onFilterChange = vi.fn<(value?: ColumnFilterValue) => void>();
    const { container } = renderTrigger({
      isFiltered: true,
      filterValue: { operator: 'contains', value: 'corp' },
      onFilterChange,
    });
    fireEvent.click(trigger(container));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onFilterChange).toHaveBeenLastCalledWith();
    expect(draftInput().value).toBe('');
    fireEvent.change(draftInput(), { target: { value: 'next' } });
    pressApply();
    expect(onFilterChange).toHaveBeenLastCalledWith({ operator: 'contains', value: 'next' });
  });

  it('resets to the default when the applied filter was removed while closed', async () => {
    const result = renderWithProviders(sampleFilter({ operator: 'is', value: 'corp' }));
    fireEvent.click(trigger(result.container));
    fireEvent.change(draftInput(), { target: { value: 'draft' } });
    pressApply();
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Enter value...')).toBeNull();
    });
    result.rerender(sampleFilter());
    fireEvent.click(trigger(result.container));
    expect(draftInput().value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Contains');
  });

  it('uses an offered numeric condition initially and after Clear', () => {
    const onFilterChange = vi.fn<(value?: ColumnFilterValue) => void>();
    const { container } = renderTrigger({ columnType: 'number', isFiltered: true, onFilterChange });
    fireEvent.click(trigger(container));
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Is');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('combobox', { name: 'Condition' }).textContent).toBe('Is');
    fireEvent.change(draftInput(), { target: { value: '50' } });
    pressApply();
    expect(onFilterChange).toHaveBeenLastCalledWith({ operator: 'is', value: '50' });
  });
});
