/**
 * Duration adapter contract specs. The Frappe Duration field is seconds in,
 * seconds out; this file only pins that the hop to forms Duration keeps
 * value / onChange / disabled / label / error. The segment math lives in
 * the forms spec.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../fieldRegistry';
import type { FieldRenderProps } from '../../fieldRegistry';

import { Duration } from '.';

afterEach(cleanup);

const hours = (container: HTMLElement) => container.querySelector('input[aria-label="Hours"]');

describe('Duration composes the forms Duration', () => {
  it('paints a controlled seconds value into the hours segment', () => {
    const result = renderWithProviders(
      <Duration
        label="Time"
        value={7200}
        onChange={() => {}}
      />,
    );
    expect(hours(result.container)?.value ?? hours(result.container)?.getAttribute('value')).toBe('2');
  });

  it('emits seconds through canonical onChange', () => {
    const onChange = vi.fn();
    const result = renderWithProviders(
      <Duration
        label="Time"
        value={3600}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(hours(result.container)!, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(7200);
  });

  it('forwards disabled onto the hours segment', () => {
    const result = renderWithProviders(
      <Duration
        label="Time"
        value={3600}
        disabled
        onChange={() => {}}
      />,
    );
    const el = hours(result.container);
    expect(el?.getAttribute('aria-disabled') === 'true' || el?.disabled).toBe(true);
  });

  it('forwards readOnly onto the hours segment', () => {
    const result = renderWithProviders(
      <Duration
        label="Time"
        value={3600}
        readOnly
        onChange={() => {}}
      />,
    );
    const el = result.container.querySelector('input');
    expect(el?.getAttribute('aria-readonly') === 'true' || el?.readOnly).toBe(true);
  });

  it('shows the label and error', () => {
    const result = renderWithProviders(
      <Duration
        label="Time"
        value={3600}
        error="not a duration"
        onChange={() => {}}
      />,
    );
    expect(result.container.textContent).toContain('Time');
    expect(result.container.textContent).toContain('not a duration');
  });
});

describe('registry resolution (Duration fieldtype)', () => {
  function propsFor(overrides: Partial<FieldRenderProps> = {}): FieldRenderProps {
    return { value: '', onChange: () => {}, ...overrides };
  }

  it("resolves 'Duration' to the Duration adapter and coerces a non-number to 0", () => {
    const Component = getFieldComponent('Duration')!;
    const element = (Component as Function)(propsFor({ value: 'nope', label: 'Time' })) as React.ReactElement<
      Record<string, unknown>
    >;
    expect(element.type).toBe(Duration);
    expect(element.props.value).toBe(0);
    expect(element.props.label).toBe('Time');
  });
});
