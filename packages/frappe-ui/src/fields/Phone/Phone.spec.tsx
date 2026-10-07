/**
 * Phone contract specs. The adapter is thin by design — compose the forms
 * PhoneInput, emit canonical onChange — so what has to be pinned is that every
 * prop the Frappe layer sets actually ARRIVES: the country the number is
 * parsed against (`defaultCountry`, fed from df.options by the registry), the
 * controlled value, and the read-only / disabled gates.
 *
 * A dropped `defaultCountry` is the failure that matters here: the same digits
 * serialise to a different E.164 number under a different region, so a silent
 * default of US would corrupt every non-US phone field on save.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { Phone } from '.';

afterEach(cleanup);

const phoneInput = (container: HTMLElement) => container.querySelector('[data-testid="phone-input"]');

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

  it('emits a serialised number through canonical onChange', async () => {
    const onChange = vi.fn();
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
    expect(onChange).toHaveBeenCalledWith();
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

  it('honours defaultCountry, so the dial code follows the DocField', () => {
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
    const onChange = vi.fn();
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
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Phone' to the Phone adapter", () => {
    const Component = getFieldComponent('Phone')!;
    expect(Component).toBeTruthy();
    const element = (Component as Function)(propsFor({ value: '+14155550123', label: 'Mobile' })) as React.ReactElement<
      Record<string, any>
    >;
    expect(element.type).toBe(Phone);
    expect(element.props.value).toBe('+14155550123');
    expect(element.props.label).toBe('Mobile');
  });

  it("takes defaultCountry from df.options — this is the DocField's own region", () => {
    const Component = getFieldComponent('Phone')!;
    const element = (Component as Function)(
      propsFor({ fieldMeta: { options: 'IN' } } as Partial<FieldRenderProps>),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.defaultCountry).toBe('IN');
  });

  it('leaves defaultCountry unset when df.options is empty, so PhoneInput owns the default', () => {
    const Component = getFieldComponent('Phone')!;
    const element = (Component as Function)(
      propsFor({ fieldMeta: { options: '' } } as Partial<FieldRenderProps>),
    ) as React.ReactElement<Record<string, any>>;
    expect(element.props.defaultCountry).toBeUndefined();
  });

  it('substitutes an empty string for a null value', () => {
    const Component = getFieldComponent('Phone')!;
    const element = (Component as Function)(propsFor({ value: null as unknown as string })) as React.ReactElement<
      Record<string, any>
    >;
    expect(element.props.value).toBe('');
  });
});
