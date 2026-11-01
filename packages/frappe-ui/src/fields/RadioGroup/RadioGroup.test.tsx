/**
 * RadioGroupField contract specs. The adapter maps `onChange` onto the forms
 * RadioGroup's `onValueChange`. Pin that value, onChange, disabled, label
 * and error survive the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { RadioGroupField } from '.';

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

interface RenderedFieldProps {
  value?: unknown;
  label?: unknown;
  options?: unknown;
}

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
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
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
    const [el] = radios(result.container);
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
  it("resolves 'Radio' to RadioGroupField and splits df.options on newlines", () => {
    const Component = getFieldComponent('Radio')!;
    // SAFETY: registry entries are function components; calling one returns its rendered element
    const renderField = Component as (props: FieldRenderProps) => React.ReactElement<RenderedFieldProps>;
    const element = renderField(
      propsFor({
        value: 'Red',
        label: 'Color',
        fieldMeta: { options: 'Red\nBlue' },
      } as Partial<FieldRenderProps>),
    );
    expect(element.type).toBe(RadioGroupField);
    expect(element.props.value).toBe('Red');
    expect(element.props.label).toBe('Color');
    expect(element.props.options).toStrictEqual([
      { label: 'Red', value: 'Red' },
      { label: 'Blue', value: 'Blue' },
    ]);
  });
});
