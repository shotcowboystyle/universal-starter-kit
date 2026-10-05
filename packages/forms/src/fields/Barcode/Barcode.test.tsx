import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';

import { preflightCamera } from './BarcodeScanner';
import { resolveHtml5FormatIds, resolveNativeBarcodeTypes } from './scannerTypes';

import { Barcode } from './index';

const barcodeIcon = <span data-testid="barcode-icon" />;
const scanIcon = <span data-testid="scan-icon" />;
const stopIcon = <span data-testid="stop-icon" />;

describe('Barcode', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(
        <Barcode label="Barcode" name="code" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} />,
      );
      expect(result.findTextElement('Barcode')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(
        <Barcode
          label="Required"
          name="req"
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
          required
        />,
      );
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(
        <Barcode
          label="Code"
          name="c"
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
          helperText="Scan or type a code"
        />,
      );
      expect(result.findTextElement('Scan or type a code')).toBeDefined();
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(
        <Barcode label="Loading" name="l" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} skeleton />,
      );
      expect(result.container.querySelector('input')).toBeNull();
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(
        <Barcode
          label="Disabled"
          name="d"
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
          disabled
        />,
      );
      const input = result.container.querySelector('input');
      expect(input?.getAttribute('aria-disabled')).toBe('true');
    });

    it('bare use renders complete affordances via package icon defaults (UX-010)', () => {
      const result = renderWithProviders(<Barcode label="No icons" name="ni" />);
      // Scan button carries the default camera glyph (icon button, named).
      const button = result.container.querySelector("[aria-label='Scan barcode']");
      expect(button).not.toBeNull();
      expect(button?.querySelector('svg')).not.toBeNull();
      // Leading adornment slot renders the default barcode glyph.
      const box = result.container.querySelector('input')?.closest("[class*='is_Input']");
      expect(result.container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
      expect(box).not.toBeNull();
    });

    it('explicit null icons fall back to a labeled text scan button (no bare box)', () => {
      const result = renderWithProviders(
        <Barcode label="No icons" name="ni" barcodeIcon={null} scanIcon={null} stopIcon={null} />,
      );
      const button = result.container.querySelector("[aria-label='Scan barcode']");
      expect(button).not.toBeNull();
      expect(button?.textContent).toContain('Scan');
      expect(button?.querySelector('scan')).toBeNull();
      expect(result.container.querySelector('scan')).toBeNull();
    });

    it('renders readOnly — hides scan button', () => {
      const result = renderWithProviders(
        <Barcode
          label="ReadOnly"
          name="r"
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
          readOnly
          value="12345"
        />,
      );
      expect(result.container.querySelectorAll("[data-testid='scan-icon']").length).toBe(0);
    });

    it('scan control lives inside the composite box', () => {
      const result = renderWithProviders(
        <Barcode label="Barcode" name="code" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} />,
      );
      const box = result.container.querySelector('[data-testid="barcode-field"]');
      const scan = result.container.querySelector("[aria-label='Scan barcode']");
      expect(box).not.toBeNull();
      expect(scan).not.toBeNull();
      expect(box!.contains(scan)).toBe(true);
    });

    it('standalone without onChange still types via internal state', () => {
      const result = renderWithProviders(<Barcode label="Code" />);
      const input = result.container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      fireEvent.change(input, { target: { value: 'SKU-001234' } });
      expect(input.value).toBe('SKU-001234');
    });

    it('clear empties the value', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Barcode
          label="Code"
          value="SKU-001234"
          onChange={onChange}
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
        />,
      );
      const clear = result.container.querySelector("[aria-label='Clear barcode']");
      expect(clear).not.toBeNull();
      fireEvent.click(clear as Element);
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('draws a Code 128 preview for an encodable value', () => {
      const result = renderWithProviders(
        <Barcode label="Code" value="SKU-001234" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} />,
      );
      expect(result.container.querySelector('[data-testid="barcode-preview"]')).not.toBeNull();
      expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    });

    it('draws a QR matrix when formats starts with a qr alias', () => {
      const result = renderWithProviders(
        <Barcode
          label="Code"
          value="SKU-001234"
          formats={['qr']}
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
        />,
      );
      expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).not.toBeNull();
      expect(result.container.querySelector('canvas')).toBeNull();
    });

    it('draws QR for the Frappe fieldtype qrcode token', () => {
      const result = renderWithProviders(
        <Barcode
          label="QR"
          value="https://multiplatform.one"
          formats={['qrcode']}
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
        />,
      );
      expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).not.toBeNull();
    });

    it('accepts a formats filter without dropping the scan control', () => {
      const result = renderWithProviders(
        <Barcode
          label="Code"
          formats={['code128', 'ean13']}
          barcodeIcon={barcodeIcon}
          scanIcon={scanIcon}
          stopIcon={stopIcon}
        />,
      );
      expect(result.container.querySelector("[aria-label='Scan barcode']")).not.toBeNull();
    });
  });

  describe('camera pre-flight', () => {
    it('preflightCamera fails when no camera capability exists', async () => {
      // jsdom has no navigator.mediaDevices — pre-flight must fail, not throw
      const result = await preflightCamera();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Camera unavailable');
      }
    });

    it('scan press without camera shows inline error and never mounts the scanner', async () => {
      const result = renderWithProviders(
        <Barcode label="Scan" name="s" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} />,
      );
      const button = result.container.querySelector("[aria-label='Scan barcode']");
      expect(button).not.toBeNull();
      fireEvent.click(button as Element);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Camera unavailable');
      });
      // The scanner surface must never have mounted (no mount-fail-unmount)
      expect(result.container.querySelector("[data-testid='barcode-scanner-popup']")).toBeNull();
      // Manual entry stays usable and the scan button stays enabled
      const input = result.container.querySelector('input');
      expect(input).not.toBeNull();
      expect((button as HTMLElement).getAttribute('aria-disabled')).not.toBe('true');
    });
  });

  describe('format mapping', () => {
    it('maps aliases onto expo-camera types and falls back on unknown', () => {
      expect(resolveNativeBarcodeTypes(['QR', 'code-128', 'ean_13'])).toEqual(['qr', 'code128', 'ean13']);
      expect(resolveNativeBarcodeTypes(['nope'])).toEqual(expect.arrayContaining(['qr', 'code128']));
    });

    it('maps aliases onto html5-qrcode enum ids', () => {
      const fakeEnum = { QR_CODE: 0, CODE_128: 5, EAN_13: 9 };
      expect(resolveHtml5FormatIds(['qr', 'CODE128'], fakeEnum)).toEqual([0, 5]);
      expect(resolveHtml5FormatIds(undefined, fakeEnum)).toBeUndefined();
      expect(resolveHtml5FormatIds(['nope'], fakeEnum)).toBeUndefined();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { code: '' } }} submitText="Submit">
          <Barcode name="code" label="Barcode" barcodeIcon={barcodeIcon} scanIcon={scanIcon} stopIcon={stopIcon} />
        </Form>,
      );
      expect(result.findTextElement('Barcode')).toBeDefined();
    });
  });
});
