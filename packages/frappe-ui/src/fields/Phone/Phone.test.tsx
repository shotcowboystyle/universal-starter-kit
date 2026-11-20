/**
 * Phone contract specs. The adapter is thin by design — compose the forms
 * PhoneInput, emit canonical onChange — so what has to be pinned is that every
 * prop the Frappe layer sets actually ARRIVES: the country the number is
 * parsed against (`defaultCountry`, fed from df.options by the registry), the
 * controlled value, and the read-only / disabled gates.
 *
 * A dropped `defaultCountry` is the failure that matters here: the same digits
 * serialize to a different E.164 number under a different region, so a silent
 * default of US would corrupt every non-US phone field on save.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { Phone } from '.';
import type { PhoneFieldProps } from '.';

type PhoneElement = React.ReactElement<PhoneFieldProps>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

/** Calls the Phone registry adapter directly and returns the field element it builds. */
const renderAdapter = (props: FieldRenderProps): PhoneElement => {
  const Component = getFieldComponent('Phone');
  if (Component === undefined) {
    throw new Error('no adapter registered for Phone');
  }
  // SAFETY: the Phone registry adapter is a plain function component that returns one Phone element.
  return (Component as (adapterProps: FieldRenderProps) => PhoneElement)(props);
};

// oxlint-disable-next-line vitest/require-top-level-describe -- DOM cleanup applies to every suite in this file
afterEach(cleanup);

const phoneInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('[data-testid="phone-input"]');

describe('Phone composes the forms PhoneInput', () => {
  it('renders the composite phone control, not a bare Input', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        onChange={() => {}}
      />,
    );
    expect(phoneInput(result.container)).toBeTruthy();
    expect(result.container.querySelector('[data-testid="phone-box"]')).toBeTruthy();
  });

  it('shows the national form of a controlled E.164 value', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value="+14155550123"
        onChange={() => {}}
      />,
    );
    const input = phoneInput(result.container);
    expect(input?.value).toContain('415');
    expect(input?.value).toContain('555');
  });

  it('emits a serialized number through canonical onChange', async () => {
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        onChange={onChange}
      />,
    );
    const input = phoneInput(result.container)!;
    await act(async () => {
      fireEvent.change(input, { target: { value: '4155550123' } });
    });
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\+/u));
    // SAFETY: Phone emits the serialized E.164 string through onChange, never the DOM change event
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted.startsWith('+')).toBe(true);
    expect(emitted).toContain('4155550123');
  });
});

describe('Phone defaultCountry', () => {
  it('defaults to the +1 region when the field declares no country', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('+1');
  });

  it('honors defaultCountry, so the dial code follows the DocField', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        defaultCountry="GB"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('+44');
  });

  it('parses the same digits under the declared region', async () => {
    const onChange = vi.fn<(value: string | ChangeEvent<HTMLDivElement>) => void>();
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        defaultCountry="IN"
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.change(phoneInput(result.container)!, {
        target: { value: '8074052136' },
      });
    });
    // SAFETY: Phone emits the serialized E.164 string through onChange, never the DOM change event
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted.startsWith('+91')).toBe(true);
  });
});

describe('Phone gates', () => {
  it('readOnly marks the control read-only', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value="+14155550123"
        readOnly
        onChange={() => {}}
      />,
    );
    expect(phoneInput(result.container)?.hasAttribute('readonly')).toBe(true);
  });

  it('skeleton branch renders no phone control', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value="+14155550123"
        skeleton
        onChange={() => {}}
      />,
    );
    expect(phoneInput(result.container)).toBeNull();
  });

  it('shows the label, helperText and error', () => {
    const result = renderWithProviders(
      <Phone
        label="Mobile"
        value=""
        helperText="include the country code"
        error="not a number"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Mobile');
    expect(result.container.textContent).toContain('not a number');
  });
});

describe('registry resolution (Phone fieldtype)', () => {
  it("resolves 'Phone' to the Phone adapter", () => {
    expect(getFieldComponent('Phone')).toBeTruthy();
    const element = renderAdapter(propsFor({ value: '+14155550123', label: 'Mobile' }));
    expect(element.type).toBe(Phone);
    expect(element.props.value).toBe('+14155550123');
    expect(element.props.label).toBe('Mobile');
  });

  it("takes defaultCountry from df.options — this is the DocField's own region", () => {
    const element = renderAdapter(propsFor({ fieldMeta: { options: 'IN' } } as Partial<FieldRenderProps>));
    expect(element.props.defaultCountry).toBe('IN');
  });

  it('leaves defaultCountry unset when df.options is empty, so PhoneInput owns the default', () => {
    const element = renderAdapter(propsFor({ fieldMeta: { options: '' } } as Partial<FieldRenderProps>));
    expect(element.props.defaultCountry).toBeUndefined();
  });

  it('substitutes an empty string for a null value', () => {
    const element = renderAdapter(propsFor({ value: null }));
    expect(element.props.value).toBe('');
  });
});
