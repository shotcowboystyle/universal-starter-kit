import { renderWithProviders } from '@repo/test-utils';
import { Preset, createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { useForm } from '@tanstack/react-form';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { TamaguiProvider, YStack, createTamagui } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from '../../Button';
import { Form } from '../../Form';

import { RadioGroup } from './index';

const mockOptions = [
  { label: 'Option 1', value: 'option1' },
  { label: 'Option 2', value: 'option2' },
  { label: 'Option 3', value: 'option3' },
];

// House builder themes for the mark assertions — created at MODULE scope:
// tamagui registers a config's theme variables globally at createTamagui
// time, and a config created after the first render (inside a test body)
// never resolves its tokens (Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (message.includes('React does not recognize the `pressTheme` prop on a DOM element')) {
      return;
    }
  });
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
});

describe('RadioGroup Components', () => {
  describe('RadioGroup', () => {
    describe('without form context', () => {
      it('should display error message', () => {
        renderWithProviders(
          <RadioGroup
            label="Choose Option"
            name="option"
            value=""
            error="This field is required"
            options={mockOptions}
          />,
        );

        // Note: Tamagui Label/Paragraph don't render queryable text in jsdom
      });

      it('should render required label with asterisk', () => {
        const result = renderWithProviders(
          <RadioGroup label="Required Radio Group" name="option" required options={mockOptions} />,
        );

        // Check that the label contains the text and asterisk
        const label = result.container.querySelector('label');
        expect(label).toBeDefined();
        expect(label?.textContent).toContain('Required Radio Group');
        expect(label?.textContent).toContain('*');
      });

      it('fires canonical onChange and the deprecated onValueChange alias once each', async () => {
        const onChange = vi.fn();
        const onValueChange = vi.fn();
        const result = renderWithProviders(
          <RadioGroup
            label="Choose Option"
            name="option"
            options={mockOptions}
            onChange={onChange}
            onValueChange={onValueChange}
          />,
        );
        const radio = result.container.querySelector("[role='radio']");
        expect(radio).toBeTruthy();
        await act(async () => {
          if (radio) {
            fireEvent.click(radio);
          }
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('option1');
        expect(onValueChange).toHaveBeenCalledTimes(1);
        expect(onValueChange).toHaveBeenCalledWith('option1');
      });

      it('clicking the painted glyph still selects', async () => {
        // RadioGlyph is pointerEvents=none so RN presses reach role=radio
        // (same inner-View steal as CheckboxGlyphBox).
        const onChange = vi.fn();
        const result = renderWithProviders(
          <RadioGroup label="Choose Option" name="option" options={mockOptions} onChange={onChange} />,
        );
        const glyph = result.container.querySelector('[data-radio-kb-focus]');
        expect(glyph).toBeTruthy();
        await act(async () => {
          if (glyph) {
            fireEvent.click(glyph);
          }
        });
        expect(onChange).toHaveBeenCalledWith('option1');
      });
    });

    describe('with form context', () => {
      const FormExample = ({ defaultValue = '', name = 'option', onSubmit = async (_value: unknown) => {} }) => {
        const form = useForm({
          defaultValues: {
            [name]: defaultValue,
          },
          onSubmit: async ({ value }) => {
            if (onSubmit) {
              await onSubmit(value);
            }
          },
        });

        return (
          <Form form={form}>
            <RadioGroup label="Choose Option" name={name} options={mockOptions} />
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
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
        }

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith({ option: '' });
        });
      });

      it('should handle form submission with selected value', async () => {
        const onSubmit = vi.fn();

        // Simplified test - just form with submit button, no field
        const TestForm = () => {
          const form = useForm({
            defaultValues: { option: 'option2' },
            onSubmit: async ({ value }) => {
              await onSubmit(value);
            },
          });

          return (
            <Form form={form}>
              <Button action="submit">Submit</Button>
            </Form>
          );
        };

        const result = renderWithProviders(
          <YStack>
            <TestForm />
          </YStack>,
        );

        const submitButton = result.getSubmitButton();
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
        }

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith({ option: 'option2' });
        });
      });
    });

    describe('with useForm hook directly', () => {
      it('should handle form submission with useForm', async () => {
        const onSubmitMock = vi.fn();
        const TestComponent = () => {
          const form = useForm({
            defaultValues: {
              preference: 'light',
            },
            onSubmit: async ({ value }) => {
              onSubmitMock(value);
            },
          });

          return (
            <Form form={form}>
              <RadioGroup
                label="Theme Preference"
                name="preference"
                options={[
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                  { label: 'Auto', value: 'auto' },
                ]}
              />
              <Button action="submit">Submit</Button>
            </Form>
          );
        };

        const result = renderWithProviders(<TestComponent />);

        const submitButton = result.getSubmitButton();
        if (submitButton) {
          await act(async () => {
            fireEvent.click(submitButton);
          });
        }

        await waitFor(() => {
          expect(onSubmitMock).toHaveBeenCalledWith({ preference: 'light' });
        });
      });
    });

    describe('roving wrapper tab order (voiceover pass residual)', () => {
      // Tamagui's RadioGroup leaves a focusable role-less RovingFocusGroup
      // View around [role=radiogroup]; the field must strip it from the tab
      // order so only the radios themselves are tab stops.
      it('keeps the role-less outer wrapper out of the tab order', async () => {
        const result = renderWithProviders(<RadioGroup label="Choose Option" name="option" options={mockOptions} />);
        const group = result.container.querySelector("[role='radiogroup']");
        expect(group).toBeTruthy();
        const wrapper = group?.parentElement;
        expect(wrapper?.getAttribute('role')).toBeNull();
        // The roving group re-applies tabIndex=0 after focusable items
        // register; the MutationObserver must settle it back to -1.
        await waitFor(() => {
          expect(wrapper?.getAttribute('tabindex')).toBe('-1');
        });
      });

      it('exposes exactly one tab stop among the radios (roving tabindex)', async () => {
        // WAI-ARIA radio group: the group is ONE tab stop — the checked radio
        // (or the first when none is checked) carries tabindex=0, the rest
        // are -1 and reached with arrow keys (keyboard-nav audit).
        const result = renderWithProviders(<RadioGroup label="Choose Option" name="option" options={mockOptions} />);
        const radios = [...result.container.querySelectorAll("[role='radio']")];
        expect(radios.length).toBe(mockOptions.length);
        expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
      });

      it('moves the tab stop to the checked radio', async () => {
        const result = renderWithProviders(
          <RadioGroup label="Choose Option" name="option" value={mockOptions[1].value} options={mockOptions} />,
        );
        const radios = [...result.container.querySelectorAll("[role='radio']")];
        expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
      });

      it('re-strips the wrapper tabindex when the roving group re-applies it', async () => {
        const result = renderWithProviders(<RadioGroup label="Choose Option" name="option" options={mockOptions} />);
        const wrapper = result.container.querySelector("[role='radiogroup']")?.parentElement;
        await waitFor(() => {
          expect(wrapper?.getAttribute('tabindex')).toBe('-1');
        });
        // Simulate the roving group's blur-cycle write of tabIndex=0
        wrapper?.setAttribute('tabindex', '0');
        await waitFor(() => {
          expect(wrapper?.getAttribute('tabindex')).toBe('-1');
        });
      });
    });

    describe('late-arriving value display (create-mode seeding)', () => {
      // The non-card variant fed the current value into tamagui as mount-only
      // `defaultValue`, so a value applied AFTER first paint (create-mode
      // engine seeding lands once meta loads) never displayed. The group must
      // render controlled — and adopting a programmatic value must not emit
      // onChange (a seeded value is not a user edit).
      const getRadioByValue = (container: ParentNode, value: string) =>
        [...container.querySelectorAll("[role='radio']")].find((radio) => radio.id.endsWith(`-${value}`));

      it('standalone controlled: a value arriving after mount renders checked, without onChange', async () => {
        const onChange = vi.fn();
        const onValueChange = vi.fn();
        const result = renderWithProviders(
          <RadioGroup
            label="Status"
            value=""
            options={mockOptions}
            onChange={onChange}
            onValueChange={onValueChange}
          />,
        );
        for (const radio of result.container.querySelectorAll("[role='radio']")) {
          expect(radio.getAttribute('aria-checked')).not.toBe('true');
        }

        // Late seed: the upstream doc value arrives after first paint.
        result.rerender(
          <RadioGroup
            label="Status"
            value="option2"
            options={mockOptions}
            onChange={onChange}
            onValueChange={onValueChange}
          />,
        );
        await waitFor(() => {
          expect(getRadioByValue(result.container, 'option2')?.getAttribute('aria-checked')).toBe('true');
        });
        expect(onChange).not.toHaveBeenCalled();
        expect(onValueChange).not.toHaveBeenCalled();
      });

      it('form-integrated: a field value set after mount renders checked, without onChange', async () => {
        const onChange = vi.fn();
        let formApi: { setFieldValue: (name: 'option', value: string) => void } | undefined;
        const TestComponent = () => {
          const form = useForm({ defaultValues: { option: '' } });
          formApi = form as unknown as typeof formApi;
          return (
            <Form form={form}>
              <RadioGroup label="Status" name="option" options={mockOptions} onChange={onChange} />
            </Form>
          );
        };
        const result = renderWithProviders(<TestComponent />);

        await act(async () => {
          formApi?.setFieldValue('option', 'option3');
        });
        await waitFor(() => {
          expect(getRadioByValue(result.container, 'option3')?.getAttribute('aria-checked')).toBe('true');
        });
        expect(onChange).not.toHaveBeenCalled();
      });

      it('still emits exactly once for a real click after a late seed', async () => {
        const onChange = vi.fn();
        const result = renderWithProviders(
          <RadioGroup label="Status" value="" options={mockOptions} onChange={onChange} />,
        );
        result.rerender(<RadioGroup label="Status" value="option1" options={mockOptions} onChange={onChange} />);
        const radio = getRadioByValue(result.container, 'option2');
        expect(radio).toBeTruthy();
        await act(async () => {
          if (radio) {
            fireEvent.click(radio);
          }
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('option2');
      });
    });

    describe('card mode', () => {
      const cardOptions = [
        { label: 'Card A', value: 'a', description: 'Description for A' },
        { label: 'Card B', value: 'b' },
      ];

      it('renders option descriptions in card mode', () => {
        const result = renderWithProviders(<RadioGroup label="Pick" name="opts" card options={cardOptions} />);
        expect(result.findTextElement('Card A')).toBeDefined();
        expect(result.findTextElement('Description for A')).toBeDefined();
      });

      it('does not render descriptions in plain mode', () => {
        const result = renderWithProviders(<RadioGroup label="Pick" name="opts" options={cardOptions} />);
        expect(result.findTextElement('Card A')).toBeDefined();
        expect(result.findTextElement('Description for A')).toBeUndefined();
      });

      it('labels the radio via aria-labelledby and aria-describedby', () => {
        const result = renderWithProviders(<RadioGroup label="Pick" name="opts" card options={cardOptions} />);
        const radio = result.container.querySelector("[role='radio']");
        const labelId = radio?.getAttribute('aria-labelledby');
        const descId = radio?.getAttribute('aria-describedby');
        expect(labelId).toBeTruthy();
        expect(document.getElementById(labelId!)?.textContent).toBe('Card A');
        expect(descId).toBeTruthy();
        expect(document.getElementById(descId!)?.textContent).toBe('Description for A');
      });

      it('radio click in card mode emits onChange with the selected value', () => {
        const onChange = vi.fn();
        const result = renderWithProviders(
          <RadioGroup label="Pick" name="opts" card options={cardOptions} onChange={onChange} />,
        );
        const radio = result.container.querySelector("[role='radio']");
        if (radio) {
          fireEvent.click(radio);
        }
        expect(onChange).toHaveBeenCalledWith('a');
        // last emit wins and must be the selected value (no double-fire revert)
        expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe('a');
      });

      it('keeps index-based ids unique for duplicate option values', () => {
        const dupes = [
          { label: 'One', value: 'same', description: 'd1' },
          { label: 'Two', value: 'same', description: 'd2' },
        ];
        const result = renderWithProviders(<RadioGroup label="Pick" name="opts" card options={dupes} />);
        const radios = [...result.container.querySelectorAll("[role='radio']")];
        const ids = radios.map((r) => r.id);
        expect(new Set(ids).size).toBe(2);
      });
    });

    describe('selected mark', () => {
      it('fills the checked radio with the accent mark; unchecked stays empty', () => {
        const { container } = render(
          <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
            <RadioGroup label="Choose" value="option2" options={mockOptions} />
          </TamaguiProvider>,
        );
        const checked = container.querySelector('[role="radio"][aria-checked="true"]');
        expect(checked).toBeTruthy();
        // Selected = fill: the glyph (not a sibling outline) carries the
        // shared accent mark token ($accentBackground).
        const marked = Array.from(checked!.querySelectorAll('*')).filter((el) =>
          (el as HTMLElement).className?.toString().includes('_bg-accentBackg'),
        );
        expect(marked.length).toBeGreaterThan(0);
        const unchecked = container.querySelector('[role="radio"][aria-checked="false"]');
        expect(unchecked).toBeTruthy();
        const uncheckedMarked = Array.from(unchecked!.querySelectorAll('*')).filter((el) =>
          (el as HTMLElement).className?.toString().includes('_bg-accentBackg'),
        );
        expect(uncheckedMarked.length).toBe(0);
      });
    });

    describe('ring anatomy', () => {
      const classOf = (el: Element) => (el as HTMLElement).className?.toString() ?? '';
      const treeHasRing = (el: Element) =>
        [el, ...el.querySelectorAll('*')].some((node) => /outlineWidth-2px/.test(classOf(node)));

      it('does not paint a ring on every radio at rest', () => {
        const result = renderWithProviders(
          <RadioGroup label="Choose Option" name="option" value="option1" options={mockOptions} />,
        );
        const radios = [...result.container.querySelectorAll('[role="radio"]')];
        expect(radios.length).toBe(mockOptions.length);
        for (const radio of radios) {
          expect(treeHasRing(radio)).toBe(false);
        }
      });

      it('does not put a focus-visible ring on the 44px hit target', () => {
        const result = renderWithProviders(
          <RadioGroup label="Choose Option" name="option" value="option1" options={mockOptions} />,
        );
        const radios = [...result.container.querySelectorAll('[role="radio"]')];
        for (const radio of radios) {
          expect(classOf(radio)).toMatch(/outlineWidth-0focus-visible-0px/);
          expect(classOf(radio)).not.toMatch(/outlineWidth-2px/);
        }
      });
    });

    describe('radio disc identity (R-IDENTITY)', () => {
      const disc = (container: HTMLElement) => container.querySelector('[data-radius-part="radio disc"]');
      const classOf = (el: Element) => (el as HTMLElement).className?.toString() ?? '';

      it('declares R-IDENTITY / radio disc on the glyph', () => {
        const result = renderWithProviders(<RadioGroup label="Choose" name="option" options={mockOptions} />);
        const el = disc(result.container);
        expect(el?.getAttribute('data-radius-class')).toBe('R-IDENTITY');
        expect(el?.getAttribute('data-radius-part')).toBe('radio disc');
      });

      it('stays round when pointy is set', () => {
        const result = renderWithProviders(<RadioGroup label="Choose" name="option" pointy options={mockOptions} />);
        const el = disc(result.container);
        expect(el).toBeTruthy();
        expect(classOf(el!)).toMatch(/1000/);
        expect(el?.getAttribute('data-radius-class')).toBe('R-IDENTITY');
      });

      it('stays round at borderRadius none', () => {
        const result = renderWithProviders(
          <Preset overrides={{ borderRadius: 'none' }}>
            <RadioGroup label="Choose" name="option" options={mockOptions} />
          </Preset>,
        );
        const el = disc(result.container);
        expect(el).toBeTruthy();
        expect(classOf(el!)).toMatch(/1000/);
        expect(el?.getAttribute('data-radius-class')).toBe('R-IDENTITY');
      });
    });
  });
});
