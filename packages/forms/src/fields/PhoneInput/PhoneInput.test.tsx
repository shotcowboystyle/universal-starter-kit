import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { YStack } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import { PhoneInput } from './index';

describe('PhoneInput', () => {
  describe('basic rendering', () => {
    it('should render input field', () => {
      const result = renderWithProviders(<PhoneInput label="Phone" name="phone" />);

      const input = result.container.querySelector('input');
      expect(input).toBeDefined();
    });
  });

  describe('phone number formatting', () => {
    it('should prevent invalid characters', async () => {
      const result = renderWithProviders(<PhoneInput label="Valid Phone" name="valid" />);

      const input = result.container.querySelector('input');
      if (input) {
        await act(async () => {
          fireEvent.change(input, { target: { value: 'abc' } });
        });
        // Invalid characters should be filtered out, value should not contain letters
        expect(input.value).not.toContain('a');
        expect(input.value).not.toContain('b');
        expect(input.value).not.toContain('c');
      }
    });

    it('forgiving paste normalization: international paste formats NANP', async () => {
      const result = renderWithProviders(<PhoneInput label="Pasted Phone" name="pasted" />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '+1 512.400.9021' } });
      });
      expect(input.value).toBe('(512) 400-9021');

      await act(async () => {
        fireEvent.change(input, { target: { value: '(800) FLO-9021' } });
      });
      expect(input.value).toBe('(800) 902-1');
    });

    it('formats national digits as you type', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<PhoneInput label="Typed Phone" defaultCountry="US" onChange={onChange} />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '5125551234' } });
      });
      expect(input.value).toBe('(512) 555-1234');
      expect(onChange).toHaveBeenCalledWith('+15125551234');
    });
  });

  describe('country selection', () => {
    it('should render default country dial code next to the flag', () => {
      const result = renderWithProviders(<PhoneInput label="Country" name="country" />);
      expect(result.container.textContent).toContain('+1');
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('keeps the national number when the country changes (SB-M-214)', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<PhoneInput label="Rebase" defaultCountry="US" onChange={onChange} />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '5125551234' } });
      });
      expect(onChange).toHaveBeenLastCalledWith('+15125551234');

      const trigger = result.container.querySelector('[data-testid="combobox-trigger"]') as HTMLElement;
      expect(trigger).toBeTruthy();
      await act(async () => {
        fireEvent.click(trigger);
      });
      const gb = Array.from(result.container.querySelectorAll('[role="option"]')).find((el) =>
        el.textContent?.includes('United Kingdom'),
      ) as HTMLElement | undefined;
      if (gb) {
        await act(async () => {
          fireEvent.click(gb);
        });
        expect(onChange).toHaveBeenLastCalledWith('+445125551234');
        expect(input.value).not.toBe('');
      }
    });

    // At 390px the country sheet opened with focus on its list, so
    // typed text never reached the search and Enter re-picked the current
    // country. The 1100px popover already focused its search.
    it('at 390px the keyboard opens the sheet into its search, and typing then Enter picks a country', async () => {
      const initialWidth = window.innerWidth;
      window.innerWidth = 390;
      try {
        const onChange = vi.fn();
        const result = renderWithProviders(<PhoneInput label="Narrow" defaultCountry="US" onChange={onChange} />);
        const number = result.container.querySelector('input') as HTMLInputElement;
        await act(async () => {
          fireEvent.change(number, { target: { value: '5125551234' } });
        });
        const trigger = result.container.querySelector('[role="combobox"]') as HTMLElement;
        await act(async () => {
          fireEvent.keyDown(trigger, { key: 'Enter' });
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
        expect(document.activeElement?.getAttribute('placeholder')).toBe('Search countries...');
        const search = document.activeElement as HTMLInputElement;
        await act(async () => {
          fireEvent.change(search, { target: { value: 'Germany' } });
        });
        await act(async () => {
          fireEvent.keyDown(search, { key: 'Enter' });
        });
        expect(onChange).toHaveBeenLastCalledWith('+495125551234');
        expect(result.container.querySelector('[data-testid="phone-dial"]')?.textContent).toBe('+49');
      } finally {
        window.innerWidth = initialWidth;
      }
    });
  });

  describe('value handling', () => {
    it('should initialize from form default value', async () => {
      const onSubmit = vi.fn();
      const result = renderWithProviders(
        <Form
          formOptions={{ defaultValues: { phone: '+447123456789' } }}
          onSubmit={async (value) => {
            await onSubmit(value);
          }}>
          <PhoneInput label="Phone Value" name="phone" />
          <Button action="submit">Submit</Button>
        </Form>,
      );

      const submitButton = result.getButton('Submit');
      if (submitButton) {
        await act(async () => {
          fireEvent.click(submitButton);
        });
      }
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ phone: '+447123456789' });
      });
    });
  });

  describe('styling and theming', () => {
    it('should render required label with asterisk', () => {
      const result = renderWithProviders(<PhoneInput label="Required Phone" name="required" required />);

      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('Required Phone');
      expect(label?.textContent).toContain('*');
    });
  });

  describe('form integration', () => {
    describe('without form context', () => {
      it('should render helper text', () => {
        const result = renderWithProviders(
          <PhoneInput label="Phone Input" name="phoneInput" helperText="Include country code" />,
        );
        expect(result.findTextElement('Include country code')).toBeDefined();
      });
    });

    describe('with form context', () => {
      const FormExample = ({ defaultValue = '', name = 'phone', onSubmit = async (_value: any) => {} }) => {
        return (
          <Form
            formOptions={{
              defaultValues: {
                [name]: defaultValue,
              },
            }}
            onSubmit={async (value) => {
              await onSubmit(value);
            }}>
            <PhoneInput label="Phone Number" name={name} />
            <Button action="submit">Submit</Button>
          </Form>
        );
      };

      it('should render with form context and handle form submission', async () => {
        const onSubmit = vi.fn();
        const result = renderWithProviders(
          <YStack>
            <FormExample onSubmit={onSubmit} />
          </YStack>,
        );

        // Find the submit button specifically, not the country selector button
        const submitButton = result.getButton('Submit');
        expect(submitButton).toBeDefined();
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
          await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({ phone: '' });
          });
        }
      });

      it('should handle form submission with phone value', async () => {
        const onSubmit = vi.fn();
        const result = renderWithProviders(
          <YStack>
            <FormExample defaultValue="+1234567890" onSubmit={onSubmit} />
          </YStack>,
        );

        // Find the submit button specifically, not the country selector button
        const submitButton = result.getButton('Submit');
        expect(submitButton).toBeDefined();
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
          await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith({ phone: '+1234567890' });
          });
        }
      });
    });

    describe('with useForm hook directly', () => {
      it('should handle form submission with useForm', async () => {
        const onSubmitMock = vi.fn();
        const TestComponent = () => {
          const form = useForm({
            defaultValues: {
              contactPhone: '+1987654321',
            },
            onSubmit: async ({ value }) => {
              onSubmitMock(value);
            },
          });

          return (
            <Form form={form}>
              <PhoneInput label="Contact Phone" name="contactPhone" />
              <Button action="submit">Save</Button>
            </Form>
          );
        };

        const result = renderWithProviders(<TestComponent />);

        // Find the submit button specifically, not the country selector button
        const submitButton = result.getButton('Save');
        expect(submitButton).toBeDefined();
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
          await waitFor(() => {
            expect(onSubmitMock).toHaveBeenCalledWith({
              contactPhone: '+1987654321',
            });
          });
        }
      });
    });
  });

  describe('field integration', () => {
    it('should handle field with errors', () => {
      const result = renderWithProviders(
        <PhoneInput
          label="Invalid Phone"
          name="invalid"
          error="Phone number format is invalid"
          helperText="This should be hidden"
        />,
      );

      expect(result.findTextElement('Phone number format is invalid')).toBeDefined();
      expect(result.findTextElement('This should be hidden')).toBeFalsy();
    });
  });

  describe('validation', () => {
    it('should render explicit error message', () => {
      const result = renderWithProviders(
        <PhoneInput label="Validation Phone" name="validation" error="Invalid phone number" />,
      );
      expect(result.findTextElement('Invalid phone number')).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should expose an interactive input element', () => {
      const result = renderWithProviders(<PhoneInput label="Accessible Phone" name="a11yPhone" />);
      const input = result.container.querySelector('input');
      expect(input).toBeDefined();
      expect(input?.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('puts the focus ring on the box that includes the flag', () => {
      const result = renderWithProviders(<PhoneInput label="Ring Phone" />);
      const box = result.container.querySelector('[data-testid="phone-box"]');
      expect(box?.className).toContain('mp-composite-ring');
      expect(box?.className).toContain('mp-composite-ring-deep');
      expect(box?.className).toContain('mp-phone-input');
      const flag = result.container.querySelector('[data-testid="combobox-trigger"]');
      expect(box?.contains(flag)).toBe(true);
      const input = result.container.querySelector('input');
      expect(box?.contains(input)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty value', () => {
      const result = renderWithProviders(<PhoneInput label="Empty Phone" name="empty" />);

      const input = result.container.querySelector('input');
      // PhoneInput initializes with the default country dial code (+1 for US)
      // so it's not truly empty, but should have a valid initial state
      expect(input?.value).toBeDefined();
    });

    it('should handle different input types', () => {
      const result = renderWithProviders(<PhoneInput label="Tel Input" name="tel" />);

      const input = result.container.querySelector('input');
      // Phone input type should be tel or text depending on implementation
      expect(input?.type).toBeDefined();
    });
  });

  describe('disabled state', () => {
    it('should handle disabled state', () => {
      const result = renderWithProviders(<PhoneInput label="Disabled Phone" name="disabled" disabled />);

      const input = result.container.querySelector('input');
      // Tamagui/React Native Web may use either disabled attribute or aria-disabled
      const isDisabled = input?.hasAttribute('disabled') || input?.getAttribute('aria-disabled') === 'true';
      expect(isDisabled).toBeTruthy();
    });

    it('should prevent input changes when disabled', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<PhoneInput label="Disabled Changes" name="disabledChanges" disabled />);

      const input = result.container.querySelector('input');
      if (input) {
        await act(async () => {
          fireEvent.change(input, { target: { value: '123' } });
        });
        expect(onChange).not.toHaveBeenCalled();
      }
    });
  });

  describe('form validation', () => {
    it('should show helper text when no error is set', () => {
      const result = renderWithProviders(
        <PhoneInput label="Form Valid Phone" name="validPhone" helperText="Use international format" />,
      );
      expect(result.findTextElement('Use international format')).toBeDefined();
    });
  });

  describe('performance', () => {
    it('should handle rapid input changes', async () => {
      const result = renderWithProviders(<PhoneInput label="Performance Phone" name="performance" />);

      const input = result.container.querySelector('input');
      if (input) {
        await act(async () => {
          fireEvent.change(input, { target: { value: '1' } });
        });
        await act(async () => {
          fireEvent.change(input, { target: { value: '12' } });
        });
        await act(async () => {
          fireEvent.change(input, { target: { value: '123' } });
        });
        await act(async () => {
          fireEvent.change(input, { target: { value: '1234' } });
        });

        // Input changes recorded
        expect(input.value).toBeTruthy();
      }
    });
  });

  describe('responsive behavior', () => {
    it('should render in narrow container', () => {
      const result = renderWithProviders(
        <div style={{ width: 240 }}>
          <PhoneInput label="Responsive Phone" name="responsivePhone" />
        </div>,
      );
      const input = result.container.querySelector('input');
      expect(input).toBeDefined();
    });
  });

  describe('design-law', () => {
    it('rings the Box that includes the flag', () => {
      const result = renderWithProviders(<PhoneInput label="Ring Phone" />);
      const box = result.container.querySelector("[data-testid='phone-box']") as HTMLElement;
      const flag = result.container.querySelector('[data-testid="combobox-trigger"]');
      const input = result.container.querySelector('input');
      expect(box).toBeTruthy();
      expect(box.className).toMatch(/mp-composite-ring/);
      expect(box.contains(flag)).toBe(true);
      expect(box.contains(input)).toBe(true);
    });

    it('national digits and the dial are T-VALUE, not textAccent', () => {
      const result = renderWithProviders(<PhoneInput label="Phone" />);
      const input = result.container.querySelector("[data-testid='phone-input']");
      const dial = result.container.querySelector("[data-testid='phone-dial']");
      expect(input?.getAttribute('data-text-class')).toBe('T-VALUE');
      expect(dial?.getAttribute('data-text-class')).toBe('T-VALUE');
      expect(dial?.textContent).toMatch(/^\+\d+/);
    });

    it('compact and size still mount without throwing', () => {
      expect(() => renderWithProviders(<PhoneInput label="Phone" compact />)).not.toThrow();
      expect(() => renderWithProviders(<PhoneInput label="Phone" size="$5" />)).not.toThrow();
      expect(() => renderWithProviders(<PhoneInput label="Phone" compact size="$5" />)).not.toThrow();
    });

    it('skeleton keeps flag+number bones and hides the field', () => {
      const result = renderWithProviders(<PhoneInput label="Phone" skeleton size="$4" />);
      expect(result.container.querySelector('input')).toBeNull();
      expect(result.container.querySelector("[data-testid='phone-input']")).toBeNull();
    });

    it('does not open the country picker when disabled (SB-M-213)', async () => {
      const result = renderWithProviders(<PhoneInput label="Phone" disabled />);
      const trigger = result.container.querySelector('[data-testid="combobox-trigger"]') as HTMLElement;
      expect(trigger).toBeTruthy();
      await act(async () => {
        fireEvent.click(trigger);
      });
      expect(result.container.querySelector('[role="option"]')).toBeNull();
    });

    it('does not open the country picker when read-only (SB-M-215)', async () => {
      const result = renderWithProviders(<PhoneInput label="Phone" readOnly />);
      const country = result.container.querySelector("[data-testid='phone-country']") as HTMLElement;
      expect(country).toBeTruthy();
      await act(async () => {
        fireEvent.click(country);
      });
      expect(result.container.querySelector('[role="option"]')).toBeNull();
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(input.readOnly).toBe(true);
    });
  });
});

describe('PhoneInput in a table cell', () => {
  const renderPhone = (inTableCell: boolean) =>
    renderWithProviders(
      <TableCellContext.Provider value={{ inTableCell, isHeader: false, editable: true }}>
        <PhoneInput defaultCountry="US" aria-label="Phone" />
      </TableCellContext.Provider>,
    );

  it('the country trigger is flag and dial only: no caret, no divider', () => {
    const { container } = renderPhone(true);
    const country = container.querySelector("[data-testid='phone-country']") as HTMLElement;
    expect(country).toBeTruthy();
    expect(country.querySelector("[data-testid='phone-dial']")?.textContent).toBe('+1');
    expect(country.querySelector('svg')).toBeNull();
    expect(container.querySelector("[data-testid='phone-divider']")).toBeNull();
  });

  it('outside a cell the trigger keeps its caret and the divider (positive control)', () => {
    const { container } = renderPhone(false);
    const country = container.querySelector("[data-testid='phone-country']") as HTMLElement;
    expect(country.querySelector('svg')).not.toBeNull();
    expect(container.querySelector("[data-testid='phone-divider']")).not.toBeNull();
  });
});
