/**
 * DateRangeField contract specs. The `Date Range` fieldtype composes the forms
 * DateRangePicker, so the adapter's contract is which props survive the hop.
 *
 * `value` and `onChange` used to be DECLARED on DateRangeFieldProps and then
 * destructured away instead of being handed to the picker, so a saved range
 * never painted and a picked one never emitted (MPO-137, found by the MPO-123
 * spec pass). Both are now wired, and the range is carried as the two calendar
 * dates comma-separated — the shape the registry feeds in and reads back.
 */
import { Form } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { DateRangeField } from '.';

afterEach(cleanup);

const trigger = (container: HTMLElement) => container.querySelector('input');

/** The accessible control: role="combobox", not the decorative inner input. */
const combobox = (container: HTMLElement) => container.querySelector('[data-testid="date-picker-trigger"]');

/**
 * An enabled day cell in the month the picker opened on. The panel is
 * portaled, and the wide layout renders the previous month first, so the
 * range's own month is the LAST calendar panel in the document.
 */
function getDayButton(day: number): HTMLButtonElement | undefined {
  const panels = document.body.querySelectorAll('[data-testid="date-picker-calendar"]');
  const panel = panels.at(-1);
  if (!panel) {
    return undefined;
  }
  return [...panel.querySelectorAll('button, [role="button"]')].find((btn) => {
    const disabled =
      btn.hasAttribute('disabled') ??
      btn.getAttribute('aria-disabled') === 'true' ??
      Object.hasOwn(btn.dataset, 'disabled');
    return btn.textContent?.trim() === String(day) && !disabled;
  }) as HTMLButtonElement | undefined;
}

describe('DateRangeField composes the forms DateRangePicker', () => {
  it('renders a single range trigger, not two date inputs', () => {
    const result = renderWithProviders(<DateRangeField label="Period" />);
    expect(result.container.querySelectorAll('input')).toHaveLength(1);
  });

  it("carries the picker's own placeholder when the field sets none", () => {
    const result = renderWithProviders(<DateRangeField label="Period" />);
    expect(trigger(result.container)?.getAttribute('placeholder')).toContain('date');
  });

  it('forwards an explicit placeholder', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        placeholder="From – To"
      />,
    );
    expect(trigger(result.container)?.getAttribute('placeholder')).toBe('From – To');
  });

  it('forwards readOnly, which swaps the popover trigger for a flat read-only box', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        readOnly
      />,
    );
    expect(trigger(result.container)?.hasAttribute('readonly')).toBe(true);
  });

  it('forwards required to the control, not just to the label', () => {
    // The accessible control is the combobox box, not the inner <input>: that
    // input is readOnly / tabIndex -1 / pointerEvents none, so the aria state
    // rides the role="combobox" wrapper. Asserting it on the input passes
    // vacuously against a picker that sets neither.
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        required
      />,
    );
    expect(combobox(result.container)?.getAttribute('aria-required')).toBe('true');
    expect(combobox(result.container)?.getAttribute('role')).toBe('combobox');
  });

  it('forwards error, which marks the control invalid', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        error="pick a range"
      />,
    );
    expect(combobox(result.container)?.getAttribute('aria-invalid')).toBe('true');
    expect(result.container.textContent).toContain('pick a range');
  });

  it('leaves both aria states off a field that is neither required nor errored', () => {
    const result = renderWithProviders(<DateRangeField label="Period" />);
    expect(combobox(result.container)?.getAttribute('aria-required')).toBeNull();
    expect(combobox(result.container)?.getAttribute('aria-invalid')).toBeNull();
  });

  it('forwards the label and helperText', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        helperText="inclusive of both ends"
      />,
    );
    expect(result.container.textContent).toContain('Period');
    expect(result.container.textContent).toContain('inclusive of both ends');
  });

  it('skeleton branch renders no trigger', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        skeleton
      />,
    );
    expect(trigger(result.container)).toBeNull();
  });
});

describe('DateRangeField controlled value (MPO-137)', () => {
  it('declares value on its props type', () => {
    // Type-level promise: the adapter advertises a controlled value.
    const props: React.ComponentProps<typeof DateRangeField> = { value: '2026-01-01' };
    expect(props.value).toBe('2026-01-01');
  });

  it('paints a saved range on the trigger rather than the placeholder', () => {
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        placeholder="From – To"
        value="2026-01-01,2026-01-31"
      />,
    );
    expect(trigger(result.container)?.value).toBe('Jan 1, 2026 – Jan 31, 2026');
  });

  it('paints a range that arrives after mount, without emitting (LC-14)', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        value=""
        onChange={onChange}
      />,
    );
    expect(trigger(result.container)?.value ?? '').toBe('');

    // Late seed: the engine applies create defaults once meta loads.
    result.rerender(
      <DateRangeField
        label="Period"
        value="2026-01-01,2026-01-31"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(trigger(result.container)?.value).toBe('Jan 1, 2026 – Jan 31, 2026');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits the comma-separated wire string once a range is picked', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        value="2026-03-05,2026-03-31"
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(trigger(result.container)!);
    });
    // The panel opens on the range's own month; in the wide (dual-calendar)
    // layout that is the LAST panel, the previous month being the first.
    await waitFor(() => {
      expect(getDayButton(15)).toBeTruthy();
    });
    // A complete range restarts on the next click, so this one only re-anchors.
    await act(async () => {
      fireEvent.click(getDayButton(15)!);
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(getDayButton(20)!);
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('2026-03-15,2026-03-20');
  });

  it('clearing the range emits the empty wire value', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        value="2026-03-05,2026-03-31"
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(result.container.querySelector('[data-testid="date-picker-clear"]')!);
    });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('the registry hands value and onChange straight to the adapter', () => {
    const Component = getFieldComponent('Date Range')!;
    const element = (Component as Function)({
      value: '2026-01-01,2026-01-31',
      onChange: () => {},
    } as FieldRenderProps) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(DateRangeField);
    expect(element.props.value).toBe('2026-01-01,2026-01-31');
    expect(element.props.onChange).toBeTypeOf('function');
  });
});

describe('DateRangeField uncontrolled and form-bound paths (MPO-137)', () => {
  it('seeds an uncontrolled field from a wire defaultValue and still emits a pick', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <DateRangeField
        label="Period"
        defaultValue="2026-03-05,2026-03-31"
        onChange={onChange}
      />,
    );
    expect(trigger(result.container)?.value).toBe('Mar 5, 2026 – Mar 31, 2026');

    await act(async () => {
      fireEvent.click(trigger(result.container)!);
    });
    await waitFor(() => {
      expect(getDayButton(15)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(getDayButton(15)!);
    });
    await act(async () => {
      fireEvent.click(getDayButton(20)!);
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('2026-03-15,2026-03-20');
    expect(trigger(result.container)?.value).toBe('Mar 15, 2026 – Mar 20, 2026');
  });

  it('binds name/form inside a TanStack form: the form value paints and a pick writes back', async () => {
    type Range = { start: Date | null; end: Date | null } | null;
    let formApi: { state: { values: { period: Range } } } | undefined;
    function Harness() {
      const form = useForm({
        defaultValues: {
          period: { start: new Date(2026, 2, 5), end: new Date(2026, 2, 31) } as Range,
        },
      });
      formApi = form as unknown as typeof formApi;
      return (
        <Form form={form}>
          <DateRangeField
            label="Period"
            name="period"
            form={form}
          />
        </Form>
      );
    }
    const result = renderWithProviders(<Harness />);
    await waitFor(() => {
      expect(trigger(result.container)?.value).toBe('Mar 5, 2026 – Mar 31, 2026');
    });

    await act(async () => {
      fireEvent.click(trigger(result.container)!);
    });
    await waitFor(() => {
      expect(getDayButton(15)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(getDayButton(15)!);
    });
    await act(async () => {
      fireEvent.click(getDayButton(20)!);
    });
    const period = formApi?.state.values.period;
    expect(period?.start?.toDateString()).toBe(new Date(2026, 2, 15).toDateString());
    expect(period?.end?.toDateString()).toBe(new Date(2026, 2, 20).toDateString());
    expect(trigger(result.container)?.value).toBe('Mar 15, 2026 – Mar 20, 2026');
  });
});

describe('registry resolution (Date Range fieldtype)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Date Range' to DateRangeField, and not to the Date adapter", () => {
    const Component = getFieldComponent('Date Range')!;
    expect(Component).toBeTruthy();
    expect(Component).not.toBe(getFieldComponent('Date'));
    const element = (Component as Function)(propsFor({ label: 'Period' })) as React.ReactElement<Record<string, any>>;
    expect(element.type).toBe(DateRangeField);
    expect(element.props.label).toBe('Period');
  });

  it('passes helperText / readOnly / skeleton / compact through', () => {
    const Component = getFieldComponent('Date Range')!;
    const element = (Component as Function)(
      propsFor({
        helperText: 'both ends inclusive',
        readOnly: true,
        skeleton: true,
        compact: true,
      }),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.helperText).toBe('both ends inclusive');
    expect(element.props.readOnly).toBe(true);
    expect(element.props.skeleton).toBe(true);
    expect(element.props.compact).toBe(true);
  });
});
