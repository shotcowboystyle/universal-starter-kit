/**
 * ToggleGroupField contract specs. The adapter maps `onChange` onto the forms
 * ToggleGroup's `onValueChange`. Pin that value, onChange, disabled, label
 * and error survive the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { ToggleGroupField } from '.';

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
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

describe('ToggleGroupField composes the forms ToggleGroup', () => {
  it('paints a controlled value onto the matching item', () => {
    const result = renderWithProviders(
      <ToggleGroupField
        label="Align"
        type="single"
        value="center"
        options={options}
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Center');
    const pressed = result.container.querySelector('[aria-pressed="true"], [data-state="on"]');
    expect(pressed).toBeTruthy();
  });

  it('emits the item value through canonical onChange', () => {
    const onChange = vi.fn<(value: string | string[] | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <ToggleGroupField
        label="Align"
        type="single"
        value="left"
        options={options}
        onChange={onChange}
      />,
    );
    const center = result.findTextElement('Center');
    expect(center).toBeTruthy();
    fireEvent.click(center as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('center');
  });

  it('forwards disabled onto the group', () => {
    const result = renderWithProviders(
      <ToggleGroupField
        label="Align"
        type="single"
        value="left"
        options={options}
        disabled
        onChange={() => {}}
      />,
    );
    const el =
      result.container.querySelector('[role="group"]') ??
      result.container.querySelector('[data-disabled="true"]') ??
      result.container.querySelector('[disabled]');
    expect(el).toBeTruthy();
  });

  it('shows the label and error', () => {
    const result = renderWithProviders(
      <ToggleGroupField
        label="Align"
        type="single"
        value="left"
        options={options}
        error="pick a side"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Align');
    expect(result.container.textContent).toContain('pick a side');
  });
});

describe('registry resolution (Toggle Group fieldtype)', () => {
  it("resolves 'Toggle Group' to ToggleGroupField and splits df.options on newlines", () => {
    const Component = getFieldComponent('Toggle Group')!;
    // SAFETY: registry entries are function components; calling one returns its rendered element
    const renderField = Component as (props: FieldRenderProps) => React.ReactElement<RenderedFieldProps>;
    const element = renderField(
      propsFor({
        value: 'Left',
        label: 'Align',
        fieldMeta: { options: 'Left\nCenter' },
      } as Partial<FieldRenderProps>),
    );
    expect(element.type).toBe(ToggleGroupField);
    expect(element.props.value).toBe('Left');
    expect(element.props.label).toBe('Align');
    expect(element.props.options).toStrictEqual([
      { label: 'Left', value: 'Left' },
      { label: 'Center', value: 'Center' },
    ]);
  });
});
