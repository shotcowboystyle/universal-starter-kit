import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { MonthPicker } from './MonthPicker';

const MONTH_ABBREVIATIONS = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;

function getMonthButtons(root: ParentNode): HTMLButtonElement[] {
  const allButtons = Array.from(root.querySelectorAll('button, [role="button"]')) as HTMLButtonElement[];
  return allButtons.filter((btn) => MONTH_ABBREVIATIONS.test(btn.textContent?.trim() ?? ''));
}

describe('MonthPicker', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<MonthPicker label="Month" name="month" />);
      expect(result.findTextElement('Month')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<MonthPicker label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(<MonthPicker label="Month" name="month" helperText="Select a month" />);
      expect(result.findTextElement('Select a month')).toBeDefined();
    });

    // The trigger BOX (not the inner input) carries the
    // field id so the ring wraps the calendar icon and the label focuses
    // the perceived control.
    it('the trigger carries the field id the sibling label resolves to', () => {
      const result = renderWithProviders(<MonthPicker label="Month" name="month" />);
      const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]') as HTMLElement;
      const label = result.container.querySelector('label') as HTMLLabelElement;
      expect(trigger?.id).toBeTruthy();
      expect(label.htmlFor).toBe(trigger.id);
      expect(trigger.getAttribute('aria-labelledby')).toBe(`${trigger.id}-label`);
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<MonthPicker label="Loading" name="l" skeleton />);
      const input = result.container.querySelector('input');
      expect(input).toBeNull();
    });

    it('renders with placeholder', () => {
      const result = renderWithProviders(<MonthPicker label="Month" name="month" placeholder="Pick a month" />);
      const input = result.container.querySelector('input[placeholder="Pick a month"]');
      expect(input).not.toBeNull();
    });

    it('renders with default placeholder when no month selected', () => {
      const result = renderWithProviders(<MonthPicker label="Month" name="month" />);
      const input = result.container.querySelector('input');
      expect(input).not.toBeNull();
    });

    it('fires canonical onChange once when a month is picked', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<MonthPicker label="Month" name="month" onChange={onChange} />);

      const trigger = result.container.querySelector("input,button,[role='button']");
      expect(trigger).toBeTruthy();
      await act(async () => {
        if (trigger) {
          fireEvent.click(trigger);
        }
      });

      await waitFor(() => {
        expect(getMonthButtons(document.body).length).toBeGreaterThan(0);
      });

      const monthButtons = getMonthButtons(document.body);
      await act(async () => {
        fireEvent.click(monthButtons[0]);
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          month: expect.any(Number),
          year: expect.any(Number),
        }),
      );
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { month: null } }} submitText="Submit">
          <MonthPicker name="month" label="Month" />
        </Form>,
      );
      expect(result.findTextElement('Month')).toBeDefined();
    });

    it('commits the picked month into form state via field.handleChange', async () => {
      const onSubmit = vi.fn();
      const FormExample = () => {
        const form = useForm({
          defaultValues: { month: null as { month: number; year: number } | null },
          onSubmit: async ({ value }) => {
            onSubmit(value);
          },
        });
        return (
          <Form form={form}>
            <MonthPicker name="month" label="Month" />
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
        expect(getMonthButtons(document.body).length).toBeGreaterThan(0);
      });
      const monthButtons = getMonthButtons(document.body);
      await act(async () => {
        fireEvent.click(monthButtons[0]);
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
      expect(onSubmit.mock.calls[0][0].month).toEqual(
        expect.objectContaining({
          month: expect.any(Number),
          year: expect.any(Number),
        }),
      );
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // `selectedValue` was hardcoded to null at mount and only user picks set
    // it, so a field value applied at ANY point (even the Field-level
    // defaultValue) never displayed. The form branch now adopts the live
    // field value — without emitting onChange (a seeded value is not
    // a user edit).
    it('form-integrated: a field value set after mount displays, without onChange', async () => {
      const onChange = vi.fn();
      let formApi:
        | { setFieldValue: (name: 'month', value: { month: number; year: number } | null) => void }
        | undefined;
      const TestComponent = () => {
        const form = useForm({
          defaultValues: { month: null as { month: number; year: number } | null },
        });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <MonthPicker name="month" label="Month" onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const getInput = () => result.container.querySelector('input');
      expect(getInput()?.value ?? '').toBe('');

      await act(async () => {
        formApi?.setFieldValue('month', { month: 2, year: 2026 });
      });
      await waitFor(() => {
        expect(getInput()?.value).toBe('March 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('form-integrated: a Field-level defaultValue displays at mount', async () => {
      const onChange = vi.fn();
      const TestComponent = () => {
        const form = useForm({
          defaultValues: { month: undefined as { month: number; year: number } | undefined },
        });
        return (
          <Form form={form}>
            <MonthPicker name="month" label="Month" defaultValue={{ month: 6, year: 2025 }} onChange={onChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      await waitFor(() => {
        const input = result.container.querySelector('input');
        expect(input?.value).toBe('July 2025');
      });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // Platform prop boundary: the year nav Buttons previously
  // passed `scaleIcon` — not a forms-Button variant, so it leaked to the DOM
  // and fired React's unknown-prop console.error whenever the picker opened.
  // Open → zero leak-class console errors.
  describe('DOM prop hygiene', () => {
    it('opens without leaking non-DOM props (scaleIcon class)', async () => {
      const LEAK = /does not recognize the `.+` prop on a DOM element|non-boolean attribute|Invalid DOM property/i;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const result = renderWithProviders(<MonthPicker label="Month" name="month" />);
        const trigger = result.container.querySelector("input,button,[role='button']");
        expect(trigger).toBeTruthy();
        await act(async () => {
          if (trigger) {
            fireEvent.click(trigger);
          }
        });
        await waitFor(() => {
          expect(getMonthButtons(document.body).length).toBeGreaterThan(0);
        });
        const leaks = errorSpy.mock.calls
          .map((args) => args.map(String).join(' '))
          .filter((message) => LEAK.test(message));
        expect(leaks).toEqual([]);
        expect(document.querySelector('[scaleicon]')).toBeNull();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
