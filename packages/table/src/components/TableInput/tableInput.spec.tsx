/**
 * TableInput field-contract tests (child-table field, forms↔table bridge).
 *
 * Covers the audited contract points:
 * - LC-14 ONCHANGE-CANONICAL: canonical onChange(rows) fires on every
 *   mutation (add / remove / edit); onDataChange is a deprecated alias
 *   firing from the same emit site; onCellChange is the per-cell companion.
 * - Three-branch render: skeleton → standalone → form-integrated <Field>
 *   (field-architecture standard) with required/custom validators.
 * - Row operations: add with per-column defaults, delete, min/max limits,
 *   honest empty state.
 * - Nested field behavior: cells provide table-cell context (chromeless
 *   detection) and inline text editors follow the draft policy (commit on
 *   Enter/blur, Escape discards).
 * - Value fidelity: payload matches the visible table exactly; types are
 *   preserved; no index drift and no id collisions after remove+add.
 *
 * Real @repo/forms components render here (no mocks) so the
 * integration is honest; heavy picker fields (select/date/stepper draft
 * policy) are covered by cellDraftPolicy.spec.tsx at the cell layer.
 */

import { Form, useForm } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import React from 'react';

// The forms <Form> wrapper calls useUrlState unconditionally; the router's
// URL machinery has no jsdom backing here, so stub just that hook.
vi.mock(import('@repo/router'), async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useUrlState: () => [{}, () => {}] };
});
import { useIsInTableCell } from '@repo/table-primitives';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';
import { ChildTable } from '../ChildTable';

import { childTableKeyAction } from './shared';

import { TableInput } from './index';

interface Row extends DataTableData {
  id: string;
  item: string;
  qty: number;
  urgent: boolean;
}

const rows3 = (): Row[] => [
  { id: 'row-a', item: 'Bracket', qty: 12, urgent: false },
  { id: 'row-b', item: 'Bolts', qty: 3, urgent: true },
  { id: 'row-c', item: 'Paint', qty: 1, urgent: false },
];

const columns: DataTableColumn<Row>[] = [
  { accessorKey: 'item', header: 'Item', field: 'input' },
  { accessorKey: 'urgent', header: 'Urgent', field: 'checkbox' },
];

function renderStandalone(props: Partial<React.ComponentProps<typeof TableInput<Row>>> = {}) {
  return renderWithProviders(
    <TableInput<Row>
      data={rows3()}
      columns={columns}
      {...props}
    />,
  );
}

/** Controlled harness so multi-step flows (edit → remove → add) re-render. */
function Controlled({
  initial = rows3(),
  onChange,
  onDataChange,
  onCellChange,
  ...rest
}: {
  initial?: Row[];
  onChange?: (rows: Row[]) => void;
  onDataChange?: (rows: Row[]) => void;
  onCellChange?: (rowIndex: number, columnId: string, value: unknown) => void;
  [key: string]: any;
}) {
  const [data, setData] = React.useState<Row[]>(initial);
  return (
    <TableInput<Row>
      data={data}
      columns={columns}
      onChange={(next) => {
        setData(next);
        onChange?.(next);
      }}
      onDataChange={onDataChange}
      onCellChange={onCellChange}
      {...rest}
    />
  );
}

describe('TableInput — LC-14 canonical onChange', () => {
  it('onChange and the onDataChange alias fire together from one emit site on cell edit', async () => {
    const onChange = vi.fn();
    const onDataChange = vi.fn();
    const onCellChange = vi.fn();
    renderStandalone({ onChange, onDataChange, onCellChange });

    const input = screen.getByDisplayValue('Bracket');
    await userEvent.type(input, 'X');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toEqual(onDataChange.mock.calls[0][0]);
    expect(onChange.mock.calls[0][0][0].item).toBe('BracketX');
    // per-cell companion fires with (rowIndex, columnId, value)
    expect(onCellChange).toHaveBeenCalledWith(0, 'item', 'BracketX');
  });

  it('onChange fires on add row and delete row with the full row array', async () => {
    const onChange = vi.fn();
    const onDataChange = vi.fn();
    renderWithProviders(
      <Controlled
        onChange={onChange}
        onDataChange={onDataChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toHaveLength(4);

    await userEvent.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toHaveLength(3);
    expect(onChange.mock.calls[1][0][0].item).toBe('Bolts');
    // alias mirrors every emit
    expect(onDataChange).toHaveBeenCalledTimes(2);
    expect(onDataChange.mock.calls[1][0]).toEqual(onChange.mock.calls[1][0]);
  });

  it('alias-only wiring (deprecated onDataChange) still receives every mutation', async () => {
    const onDataChange = vi.fn();
    renderStandalone({ onDataChange });
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onDataChange.mock.calls[0][0]).toHaveLength(4);
  });
});

describe('TableInput — row operations', () => {
  it('add row seeds per-column defaults and a generated unique id (no idx bookkeeping)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Controlled
        onChange={onChange}
        defaultRow={{ item: 'NEW', qty: 1, urgent: false }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));

    const rows = onChange.mock.calls[1][0] as Row[];
    expect(rows).toHaveLength(5);
    const [added1, added2] = rows.slice(3);
    expect(added1.item).toBe('NEW');
    expect(added2.item).toBe('NEW');
    expect(added1.id).not.toBe(added2.id);
    expect(added1).not.toHaveProperty('idx');
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
  });

  it('maxRows disables and blocks add; minRows disables and blocks delete', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Controlled
        onChange={onChange}
        minRows={3}
        maxRows={3}
      />,
    );
    const isDisabled = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

    const addButton = screen.getByRole('button', { name: 'Add Row' });
    expect(isDisabled(addButton)).toBe(true);
    fireEvent.click(addButton);
    expect(onChange).not.toHaveBeenCalled();

    const deleteButton = screen.getByRole('button', { name: 'Delete row 1' });
    expect(isDisabled(deleteButton)).toBe(true);
    fireEvent.click(deleteButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the empty message when there are no rows and seeds the first row from it', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Controlled
        initial={[]}
        onChange={onChange}
        emptyMessage="Nothing here yet"
      />,
    );
    expect(screen.getByText('Nothing here yet')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });
});

describe('TableInput — three-branch render', () => {
  it('skeleton branch renders placeholders: no inputs, no add/delete affordances, aria-busy', () => {
    const { container } = renderStandalone({ skeleton: true });
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Add Row' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete row/ })).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('standalone branch renders from the data prop and stays fully controlled', async () => {
    renderStandalone(); // no onChange at all
    expect(screen.getByDisplayValue('Bracket')).toBeTruthy();
    // no onChange → add row is a no-op: no fourth row appears
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Delete row 4' })).toBeNull();
  });

  it('form branch renders rows from form state and commits mutations through field.handleChange', async () => {
    const onChange = vi.fn();
    let formRef: any;
    function FormHarness() {
      const form = useForm({ defaultValues: { items: rows3() } });
      formRef = form;
      return (
        <TableInput<Row>
          form={form as any}
          name="items"
          columns={columns}
          onChange={onChange}
        />
      );
    }
    renderWithProviders(<FormHarness />);

    // renders from form state (no data prop passed at all)
    expect(screen.getByDisplayValue('Bracket')).toBeTruthy();

    // add row → form state updated AND canonical onChange fired
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(formRef.state.values.items).toHaveLength(4);
    expect(onChange).toHaveBeenCalledOnce();

    // delete → form state updated
    await userEvent.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(formRef.state.values.items).toHaveLength(3);
    expect(formRef.state.values.items[0].item).toBe('Bolts');

    // external form update re-renders the table (field subscription)
    act(() => {
      formRef.setFieldValue('items', [{ id: 'row-z', item: 'External', qty: 9, urgent: false }]);
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue('External')).toBeTruthy();
    });
  });

  it('resolves the form from <Form> context when no form prop is given', async () => {
    let formRef: any;
    function Harness() {
      const form = useForm({ defaultValues: { items: rows3() } });
      formRef = form;
      return (
        <Form form={form as any}>
          <TableInput<Row>
            name="items"
            columns={columns}
          />
        </Form>
      );
    }
    renderWithProviders(<Harness />);

    expect(screen.getByDisplayValue('Bracket')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(formRef.state.values.items).toHaveLength(4);
  });

  it('required validator registers on the form field and fails submit with zero rows', async () => {
    let formRef: any;
    function FormHarness() {
      const form = useForm({ defaultValues: { items: [] as Row[] } });
      formRef = form;
      return (
        <TableInput<Row>
          form={form as any}
          name="items"
          columns={columns}
          required
          aria-label="Line items"
        />
      );
    }
    renderWithProviders(<FormHarness />);

    await act(async () => {
      await formRef.handleSubmit();
    });
    const errors = formRef.state.fieldMeta?.items?.errors ?? [];
    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0])).toMatch(/required/i);
  });
});

describe('TableInput — nested field behavior', () => {
  it('cells provide table-cell context so fields render chromeless (useIsInTableCell)', () => {
    function CellProbe() {
      const inCell = useIsInTableCell();
      return <span data-testid="cell-ctx">{String(inCell)}</span>;
    }
    renderWithProviders(
      <TableInput<Row>
        data={[rows3()[0]]}
        columns={[
          {
            accessorKey: 'item',
            header: 'Probe',
            field: 'custom',
            fieldProps: { render: () => <CellProbe /> },
          },
        ]}
      />,
    );
    expect(screen.getByTestId('cell-ctx').textContent).toBe('true');
  });

  it('inline text editor drafts: no commit per keystroke, Enter commits once, Escape discards', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Controlled onChange={onChange} />);

    const input = screen.getByDisplayValue('Bolts') as HTMLInputElement;
    await userEvent.type(input, '!!');
    expect(onChange).not.toHaveBeenCalled(); // draft only

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as Row[])[1].item).toBe('Bolts!!');

    // Escape reverts a fresh draft without committing
    const committed = screen.getByDisplayValue('Bolts!!') as HTMLInputElement;
    await userEvent.type(committed, 'ZZZ');
    fireEvent.keyDown(screen.getByDisplayValue('Bolts!!ZZZ'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledOnce(); // still just the Enter commit
    await waitFor(() => {
      expect(screen.getByDisplayValue('Bolts!!')).toBeTruthy();
    });
  });

  it('inline text editor commits the draft on blur', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Controlled onChange={onChange} />);
    const input = screen.getByDisplayValue('Paint') as HTMLInputElement;
    await userEvent.type(input, 'ed');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as Row[])[2].item).toBe('Painted');
  });
});

describe('TableInput — value fidelity', () => {
  it('round-trips edits with types preserved and no drift after remove+add', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Controlled
        onChange={onChange}
        defaultRow={{ item: 'NEW', qty: 0, urgent: false }}
      />,
    );

    // boolean flip through the checkbox cell
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    let payload = onChange.mock.calls.at(-1)![0] as Row[];
    expect(payload[0].urgent).toBe(true); // boolean, not "true"
    expect(payload[0].qty).toBe(12); // untouched number preserved
    expect(payload[0].id).toBe('row-a');

    // remove first row, then add — remaining rows keep identity and order
    await userEvent.click(screen.getByRole('button', { name: 'Delete row 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    payload = onChange.mock.calls.at(-1)![0] as Row[];
    expect(payload.map((r) => r.item)).toEqual(['Bolts', 'Paint', 'NEW']);
    expect(payload[0]).toMatchObject({ id: 'row-b', qty: 3, urgent: true });
    expect(new Set(payload.map((r) => r.id)).size).toBe(3);
    expect(payload[2]).not.toHaveProperty('idx');

    // visible table matches the payload exactly
    expect(screen.getByDisplayValue('Bolts')).toBeTruthy();
    expect(screen.getByDisplayValue('Paint')).toBeTruthy();
    expect(screen.getByDisplayValue('NEW')).toBeTruthy();
    expect(screen.queryByDisplayValue('Bracket')).toBeNull();
    // row numbers renumber 1..3 (display), while row identity stays stable
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('ChildTable — field wrapper integration', () => {
  it('renders label, helper, and control in field-layout slot order; error replaces helper', () => {
    const { rerender } = renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        helperText="Helper text here"
        value={rows3()}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    const label = screen.getByText('Line items');
    const helper = screen.getByText('Helper text here');
    expect(label.compareDocumentPosition(helper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(
      <ChildTable<Row>
        label="Line items"
        helperText="Helper text here"
        error="Something is wrong"
        value={rows3()}
        onChange={vi.fn()}
        columns={columns}
      />,
    );
    expect(screen.getByText('Something is wrong')).toBeTruthy();
    expect(screen.queryByText('Helper text here')).toBeNull();
  });

  it('forwards validators/required to the form field and surfaces the error in the layout slot', async () => {
    let formRef: any;
    function Harness() {
      const form = useForm({ defaultValues: { items: [] as Row[] } });
      formRef = form;
      return (
        <ChildTable<Row>
          form={form as any}
          name="items"
          label="Line items"
          required
          columns={columns}
        />
      );
    }
    renderWithProviders(<Harness />);

    await act(async () => {
      await formRef.handleSubmit();
    });
    await waitFor(() => {
      expect(screen.getByText(/required/i)).toBeTruthy();
    });
  });

  it('binds through form context add/delete (README first-class field contract)', async () => {
    let formRef: any;
    function Harness() {
      const form = useForm({ defaultValues: { items: [] as Row[] } });
      formRef = form;
      return (
        <ChildTable<Row>
          form={form as any}
          name="items"
          columns={columns}
        />
      );
    }
    renderWithProviders(<Harness />);

    expect(screen.getByText('No rows')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add Row' }));
    expect(formRef.state.values.items).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(formRef.state.values.items).toHaveLength(0);
  });

  it('associates the label with the control: htmlFor resolves to the named group', () => {
    const { container } = renderWithProviders(
      <ChildTable<Row>
        label="Line items"
        value={rows3()}
        onChange={vi.fn()}
        columns={columns}
      />,
    );

    const label = container.querySelector('label[for]') as HTMLLabelElement | null;
    expect(label?.textContent).toContain('Line items');
    const forId = label?.getAttribute('for')!;
    const control = container.querySelector(`[id="${forId}"]`) as HTMLElement | null;
    expect(control).toBeTruthy();
    expect(control?.getAttribute('role')).toBe('group');
    const labelledBy = control?.getAttribute('aria-labelledby');
    expect(labelledBy).toBe(`${forId}-label`);
    expect(document.getElementById(labelledBy!)?.textContent).toContain('Line items');
    // The named group is what assistive tech (and getByRole) resolves
    expect(screen.getByRole('group', { name: /Line items/ })).toBeTruthy();
  });
});

describe('TableInput — Frappe grid + LC-71', () => {
  const keys = {
    key: '',
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  };

  it('Tab on the last data cell of the last row adds a row', () => {
    expect(
      childTableKeyAction(
        { ...keys, key: 'Tab' },
        {
          rowIndex: 2,
          rowCount: 3,
          columnId: 'urgent',
          inLastDataCell: true,
          field: 'checkbox',
          tagName: 'INPUT',
          listboxOpen: false,
          canAddRow: true,
        },
      ),
    ).toEqual({ type: 'addRow' });
  });

  it('Tab on a middle cell does not add a row', () => {
    expect(
      childTableKeyAction(
        { ...keys, key: 'Tab' },
        {
          rowIndex: 2,
          rowCount: 3,
          columnId: 'item',
          inLastDataCell: false,
          field: 'input',
          tagName: 'INPUT',
          listboxOpen: false,
          canAddRow: true,
        },
      ),
    ).toBeNull();
  });

  it('ArrowDown/Up move to the same column; stepper and textarea are ignored', () => {
    expect(
      childTableKeyAction(
        { ...keys, key: 'ArrowDown' },
        {
          rowIndex: 0,
          rowCount: 3,
          columnId: 'item',
          inLastDataCell: false,
          field: 'input',
          tagName: 'INPUT',
          listboxOpen: false,
          canAddRow: true,
        },
      ),
    ).toEqual({ type: 'move', rowIndex: 1, columnId: 'item' });
    expect(
      childTableKeyAction(
        { ...keys, key: 'ArrowDown' },
        {
          rowIndex: 0,
          rowCount: 3,
          columnId: 'qty',
          inLastDataCell: false,
          field: 'stepper',
          tagName: 'INPUT',
          listboxOpen: false,
          canAddRow: true,
        },
      ),
    ).toBeNull();
  });

  it('Add Row lives inside the grid frame (Frappe grid-footer)', () => {
    const { container } = renderStandalone();
    const add = screen.getByRole('button', { name: 'Add Row' });
    const frame = container.querySelector('[aria-label="Table input"]')?.parentElement;
    expect(frame?.contains(add)).toBe(true);
  });

  it('focusing a cell marks that row active (LC-71 selected = fill)', async () => {
    renderStandalone();
    const input = screen.getByDisplayValue('Bracket');
    expect(input.closest("[data-active='true']")).toBeNull();
    await userEvent.click(input);
    expect(input.closest("[data-active='true']")).toBeTruthy();
  });

  it('Tab on the last cell of the last row commits a new row through onChange', async () => {
    const onChange = vi.fn();
    renderWithProviders(<Controlled onChange={onChange} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.keyDown(checkboxes.at(-1), { key: 'Tab' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toHaveLength(4);
  });
});
