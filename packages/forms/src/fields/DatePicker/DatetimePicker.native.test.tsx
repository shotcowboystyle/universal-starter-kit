import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { DatetimePicker } from './DatetimePicker.native';
import { DatePicker } from './index.native';

vi.mock('tamagui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tamagui')>()),
  isWeb: false,
}));

// RNW omits React Native's accessibilityValue object. Bridge that native
// contract for this harness; the actual iOS AX tree remains the runtime gate.
vi.mock('react-native-web', async (importOriginal) => {
  const native = await importOriginal<typeof import('react-native')>();
  return {
    ...native,
    Pressable: ({ accessibilityValue, ...props }: import('react-native').PressableProps) => (
      <native.Pressable {...props} aria-valuetext={accessibilityValue?.text} />
    ),
  };
});

const picked = new Date(2026, 2, 5, 14, 30);
vi.mock('../nativeDateTime/OsDateTimeSheet', () => ({
  OsDateTimeSheet: ({ open, onConfirm }: { open: boolean; onConfirm: (date: Date) => void }) =>
    open ? (
      <div role="dialog" aria-label="OS date and time">
        <button
          onClick={() => {
            onConfirm(new Date(2026, 2, 5, 14, 30));
          }}>
          Confirm OS selection
        </button>
      </div>
    ) : null,
}));

describe('native DatetimePicker ownership', () => {
  it.each([
    { Control: DatePicker, name: 'Date' },
    { Control: DatetimePicker, name: 'Date and time' },
  ])('keeps $name paint inert and exposes its current value on the press owner', ({ Control, name }) => {
    const result = renderWithProviders(<Control value={picked} />);
    const trigger = result.getByRole('button', { name });
    expect(trigger.getAttribute('aria-valuetext')).toContain('Mar 5, 2026');
    const painted = result.getByTestId('date-picker-trigger');
    const paintAncestors: HTMLElement[] = [];
    for (let el = painted.parentElement; el && el !== trigger; el = el.parentElement) {
      paintAncestors.push(el);
    }
    expect(paintAncestors.some((el) => getComputedStyle(el).pointerEvents === 'none')).toBe(true);
  });

  it('opens from its full-width native target and commits exactly once', () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const result = renderWithProviders(<DatetimePicker onChange={onChange} onValueChange={onValueChange} />);
    const trigger = result.getByRole('button', { name: 'Date and time' });
    expect(getComputedStyle(trigger).width).toBe('100%');
    fireEvent.click(trigger);
    expect(result.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(result.getByRole('button', { name: 'Confirm OS selection' }));
    expect(result.queryByRole('dialog')).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(picked);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(picked);
    expect(result.container.querySelector('input')?.value).toContain('Mar 5, 2026');
  });

  it('keeps native read-only text undimmed, without a picker press target', () => {
    const result = renderWithProviders(<DatetimePicker value={picked} readOnly />);
    const input = result.container.querySelector('input')!;
    expect(input.value).toContain('Mar 5, 2026');
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(result.queryByRole('button')).toBeNull();
    fireEvent.click(input);
    expect(result.queryByRole('dialog')).toBeNull();
    for (let el: HTMLElement | null = input; el && el !== result.container; el = el.parentElement) {
      const opacity = getComputedStyle(el).opacity;
      expect(opacity === '' || Number(opacity) === 1).toBe(true);
    }
  });

  it('keeps a disabled value visible while declining activation', () => {
    const result = renderWithProviders(<DatetimePicker value={picked} disabled />);
    const trigger = result.getByRole('button', { name: 'Date and time' });
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(result.container.querySelector('input')?.value).toContain('Mar 5, 2026');
    fireEvent.click(trigger);
    expect(result.queryByRole('dialog')).toBeNull();
  });

  it('adopts controlled values after mount without emitting changes or opening', async () => {
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    const result = renderWithProviders(
      <DatetimePicker value={null} onChange={onChange} onValueChange={onValueChange} />,
    );
    expect(result.container.querySelector('input')?.value).toBe('');
    result.rerender(<DatetimePicker value={picked} onChange={onChange} onValueChange={onValueChange} />);
    await waitFor(() => {
      expect(result.container.querySelector('input')?.value).toContain('Mar 5, 2026');
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(result.queryByRole('dialog')).toBeNull();
  });

  it('adopts form values after mount without emitting changes or opening', async () => {
    const onChange = vi.fn();
    let update: ((date: Date) => void) | undefined;
    function Example() {
      const form = useForm({ defaultValues: { when: null as Date | null } });
      update = (date) => {
        form.setFieldValue('when', date);
      };
      return (
        <Form form={form}>
          <DatetimePicker name="when" onChange={onChange} />
        </Form>
      );
    }
    const result = renderWithProviders(<Example />);
    expect(result.container.querySelector('input')?.value).toBe('');
    await act(async () => update?.(picked));
    await waitFor(() => {
      expect(result.container.querySelector('input')?.value).toContain('Mar 5, 2026');
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(result.queryByRole('dialog')).toBeNull();
  });

  it('gives the native trigger box the row width its text section needs', () => {
    const result = renderWithProviders(<DatetimePicker value={picked} />);
    const box = result.getByTestId('date-picker-trigger');
    expect(getComputedStyle(box).flexGrow).toBe('1');
    expect(getComputedStyle(box).minWidth).toBe('0px');
  });
});
