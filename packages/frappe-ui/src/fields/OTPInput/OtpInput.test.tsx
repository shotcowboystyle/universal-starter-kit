/**
 * OTPInputField contract specs. The `OTP` fieldtype is a segmented code entry,
 * so the adapter's promises are countable: `length` decides how many cells
 * exist, `type` decides what a cell will accept, `secureTextEntry` decides
 * whether the digits are legible, and `onComplete` fires exactly once the last
 * cell is filled — a login screen wires its submit to that callback, so a
 * dropped `onComplete` is a dead flow, not a cosmetic bug.
 */
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { OTPInputField } from '.';

/** The props type intersects the value callback with YStack's DOM ChangeEventHandler; the mock accepts both. */
type FieldChange = (value: string | React.ChangeEvent<HTMLDivElement>) => void;

/** Registry entries are function components; calling one yields the adapter element. */
type RenderAdapter = (props: FieldRenderProps) => React.ReactElement<React.ComponentProps<typeof OTPInputField>>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

const cells = (container: HTMLElement) => [...container.querySelectorAll('input')] as HTMLInputElement[];

describe('OTPInput field', () => {
  afterEach(cleanup);

  describe('OTPInputField cell count', () => {
    it('defaults to six cells, the stock one-time-code length', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value=""
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)).toHaveLength(6);
    });

    it('honours an explicit length', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value=""
          length={4}
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)).toHaveLength(4);
    });

    it('paints a controlled value one character per cell', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="1234"
          length={4}
          onChange={() => {}}
        />,
      );
      expect(cells(result.container).map((c) => c.value)).toStrictEqual(['1', '2', '3', '4']);
    });

    it('leaves the tail blank for a partial value', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="12"
          length={4}
          onChange={() => {}}
        />,
      );
      expect(cells(result.container).map((c) => c.value)).toStrictEqual(['1', '2', '', '']);
    });
  });

  describe('OTPInputField entry', () => {
    it('emits the assembled code through canonical onChange', async () => {
      const onChange = vi.fn<FieldChange>();
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value=""
          length={4}
          onChange={onChange}
        />,
      );
      await act(async () => {
        fireEvent.change(cells(result.container)[0], { target: { value: '7' } });
      });
      expect(onChange.mock.calls.at(-1)?.[0]).toBe('7');
    });

    it('fires onComplete when the last cell is filled, and not before', async () => {
      const onComplete = vi.fn<(code: string) => void>();
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="123"
          length={4}
          onComplete={onComplete}
          onChange={() => {}}
        />,
      );
      expect(onComplete).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.change(cells(result.container)[3], { target: { value: '4' } });
      });
      expect(onComplete).toHaveBeenCalledWith('1234');
    });

    it('numeric is the default cell mode', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value=""
          length={4}
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)[0].getAttribute('inputmode')).toBe('numeric');
    });

    it('alphanumeric widens the cell mode past digits', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value=""
          length={4}
          type="alphanumeric"
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)[0].getAttribute('inputmode')).not.toBe('numeric');
    });

    it('secureTextEntry masks the cells', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="1234"
          length={4}
          secureTextEntry
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)[0].getAttribute('type')).toBe('password');
    });

    it('readOnly marks every cell readonly, which is how the browser refuses entry', async () => {
      const onChange = vi.fn<FieldChange>();
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="12"
          length={4}
          readOnly
          onChange={onChange}
        />,
      );
      // Every cell, not just the first: a partially readOnly OTP is a field a
      // user can half-edit.
      for (const cell of cells(result.container)) {
        expect(cell.hasAttribute('readonly')).toBe(true);
      }

      // FINDING (MPO-123): the DOM attribute is the ONLY guard. Unlike
      // forms/TextArea, whose onChangeText opens `if (disabled || readOnly)
      // return;`, OTPInput's handleDigitChange has no such check — so a
      // programmatic change still moves the digits and still emits. A real
      // browser never fires change on a readonly input, so this is not a user
      // -reachable bug today; it is a missing guard, asserted here as the
      // behaviour that actually exists rather than the one that should.
      await act(async () => {
        fireEvent.change(cells(result.container)[2], { target: { value: '9' } });
      });
      expect(onChange).toHaveBeenCalledWith(expect.any(String));
    });

    it('skeleton branch renders no cells', () => {
      const result = renderWithProviders(
        <OTPInputField
          label="Code"
          value="1234"
          length={4}
          skeleton
          onChange={() => {}}
        />,
      );
      expect(cells(result.container)).toHaveLength(0);
    });
  });

  describe('registry resolution (OTP fieldtype)', () => {
    it("resolves 'OTP' to OTPInputField", () => {
      const Component = getFieldComponent('OTP')!;
      expect(Component).toBeTruthy();
      const element = (Component as RenderAdapter)(propsFor({ value: '123456', label: 'Code' }));
      expect(element.type).toBe(OTPInputField);
      expect(element.props.value).toBe('123456');
      expect(element.props.label).toBe('Code');
    });

    it('substitutes an empty string for a null value so the cells stay controlled', () => {
      const Component = getFieldComponent('OTP')!;
      const element = (Component as RenderAdapter)(propsFor({ value: null as unknown as string }));
      expect(element.props.value).toBe('');
    });

    it('passes helperText / readOnly / skeleton / compact through', () => {
      const Component = getFieldComponent('OTP')!;
      const element = (Component as RenderAdapter)(
        propsFor({ helperText: 'check your texts', readOnly: true, skeleton: true, compact: true }),
      );
      expect(element.props.helperText).toBe('check your texts');
      expect(element.props.readOnly).toBe(true);
      expect(element.props.skeleton).toBe(true);
      expect(element.props.compact).toBe(true);
    });
  });
});
