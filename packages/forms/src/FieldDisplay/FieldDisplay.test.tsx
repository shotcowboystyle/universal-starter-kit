// @vitest-environment jsdom

import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Geocoder } from '../fields/Geolocation/geocoder';
import { GeocoderProvider } from '../fields/Geolocation/geocoder-context';

import { EMPTY } from './formatters';

import { FieldDisplay } from './index';

const frame = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-component='FieldDisplay']");

const radiusClasses = (el: HTMLElement | null): string[] =>
  (el?.className ?? '').split(' ').filter((c) => c.startsWith('_btlr-'));

describe(FieldDisplay, () => {
  afterEach(cleanup);

  it('keeps zero and false as values, empty as the empty mark', () => {
    const zero = renderWithProviders(
      <FieldDisplay
        field="stepper"
        value={0}
      />,
    );
    expect(zero.container.textContent).toContain('0');
    expect(zero.container.textContent).not.toContain(EMPTY);
    cleanup();

    const falsy = renderWithProviders(
      <FieldDisplay
        field="checkbox"
        value={false}
      />,
    );
    expect(frame(falsy.container)?.querySelector('svg')).toBeNull();
    expect(falsy.container.textContent).not.toContain(EMPTY);
    cleanup();

    const empty = renderWithProviders(
      <FieldDisplay
        field="input"
        value={null}
      />,
    );
    expect(empty.container.textContent).toContain(EMPTY);
  });

  it('renders select labels through Chip, not the raw slug', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="select"
        value="b"
        fieldProps={{
          options: [
            { label: 'Beta', value: 'b', color: 'blue' },
            { label: 'Alpha', value: 'a' },
          ],
        }}
      />,
    );
    expect(result.findTextElement('Beta')).toBeDefined();
    expect(result.container.textContent).not.toMatch(/\bb\b/u);
  });

  it('escapes HTML as text and does not create a javascript: link', () => {
    const html = renderWithProviders(
      <FieldDisplay
        field="input"
        value='<img src=x onerror="alert(1)">'
      />,
    );
    expect(html.container.querySelector('img')).toBeNull();
    expect(html.container.textContent).toContain('<img');
    cleanup();

    const js = renderWithProviders(
      <FieldDisplay
        field="input"
        // oxlint-disable-next-line no-script-url -- the contract under test is that a javascript: value is never linked
        value="javascript:alert(1)"
      />,
    );
    expect(js.container.querySelector("[role='link']")).toBeNull();
    // oxlint-disable-next-line no-script-url -- asserting the unsafe value renders as inert text
    expect(js.container.textContent).toContain('javascript:alert(1)');
  });

  it('turns a safe https value into a keyboard-reachable link', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="input"
        value="https://example.com/item"
      />,
    );
    const link = result.container.querySelector("[role='link']");
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com/item');
  });

  it('strips tags from rich text', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="richtexteditor"
        value="<p>Rich <b>text</b> content</p>"
      />,
    );
    expect(result.container.textContent).toContain('Rich text content');
    expect(result.container.querySelector('b')).toBeNull();
  });

  it('standalone frame follows the radius knob', () => {
    const none = renderWithProviders(
      <Preset overrides={{ borderRadius: 'none' }}>
        <FieldDisplay
          field="input"
          value="Hello"
        />
      </Preset>,
    );
    expect(radiusClasses(frame(none.container))).toStrictEqual(['_btlr-t-radius-0']);
    cleanup();

    const full = renderWithProviders(
      <Preset overrides={{ borderRadius: 'full' }}>
        <FieldDisplay
          field="input"
          value="Hello"
        />
      </Preset>,
    );
    expect(radiusClasses(frame(full.container))).toStrictEqual(['_btlr-t-radius-12']);
  });

  it('standalone textarea keeps line breaks', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="textarea"
        value={'line one\nline two'}
      />,
    );
    const text = frame(result.container)?.textContent ?? '';
    expect(text).toContain('line one');
    expect(text).toContain('line two');
  });

  // Restored `it(...)` header lost in the 2026-08-14 merge (the body was
  // orphaned at top level and broke the whole file's parse).
  it('standalone datepicker renders its field frame', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="datepicker"
        value="2026-01-15"
      />,
    );
    const root = frame(result.container);
    expect(root).not.toBeNull();
    expect(root?.dataset.field).toBe('datepicker');
  });

  /**
   * The qr format reaches BarcodePreview (the round trip is asserted there),
   * but a display cell's bound is the glyph size — around 20px — and a QR
   * needs one WHOLE pixel per module, 29 minimum. So the cell draws no matrix
   * and, because it already prints the value beside the symbol, contributes
   * nothing rather than a second copy of the string (textFallback={false}).
   * Growing the row to fit a scannable square is the thing this contract forbids.
   */
  it('prints the barcode value once and draws no unreadable QR at a display bound', () => {
    const result = renderWithProviders(
      <FieldDisplay
        field="barcode"
        value="SKU-001234"
        fieldProps={{ formats: ['qr'] }}
      />,
    );
    expect(result.container.querySelector('[data-testid="barcode-preview-qr"]')).toBeNull();
    expect(result.container.querySelector('canvas')).toBeNull();
    // exactly once
    expect(result.container.textContent?.split('SKU-001234').length).toBe(2);
  });

  describe('geolocation', () => {
    const helsinki = { lat: 60.16952, lng: 24.93545 };

    it('reads a pair from an object or a stored JSON string', () => {
      const object = renderWithProviders(
        <FieldDisplay
          field="geolocation"
          value={helsinki}
        />,
      );
      expect(object.container.textContent).toContain('60.1695, 24.9354');
      cleanup();
      const json = renderWithProviders(
        <FieldDisplay
          field="geolocation"
          value={JSON.stringify(helsinki)}
        />,
      );
      expect(json.container.textContent).toContain('60.1695, 24.9354');
      expect(json.container.textContent).not.toContain('{');
    });

    it("shows the provider's address in place of the pair", async () => {
      const reverseGeocode = vi.fn<Geocoder['reverseGeocode']>().mockResolvedValue({
        ...helsinki,
        label: 'Mannerheimintie 3',
        description: 'Kamppi, Helsinki',
      });
      const result = renderWithProviders(
        <GeocoderProvider geocoder={{ geocode: vi.fn<Geocoder['geocode']>(), reverseGeocode }}>
          <FieldDisplay
            field="geolocation"
            value={JSON.stringify(helsinki)}
          />
        </GeocoderProvider>,
      );
      await waitFor(() => {
        expect(result.container.textContent).toContain('Mannerheimintie 3, Kamppi, Helsinki');
      });
      expect(result.container.textContent).not.toContain('60.1695');
      expect(reverseGeocode).toHaveBeenCalledWith(helsinki);
    });

    it('keeps the pair when the provider fails or finds nothing', async () => {
      const reverseGeocode = vi.fn<Geocoder['reverseGeocode']>().mockRejectedValue(new Error('down'));
      const result = renderWithProviders(
        <GeocoderProvider geocoder={{ geocode: vi.fn<Geocoder['geocode']>(), reverseGeocode }}>
          <FieldDisplay
            field="geolocation"
            value={helsinki}
          />
        </GeocoderProvider>,
      );
      await waitFor(() => {
        expect(reverseGeocode).toHaveBeenCalledWith(helsinki);
      });
      expect(result.container.textContent).toContain('60.1695, 24.9354');
    });
  });
});
