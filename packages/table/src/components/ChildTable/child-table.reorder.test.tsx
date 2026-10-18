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

const Harness = ({ onChange }: { onChange: (rows: TaskRow[]) => void }) => {
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
};

const signingKeyHandle = () => screen.getByRole('button', { name: /Rotate signing key/iu });

describe('ChildTable idx reorder (MPO-22)', () => {
  it('keyboard-reorders a row and writes idx 1..n on the change payload', () => {
    const onChange = vi.fn<(rows: TaskRow[]) => void>();
    renderWithProviders(<Harness onChange={onChange} />);

    signingKeyHandle().focus();
    fireEvent.keyDown(signingKeyHandle(), { key: ' ' });
    fireEvent.keyDown(signingKeyHandle(), { key: 'ArrowDown' });
    fireEvent.keyDown(signingKeyHandle(), { key: ' ' });

    expect(onChange).toHaveBeenCalledOnce();
    const [[next]] = onChange.mock.calls;
    expect(next.map((r) => ({ id: r.id, idx: r.idx, task: r.task }))).toStrictEqual([
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
        onChange={vi.fn<(rows: TaskRow[]) => void>()}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /Reorder/iu })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rotate signing key/iu })).toBeNull();
  });
});
