/**
 * CellOptionsEditor specs — the popover host's OWN contract (UX-022 / LC-06).
 *
 * data-table-cell.test.tsx drives this host through DataTableCell with a faked
 * FloatingPanel, so it proves the CELL wires it up. Nothing pinned the host
 * itself: that a disabled editor collapses to a bare face with no trigger and
 * no keyboard stop, that the face is chromeless on focus because the ring
 * belongs to the parent cell (LC-71), that the panel body leaves table-cell
 * context so option groups get their full chrome back, and that `close` is
 * handed to the children so a COMMIT-class pick can dismiss.
 *
 * The panel is faked the same way the sibling cell spec fakes it: content only
 * while open, trigger toggles.
 */

import type { TableCellContext } from '@repo/table-primitives';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CellOptionsEditor } from './CellOptionsEditor';
import type { CellOptionsEditorProps } from './CellOptionsEditor';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the FloatingPanel double is a plain function component; the real component's type rejects it in a typed factory
vi.mock('@repo/forms', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FieldDisplay: (props: { field?: string; value?: string }) =>
    React.createElement('div', { 'data-testid': 'mock-FieldDisplay', 'data-field': props.field }, props.value ?? ''),
  FloatingPanel: ({
    open,
    onOpenChange,
    trigger,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
    trigger?: React.ReactNode;
    children?: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-FloatingPanel' },
      React.createElement(
        'div',
        { 'data-testid': 'floating-panel-trigger', onClick: () => onOpenChange?.(!open) },
        trigger,
      ),
      open === true ? React.createElement('div', { 'data-testid': 'floating-panel-content' }, children) : null,
    ),
}));

// oxlint-disable-next-line vitest/prefer-import-in-mock -- the Provider double renders a probe element; React's Provider type rejects it in a typed factory
vi.mock('@repo/table-primitives', async (importOriginal) => {
  const actual = await importOriginal<{ TableCellContext: typeof TableCellContext }>();
  return {
    ...actual,
    TableCellContext: {
      ...actual.TableCellContext,
      Provider: ({ value, children }: { value?: { inTableCell?: boolean }; children?: React.ReactNode }) =>
        React.createElement(
          'div',
          { 'data-testid': 'cell-context', 'data-in-table-cell': String(value?.inTableCell) },
          children,
        ),
    },
  };
});

const renderEditor = (props: Partial<CellOptionsEditorProps> = {}, body?: (close: () => void) => React.ReactNode) =>
  renderWithProviders(
    <CellOptionsEditor
      field="radiogroup"
      value="high"
      label="Priority"
      {...props}>
      {body ??
        ((close) => (
          <button
            type="button"
            data-testid="pick"
            onClick={() => {
              close();
            }}>
            pick
          </button>
        ))}
    </CellOptionsEditor>,
  );

describe(CellOptionsEditor, () => {
  it('renders the current value as a compact face, panel closed', () => {
    renderEditor();
    expect(screen.getByTestId('mock-FieldDisplay').textContent).toBe('high');
    expect(screen.queryByTestId('floating-panel-content')).toBeNull();
  });

  it('the face is a named, focusable button that reports its expanded state', () => {
    const { container } = renderEditor();
    const face = container.querySelector('[role="button"]') as HTMLElement;
    expect(face).not.toBeNull();
    expect(face.getAttribute('aria-label')).toBe('Priority');
    expect(face.getAttribute('aria-expanded')).toBe('false');
    expect(face.getAttribute('tabindex')).toBe('0');
  });

  it('opening the panel flips aria-expanded and mounts the option group', () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByTestId('floating-panel-trigger'));
    expect(screen.getByTestId('floating-panel-content')).toBeTruthy();
    expect(container.querySelector('[role="button"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('hands `close` to the children so a COMMIT pick can dismiss the panel', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('floating-panel-trigger'));
    fireEvent.click(screen.getByTestId('pick'));
    expect(screen.queryByTestId('floating-panel-content')).toBeNull();
  });

  it('the panel body leaves table-cell context so options get full chrome back', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('floating-panel-trigger'));
    const ctx = screen.getByTestId('cell-context');
    expect(ctx.dataset.inTableCell).toBe('false');
  });

  it('disabled collapses to a bare face: no panel host, no button role, no tab stop', () => {
    const { container } = renderEditor({ disabled: true });
    expect(screen.getByTestId('mock-FieldDisplay').textContent).toBe('high');
    expect(screen.queryByTestId('mock-FloatingPanel')).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('the face paints no ring of its own — the parent cell owns the one ring (LC-71)', () => {
    const { container } = renderEditor();
    const face = container.querySelector('[role="button"]') as HTMLElement;
    expect(face.style.outlineWidth === '' || face.style.outlineWidth === '0px').toBe(true);
  });
});
