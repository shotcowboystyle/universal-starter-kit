import { renderWithProviders } from '@repo/test-utils';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { YStack } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';
import { __resetDevWarnSeen } from '../../shared/devWarn';

import { Select, type SelectOption } from './index';

/** Web panels portal out to the page, so panel text is read from the page. */
function findInPage(text: string): Element | undefined {
  try {
    return within(document.body).queryByText(text, { exact: false }) ?? undefined;
  } catch {
    return Array.from(document.body.querySelectorAll('*')).find((el) => el.textContent?.includes(text));
  }
}

const mockOptions: SelectOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (message.includes('React does not recognize the `marginLeft` prop on a DOM element')) {
      return;
    }
  });
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
});

describe('Select Components', () => {
  describe('Select', () => {
    it('should display placeholder when no value is selected', () => {
      renderWithProviders(<Select options={mockOptions} placeholder="Choose an option" />);

      // Placeholder should be visible
      expect(findInPage('Choose an option')).toBeDefined();
    });

    it('should display selected value', () => {
      renderWithProviders(<Select options={mockOptions} value="option1" placeholder="Choose an option" />);

      // Should show the selected option label
      expect(findInPage('Option 1')).toBeDefined();
    });

    it('should handle empty options array', () => {
      renderWithProviders(<Select options={[]} placeholder="No options" />);

      expect(findInPage('No options')).toBeDefined();
    });

    it('should support custom placeholder', () => {
      renderWithProviders(<Select options={mockOptions} placeholder="Custom placeholder text" />);

      expect(findInPage('Custom placeholder text')).toBeDefined();
    });
  });

  describe('Select', () => {
    describe('without form context', () => {
      it('should render with label and helper text', () => {
        renderWithProviders(
          <Select
            label="Choose Option"
            helperText="Select an option from the list"
            name="option"
            options={mockOptions}
          />,
        );

        expect(findInPage('Choose Option')).toBeDefined();
        expect(findInPage('Select an option from the list')).toBeDefined();
      });

      it('should display error message', () => {
        renderWithProviders(
          <Select label="Choose Option" name="option" options={mockOptions} error="This field is required" />,
        );

        expect(findInPage('This field is required')).toBeDefined();
      });

      it('should render required label with asterisk', () => {
        const result = renderWithProviders(
          <Select label="Required Select" name="option" options={mockOptions} required />,
        );

        const label = result.baseElement.querySelector('label');
        expect(label).toBeDefined();
        expect(label?.textContent).toContain('Required Select');
        expect(label?.textContent).toContain('*');
      });

      it('fires canonical onChange and the deprecated onValueChange alias once when dismissing a chip', async () => {
        const onChange = vi.fn();
        const onValueChange = vi.fn();
        const result = renderWithProviders(
          <Select
            label="Multi Select"
            name="multi"
            options={mockOptions}
            multiple
            dismissible
            value={['option1', 'option2']}
            onChange={onChange}
            onValueChange={onValueChange}
          />,
        );
        // Labels are differentiated per chip now — "Remove {label}".
        const dismiss = result.baseElement.querySelector('[aria-label^="Remove"]');
        expect(dismiss).toBeTruthy();
        await act(async () => {
          if (dismiss) {
            fireEvent.click(dismiss);
          }
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(['option2']);
        expect(onValueChange).toHaveBeenCalledTimes(1);
        expect(onValueChange).toHaveBeenCalledWith(['option2']);
      });
    });

    describe('with form context', () => {
      const FormExample = ({ defaultValue = '', name = 'option', onSubmit = async (_value: unknown) => {} }) => {
        const form = useForm({
          defaultValues: {
            [name]: defaultValue,
          },
          onSubmit: async ({ value }) => {
            await onSubmit(value);
          },
        });

        return (
          <Form form={form}>
            <Select label="Choose Option" name={name} options={mockOptions} />
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

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        expect(onSubmit).toHaveBeenCalledWith({ option: '' });
      });

      it('should handle form submission with selected value', async () => {
        const onSubmit = vi.fn();
        const result = renderWithProviders(
          <YStack>
            <FormExample defaultValue="option1" onSubmit={onSubmit} />
          </YStack>,
        );

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        expect(onSubmit).toHaveBeenCalledWith({ option: 'option1' });
      });
    });

    describe('with useForm hook directly', () => {
      it('should handle form submission with useForm', async () => {
        const onSubmitMock = vi.fn();
        const TestComponent = () => {
          const form = useForm({
            defaultValues: {
              option: 'option2',
            },
            onSubmit: async ({ value }) => {
              onSubmitMock(value);
            },
          });

          return (
            <Form form={form}>
              <Select label="Choose Option" name="option" options={mockOptions} />
              <Button action="submit">Submit</Button>
            </Form>
          );
        };

        const result = renderWithProviders(<TestComponent />);

        const submitButton = result.getSubmitButton();
        await act(async () => {
          if (submitButton) {
            fireEvent.click(submitButton);
          }
        });

        await waitFor(() => {
          expect(onSubmitMock).toHaveBeenCalledWith({ option: 'option2' });
        });
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle dynamic options', () => {
      const DynamicSelect = ({ options }: { options: SelectOption[] }) => {
        return <Select label="Dynamic Select" name="dynamic" options={options} />;
      };

      const result = renderWithProviders(<DynamicSelect options={mockOptions} />);

      result.rerender(
        <DynamicSelect
          options={[
            { value: 'new1', label: 'New Option 1' },
            { value: 'new2', label: 'New Option 2' },
          ]}
        />,
      );
      expect(findInPage('Dynamic Select')).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('should announce selected value to screen readers', () => {
      renderWithProviders(<Select options={mockOptions} value="option1" aria-label="Test select" />);

      expect(findInPage('Option 1')).toBeDefined();
    });
  });

  describe('DEV select-too-few-options', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      __resetDevWarnSeen();
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      __resetDevWarnSeen();
    });

    it('warns when single-select has ≤5 options', () => {
      renderWithProviders(<Select options={mockOptions} id="short" />);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('select-too-few-options'));
    });

    it('does not warn when options.length > 5', () => {
      const many: SelectOption[] = Array.from({ length: 6 }, (_, i) => ({
        value: `v${i}`,
        label: `Label ${i}`,
      }));
      renderWithProviders(<Select options={many} id="long" />);
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('select-too-few-options'));
    });
  });

  describe('ring anatomy', () => {
    const many: SelectOption[] = Array.from({ length: 6 }, (_, i) => ({
      value: `v${i}`,
      label: `Label ${i}`,
    }));

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1200,
      });
    });

    it('does not ring the trigger or a row on mouse open', async () => {
      const result = renderWithProviders(<Select options={many} placeholder="Pick" />);
      const trigger = result.baseElement.querySelector('[data-testid="select-trigger"]') as HTMLElement;
      expect(trigger).toBeTruthy();
      fireEvent.pointerDown(trigger);
      fireEvent.mouseDown(trigger);
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(result.baseElement.querySelector('[role="option"]')).toBeTruthy();
      });
      expect(trigger.getAttribute('data-kb-ring')).not.toBe('true');
      for (const opt of result.baseElement.querySelectorAll('[role="option"]')) {
        expect(opt.getAttribute('data-kb-ring')).not.toBe('true');
      }
    });

    it('paints an inset ring on the keyboard-active row; rows stay square', async () => {
      const result = renderWithProviders(<Select options={many} placeholder="Pick" />);
      const trigger = result.baseElement.querySelector('[data-testid="select-trigger"]') as HTMLElement;
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      await waitFor(() => {
        expect(result.baseElement.querySelector('[role="option"]')).toBeTruthy();
      });
      expect(trigger.getAttribute('data-kb-ring')).not.toBe('true');
      const options = [...result.baseElement.querySelectorAll('[role="option"]')];
      const ringed = options.filter((el) => el.getAttribute('data-kb-ring') === 'true');
      expect(ringed.length).toBe(1);
      for (const opt of options) {
        const radius = getComputedStyle(opt).borderRadius;
        expect(radius === '0px' || radius === '0' || radius === '').toBe(true);
      }
    });
  });
});

describe('Select pointer intent', () => {
  it('commits a deliberate cross-row release immediately after keyboard open', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<Select options={mockOptions} onChange={onChange} />);
    const trigger = result.getByTestId('select-trigger');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const options = await result.findAllByRole('option');
    fireEvent.pointerDown(options[0], { button: 0, pointerId: 1 });
    fireEvent.mouseDown(options[0]);
    fireEvent.mouseUp(options[1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('option2');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('consumes the opening gesture release over the covered row', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<Select options={mockOptions} onChange={onChange} />);
    const trigger = result.getByTestId('select-trigger');
    fireEvent.mouseDown(trigger);
    const options = await result.findAllByRole('option');
    fireEvent.mouseUp(options[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not select when a background drag releases over an option', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<Select options={mockOptions} onChange={onChange} />);
    fireEvent.mouseDown(result.getByTestId('select-trigger'));
    const options = await result.findAllByRole('option');
    fireEvent.mouseUp(options[0]);
    const panel = result.getByTestId('select-dropdown');
    fireEvent.pointerDown(panel, { button: 0, clientY: 10 });
    fireEvent.pointerMove(document, { clientY: 50 });
    fireEvent.pointerUp(document);
    fireEvent.mouseUp(options[1]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles a multiple option exactly once on an immediate click', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(<Select options={mockOptions} multiple onChange={onChange} />);
    fireEvent.keyDown(result.getByTestId('select-trigger'), { key: 'Enter' });
    const options = await result.findAllByRole('option');
    fireEvent.pointerDown(options[0], { button: 0, pointerId: 1 });
    fireEvent.mouseDown(options[0]);
    fireEvent.mouseUp(options[0]);
    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['option1']);
  });
});
