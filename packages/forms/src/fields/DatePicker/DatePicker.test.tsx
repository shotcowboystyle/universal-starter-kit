import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { formatDateDisplay, isSameDay, toWeeks } from './parts';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('@tamagui/lucide-icons-2', () => ({
  Calendar: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
}));

async function loadDatePicker() {
  return (await import('./index')).DatePicker;
}

function getEnabledDayButtons(root: ParentNode): HTMLButtonElement[] {
  const allButtons = Array.from(root.querySelectorAll('button, [role="button"]')) as HTMLButtonElement[];
  return allButtons.filter((btn) => {
    const text = btn.textContent?.trim() ?? '';
    const isDay = /^\d{1,2}$/.test(text);
    const disabled =
      btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' || btn.hasAttribute('data-disabled');
    return isDay && !disabled;
  });
}

describe('DatePicker', () => {
  describe('without form context', () => {
    it('rings the whole trigger box including the calendar icon slot', async () => {
      const DatePicker = await loadDatePicker();
      const result = renderWithProviders(<DatePicker label="Date" />);
      const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]') as HTMLElement;
      const input = result.container.querySelector('input') as HTMLInputElement;
      const label = result.container.querySelector('label') as HTMLLabelElement;
      expect(trigger).toBeTruthy();
      expect(trigger.contains(input)).toBe(true);
      expect(trigger.className).toMatch(/mp-composite-ring/);
      expect(trigger.getAttribute('tabindex')).toBe('0');
      expect(trigger.getAttribute('role')).toBe('combobox');
      expect(input.tabIndex).toBe(-1);
      expect(trigger.id).toBeTruthy();
      expect(label.htmlFor).toBe(trigger.id);
    });

    it('should handle disabled state', async () => {
      const DatePicker = await loadDatePicker();
      const result = renderWithProviders(<DatePicker label="Date" name="date" disabled />);
      const input = result.container.querySelector('input');
      expect(input).toBeTruthy();
      expect(input?.getAttribute('aria-disabled')).toBe('true');

      const clickable = result.container.querySelector("input,button,[role='button']");
      if (clickable) {
        // BOTH halves of a real click. `click` alone only exercised the
        // trigger's own gated handler, so this passed while the field still
        // opened in a browser (SB-M-614): FloatingPanel's opener is
        // `useClick(..., { event: "mousedown" })`, and the disabled trigger
        // is pointerEvents-none, so the press falls through to it.
        fireEvent.mouseDown(clickable);
        fireEvent.click(clickable);
      }
      await waitFor(() => {
        expect(result.findTextElement('Select a month')).toBeUndefined();
      });
      expect(document.querySelector('[data-testid="floating-panel-viewport"]')).toBeNull();
    });

    it('fires canonical onChange and the deprecated onValueChange alias once when a day is picked', async () => {
      const DatePicker = await loadDatePicker();
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <DatePicker label="Date" name="date" onChange={onChange} onValueChange={onValueChange} />,
      );

      const trigger = result.container.querySelector("input,button,[role='button']");
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.click(trigger);
        }
      });

      await waitFor(() => {
        expect(getEnabledDayButtons(document.body).length).toBeGreaterThan(0);
      });

      const dayButtons = getEnabledDayButtons(document.body);
      await act(async () => {
        fireEvent.click(dayButtons[0]);
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBeInstanceOf(Date);
      expect(onChange.mock.calls[0][0]).toEqual(onValueChange.mock.calls[0][0]);
    });
  });

  describe('with form context', () => {
    it('commits the picked date into form state via field.handleChange', async () => {
      const DatePicker = await loadDatePicker();
      const onSubmit = vi.fn();

      const FormExample = () => {
        const form = useForm({
          defaultValues: { date: null as Date | null },
          onSubmit: async ({ value }) => {
            onSubmit(value);
          },
        });
        return (
          <Form form={form}>
            <DatePicker label="Date" name="date" />
            <Button action="submit">Submit</Button>
          </Form>
        );
      };

      const result = renderWithProviders(<FormExample />);
      const trigger = result.container.querySelector("input,button,[role='button']");
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.click(trigger);
        }
      });

      await waitFor(() => {
        expect(getEnabledDayButtons(document.body).length).toBeGreaterThan(0);
      });

      const dayButtons = getEnabledDayButtons(document.body);
      await act(async () => {
        fireEvent.click(dayButtons[0]);
      });

      const submitButton = result.getSubmitButton();
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      const submitted = onSubmit.mock.calls[0][0];
      expect(submitted.date).toBeInstanceOf(Date);
    });

    it('clears onChange validation errors after a date is picked', async () => {
      const DatePicker = await loadDatePicker();

      const FormExample = () => {
        const form = useForm({
          defaultValues: { date: new Date(2024, 0, 15) as Date | null },
        });
        return (
          <Form form={form}>
            <DatePicker
              label="Date"
              name="date"
              defaultValue={new Date(2024, 0, 15)}
              validators={{
                onChange: ({ value }: { value: Date | null }) => (value == null ? 'Date is required' : undefined),
              }}
            />
          </Form>
        );
      };

      const result = renderWithProviders(<FormExample />);

      // Clear commits null via field.handleChange → onChange validator errors.
      const clearButton = result.container.querySelector('button');
      expect(clearButton).toBeTruthy();
      await act(async () => {
        if (clearButton) {
          fireEvent.click(clearButton);
        }
      });
      await waitFor(() => {
        expect(result.container.textContent).toContain('Date is required');
      });

      // Pick a day → field.handleChange(date) must clear that error.
      const trigger = result.container.querySelector('input');
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.click(trigger);
        }
      });
      await waitFor(() => {
        expect(getEnabledDayButtons(document.body).length).toBeGreaterThan(0);
      });
      const dayButtons = getEnabledDayButtons(document.body);
      await act(async () => {
        fireEvent.click(dayButtons[0]);
      });

      await waitFor(() => {
        expect(result.container.textContent).not.toContain('Date is required');
      });
    });

    it('clears form value when the reset control is pressed', async () => {
      const DatePicker = await loadDatePicker();
      const onSubmit = vi.fn();

      const FormExample = () => {
        const form = useForm({
          defaultValues: { date: new Date(2024, 0, 15) as Date | null },
          onSubmit: async ({ value }) => {
            onSubmit(value);
          },
        });
        return (
          <Form form={form}>
            <DatePicker label="Date" name="date" defaultValue={new Date(2024, 0, 15)} />
            <Button action="submit">Submit</Button>
          </Form>
        );
      };

      const result = renderWithProviders(<FormExample />);
      const clearButton = result.container.querySelector('button');
      expect(clearButton).toBeTruthy();
      await act(async () => {
        if (clearButton) {
          fireEvent.click(clearButton);
        }
      });

      const submitButton = result.getSubmitButton();
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ date: null });
      });
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The form branch only ever displayed the mount-time value (`selectedDate`
    // was never re-synced from field state), so a value applied AFTER first
    // paint — create-mode engine seeding, form.setFieldValue, live server
    // merge — never rendered. Adopting a programmatic value must not emit
    // onChange (a seeded value is not a user edit).
    const getDisplayInput = (container: ParentNode) => container.querySelector('input');

    it('standalone controlled: a value arriving after mount displays, without onChange', async () => {
      const DatePicker = await loadDatePicker();
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <DatePicker label="Due Date" value={null} onChange={onChange} onValueChange={onValueChange} />,
      );
      expect(getDisplayInput(result.container)?.value ?? '').toBe('');

      // Late seed: the upstream doc value (frappe wire string) arrives after
      // first paint.
      result.rerender(
        <DatePicker label="Due Date" value="2026-03-05" onChange={onChange} onValueChange={onValueChange} />,
      );
      await waitFor(() => {
        expect(getDisplayInput(result.container)?.value).toBe('Mar 5, 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onValueChange).not.toHaveBeenCalled();
    });

    it('form-integrated: a field value set after mount displays, without onChange', async () => {
      const DatePicker = await loadDatePicker();
      const onChange = vi.fn();
      let formApi: { setFieldValue: (name: 'date', value: string | null) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { date: null as string | null } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <DatePicker label="Due Date" name="date" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      expect(getDisplayInput(result.container)?.value ?? '').toBe('');

      await act(async () => {
        formApi?.setFieldValue('date', '2026-03-05');
      });
      await waitFor(() => {
        expect(getDisplayInput(result.container)?.value).toBe('Mar 5, 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('form-integrated: clearing the field value programmatically clears the display', async () => {
      const DatePicker = await loadDatePicker();
      const onChange = vi.fn();
      let formApi: { setFieldValue: (name: 'date', value: string | null) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { date: '2026-03-05' as string | null } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <DatePicker label="Due Date" name="date" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      await waitFor(() => {
        expect(getDisplayInput(result.container)?.value).toBe('Mar 5, 2026');
      });

      await act(async () => {
        formApi?.setFieldValue('date', null);
      });
      await waitFor(() => {
        expect(getDisplayInput(result.container)?.value ?? '').toBe('');
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('date utilities', () => {
    it('formats display values in the house absolute register and handles null', () => {
      expect(formatDateDisplay(null)).toBe('');
      // Editing surfaces show the compact absolute register
      // with the year always present — never numeric-locale "01/15/2024".
      expect(formatDateDisplay(new Date(2024, 0, 15))).toBe('Jan 15, 2024');
    });

    it('compares dates by calendar day', () => {
      expect(isSameDay(new Date(2024, 4, 1, 1), new Date(2024, 4, 1, 23))).toBe(true);
      expect(isSameDay(new Date(2024, 4, 1, 1), new Date(2024, 4, 2, 1))).toBe(false);
      expect(isSameDay(null, new Date(2024, 4, 1, 1))).toBe(false);
    });

    it('chunks a day list into calendar weeks', () => {
      const days = Array.from({ length: 14 }, (_, i) => new Date(2024, 0, i + 1));
      const weeks = toWeeks(days);

      expect(weeks.length).toBe(2);
      expect(weeks[0]).toHaveLength(7);
      expect(weeks[1]).toHaveLength(7);
      expect(weeks[0]?.[0]?.getDate()).toBe(1);
      expect(weeks[1]?.[6]?.getDate()).toBe(14);
    });
  });
});
