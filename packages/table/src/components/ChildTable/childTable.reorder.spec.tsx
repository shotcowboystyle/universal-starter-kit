import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DataTableColumn, DataTableData } from '../../types';

import { ChildTable } from './index';

interface TaskRow extends DataTableData {
  id: string;
  task: string;
  idx: number;
}

const columns: DataTableColumn<TaskRow>[] = [{ accessorKey: 'task', header: 'Task', field: 'input' }];

const initial: TaskRow[] = [
  { id: 'a', task: 'Provision runner', idx: 1 },
  { id: 'b', task: 'Rotate signing key', idx: 2 },
  { id: 'c', task: 'Update mirrors', idx: 3 },
];

function Harness({ onChange }: { onChange: (rows: TaskRow[]) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ChildTable<TaskRow>
      value={value}
      columns={columns}
      onChange={(rows) => {
        setValue(rows);
        onChange(rows);
      }}
    />
  );
}

describe('ChildTable idx reorder (MPO-22)', () => {
  it('keyboard-reorders a row and writes idx 1..n on the change payload', () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);

    const handle = () => screen.getByRole('button', { name: /Rotate signing key/i });
    handle().focus();
    fireEvent.keyDown(handle(), { key: ' ' });
    fireEvent.keyDown(handle(), { key: 'ArrowDown' });
    fireEvent.keyDown(handle(), { key: ' ' });

    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0][0] as TaskRow[];
    expect(next.map((r) => ({ id: r.id, idx: r.idx, task: r.task }))).toEqual([
      { id: 'a', idx: 1, task: 'Provision runner' },
      { id: 'c', idx: 2, task: 'Update mirrors' },
      { id: 'b', idx: 3, task: 'Rotate signing key' },
    ]);
  });

  it('hides reorder handles when readOnly', () => {
    renderWithProviders(
      <ChildTable<TaskRow>
        value={initial}
        columns={columns}
        onChange={vi.fn()}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /Reorder/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rotate signing key/i })).toBeNull();
  });
});
