import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { Theme, YStack } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { TextArea } from './index';

/** Tamagui atomic top-left radius class on the ring box. */
function boxRadiusClasses(container: HTMLElement): string[] {
  const textarea = container.querySelector('textarea');
  const box = textarea?.closest('.mp-composite-ring');
  return String(box?.className || '')
    .split(' ')
    .filter((c) => c.startsWith('_btlr-'));
}

describe('TextArea', () => {
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
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <TextArea label="Description" name="description" onChangeText={onChangeText} defaultValue="" />,
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
        <TextArea label="Description" name="description" defaultValue="" textAreaProps={{ maxLength: 10 }} />,
      );
      const textarea = result.getTextArea();
      expect(textarea?.getAttribute('maxLength')).toBe('10');
    });

    it('should render required label with asterisk', () => {
      const result = renderWithProviders(<TextArea label="Required Field" name="description" required />);
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
      const result = renderWithProviders(<TextArea id={customId} label="Test" defaultValue="" />);
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      expect(textarea?.id).toBe(customId);
    });

    it('should handle multiline text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const result = renderWithProviders(<TextArea label="Multiline Text" name="text" defaultValue={multilineText} />);
      const textarea = result.getTextArea();
      expect(textarea).toHaveValue(multilineText);
    });

    it('padX does not exceed padY when styles resolve', () => {
      const result = renderWithProviders(<TextArea label="Notes" defaultValue="hello" />);
      const textarea = result.getTextArea() as HTMLTextAreaElement | null;
      expect(textarea).toBeTruthy();
      const cs = textarea ? getComputedStyle(textarea) : null;
      const padX = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
      const padY = cs ? parseFloat(cs.paddingTop) || 0 : 0;
      expect(padX).toBeLessThanOrEqual(padY);
    });

    it('should handle state transitions', async () => {
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <TextArea name="description" defaultValue="Initial text" onChangeText={onChangeText} />,
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
    const FormExample = ({ defaultValue = '', name = 'description', onSubmit = async (_value: any) => {} }) => {
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
          <TextArea label="Description" name={name} />
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
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'Test description' } });
        }
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
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { description: 'Initial text' } }}>
          <TextArea label="Description" name="description" disabled onChangeText={onChangeText} />
        </Form>,
      );
      const textarea = result.getTextArea();
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'New text' } });
        }
      });
      expect(onChangeText).not.toHaveBeenCalled();
      const isDisabled = textarea?.hasAttribute('disabled') || textarea?.getAttribute('aria-disabled') === 'true';
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
      const onChange = vi.fn();
      const onChangeText = vi.fn();
      let formApi: { setFieldValue: (name: 'notes', value: string) => void } | undefined;
      const TestComponent = () => {
        const form = useForm({ defaultValues: { notes: '' } });
        formApi = form as unknown as typeof formApi;
        return (
          <Form form={form}>
            <TextArea label="Notes" name="notes" showCount onChange={onChange} onChangeText={onChangeText} />
          </Form>
        );
      };
      const result = renderWithProviders(<TestComponent />);
      expect(result.findTextElement('0 characters')).toBeDefined();

      await act(async () => {
        formApi?.setFieldValue('notes', 'seeded text');
      });
      await waitFor(() => {
        expect((result.getTextArea() as HTMLTextAreaElement)?.value).toBe('seeded text');
        expect(result.findTextElement('11 characters')).toBeDefined();
      });
      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeText).not.toHaveBeenCalled();
    });

    it('standalone controlled: a value arriving after mount updates the count, without onChange', async () => {
      const onChangeText = vi.fn();
      const result = renderWithProviders(<TextArea label="Notes" value="" showCount onChangeText={onChangeText} />);
      expect(result.findTextElement('0 characters')).toBeDefined();

      result.rerender(<TextArea label="Notes" value="late value" showCount onChangeText={onChangeText} />);
      await waitFor(() => {
        expect((result.getTextArea() as HTMLTextAreaElement)?.value).toBe('late value');
        expect(result.findTextElement('10 characters')).toBeDefined();
      });
      expect(onChangeText).not.toHaveBeenCalled();
    });
  });

  describe('ring anatomy and character count', () => {
    it('paints the ring class on the Box; the inner textarea is mp-input-area', () => {
      const result = renderWithProviders(<TextArea label="Notes" defaultValue="hello" />);
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      expect(textarea?.className).toMatch(/mp-input-area/);
      expect(textarea?.closest('.mp-composite-ring')).toBeTruthy();
      expect(textarea?.getAttribute('aria-multiline')).toBe('true');
    });

    it('surfaces a live character count when maxLength is set, announced only while focused', async () => {
      const result = renderWithProviders(
        <TextArea label="Notes" id="notes-count" maxLength={20} defaultValue="hello" />,
      );
      const textarea = result.getTextArea() as HTMLTextAreaElement;
      const count = result.container.querySelector('#notes-count-count');
      expect(count?.textContent).toBe('5/20');
      expect(count?.getAttribute('aria-live')).toBe('off');
      expect(textarea?.getAttribute('aria-describedby') ?? '').toContain('notes-count-count');

      await act(async () => {
        if (textarea) {
          fireEvent.focus(textarea);
        }
      });
      expect(count?.getAttribute('aria-live')).toBe('polite');

      await act(async () => {
        if (textarea) {
          fireEvent.blur(textarea);
        }
      });
      expect(count?.getAttribute('aria-live')).toBe('off');
    });

    it('does not render a count when showCount is explicitly false', () => {
      const result = renderWithProviders(
        <TextArea label="Notes" maxLength={20} showCount={false} defaultValue="hello" />,
      );
      expect(result.container.textContent).not.toContain('5/20');
    });
  });

  describe('with useForm hook directly', () => {
    it('should handle form submission with useForm', async () => {
      const onSubmitMock = vi.fn();
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
            <TextArea label="Description" name="description" />
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
      const onChange = vi.fn();
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <TextArea label="Notes" defaultValue="" onChange={onChange} onChangeText={onChangeText} />,
      );
      const textarea = result.getTextArea();
      await act(async () => {
        if (textarea) {
          fireEvent.change(textarea, { target: { value: 'hello' } });
        }
      });
      expect(onChange).toHaveBeenCalledWith('hello');
      expect(onChangeText).toHaveBeenCalledWith('hello');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChangeText).toHaveBeenCalledTimes(1);
    });
  });

  describe('CONTAINER-CAP radius', () => {
    it('squares at none and rides the token through large; full caps at padding, never a pill', () => {
      const none = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      expect(boxRadiusClasses(none.container)).toEqual(['_btlr-t-radius-0']);
      none.unmount();

      const small = renderWithProviders(
        <Preset overrides={{ borderRadius: 'small' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      expect(boxRadiusClasses(small.container)).toEqual(['_btlr-t-radius-2']);
      small.unmount();

      const medium = renderWithProviders(
        <Preset overrides={{ borderRadius: 'medium' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      expect(boxRadiusClasses(medium.container)).toEqual(['_btlr-t-radius-4']);
      medium.unmount();

      const large = renderWithProviders(
        <Preset overrides={{ borderRadius: 'large' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      expect(boxRadiusClasses(large.container)).toEqual(['_btlr-t-radius-6']);
      large.unmount();

      const full = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      const fullClasses = boxRadiusClasses(full.container);
      expect(fullClasses).toEqual(['_btlr-18px']);
      expect(fullClasses.join(' ')).not.toMatch(/t-radius-12/);
    });

    it('declares the cap on the painted box with the knob stops it resolved', () => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full', space: 'small' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      const box = result.container.querySelector('textarea')?.closest('.mp-composite-ring');
      expect(box?.getAttribute('data-constraint-container')).toBe('TextArea');
      expect(box?.getAttribute('data-radius-knob')).toBe('full');
      expect(box?.getAttribute('data-space-knob')).toBe('small');
    });

    it('caps large under space=small at the padding px', () => {
      const result = renderWithProviders(
        <Preset overrides={{ borderRadius: 'large', space: 'small' }}>
          <TextArea label="Notes" defaultValue="x" />
        </Preset>,
      );
      expect(boxRadiusClasses(result.container)).toEqual(['_btlr-13px']);
    });

    it('caps full at the padding px in both schemes, never at the $4 clamp', () => {
      for (const scheme of ['light', 'dark'] as const) {
        const ui = (
          <Preset overrides={{ borderRadius: 'full', space: 'medium' }}>
            <TextArea label="Notes" defaultValue="x" />
          </Preset>
        );
        const result = renderWithProviders(scheme === 'dark' ? <Theme name="dark">{ui}</Theme> : ui);
        const classes = boxRadiusClasses(result.container);
        expect(classes, scheme).toEqual(['_btlr-18px']);
        expect(classes.join(' '), scheme).not.toMatch(/t-radius-(4|12)/);
        result.unmount();
      }
    });
  });

  describe('skeleton mirrors anatomy', () => {
    it('keeps the real label and skeletons only the control', () => {
      const result = renderWithProviders(<TextArea label="Description" helperText="Loading notes" skeleton />);
      expect(result.findTextElement('Description')).toBeDefined();
      expect(result.container.querySelector('textarea')).toBeNull();
      expect(result.container.querySelector('label')?.textContent).toContain('Description');
    });
  });

  describe('RM-TXT-6 fontWeight and T-VALUE textAccent', () => {
    function inkWeight(el: Element | null): string {
      if (!el) {
        return '';
      }
      const html = el as HTMLElement;
      const fromStyle = html.style.fontWeight || getComputedStyle(html).fontWeight;
      if (fromStyle && fromStyle !== 'normal' && fromStyle !== '') {
        return String(fromStyle);
      }
      for (const cls of String(html.className ?? '').split(/\s+/)) {
        const match = cls.match(/(?:^|_)(?:fw|fow|fontWeight)-?(\d+)/i);
        if (match) {
          return match[1];
        }
      }
      return String(fromStyle || '');
    }

    function isBold(weight: string): boolean {
      const n = Number.parseInt(weight, 10);
      if (!Number.isNaN(n)) {
        return n >= 700;
      }
      return weight === 'bold';
    }

    function colorToken(el: Element | null): string {
      if (!el) {
        return '';
      }
      const html = el as HTMLElement;
      const cls = String(html.className ?? '');
      // Tamagui atomics (`_col-color11`, `_col-color`) — happy-dom often
      // leaves getComputedStyle().color empty for theme tokens.
      const match = cls.match(/_col-(color\d*)\b/);
      if (match) {
        return match[1];
      }
      const fromStyle = html.style.color || getComputedStyle(html).color || '';
      return fromStyle;
    }

    it('bold: multiline value rides 700 with its helper (RM-TXT-6)', () => {
      const result = renderWithProviders(
        <Preset overrides={{ fontWeight: 'bold' }}>
          <TextArea label="Notes" helperText="Be specific" defaultValue="hello" />
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
          <TextArea label="Notes" helperText="Be specific" defaultValue="hello" />
        </Preset>,
      );
      const high = renderWithProviders(
        <Preset overrides={{ textAccent: 'high' }}>
          <TextArea label="Notes" helperText="Be specific" defaultValue="hello" />
        </Preset>,
      );
      const lowValue = colorToken(low.getTextArea());
      const highValue = colorToken(high.getTextArea());
      expect(lowValue).toBeTruthy();
      expect(lowValue).toBe(highValue);
      // Full ramp, not the accent floor (`$color11`).
      expect(lowValue).toMatch(/^color$|^rgb|^#/i);
      expect(lowValue).not.toMatch(/color11/);
      low.unmount();
      high.unmount();
    });
  });
});
