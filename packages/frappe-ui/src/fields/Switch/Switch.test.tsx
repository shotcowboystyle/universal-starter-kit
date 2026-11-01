/**
 * SwitchField contract specs. Frappe Switch is 1/0 in the doc; this adapter
 * maps that onto the forms Switch's boolean checked/onCheckedChange. Pin
 * that value, onChange, disabled, label and error survive the hop.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { SwitchField } from '.';

/** Registry entries are function components; calling one yields the adapter element. */
type RenderAdapter = (props: FieldRenderProps) => React.ReactElement<React.ComponentProps<typeof SwitchField>>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

describe('Switch field', () => {
  afterEach(cleanup);

  describe('SwitchField composes the forms Switch', () => {
    it('paints a controlled true value as aria-checked=true', () => {
      const result = renderWithProviders(
        <SwitchField
          label="Enabled"
          value={true}
          onChange={() => {}}
        />,
      );
      expect(result.getSwitch()?.getAttribute('aria-checked')).toBe('true');
    });

    it('emits a boolean through canonical onChange', async () => {
      const onChange = vi.fn<(value: boolean | React.ChangeEvent<HTMLDivElement>) => void>();
      const result = renderWithProviders(
        <SwitchField
          label="Enabled"
          value={false}
          onChange={onChange}
        />,
      );
      await act(async () => {
        fireEvent.click(result.getSwitch() as HTMLElement);
      });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('forwards disabled onto the switch', () => {
      const result = renderWithProviders(
        <SwitchField
          label="Enabled"
          value={false}
          disabled
          onChange={() => {}}
        />,
      );
      const el = result.getSwitch();
      expect(el?.hasAttribute('disabled') ?? el?.getAttribute('aria-disabled') === 'true').toBe(true);
    });

    it('shows the label and error', () => {
      const result = renderWithProviders(
        <SwitchField
          label="Enabled"
          value={false}
          error="cannot enable"
          onChange={() => {}}
        />,
      );
      expect(result.container.textContent).toContain('Enabled');
      expect(result.container.textContent).toContain('cannot enable');
    });
  });

  describe('registry resolution (Switch fieldtype)', () => {
    it("resolves 'Switch' to SwitchField and maps a truthy doc value to true", () => {
      const Component = getFieldComponent('Switch')!;
      const element = (Component as RenderAdapter)(propsFor({ value: 1, label: 'Enabled' }));
      expect(element.type).toBe(SwitchField);
      expect(element.props.value).toBe(true);
      expect(element.props.label).toBe('Enabled');
    });
  });
});
