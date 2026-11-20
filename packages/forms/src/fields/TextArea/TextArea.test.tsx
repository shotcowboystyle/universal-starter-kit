import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { Theme, YStack } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { TextArea } from './index';

type TextAreaFormValues = Record<string, string>;

const ignoreSubmit = async (_value: TextAreaFormValues): Promise<void> => {};

const FormExample = ({
  defaultValue = '',
  name = 'description',
  onSubmit = ignoreSubmit,
}: {
  defaultValue?: string;
  name?: string;
  onSubmit?: (value: TextAreaFormValues) => Promise<void> | void;
}) => (
  <Form
    formOptions={{
      defaultValues: {
        [name]: defaultValue,
      },
    }}
    onSubmit={async (value) => {
      await onSubmit(value);
    }}>
    <TextArea
      label="Description"
      name={name}
    />
    <Button action="submit">Submit</Button>
  </Form>
);

// oxlint-disable-next-line unicorn/prefer-number-coercion -- computed lengths carry a "px" suffix, which Number() would turn into NaN
const cssPx = (length: string): number => Number.parseFloat(length);

/** Resolved font weight of an element: inline/computed style, else the Tamagui atom class. */
const inkWeight = (el: Element | null): string => {
  if (!(el instanceof HTMLElement)) {
    return '';
  }
  const fromStyle = el.style.fontWeight || getComputedStyle(el).fontWeight;
  if (fromStyle !== '' && fromStyle !== 'normal') {
    return fromStyle;
  }
  for (const cls of el.className.split(/\s+/u)) {
    const weight = /(?:^|_)(?:fw|fow|fontWeight)-?(?<weight>\d+)/iu.exec(cls)?.groups?.weight;
    if (weight !== undefined) {
      return weight;
    }
  }
  return fromStyle;
};

const isBold = (weight: string): boolean => {
  const n = Math.trunc(Number(weight));
  if (!Number.isNaN(n)) {
    return n >= 700;
  }
  return weight === 'bold';
};

const colorToken = (el: Element | null): string => {
  if (!(el instanceof HTMLElement)) {
    return '';
  }
  // Tamagui atomics (`_col-color11`, `_col-color`) — happy-dom often
  // leaves getComputedStyle().color empty for theme tokens.
  const token = /_col-(?<token>color\d*)\b/u.exec(el.className)?.groups?.token;
  if (token !== undefined) {
    return token;
  }
  return el.style.color || getComputedStyle(el).color || '';
};

/** Tamagui atomic top-left radius class on the ring box. */
const boxRadiusClasses = (container: HTMLElement): string[] => {
  const textarea = container.querySelector('textarea');
  const box = textarea?.closest('.mp-composite-ring');
  return (box?.className ?? '').split(' ').filter((c) => c.startsWith('_btlr-'));
};

describe(TextArea, () => {
  describe('without form context', () => {
    it('should render with label and helper text correctly', () => {
      const result = renderWithProviders(
        <TextArea
          label="Description"
          helperText="Enter a detailed description"
          name="description"
          defaultValue="Sample text"
        />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;

      expect(textarea?.value).toBe('Sample text');
      expect(textarea?.hasAttribute('disabled')).toBeFalsy();
    });

    it('should handle text changes', async () => {
      const onChangeText = vi.fn<(text: string) => void>();
      const result = renderWithProviders(
        <TextArea
          label="Description"
          name="description"
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onChangeText={onChangeText}
          defaultValue=""
        />,
      );
      const textarea = result.getTextArea();
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'New description' } });
        }
      });
      expect(onChangeText).toHaveBeenCalledWith('New description');
    });

    it('should handle maxLength constraint', () => {
      const result = renderWithProviders(
        <TextArea
          label="Description"
          name="description"
          defaultValue=""
          textAreaProps={{ maxLength: 10 }}
        />,
      );
      const textarea = result.getTextArea();
      expect(textarea?.getAttribute('maxlength')).toBe('10');
    });

    it('should render required label with asterisk', () => {
      const result = renderWithProviders(
        <TextArea
          label="Required Field"
          name="description"
          required
        />,
      );
      // Check that the label contains the text and asterisk
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('Required Field');
      expect(label?.textContent).toContain('*');
    });

    it('should handle custom textarea props', () => {
      const result = renderWithProviders(
        <TextArea
          label="Custom TextArea"
          name="description"
          textAreaProps={{
            placeholder: 'Enter text here',
            rows: 5,
          }}
        />,
      );
      const textarea = result.getTextArea();
      expect(textarea?.getAttribute('placeholder')).toBe('Enter text here');
    });

    it('should handle custom id prop', () => {
      const customId = 'custom-textarea-id';
      const result = renderWithProviders(
        <TextArea
          id={customId}
          label="Test"
          defaultValue=""
        />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      expect(textarea?.id).toBe(customId);
    });

    it('should handle multiline text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const result = renderWithProviders(
        <TextArea
          label="Multiline Text"
          name="text"
          defaultValue={multilineText}
        />,
      );
      const textarea = result.getTextArea();
      expect(textarea).toHaveValue(multilineText);
    });

    it('padX does not exceed padY when styles resolve', () => {
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          defaultValue="hello"
        />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement | null;
      expect(textarea).toBeTruthy();
      const cs = textarea ? getComputedStyle(textarea) : null;
      const padX = cs ? cssPx(cs.paddingLeft) || 0 : 0;
      const padY = cs ? cssPx(cs.paddingTop) || 0 : 0;
      expect(padX).toBeLessThanOrEqual(padY);
    });

    it('should handle state transitions', async () => {
      const onChangeText = vi.fn<(text: string) => void>();
      const result = renderWithProviders(
        <TextArea
          name="description"
          defaultValue="Initial text"
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onChangeText={onChangeText}
        />,
      );
      const textarea = result.getTextArea();

      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'Updated text' } });
        }
      });
      expect(onChangeText).toHaveBeenCalledWith('Updated text');

      if (textarea) {
        fireEvent.change(textarea, { target: { value: '' } });
      }
      expect(onChangeText).toHaveBeenCalledWith('');
    });
  });

  describe('with form context', () => {
    it('should render with form context and handle form submission', async () => {
      const onSubmit = vi.fn<(value: TextAreaFormValues) => void>();
      const result = renderWithProviders(
        <YStack>
          <FormExample onSubmit={onSubmit} />
        </YStack>,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      const submitButton = result.getSubmitButton();
      expect(textarea?.value).toBe('');
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ description: '' });
      });
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Test description' } });
      });
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          description: 'Test description',
        });
      });
    });

    it('should handle disabled state in form context', async () => {
      const onChangeText = vi.fn<(text: string) => void>();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { description: 'Initial text' } }}>
          <TextArea
            label="Description"
            name="description"
            disabled
            // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
            onChangeText={onChangeText}
          />
        </Form>,
      );
      const textarea = result.getTextArea();
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'New text' } });
        }
      });
      expect(onChangeText).not.toHaveBeenCalled();
      const isDisabled =
        textarea?.hasAttribute('disabled') === true || textarea?.getAttribute('aria-disabled') === 'true';
      expect(isDisabled).toBeTruthy();
    });
  });

  describe('late-arriving value display (create-mode seeding)', () => {
    // The DOM textarea itself adopts late `defaultValue` updates while
    // pristine (React DOM keeps the value attribute synced), but `charCount`
    // was mount-only state — a value applied AFTER first paint (create-mode
    // engine seeding, setFieldValue) rendered a stale count. Adopting a
    // programmatic value must not emit onChange.
    it('form-integrated: a field value set after mount displays with a live count, without onChange', async () => {
      const onChange = vi.fn<(value: string) => void>();
      const onChangeText = vi.fn<(text: string) => void>();
      const { result: formHook } = renderHook(() => useForm({ defaultValues: { notes: '' } }));
      const result = renderWithProviders(
        <Form form={formHook.current}>
          <TextArea
            label="Notes"
            name="notes"
            showCount
            onChange={onChange}
            // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
            onChangeText={onChangeText}
          />
        </Form>,
      );
      expect(result.findTextElement('0 characters')).toBeDefined();

      await act(async () => {
        formHook.current.setFieldValue('notes', 'seeded text');
      });
      await waitFor(() => {
        expect((result.getTextArea() as HTMLTextAreaElement)?.value).toBe('seeded text');
        expect(result.findTextElement('11 characters')).toBeDefined();
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeText).not.toHaveBeenCalled();
    });

    it('standalone controlled: a value arriving after mount updates the count, without onChange', async () => {
      const onChangeText = vi.fn<(text: string) => void>();
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          value=""
          showCount
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onChangeText={onChangeText}
        />,
      );
      expect(result.findTextElement('0 characters')).toBeDefined();

      result.rerender(
        <TextArea
          label="Notes"
          value="late value"
          showCount
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onChangeText={onChangeText}
        />,
      );
      await waitFor(() => {
        expect((result.getTextArea() as HTMLTextAreaElement)?.value).toBe('late value');
        expect(result.findTextElement('10 characters')).toBeDefined();
      });
      expect(onChangeText).not.toHaveBeenCalled();
    });
  });

  describe('ring anatomy and character count', () => {
    it('paints the ring class on the Box; the inner textarea is mp-input-area', () => {
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          defaultValue="hello"
        />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      expect(textarea?.className).toMatch(/mp-input-area/u);
      expect(textarea?.closest('.mp-composite-ring')).toBeTruthy();
      expect(textarea?.getAttribute('aria-multiline')).toBe('true');
    });

    it('surfaces a live character count when maxLength is set, announced only while focused', async () => {
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          id="notes-count"
          maxLength={20}
          defaultValue="hello"
        />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      const count = result.container.querySelector('#notes-count-count');
      expect(count?.textContent).toBe('5/20');
      expect(count?.getAttribute('aria-live')).toBe('off');
      expect(textarea?.getAttribute('aria-describedby') ?? '').toContain('notes-count-count');

      await act(async () => {
        fireEvent.focus(textarea);
      });
      expect(count?.getAttribute('aria-live')).toBe('polite');

      await act(async () => {
        fireEvent.focusOut(textarea);
      });
      expect(count?.getAttribute('aria-live')).toBe('off');
    });

    it('does not render a count when showCount is explicitly false', () => {
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          maxLength={20}
          showCount={false}
          defaultValue="hello"
        />,
      );
      expect(result.container.textContent).not.toContain('5/20');
    });
  });

  describe('with useForm hook directly', () => {
    it('should handle form submission with useForm', async () => {
      const onSubmitMock = vi.fn<(value: { description: string }) => void>();
      const TestComponent = () => {
        const form = useForm({
          defaultValues: {
            description: 'Default text',
          },
          onSubmit: async ({ value }) => {
            onSubmitMock(value);
          },
        });
        return (
          <Form form={form}>
            <TextArea
              label="Description"
              name="description"
            />
            <Button action="submit">Submit</Button>
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      const textarea = result.getTextArea();
      const submitButton = result.getSubmitButton();
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmitMock).toHaveBeenCalledWith({
          description: 'Default text',
        });
      });
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, {
            target: { value: 'Updated description' },
          });
        }
      });
      await act(async () => {
        if (submitButton) {
          fireEvent.click(submitButton);
        }
      });
      await waitFor(() => {
        expect(onSubmitMock).toHaveBeenCalledWith({
          description: 'Updated description',
        });
      });
    });
  });

  describe('canonical onChange(value)', () => {
    it('fires onChange with the string; onChangeText alias fires from the same site', async () => {
      const onChange = vi.fn<(value: string) => void>();
      const onChangeText = vi.fn<(text: string) => void>();
      const result = renderWithProviders(
        <TextArea
          label="Notes"
          defaultValue=""
          onChange={onChange}
          // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is the behavior under test
          onChangeText={onChangeText}
        />,
      );
      const textarea = result.getTextArea();
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'hello' } });
        }
      });
      expect(onChange).toHaveBeenCalledExactlyOnceWith('hello');
      expect(onChangeText).toHaveBeenCalledExactlyOnceWith('hello');
    });
  });

  describe('CONTAINER-CAP radius', () => {
    it('squares at none and rides the token through large; full caps at padding, never a pill', () => {
      const none = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      expect(boxRadiusClasses(none.container)).toStrictEqual(['_btlr-t-radius-0']);
      none.unmount();

      const small = renderWithProviders(
        <Preset overrides={{ borderRadius: 'small' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      expect(boxRadiusClasses(small.container)).toStrictEqual(['_btlr-t-radius-2']);
      small.unmount();

      const medium = renderWithProviders(
        <Preset overrides={{ borderRadius: 'medium' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      expect(boxRadiusClasses(medium.container)).toStrictEqual(['_btlr-t-radius-4']);
      medium.unmount();

      const large = renderWithProviders(
        <Preset overrides={{ borderRadius: 'large' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      expect(boxRadiusClasses(large.container)).toStrictEqual(['_btlr-t-radius-6']);
      large.unmount();

      const full = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      const fullClasses = boxRadiusClasses(full.container);
      expect(fullClasses).toStrictEqual(['_btlr-18px']);
      expect(fullClasses.join(' ')).not.toMatch(/t-radius-12/u);
    });

    it('declares the cap on the painted box with the knob stops it resolved', () => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full', space: 'small' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      const box = result.container.querySelector('textarea')?.closest<HTMLElement>('.mp-composite-ring');
      expect(box?.dataset.constraintContainer).toBe('TextArea');
      expect(box?.dataset.radiusKnob).toBe('full');
      expect(box?.dataset.spaceKnob).toBe('small');
    });

    it('caps large under space=small at the padding px', () => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius: 'large', space: 'small' }}>
          <TextArea
            label="Notes"
            defaultValue="x"
          />
        </Preset>,
      );
      expect(boxRadiusClasses(result.container)).toStrictEqual(['_btlr-13px']);
    });

    it('caps full at the padding px in both schemes, never at the $4 clamp', () => {
      for (const scheme of ['light', 'dark'] as const) {
        const ui = (
          <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
            <TextArea
              label="Notes"
              defaultValue="x"
            />
          </Preset>
        );
        const result = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
        const classes = boxRadiusClasses(result.container);
        expect(classes, scheme).toStrictEqual(['_btlr-18px']);
        expect(classes.join(' '), scheme).not.toMatch(/t-radius-(?:4|12)/u);
        result.unmount();
      }
    });
  });

  describe('skeleton mirrors anatomy', () => {
    it('keeps the real label and skeletons only the control', () => {
      const result = renderWithProviders(
        <TextArea
          label="Description"
          helperText="Loading notes"
          skeleton
        />,
      );
      expect(result.findTextElement('Description')).toBeDefined();
      expect(result.container.querySelector('textarea')).toBeNull();
      expect(result.container.querySelector('label')?.textContent).toContain('Description');
    });
  });

  describe('RM-TXT-6 fontWeight and T-VALUE textAccent', () => {
    it('bold: multiline value rides 700 with its helper (RM-TXT-6)', () => {
      const result = renderWithProviders(
        <Preset overrides={{ fontWeight: 'bold' }}>
          <TextArea
            label="Notes"
            helperText="Be specific"
            defaultValue="hello"
          />
        </Preset>,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      const helper = result.findTextElement('Be specific') as HTMLElement | undefined;
      expect(textarea).toBeTruthy();
      expect(helper).toBeTruthy();
      expect(isBold(inkWeight(textarea))).toBe(true);
      expect(isBold(inkWeight(helper ?? null))).toBe(true);
    });

    it('T-VALUE ignores textAccent: value color at low equals high (no inversion)', () => {
      const low = renderWithProviders(
        <Preset overrides={{ textAccent: 'low' }}>
          <TextArea
            label="Notes"
            helperText="Be specific"
            defaultValue="hello"
          />
        </Preset>,
      );
      const high = renderWithProviders(
        <Preset overrides={{ textAccent: 'high' }}>
          <TextArea
            label="Notes"
            helperText="Be specific"
            defaultValue="hello"
          />
        </Preset>,
      );
      const lowValue = colorToken(low.getTextArea());
      const highValue = colorToken(high.getTextArea());
      expect(lowValue).toBeTruthy();
      expect(lowValue).toBe(highValue);
      // Full ramp, not the accent floor (`$color11`).
      expect(lowValue).toMatch(/^color$|^rgb|^#/iu);
      expect(lowValue).not.toMatch(/color11/u);
      low.unmount();
      high.unmount();
    });
  });
});
