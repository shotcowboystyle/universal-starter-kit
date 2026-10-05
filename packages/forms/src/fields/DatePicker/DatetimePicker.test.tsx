import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { DatetimePicker } from './DatetimePicker';

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

describe('DatetimePicker', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<DatetimePicker label="Appointment" name="appt" />);
      expect(result.findTextElement('Appointment')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<DatetimePicker label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(
        <DatetimePicker label="Appointment" name="appt" helperText="Select date and time" />,
      );
      expect(result.findTextElement('Select date and time')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<DatetimePicker label="Loading" name="l" skeleton />);
      const input = result.container.querySelector('input');
      expect(input).toBeNull();
    });

    it('renders with placeholder', () => {
      const result = renderWithProviders(
        <DatetimePicker label="Appointment" name="appt" placeholder="Pick date & time" />,
      );
      const input = result.container.querySelector('input[placeholder="Pick date & time"]');
      expect(input).not.toBeNull();
    });

    it('renders with default placeholder when no date selected', () => {
      const result = renderWithProviders(<DatetimePicker label="Appointment" name="appt" />);
      const input = result.container.querySelector('input');
      expect(input).not.toBeNull();
    });

    it('empty trigger shows placeholder and a calendar glyph, not a clear affordance', () => {
      const result = renderWithProviders(
        <DatetimePicker label="Appointment" name="appt" placeholder="Choose a date and time" />,
      );
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('placeholder')).toBe('Choose a date and time');
      expect(result.container.querySelector('[data-testid="date-picker-glyph"]')).toBeTruthy();
      expect(result.container.querySelector('[data-testid="date-picker-clear"]')).toBeNull();
    });

    it('shows clear only when a datetime is set', () => {
      const result = renderWithProviders(
        <DatetimePicker label="Appointment" name="appt" value={new Date(2026, 2, 5, 14, 30)} />,
      );
      expect(result.container.querySelector('[data-testid="date-picker-clear"]')).toBeTruthy();
    });

    // SB-KS-04: the trigger carried no id, so FieldLayout's label pointed at
    // nothing — one unidentified control and one dangling label per story.
    it('the trigger carries the field id the sibling label resolves to', () => {
      const result = renderWithProviders(<DatetimePicker label="Appointment" name="appt" />);
      const trigger = result.container.querySelector('[data-testid="date-picker-trigger"]') as HTMLElement;
      const label = result.container.querySelector('label') as HTMLLabelElement;
      expect(trigger?.id).toBeTruthy();
      expect(label.htmlFor).toBe(trigger.id);
      expect(result.container.querySelector(`#${CSS.escape(label.htmlFor)}`)).toBe(trigger);
      expect(trigger.getAttribute('aria-labelledby')).toBe(`${trigger.id}-label`);
    });

    it('fires canonical onChange and the deprecated onValueChange alias once when a day is picked', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      const result = renderWithProviders(
        <DatetimePicker label="Appointment" name="appt" onChange={onChange} onValueChange={onValueChange} />,
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
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { appt: null } }} submitText="Submit">
          <DatetimePicker name="appt" label="Appointment" />
        </Form>,
      );
      expect(result.findTextElement('Appointment')).toBeDefined();
    });

    it('commits the picked datetime into form state via field.handleChange', async () => {
      const onSubmit = vi.fn();
      const FormExample = () => {
        const form = useForm({
          defaultValues: { appt: null as Date | null },
          onSubmit: async ({ value }) => {
            onSubmit(value);
          },
        });
        return (
          <Form form={form}>
            <DatetimePicker name="appt" label="Appointment" />
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
      expect(onSubmit.mock.calls[0][0].appt).toBeInstanceOf(Date);
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The form branch displays from `selectedDatetime`, kept synced to the
    // live field value by DatePickerFieldValueSync — a value applied AFTER
    // first paint (create-mode engine seeding, setFieldValue, live server
    // merge) must render. Adopting a programmatic value must not emit
    // onChange (a seeded value is not a user edit).
    it('form-integrated: a field value set after mount displays, without onChange', async () => {
      const onChange = vi.fn();
      const onValueChange = vi.fn();
      let formApi: { setFieldValue: (name: 'appt', value: Date | null) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { appt: null as Date | null } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <DatetimePicker name="appt" label="Appointment" onChange={onChange} onValueChange={onValueChange} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const getInput = () => result.container.querySelector('input');
      expect(getInput()?.value ?? '').toBe('');

      await act(async () => {
        formApi?.setFieldValue('appt', new Date(2026, 2, 5, 14, 30));
      });
      await waitFor(() => {
        expect(getInput()?.value ?? '').toContain('Mar 5, 2026');
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });
});
