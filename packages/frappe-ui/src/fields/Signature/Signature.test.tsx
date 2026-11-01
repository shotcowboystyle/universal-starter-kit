/**
 * Signature adapter contract specs. The Frappe Signature field stores a
 * data URL; this adapter must hand value / onChange / disabled / label /
 * error to the forms Signature pad. Drawing lives in the forms spec.
 */
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { getFieldComponent } from '../../field-registry';
import type { FieldRenderProps } from '../../field-registry';

import { Signature } from '.';

/** The props type intersects the value callback with YStack's DOM ChangeEventHandler; the mock accepts both. */
type FieldChange = (value: string | React.ChangeEvent<HTMLDivElement>) => void;

/** Registry entries are function components; calling one yields the adapter element. */
type RenderAdapter = (props: FieldRenderProps) => React.ReactElement<React.ComponentProps<typeof Signature>>;

const propsFor = (overrides: Partial<FieldRenderProps> = {}): FieldRenderProps => ({
  value: '',
  onChange: () => {},
  ...overrides,
});

const encodeSignature = (strokes: number[][][]): string => {
  const json = JSON.stringify({ v: 2, s: strokes });
  return `data:application/json;base64,${btoa(json)}`;
};

const inkedValue = encodeSignature([
  [
    [0.1, 0.2, 0.5],
    [0.4, 0.3, 0.5],
    [0.7, 0.25, 0.5],
  ],
]);

const getPad = (container: HTMLElement): HTMLElement => {
  const label = container.querySelector<HTMLLabelElement>('label[for]');
  const id = label?.htmlFor;
  const pad = id !== undefined && id !== '' ? container.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
  if (!pad) {
    throw new Error('signature pad not found');
  }
  return pad;
};

describe('Signature field', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn<() => object>(() => ({
      clearRect: vi.fn<() => void>(),
      beginPath: vi.fn<() => void>(),
      moveTo: vi.fn<() => void>(),
      lineTo: vi.fn<() => void>(),
      stroke: vi.fn<() => void>(),
      fillRect: vi.fn<() => void>(),
      drawImage: vi.fn<() => void>(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(cleanup);

  describe('Signature composes the forms Signature', () => {
    it('paints a controlled value as a signed pad', () => {
      const result = renderWithProviders(
        <Signature
          label="Sign here"
          value={inkedValue}
          onChange={() => {}}
        />,
      );
      expect(getPad(result.container).dataset.signed).toBe('true');
    });

    it('emits an empty string through canonical onChange on Delete', () => {
      const onChange = vi.fn<FieldChange>();
      const result = renderWithProviders(
        <Signature
          label="Sign here"
          value={inkedValue}
          onChange={onChange}
        />,
      );
      const pad = getPad(result.container);
      fireEvent.focus(pad);
      fireEvent.keyDown(pad, { key: 'Delete' });
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('forwards readOnly onto the pad', () => {
      const result = renderWithProviders(
        <Signature
          label="Sign here"
          value={inkedValue}
          readOnly
          onChange={() => {}}
        />,
      );
      expect(getPad(result.container).getAttribute('aria-readonly')).toBe('true');
    });

    it('forwards disabled onto the pad', () => {
      const result = renderWithProviders(
        <Signature
          label="Sign here"
          value={inkedValue}
          disabled
          onChange={() => {}}
        />,
      );
      const pad = getPad(result.container);
      expect(pad.getAttribute('aria-disabled') === 'true' || pad.hasAttribute('disabled')).toBe(true);
    });

    it('shows the label and error', () => {
      const result = renderWithProviders(
        <Signature
          label="Sign here"
          value=""
          error="signature required"
          onChange={() => {}}
        />,
      );
      expect(result.container.textContent).toContain('Sign here');
      expect(result.container.textContent).toContain('signature required');
    });
  });

  describe('registry resolution (Signature fieldtype)', () => {
    it("resolves 'Signature' to the Signature adapter and hands value through", () => {
      const Component = getFieldComponent('Signature')!;
      const element = (Component as RenderAdapter)(propsFor({ value: inkedValue, label: 'Sign here' }));
      expect(element.type).toBe(Signature);
      expect(element.props.value).toBe(inkedValue);
      expect(element.props.label).toBe('Sign here');
    });
  });
});
