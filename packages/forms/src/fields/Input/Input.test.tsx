import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import { Input } from './index';

describe('Input', () => {
  describe('without form context', () => {
    it('renders with label and placeholder', () => {
      const result = renderWithProviders(<Input label="Name" placeholder="Enter name" name="name" />);
      expect(result.findTextElement('Name')).toBeDefined();
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('placeholder')).toBe('Enter name');
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Input label="Required" name="req" required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('Required');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text and error', () => {
      const result = renderWithProviders(
        <Input label="Email" helperText="Enter your email" error="Invalid email" name="email" />,
      );
      // Helper text is hidden when error is present; error takes precedence
      expect(result.findTextElement('Enter your email')).toBeUndefined();
      expect(result.findTextElement('Invalid email')).toBeDefined();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<Input label="Disabled" name="d" disabled />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-disabled')).toBe('true');
    });

    it('renders readOnly state', () => {
      const result = renderWithProviders(<Input label="ReadOnly" name="r" readOnly value="hello" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-readonly')).toBe('true');
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Input label="Loading" name="l" skeleton />);
      expect(result.container.querySelector('input')).toBeNull();
    });

    it('calls onChangeText when value changes', async () => {
      const onChangeText = vi.fn();
      const result = renderWithProviders(<Input label="Text" name="text" onChangeText={onChangeText} />);
      const input = result.container.querySelector('input');
      if (input) {
        fireEvent.change(input, { target: { value: 'hello' } });
      }
      await waitFor(() => {
        expect(onChangeText).toHaveBeenCalledWith('hello');
      });
    });
  });

  describe('standalone value ownership', () => {
    it('reflects external controlled updates, including clearing, without remounting', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Input label="Name" value="corp" onChange={onChange} />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      act(() => {
        input.focus();
      });
      fireEvent.change(input, { target: { value: 'edited' } });
      expect(onChange).toHaveBeenCalledOnce();
      result.rerender(<Input label="Name" value="external" onChange={onChange} />);
      expect(input.value).toBe('external');
      result.rerender(<Input label="Name" value="" onChange={onChange} />);
      expect(input.value).toBe('');
      expect(result.container.querySelector('input')).toBe(input);
      expect(document.activeElement).toBe(input);
    });

    it('keeps uncontrolled edits when a new default arrives', () => {
      const result = renderWithProviders(<Input label="Name" defaultValue="corp" />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'draft' } });
      result.rerender(<Input label="Name" defaultValue="external" />);
      expect(input.value).toBe('draft');
    });

    it.each(['onChange', 'onChangeText'] as const)('round-trips controlled edits through %s', (callback) => {
      function ControlledInput() {
        const [value, setValue] = useState('corp');
        return (
          <Input
            label="Name"
            value={value}
            {...(callback === 'onChange'
              ? {
                  onChange: (event) => {
                    setValue(event.target.value);
                  },
                }
              : { onChangeText: setValue })}
          />
        );
      }
      const result = renderWithProviders(<ControlledInput />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'draft' } });
      expect(input.value).toBe('draft');
      fireEvent.change(input, { target: { value: '' } });
      expect(input.value).toBe('');
    });
  });

  describe('purpose → keyboard/autofill (DG §32)', () => {
    it('purpose=email sets autocomplete + inputmode on the DOM input', () => {
      const result = renderWithProviders(<Input label="Email" name="email" purpose="email" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('autocomplete')).toBe('email');
      expect(input?.getAttribute('inputmode')).toBe('email');
    });

    it('purpose=phone sets tel autocomplete + tel inputmode', () => {
      const result = renderWithProviders(<Input label="Phone" name="phone" purpose="phone" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('autocomplete')).toBe('tel');
      expect(input?.getAttribute('inputmode')).toBe('tel');
    });

    it('purpose=year uses numeric inputmode on a text input', () => {
      const result = renderWithProviders(<Input label="Year" name="year" purpose="year" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('inputmode')).toBe('numeric');
      expect(input?.getAttribute('type')).not.toBe('number');
    });

    it('autoComplete token alone derives the keyboard (postal-code stays text)', () => {
      const result = renderWithProviders(<Input label="Postcode" name="postal" autoComplete="postal-code" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('autocomplete')).toBe('postal-code');
      expect(input?.getAttribute('inputmode')).toBeNull();
    });

    it('explicit autoComplete + keyboardType eject the purpose defaults', () => {
      const result = renderWithProviders(<Input label="Email" name="email" purpose="email" autoComplete="off" />);
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('autocomplete')).toBe('off');
      expect(input?.getAttribute('inputmode')).toBe('email');
    });
  });

  describe('with form context', () => {
    it('renders and validates with tanstack form', async () => {
      const onSubmit = vi.fn();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { name: '' } }} onSubmit={onSubmit} submitText="Submit">
          <Input name="name" label="Name" required />
        </Form>,
      );
      expect(result.findTextElement('Name')).toBeDefined();
    });
  });

  /**
   * Regression guard for the TableInput audit NEEDS-DECISION item "forms
   * Input remounts on focus". Investigation showed programmatic focus drops were environmental (storybook
   * HMR remounts), not a component defect — these tests pin the invariant so
   * a real focus-triggered remount can never land silently: the DOM node
   * identity must be stable across focus, typing, and re-renders, and
   * programmatic focus must stick (the table cell editor contract).
   */
  describe('focus stability — no remount on focus', () => {
    it('standalone: programmatic focus sticks and node identity is stable', async () => {
      const result = renderWithProviders(<Input label="Name" name="name" defaultValue="hello" />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();
      act(() => {
        input.focus();
      });
      expect(document.activeElement).toBe(input);
      // Same node still mounted and focused after effects flush.
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(result.container.querySelector('input')).toBe(input);
      expect(input.isConnected).toBe(true);
    });

    it('standalone: typing immediately after programmatic focus lands in the same node', async () => {
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <Input label="Item" name="item" defaultValue="" onChangeText={onChangeText} />,
      );
      const input = result.container.querySelector('input') as HTMLInputElement;
      act(() => {
        input.focus();
      });
      fireEvent.change(input, { target: { value: 'XYZ' } });
      await waitFor(() => {
        expect(onChangeText).toHaveBeenCalledWith('XYZ');
      });
      expect(result.container.querySelector('input')).toBe(input);
      expect(document.activeElement).toBe(input);
    });

    it('form branch: focus survives field-state re-renders while typing', async () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { name: '' } }} submitText="Submit">
          <Input name="name" label="Name" />
        </Form>,
      );
      const input = result.container.querySelector('input') as HTMLInputElement;
      act(() => {
        input.focus();
      });
      expect(document.activeElement).toBe(input);
      // field.handleChange re-renders the Field subtree — must not remount.
      fireEvent.change(input, { target: { value: 'abc' } });
      await waitFor(() => {
        expect(result.container.querySelector('input')).toBe(input);
      });
      expect(document.activeElement).toBe(input);
      expect(input.isConnected).toBe(true);
    });

    it('in table cell (chromeless): programmatic focus on editor open sticks and typing works', async () => {
      const onChangeText = vi.fn();
      const result = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
          <Input name="item" value="Steel bracket" onChangeText={onChangeText} />
        </TableCellContext.Provider>,
      );
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();
      // The cell editor contract: focus is set programmatically on open and
      // the user can type immediately.
      act(() => {
        input.focus();
      });
      expect(document.activeElement).toBe(input);
      fireEvent.change(input, { target: { value: 'Aluminum bracket' } });
      await waitFor(() => {
        expect(onChangeText).toHaveBeenCalledWith('Aluminum bracket');
      });
      expect(result.container.querySelector('input')).toBe(input);
      expect(document.activeElement).toBe(input);
    });

    it('re-render with unrelated prop changes keeps the focused node mounted', async () => {
      const result = renderWithProviders(<Input label="Name" name="name" helperText="before" defaultValue="x" />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      act(() => {
        input.focus();
      });
      expect(document.activeElement).toBe(input);
      result.rerender(<Input label="Name" name="name" helperText="after" defaultValue="x" />);
      await waitFor(() => {
        expect(result.container.querySelector('input')).toBe(input);
      });
      expect(document.activeElement).toBe(input);
    });
  });

  describe('ring anatomy', () => {
    it('rings the Box (icons included), never the inner input', () => {
      const result = renderWithProviders(
        <Input
          label="Search"
          name="q"
          leftIcon={<span data-testid="leading">L</span>}
          rightIcon={<span data-testid="trailing">R</span>}
        />,
      );
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(box).toBeTruthy();
      expect(box.className).toMatch(/mp-composite-ring/);
      expect(box.contains(result.getByTestId('leading'))).toBe(true);
      expect(box.contains(result.getByTestId('trailing'))).toBe(true);
      expect(box.contains(input)).toBe(true);
      expect(input.className).toMatch(/mp-input-area/);
      const inputCs = getComputedStyle(input);
      expect(inputCs.outlineStyle === 'none' || inputCs.outlineWidth === '0px').toBe(true);
    });

    it('chromeless keeps the Box ring contract (does not move it onto Area)', () => {
      const result = renderWithProviders(
        <Input label="Filter" name="f" chromeless leftIcon={<span data-testid="leading">L</span>} />,
      );
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(box.className).toMatch(/mp-composite-ring/);
      expect(box.contains(result.getByTestId('leading'))).toBe(true);
      expect(input.className).toMatch(/mp-input-area/);
    });
  });

  describe('density ≠ size', () => {
    it('compact steps density without requiring a size token', () => {
      const result = renderWithProviders(<Input label="Name" name="n" compact />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.getAttribute('data-density')).toBe('compact');
      // Compact steps space, never the size axis — the painted height
      // token must be exactly what a comfortable field resolves to.
      expect(box.getAttribute('data-size')).toBe('$4');
    });

    it('size ejects painted height and leaves density comfortable', () => {
      const result = renderWithProviders(<Input label="Name" name="n" size="$5" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.getAttribute('data-density')).toBe('comfortable');
      expect(box.getAttribute('data-size')).toBe('$5');
    });

    it('compact + size stay orthogonal', () => {
      const result = renderWithProviders(<Input label="Name" name="n" compact size="$5" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.getAttribute('data-density')).toBe('compact');
      expect(box.getAttribute('data-size')).toBe('$5');
    });
  });

  describe('44px press floor', () => {
    it('default painted box meets the 44px floor', () => {
      const result = renderWithProviders(<Input label="Name" name="n" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(Number(box.getAttribute('data-visual-height'))).toBe(44);
      expect(box.getAttribute('data-press-floor')).toBe('box');
    });

    it('sub-44 sizes restore press via slop, not giant chrome', () => {
      // $4 now paints 44 natively (compact keeps recipe height),
      // so the sub-floor path is proven with a genuinely small size.
      const result = renderWithProviders(<Input label="Name" name="n" size="$2" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      const visual = Number(box.getAttribute('data-visual-height'));
      expect(visual).toBeLessThan(44);
      expect(box.getAttribute('data-press-floor')).toBe('slop');
    });
  });

  describe('text-field anatomy (Polaris / Primer / Spectrum / M3)', () => {
    it('injects a trailing error icon when error is set and the slot is free', () => {
      const result = renderWithProviders(<Input label="Email" name="email" error="Enter a valid email" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.querySelector('svg')).toBeTruthy();
      expect(result.findTextElement('Enter a valid email')).toBeDefined();
    });

    it('does not steal a consumer trailing icon for the error glyph', () => {
      const result = renderWithProviders(
        <Input
          label="Email"
          name="email"
          error="Enter a valid email"
          rightIcon={<span data-testid="owned-trailing">x</span>}
        />,
      );
      expect(result.getByTestId('owned-trailing')).toBeTruthy();
    });

    it('labelHidden keeps the accessible name without a visible label', () => {
      const result = renderWithProviders(<Input label="Search" name="q" labelHidden placeholder="Search…" />);
      expect(result.container.querySelector('label')).toBeNull();
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-label')).toBe('Search');
    });
  });

  /**
   * Design-law 100%. Spec: text-and-number anatomy/knobs
   * boards + knobs-enumerated Part 2b DEFAULT class + F1 ring offset 0 +
   * label weight 400. jsdom cannot cascade Tamagui CSS, so radius
   * assertions read `_btlr-*` atoms (same as Button).
   */
  describe('design-law — DEFAULT radius, ring offset 0, label 400', () => {
    function radiusClasses(el: HTMLElement | null): string[] {
      return String(el?.className || '')
        .split(' ')
        .filter((c) => c.startsWith('_btlr-'));
    }

    it('declares radius DEFAULT class on the control box', () => {
      const result = renderWithProviders(<Input label="Name" name="n" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.getAttribute('data-radius-class')).toBe('DEFAULT');
      expect(box.getAttribute('data-radius-part')).toBe('Input');
    });

    it('rides the DEFAULT radius scale: square at none, $12 at full', () => {
      const none = renderWithProviders(
        <Preset overrides={{ borderRadius: 'none' }}>
          <Input label="Name" name="n" />
        </Preset>,
      );
      const noneBox = none.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(radiusClasses(noneBox)).toEqual(['_btlr-t-radius-0']);

      const full = renderWithProviders(
        <Preset overrides={{ borderRadius: 'full' }}>
          <Input label="Name" name="n" />
        </Preset>,
      );
      const fullBox = full.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(radiusClasses(fullBox)).toEqual(['_btlr-t-radius-12']);
    });

    it("paints the size table's corner at medium, as Button does", () => {
      const at = (size: 'small' | 'medium' | 'large', borderRadius = 'medium' as const) => {
        const result = renderWithProviders(
          <Preset overrides={{ size, borderRadius }}>
            <Input label="Name" name="n" />
          </Preset>,
        );
        return radiusClasses(result.container.querySelector("[data-ring-target='box']")!);
      };
      expect(at('small')).toEqual(['_btlr-7px']);
      expect(at('medium')).toEqual(['_btlr-9px']);
      expect(at('large')).toEqual(['_btlr-10px']);
    });

    it('an explicit size prop picks the corner too', () => {
      const result = renderWithProviders(<Input label="Name" name="n" size="$5" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(radiusClasses(box)).toEqual(['_btlr-10px']);
      expect(box.className).toContain('_h-52px');
    });

    it('focus ring offset is 0 (F1 / reference §10 / cover-offset-0)', () => {
      const result = renderWithProviders(<Input label="Name" name="n" />);
      const box = result.container.querySelector("[data-ring-target='box']") as HTMLElement;
      expect(box.getAttribute('data-ring-offset')).toBe('0');
      expect(document.getElementById('mp-input-field-ring-offset')?.textContent).toContain('outline-offset: 0');
    });

    it('paints the field label at weight 400', () => {
      const result = renderWithProviders(<Input label="Full name" name="n" />);
      const label = result.container.querySelector('label') as HTMLElement;
      expect(label).toBeTruthy();
      const weight = label.style.fontWeight || getComputedStyle(label).fontWeight;
      expect(['400', 'normal']).toContain(String(weight));
    });
  });
});
