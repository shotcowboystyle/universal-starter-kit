import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimePicker } from './index.native';

vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

vi.mock('../nativeDateTime/OsDateTimeSheet', () => ({
  OsDateTimeSheet: ({ open, onConfirm }: { open: boolean; onConfirm: (date: Date) => void }) =>
    open ? (
      <div role="dialog" aria-label="OS time">
        <button
          onClick={() => {
            onConfirm(new Date(2026, 2, 5, 14, 30));
          }}>
          Confirm OS time
        </button>
      </div>
    ) : null,
}));

const paintedBox = (result: ReturnType<typeof renderWithProviders>) =>
  result.getByTestId('time-picker-glyph').parentElement as HTMLElement;

describe('native TimePicker trigger', () => {
  it('paints the empty trigger across the row with its placeholder', () => {
    const result = renderWithProviders(<TimePicker />);
    expect(getComputedStyle(result.getByRole('button', { name: 'Time' })).width).toBe('100%');
    const box = paintedBox(result);
    expect(getComputedStyle(box).flexGrow).toBe('1');
    expect(getComputedStyle(box).minWidth).toBe('0px');
    expect(box.querySelector('input')?.placeholder).toBe('Select time');
  });

  it('leaves the tap to the native press owner', () => {
    const result = renderWithProviders(<TimePicker />);
    expect(getComputedStyle(result.getByTestId('time-picker-trigger')).pointerEvents).toBe('none');
  });

  it('renders a picked time inside the same full-row box', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<TimePicker onChange={onChange} />);
    fireEvent.click(result.getByRole('button', { name: 'Time' }));
    fireEvent.click(result.getByRole('button', { name: 'Confirm OS time' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('14:30');
    const box = paintedBox(result);
    expect(getComputedStyle(box).flexGrow).toBe('1');
    expect(box.querySelector('input')?.value).toBe('2:30 PM');
  });
});
