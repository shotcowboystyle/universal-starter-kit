import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { YStack } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../Button';
import { Input } from '../fields/Input';

import { Form, FormActions, useFormContext } from './index';

type SubmitValues = Record<string, string>;

// Mock @repo/router at top level
const mockSetUrlState = vi.fn<(next: Partial<SubmitValues>) => void>();
// oxlint-disable-next-line vitest/prefer-import-in-mock -- useUrlState is generic over the form shape, so no concrete mock can satisfy the typed factory
vi.mock('@repo/router', () => ({
  useUrlState: vi.fn<(...args: unknown[]) => [SubmitValues, typeof mockSetUrlState]>(() => [
    { name: 'From URL' },
    mockSetUrlState,
  ]),
}));

const TestConsumer = () => {
  const form = useFormContext();
  return <YStack data-testid="form-context">{form === undefined ? 'No Context' : 'Has Context'}</YStack>;
};

describe(Form, () => {
  describe('basic rendering', () => {
    it('should render form with aria-label', () => {
      const result = renderWithProviders(
        <Form
          onSubmit={vi.fn<() => void>()}
          aria-label="Test Form">
          <YStack>Content</YStack>
        </Form>,
      );
      const formElement = result.container.querySelector('[aria-label="Test Form"]');
      expect(formElement?.getAttribute('aria-label')).toBe('Test Form');
    });
  });

  describe('form submission', () => {
    it('should handle form submission with default values', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();

      // Use Button action="submit" which properly handles form submission
      const result = renderWithProviders(
        <Form
          formOptions={{
            defaultValues: { name: 'John', email: 'john@example.com' },
          }}
          onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const submitButton = result.container.querySelector('[data-testid="submit-button"]');

      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          name: 'John',
          email: 'john@example.com',
        });
      });
    });

    it('should handle form submission with provided form instance', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();

      const TestComponent = () => {
        const form = useForm({
          defaultValues: { name: 'Jane' },
          onSubmit: async ({ value }) => {
            onSubmit(value);
          },
        });

        return (
          <Form
            form={form}
            onSubmit={() => {}}>
            <Button
              action="submit"
              testID="submit-button">
              Submit
            </Button>
          </Form>
        );
      };

      const result = renderWithProviders(<TestComponent />);

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Jane' });
      });
    });

    it('should include readOnly field values in submit payload', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const result = renderWithProviders(
        <Form
          formOptions={{
            defaultValues: {
              editable: 'editable value',
              readOnlyField: 'readonly value',
            },
          }}
          onSubmit={onSubmit}>
          <Input
            name="editable"
            label="Editable"
          />
          <Input
            name="readOnlyField"
            label="Read only"
            readOnly
          />
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const submitButton = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            editable: 'editable value',
            readOnlyField: 'readonly value',
          }),
        );
      });
    });

    it('should keep disabled field values in submit payload', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const result = renderWithProviders(
        <Form
          formOptions={{
            defaultValues: {
              editable: 'editable value',
              disabledField: 'disabled value',
            },
          }}
          onSubmit={onSubmit}>
          <Input
            name="editable"
            label="Editable"
          />
          <Input
            name="disabledField"
            label="Disabled"
            disabled
          />
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const submitButton = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(expect.anything());
      });

      const payload = onSubmit.mock.calls[0]?.[0];
      expect(payload).toStrictEqual(
        expect.objectContaining({
          editable: 'editable value',
          disabledField: 'disabled value',
        }),
      );
    });
  });

  describe('form context', () => {
    it('should provide form context to children', () => {
      const result = renderWithProviders(
        <Form onSubmit={vi.fn<() => void>()}>
          <TestConsumer />
        </Form>,
      );

      const formContext = result.container.querySelector('[data-testid="form-context"]');
      expect(formContext?.textContent).toBe('Has Context');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined onSubmit', () => {
      const result = renderWithProviders(
        <Form>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const submitButton = result.container.querySelector('[data-testid="submit-button"]');
      expect(() => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      }).not.toThrow();
    });

    it('should handle async onSubmit', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => Promise<void>>().mockResolvedValue();
      const result = renderWithProviders(
        <Form onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(expect.anything());
      });
    });
  });

  describe('accessibility', () => {
    it('should support aria attributes', () => {
      const result = renderWithProviders(
        <Form
          onSubmit={vi.fn<() => void>()}
          aria-label="Test Form"
          aria-describedby="form-description">
          <YStack>Test Content</YStack>
        </Form>,
      );

      const form = result.container.querySelector('[aria-label="Test Form"]');
      expect(form?.getAttribute('aria-label')).toBe('Test Form');
      expect(form?.getAttribute('aria-describedby')).toBe('form-description');
    });
  });

  describe('form validation', () => {
    it('should handle form validation errors', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const formOptions = {
        defaultValues: { name: '' },
        validators: {
          onSubmit: ({ value }: { value: { name: string } }) => (value.name === '' ? 'Name is required' : undefined),
        },
      };

      const result = renderWithProviders(
        <Form
          formOptions={formOptions}
          onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      // Form should not submit due to validation error
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('renders ErrorSummary with field errors after failed submit', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const result = renderWithProviders(
        <Form
          formOptions={{ defaultValues: { name: '' } }}
          onSubmit={onSubmit}>
          <Input
            id="name"
            name="name"
            label="Name"
            required
          />
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      await waitFor(() => {
        const summary = result.container.querySelector('[data-testid="error-summary"]');
        expect(summary?.getAttribute('role')).toBe('alert');
        expect(summary?.textContent).toMatch(/required/iu);
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should submit when validation passes', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const formOptions = {
        defaultValues: { name: 'Valid Name' },
        validators: {
          onSubmit: ({ value }: { value: { name: string } }) => (value.name === '' ? 'Name is required' : undefined),
        },
      };

      const result = renderWithProviders(
        <Form
          formOptions={formOptions}
          onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Valid Name' });
      });
    });
  });

  describe('form state management', () => {
    it('should maintain form state between renders', async () => {
      const onSubmit = vi.fn<(values: SubmitValues) => void>();
      const result = renderWithProviders(
        <Form
          formOptions={{ defaultValues: { name: 'Initial' } }}
          onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      // Form state should be maintained after rerender
      result.rerender(
        <Form
          formOptions={{ defaultValues: { name: 'Initial' } }}
          onSubmit={onSubmit}>
          <Button
            action="submit"
            testID="submit-button">
            Submit
          </Button>
        </Form>,
      );

      const button = result.container.querySelector('[data-testid="submit-button"]');
      await act(async () => {
        if (button) {
          fireEvent.click(button);
        }
      });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Initial' });
      });
    });
  });

  describe('layout recipes', () => {
    it('owns vertical rhythm from the space recipe, not sizeToken', () => {
      const result = renderWithProviders(
        <Preset overrides={{ size: 'large', space: 'small' }}>
          <Form
            onSubmit={vi.fn<() => void>()}
            aria-label="Layout Form">
            <YStack>Content</YStack>
          </Form>
        </Preset>,
      );
      const layout = result.container.querySelector<HTMLElement>('[data-mpo-form-layout]');
      expect(layout?.dataset.gap).toBe('$2');
      expect(layout?.dataset.size).toBe('large');
      expect(layout?.dataset.density).toBe('comfortable');
    });

    it('compact nested scale steps space without changing size (density≠size)', () => {
      const result = renderWithProviders(
        <Form
          compact
          onSubmit={vi.fn<() => void>()}>
          <YStack>Content</YStack>
        </Form>,
      );
      const layout = result.container.querySelector<HTMLElement>('[data-mpo-form-layout]');
      expect(layout?.dataset.nested).toBe('true');
      expect(layout?.dataset.density).toBe('compact');
      expect(layout?.dataset.size).toBe('medium');
      expect(layout?.dataset.gap).toBe('$2');
    });

    it('FormActions hugs content and uses the space recipe', () => {
      const result = renderWithProviders(
        <Preset overrides={{ space: 'small', size: 'large' }}>
          <FormActions>
            <Button action="submit">Save</Button>
          </FormActions>
        </Preset>,
      );
      const actions = result.container.querySelector<HTMLElement>('[data-mpo-form-actions]');
      expect(actions?.dataset.gap).toBe('$2');
      expect(actions?.dataset.size).toBe('large');
      expect(actions?.dataset.density).toBe('comfortable');
    });
  });
});
