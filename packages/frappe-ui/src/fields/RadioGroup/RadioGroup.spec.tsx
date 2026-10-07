/**
 * RadioGroupField contract specs. The adapter maps `onChange` onto the forms
 * RadioGroup's `onValueChange`. Pin that value, onChange, disabled, label
 * and error survive the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { RadioGroupField } from '.';

afterEach(cleanup);

const options = [
  { label: 'Red', value: 'red' },
  { label: 'Blue', value: 'blue' },
];

const radios = (container: HTMLElement) => [...container.querySelectorAll('[role="radio"]')] as HTMLElement[];

describe('RadioGroupField composes the forms RadioGroup', () => {
  it('paints a controlled value onto the matching radio', () => {
    const result = renderWithProviders(
      <RadioGroupField
        label="Color"
        value="blue"
        options={options}
        onChange={() => {}}
      />,
    );
    const all = radios(result.container);
    const checked = all.find((el) => el.getAttribute('aria-checked') === 'true');
    expect(checked).toBeTruthy();
    // option order is Red, Blue — the disc itself has no text
    expect(checked).toBe(all[1]);
  });

  it('emits the option value through canonical onChange', async () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <RadioGroupField
        label="Color"
        value="red"
        options={options}
        onChange={onChange}
      />,
    );
    const blue = radios(result.container).find((el) => (el.textContent || '').includes('Blue'));
    expect(blue ?? radios(result.container)[1]).toBeTruthy();
    await act(async () => {
      fireEvent.click(blue ?? radios(result.container)[1]);
    });
    expect(onChange).toHaveBeenCalledWith('blue');
  });

  it('forwards disabled onto the radios', () => {
    const result = renderWithProviders(
      <RadioGroupField
        label="Color"
        value="red"
        options={options}
        disabled
        onChange={() => {}}
      />,
    );
    const el = radios(result.container)[0];
    expect(el?.getAttribute('aria-disabled') === 'true' || el?.hasAttribute('disabled')).toBe(true);
  });

  it('shows the label and error', () => {
    const result = renderWithProviders(
      <RadioGroupField
        label="Color"
        value="red"
        options={options}
        error="pick one"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Color');
    expect(result.container.textContent).toContain('pick one');
  });
});

describe('registry resolution (Radio fieldtype)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Radio' to RadioGroupField and splits df.options on newlines", () => {
    const Component = getFieldComponent('Radio')!;
    const element = (Component as Function)(
      propsFor({
        value: 'Red',
        label: 'Color',
        fieldMeta: { options: 'Red\nBlue' },
      } as Partial<FieldRenderProps>),
    ) as React.ReactElement<Record<string, unknown>>;
    expect(element.type).toBe(RadioGroupField);
    expect(element.props.value).toBe('Red');
    expect(element.props.label).toBe('Color');
    expect(element.props.options).toEqual([
      { label: 'Red', value: 'Red' },
      { label: 'Blue', value: 'Blue' },
    ]);
  });
});
