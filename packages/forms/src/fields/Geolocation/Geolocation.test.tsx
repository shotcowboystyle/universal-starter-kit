import { NavigationArrowIcon } from '@phosphor-icons/react';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, waitFor } from '@testing-library/react';
import { Theme } from 'tamagui';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import type { GeocodeResult, Geocoder } from './geocoder';
import { GeocoderProvider } from './geocoderContext';

import { Geolocation, preflightGeolocation } from './index';

const locationIcon = <span data-testid="location-icon" />;
const HELSINKI = JSON.stringify({ lat: 60.16952, lng: 24.93545 });

const mannerheim: GeocodeResult = {
  lat: 60.16952,
  lng: 24.93545,
  label: 'Mannerheimintie 3',
  description: 'Kamppi, Helsinki, Finland',
};

function mockGeocode(results: GeocodeResult[] = [mannerheim]) {
  return vi.fn().mockResolvedValue(results);
}

function mockReverse(result: GeocodeResult | null = mannerheim) {
  return vi.fn().mockResolvedValue(result);
}

function searchInput(container: HTMLElement | Document = document) {
  return (container.querySelector("[data-testid='geolocation-search']") ??
    container.querySelector("[aria-label='Search for a location']")) as HTMLInputElement | null;
}

const mapControlSelector =
  "button, input, textarea, select, [role='button'], [role='combobox'], [role='option'], [tabindex]";

function mapControls(container: HTMLElement): Element[] {
  const map = container.querySelector("[data-testid='geolocation-map']");
  expect(map).not.toBeNull();
  return [...(map as HTMLElement).querySelectorAll(mapControlSelector)];
}

function typeSearch(container: HTMLElement, text: string) {
  const input = searchInput(container);
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, { target: { value: text } });
}

/**
 * Recorded stock-Frappe Geolocation value: what
 * `JSON.stringify(editableLayers.toGeoJSON())` writes for a circle marker at
 * 37.7749,-122.4194. GeoJSON order is [lng, lat].
 */
const stockFrappePoint = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { point_type: 'circle', radius: 10 },
      geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
    },
  ],
});

/**
 * Stock Frappe's geolocation.js load path: JSON.parse then L.geoJSON. Compact
 * `{"lat","lng"}` parses as JSON but is not GeoJSON, so Leaflet adds nothing
 * and the desk field renders empty. A FeatureCollection with a Point is what
 * survives a round trip through both clients.
 */
function frappeGeoJsonReads(value: string): { lat: number; lng: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const collection = parsed as { type?: unknown; features?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return null;
  }
  for (const feature of collection.features) {
    if (!feature || typeof feature !== 'object') {
      continue;
    }
    const geometry = (feature as { geometry?: { type?: unknown; coordinates?: unknown } }).geometry;
    if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
      continue;
    }
    const [lng, lat] = geometry.coordinates as [unknown, unknown];
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      continue;
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }
    return { lat, lng };
  }
  return null;
}

describe('Geolocation', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<Geolocation label="Location" name="loc" locationIcon={locationIcon} />);
      expect(result.findTextElement('Location')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(
        <Geolocation label="Required" name="req" locationIcon={locationIcon} required />,
      );
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders bare without locationIcon — package default glyph on Locate', () => {
      const result = renderWithProviders(<Geolocation label="Bare" value={HELSINKI} />);
      const locate = result.container.querySelector("[aria-label='Locate']");
      expect(locate).not.toBeNull();
      expect(locate?.querySelector('svg')).not.toBeNull();
    });

    it.each(['light', 'dark'] as const)('paints the default Locate glyph with concrete %s ink', (scheme) => {
      const result = renderWithProviders(
        <Theme name={scheme}>
          <Geolocation label="Location" value={HELSINKI} />
        </Theme>,
      );
      const glyph = result.container.querySelector("[aria-label='Locate'] svg")!;
      const color = glyph.getAttribute('fill');
      expect(color).toMatch(/^(#|rgb|hsl)/);
      expect(color).not.toBe('currentColor');
    });

    it('preserves explicit Locate glyph paint and an explicit null glyph', () => {
      const result = renderWithProviders(
        <Geolocation label="Location" value={HELSINKI} locationIcon=<NavigationArrowIcon color="#123456" /> />,
      );
      expect(result.container.querySelector("[aria-label='Locate'] svg")?.getAttribute('fill')).toBe('#123456');
      result.rerender(<Geolocation label="Location" value={HELSINKI} locationIcon={null} />);
      expect(result.container.querySelector("[aria-label='Locate']")).not.toBeNull();
      expect(result.container.querySelector("[aria-label='Locate'] svg")).toBeNull();
    });

    it('empty state teaches three paths and labels Use my current location', () => {
      const result = renderWithProviders(<Geolocation label="Location" />);
      expect(result.container.textContent).not.toContain('0.00000, 0.00000');
      expect(result.container.textContent).toContain('No location set');
      expect(result.container.textContent).toContain('Use my current location');
      expect(result.container.textContent).toContain('Search, tap the map, or use your location.');
      expect(searchInput(result.container)).not.toBeNull();
    });

    it('no input control is absolutely positioned over the map surface', () => {
      const result = renderWithProviders(<Geolocation label="Location" value={HELSINKI} locationIcon={locationIcon} />);
      const map = result.container.querySelector("[data-testid='geolocation-map']");
      expect(map).not.toBeNull();
      const inputs = [...result.container.querySelectorAll('input')];
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(map?.contains(input)).toBe(false);
      }
      expect(result.container.querySelector("[data-testid='geolocation-coords-chip']")).toBeNull();
    });

    it.each([
      ['a set value', HELSINKI],
      ['the empty state', ''],
    ])('with %s, nothing interactive sits on the map; the controls live below it', (_, value) => {
      const result = renderWithProviders(
        <Geolocation
          label="Location"
          value={value}
          geocode={mockGeocode()}
          locationIcon={locationIcon}
          expandIcon=<span data-testid="expand-icon" />
        />,
      );
      expect(mapControls(result.container)).toEqual([]);
      const map = result.container.querySelector("[data-testid='geolocation-map']") as HTMLElement;
      const footer = result.container.querySelector("[data-testid='geolocation-map-footer']") as HTMLElement;
      expect(footer).not.toBeNull();
      expect(map.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const locate = footer.querySelector(value ? "[aria-label='Locate']" : "[aria-label='Use my current location']");
      expect(locate).not.toBeNull();
      expect(locate?.textContent).toContain(value ? 'Locate' : 'Use my current location');
      expect(footer.querySelector("[aria-label='Expand map']")).not.toBeNull();
      expect(footer.querySelector("[data-testid='geolocation-coordline']")).not.toBeNull();
    });

    it('without an injected geocoder, search is disabled and map/manual paths stay', () => {
      const result = renderWithProviders(<Geolocation label="Location" value={HELSINKI} locationIcon={locationIcon} />);
      const input = searchInput(result.container);
      expect(input).not.toBeNull();
      expect(input?.disabled || input?.getAttribute('aria-disabled') === 'true').toBeTruthy();
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
      expect(result.container.querySelector("[data-testid='geolocation-coordline']")).not.toBeNull();
      expect(result.container.querySelector("[aria-label='Locate']")).not.toBeNull();
    });

    it('a set value renders a reverse-geocoded address, pair subordinate', async () => {
      const reverseGeocode = mockReverse();
      const result = renderWithProviders(
        <Geolocation label="Location" value={HELSINKI} reverseGeocode={reverseGeocode} locationIcon={locationIcon} />,
      );
      await waitFor(() => {
        expect(reverseGeocode).toHaveBeenCalledWith({ lat: 60.16952, lng: 24.93545 });
        expect(searchInput(result.container)?.value).toBe('Mannerheimintie 3, Kamppi, Helsinki, Finland');
      });
      expect(result.container.textContent).toContain('60.16952, 24.93545');
    });

    it('typing a place name produces a results panel; picking sets the value', async () => {
      const geocode = mockGeocode();
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} onChange={onChange} locationIcon={locationIcon} />,
      );
      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(geocode).toHaveBeenCalledWith({ query: 'manner' });
        expect(document.querySelector("[data-testid='geolocation-results']")).not.toBeNull();
        expect(document.body.textContent).toContain('Use my current location');
        expect(document.body.textContent).toContain('Mannerheimintie 3');
        expect(document.body.textContent).toContain('Kamppi, Helsinki, Finland');
      });
      fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']") as Element);
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(HELSINKI);
      });
      expect(searchInput(result.container)?.value).toBe('Mannerheimintie 3, Kamppi, Helsinki, Finland');
    });

    it('Use my current location is the first results row', async () => {
      const geocode = mockGeocode();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} locationIcon={locationIcon} />,
      );
      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(document.querySelector("[data-testid='geolocation-results']")).not.toBeNull();
      });
      const list = document.querySelector("[data-testid='geolocation-results']") as HTMLElement;
      const first = list.firstElementChild as HTMLElement;
      expect(first.getAttribute('data-testid')).toBe('geolocation-use-location');
      expect(first.textContent).toContain('Use my current location');
    });

    it('zero-results and geocoder failure leave the map and coordinates working', async () => {
      const geocode = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('down'));
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} onChange={onChange} locationIcon={locationIcon} />,
      );
      typeSearch(result.container, 'mannerheimintei');
      await waitFor(() => {
        expect(document.body.textContent).toContain('No places match "mannerheimintei"');
      });
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();

      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(document.body.textContent).toContain('Search is unavailable — check your connection');
      });

      const pick = result.container.querySelector("[data-testid='geolocation-map-pick']") as HTMLElement;
      pick.getBoundingClientRect = () =>
        ({
          width: 200,
          height: 200,
          left: 0,
          top: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      fireEvent.click(pick, { clientX: 100, clientY: 100 });
      expect(onChange).toHaveBeenCalled();
    });

    it('after a geocoder failure the coordinate editor still commits', async () => {
      const geocode = vi.fn().mockRejectedValue(new Error('down'));
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} onChange={onChange} locationIcon={locationIcon} />,
      );
      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(document.body.textContent).toContain('Search is unavailable — check your connection');
      });
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(result.container.querySelector("[aria-label='Edit coordinates']") as Element);
      const lat = await waitFor(() => {
        const input = document.querySelector("input[aria-label='Latitude']");
        expect(input).not.toBeNull();
        return input as HTMLInputElement;
      });
      fireEvent.change(lat, { target: { value: '12.5' } });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 12.5, lng: 0 }));
      });
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
    });

    it('a typed lat, lng pair offers the exact point', async () => {
      const geocode = mockGeocode();
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} onChange={onChange} locationIcon={locationIcon} />,
      );
      typeSearch(result.container, '60.169, 24.935');
      await waitFor(() => {
        expect(document.body.textContent).toContain('Go to 60.16900, 24.93500');
        expect(document.body.textContent).toContain('Exact coordinates — no address');
      });
      expect(geocode).not.toHaveBeenCalled();
      fireEvent.click(document.querySelector("[data-testid='geolocation-coord-result']")!);
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 60.169, lng: 24.935 }));
      });
    });

    it('inTableCell renders a TEXT face inside the row rhythm, never the map', async () => {
      const reverseGeocode = mockReverse();
      const result = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
          <Geolocation label="Location" value={HELSINKI} reverseGeocode={reverseGeocode} locationIcon={locationIcon} />
        </TableCellContext.Provider>,
      );
      expect(result.container.querySelector("[data-testid='geolocation-map']")).toBeNull();
      expect(result.container.querySelector("[data-testid='geolocation-cell-face']")).not.toBeNull();
      await waitFor(() => {
        expect(result.container.textContent).toContain('Mannerheimintie 3, Kamppi, Helsinki, Finland');
      });
    });

    it('at <=640 the results panel is a sheet with a pinned search row', async () => {
      const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
      window.dispatchEvent(new Event('resize'));
      const geocode = mockGeocode();
      const result = renderWithProviders(
        <Geolocation label="Location" geocode={geocode} locationIcon={locationIcon} />,
      );
      expect(
        result.container.querySelector("[data-testid='geolocation-search-anchor']")?.getAttribute('data-sheet'),
      ).toBe('true');
      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(geocode).toHaveBeenCalled();
      });
      await waitFor(() => {
        const sheet =
          document.querySelector("[data-testid='geolocation-results-sheet']") ??
          document.querySelector("[role='dialog']");
        expect(sheet).not.toBeNull();
        expect(
          sheet?.querySelector("[aria-label='Search for a location']") ??
            document.querySelector("[data-testid='geolocation-search']"),
        ).not.toBeNull();
        expect(document.querySelector("[data-testid='geolocation-results']")).not.toBeNull();
      });
      width.mockRestore();
    });

    it('map frame is the keyboard stop; pick layer is not a tab stop', () => {
      const result = renderWithProviders(<Geolocation label="Location" value={HELSINKI} locationIcon={locationIcon} />);
      const map = result.container.querySelector("[data-testid='geolocation-map']");
      const pick = result.container.querySelector("[data-testid='geolocation-map-pick']");
      expect(map?.getAttribute('tabindex')).toBe('0');
      expect(pick?.getAttribute('tabindex')).toBeNull();
      expect(result.container.querySelector('iframe')).toBeNull();
    });

    it('clicking the map pick layer commits a coordinate', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation
          label="Location"
          value={JSON.stringify({ lat: 0, lng: 0 })}
          onChange={onChange}
          locationIcon={locationIcon}
        />,
      );
      const pick = result.container.querySelector("[data-testid='geolocation-map-pick']") as HTMLElement;
      expect(pick).not.toBeNull();
      pick.getBoundingClientRect = () =>
        ({
          width: 200,
          height: 200,
          left: 0,
          top: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      fireEvent.click(pick, { clientX: 100, clientY: 100 });
      expect(onChange).toHaveBeenCalled();
      const parsed = JSON.parse(onChange.mock.calls[0][0] as string) as {
        lat: number;
        lng: number;
      };
      expect(parsed.lat).toBeCloseTo(0, 4);
      expect(parsed.lng).toBeCloseTo(0, 4);
    });

    it('arrow keys nudge the pin when the map is focused', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation
          label="Location"
          value={JSON.stringify({ lat: 10, lng: 20 })}
          onChange={onChange}
          locationIcon={locationIcon}
        />,
      );
      const map = result.container.querySelector("[data-testid='geolocation-map']") as HTMLElement;
      fireEvent.keyDown(map, { key: 'ArrowUp' });
      expect(onChange).toHaveBeenCalled();
      const parsed = JSON.parse(onChange.mock.calls[0][0] as string) as {
        lat: number;
        lng: number;
      };
      expect(parsed.lat).toBeGreaterThan(10);
      expect(parsed.lng).toBe(20);
    });

    it('coordinates FloatingPanel commits live — no Apply button', async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation
          label="Location"
          name="loc"
          locationIcon={locationIcon}
          value={JSON.stringify({ lat: 10, lng: 20 })}
          onChange={onChange}
        />,
      );
      fireEvent.click(result.container.querySelector("[aria-label='Edit coordinates']") as Element);
      await waitFor(() => {
        expect(document.querySelector("[data-testid='geolocation-coords-panel']")).not.toBeNull();
      });
      expect(document.querySelector("[aria-label='Apply coordinates']")).toBeNull();
      expect(document.querySelector("[aria-label='Cancel coordinates']")).toBeNull();
      expect(document.body.textContent).not.toMatch(/\bApply\b/);
      expect(document.body.textContent).not.toMatch(/\bCancel\b/);
      expect(document.body.textContent).not.toMatch(/\bDone\b/);

      const latInput = document.querySelector("input[aria-label='Latitude']") as HTMLInputElement;
      const lngInput = document.querySelector("input[aria-label='Longitude']") as HTMLInputElement;
      expect(latInput).not.toBeNull();
      expect(lngInput).not.toBeNull();

      fireEvent.change(latInput, { target: { value: '12.34' } });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 12.34, lng: 20 }));
      });
      fireEvent.change(lngInput, { target: { value: '56.78' } });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: 12.34, lng: 56.78 }));
      });
    });

    it('renders with helper text', () => {
      const result = renderWithProviders(
        <Geolocation label="Location" name="loc" locationIcon={locationIcon} helperText="Pick a point" />,
      );
      expect(result.findTextElement('Pick a point')).toBeDefined();
    });

    it('renders skeleton placeholder as search + map', () => {
      const result = renderWithProviders(<Geolocation label="Loading" name="l" locationIcon={locationIcon} skeleton />);
      expect(result.container.querySelector("[data-testid='geolocation-map']")).toBeNull();
      expect(result.container.querySelector("[aria-label='Locate']")).toBeNull();
      expect(result.container.querySelector('input')).toBeNull();
    });

    describe('disabled opens no overlay', () => {
      const expandIcon = <span data-testid="expand-icon" />;
      const value = JSON.stringify({ lat: 51.5, lng: -0.12 });

      const press = (el: Element) => {
        fireEvent.mouseDown(el);
        fireEvent.mouseUp(el);
        fireEvent.click(el);
      };

      it('enabled: Expand opens the map popup (positive control)', async () => {
        const result = renderWithProviders(
          <Geolocation label="Location" name="loc" locationIcon={locationIcon} expandIcon={expandIcon} value={value} />,
        );
        press(result.container.querySelector("[aria-label='Expand map']") as Element);
        await waitFor(() => {
          expect(document.querySelector("[role='dialog'][data-state='open']")).not.toBeNull();
        });
      });

      it('disabled: Expand opens nothing', async () => {
        const result = renderWithProviders(
          <Geolocation
            label="Location"
            name="loc"
            locationIcon={locationIcon}
            expandIcon={expandIcon}
            value={value}
            disabled
          />,
        );
        const expand = result.container.querySelector("[aria-label='Expand map']");
        expect(expand).not.toBeNull();
        press(expand as Element);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(document.querySelector("[role='dialog'][data-state='open']")).toBeNull();
      });

      it('disabled: Coordinates opens no panel', async () => {
        const result = renderWithProviders(
          <Geolocation label="Location" name="loc" locationIcon={locationIcon} value={value} disabled />,
        );
        const line = result.container.querySelector("[data-testid='geolocation-coordline']");
        expect(line).not.toBeNull();
        press(line as Element);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(document.querySelector("[data-testid='geolocation-coords-panel']")).toBeNull();
        expect(document.querySelector("[data-testid='floating-panel-viewport']")).toBeNull();
      });
    });

    it('renders readOnly — address as fact, no search, no locate', async () => {
      const reverseGeocode = mockReverse();
      const result = renderWithProviders(
        <Geolocation
          label="ReadOnly"
          name="r"
          locationIcon={locationIcon}
          readOnly
          value={HELSINKI}
          reverseGeocode={reverseGeocode}
        />,
      );
      expect(searchInput(result.container)).toBeNull();
      expect(result.container.querySelector("[aria-label='Locate']")).toBeNull();
      expect(result.container.querySelector("[aria-label='Edit coordinates']")).toBeNull();
      expect(result.container.querySelector("[data-testid='geolocation-readonly-address']")).not.toBeNull();
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
      await waitFor(() => {
        expect(result.container.textContent).toContain('Mannerheimintie 3, Kamppi, Helsinki, Finland');
      });
    });
  });

  describe('GeocoderProvider', () => {
    const provided: Geocoder = {
      geocode: mockGeocode(),
      reverseGeocode: mockReverse(),
    };

    it('hands its geocoder to a field that was given none', async () => {
      const result = renderWithProviders(
        <GeocoderProvider geocoder={provided}>
          <Geolocation label="Location" value={HELSINKI} locationIcon={locationIcon} />
        </GeocoderProvider>,
      );
      await waitFor(() => {
        expect(searchInput(result.container)?.value).toBe('Mannerheimintie 3, Kamppi, Helsinki, Finland');
      });
      expect(searchInput(result.container)?.disabled).toBe(false);
      typeSearch(result.container, 'manner');
      await waitFor(() => {
        expect(provided.geocode).toHaveBeenCalledWith({ query: 'manner' });
      });
    });

    it("loses to the field's own props, and geocoder={null} opts out", async () => {
      const own = mockReverse({ ...mannerheim, label: 'Own provider', description: undefined });
      const result = renderWithProviders(
        <GeocoderProvider geocoder={provided}>
          <Geolocation label="Own" value={HELSINKI} reverseGeocode={own} locationIcon={locationIcon} />
          <Geolocation label="None" value={HELSINKI} geocoder={null} locationIcon={locationIcon} />
        </GeocoderProvider>,
      );
      const inputs = () =>
        [...result.container.querySelectorAll("[data-testid='geolocation-search']")] as HTMLInputElement[];
      await waitFor(() => {
        expect(inputs()[0].value).toBe('Own provider');
      });
      expect(inputs()[1].value).toBe('');
      expect(inputs()[1].disabled).toBe(true);
    });
  });

  describe('geolocation pre-flight', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('preflightGeolocation fails when no geolocation capability exists', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: undefined,
        permissions: undefined,
      });
      const result = await preflightGeolocation();
      expect(result).toEqual({
        ok: false,
        reason: expect.stringContaining('Geolocation unavailable'),
      });
    });

    it('preflightGeolocation fails when permission is hard-denied', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: { getCurrentPosition: vi.fn() },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'denied' }),
        },
      });
      const result = await preflightGeolocation();
      expect(result).toEqual({
        ok: false,
        reason: expect.stringContaining('permission denied'),
      });
    });

    it('preflightGeolocation passes when permission is prompt', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: { getCurrentPosition: vi.fn() },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'prompt' }),
        },
      });
      const result = await preflightGeolocation();
      expect(result).toEqual({ ok: true });
    });

    it('locate press without geolocation shows inline error and never mounts the locate panel', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: undefined,
        permissions: undefined,
      });
      const result = renderWithProviders(<Geolocation label="Location" name="loc" locationIcon={locationIcon} />);
      const button = result.container.querySelector("[aria-label='Use my current location']");
      expect(button).not.toBeNull();
      fireEvent.click(button as Element);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Geolocation unavailable');
      });
      expect(result.container.querySelector("[data-testid='geolocation-locate-panel']")).toBeNull();
      expect((button as HTMLElement).getAttribute('aria-disabled')).not.toBe('true');
    });

    it('denied permission pre-flight shows inline error without mounting locate panel', async () => {
      const getCurrentPosition = vi.fn();
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: { getCurrentPosition },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'denied' }),
        },
      });
      const result = renderWithProviders(<Geolocation label="Location" name="loc" locationIcon={locationIcon} />);
      fireEvent.click(result.container.querySelector("[aria-label='Use my current location']")!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('permission denied');
      });
      expect(result.container.querySelector("[data-testid='geolocation-locate-panel']")).toBeNull();
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('post-preflight failure keeps the locate panel open with Retry', async () => {
      const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.({
          code: 3,
          message: 'Timeout expired',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      });
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: { getCurrentPosition },
        permissions: {
          query: vi.fn().mockResolvedValue({ state: 'granted' }),
        },
      });

      const result = renderWithProviders(<Geolocation label="Location" name="loc" locationIcon={locationIcon} />);
      fireEvent.click(result.container.querySelector("[aria-label='Use my current location']")!);

      await waitFor(() => {
        expect(result.container.querySelector("[data-testid='geolocation-locate-panel']")).not.toBeNull();
        expect(result.container.textContent).toContain('timed out');
      });
      expect(mapControls(result.container)).toEqual([]);
      const retry = result.container.querySelector("[aria-label='Retry location']");
      expect(retry).not.toBeNull();
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);

      fireEvent.click(retry as Element);
      await waitFor(() => {
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
      });
      expect(result.container.querySelector("[data-testid='geolocation-locate-panel']")).not.toBeNull();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { loc: JSON.stringify({ lat: 0, lng: 0 }) } }} submitText="Submit">
          <Geolocation name="loc" label="Location" locationIcon={locationIcon} />
        </Form>,
      );
      expect(result.findTextElement('Location')).toBeDefined();
    });
  });

  describe('stock Frappe FeatureCollection', () => {
    it('paints a recorded stock value instead of rendering empty', () => {
      const result = renderWithProviders(
        <Geolocation label="Location" value={stockFrappePoint} locationIcon={locationIcon} />,
      );
      expect(result.container.textContent).toContain('37.77490, -122.41940');
      expect(result.container.textContent).not.toContain('Set location');
      expect(result.container.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
    });

    it("a compact {lat,lng} write is invisible to Frappe's parser (negative control)", () => {
      expect(frappeGeoJsonReads(JSON.stringify({ lat: 37.7749, lng: -122.4194 }))).toBeNull();
      expect(frappeGeoJsonReads(stockFrappePoint)).toEqual({ lat: 37.7749, lng: -122.4194 });
    });

    it("editing a stock value still reads in Frappe's parser and keeps properties", async () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" locationIcon={locationIcon} value={stockFrappePoint} onChange={onChange} />,
      );
      fireEvent.click(result.container.querySelector("[aria-label='Edit coordinates']") as Element);
      await waitFor(() => {
        expect(document.querySelector("[data-testid='geolocation-coords-panel']")).not.toBeNull();
      });
      const latInput = document.querySelector("input[aria-label='Latitude']") as HTMLInputElement;
      expect(latInput).not.toBeNull();
      fireEvent.change(latInput, { target: { value: '12.34' } });
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
      const written = onChange.mock.calls[0][0] as string;
      expect(JSON.parse(written).type).toBe('FeatureCollection');
      expect(frappeGeoJsonReads(written)).toEqual({ lat: 12.34, lng: -122.4194 });
      expect(JSON.parse(written).features[0].properties).toEqual({
        point_type: 'circle',
        radius: 10,
      });
    });

    it('map pick on a stock value writes FeatureCollection, not compact latlng', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Geolocation label="Location" value={stockFrappePoint} onChange={onChange} locationIcon={locationIcon} />,
      );
      const pick = result.container.querySelector("[data-testid='geolocation-map-pick']") as HTMLElement;
      expect(pick).not.toBeNull();
      pick.getBoundingClientRect = () =>
        ({
          width: 200,
          height: 200,
          left: 0,
          top: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON() {},
        }) as DOMRect;
      fireEvent.click(pick, { clientX: 150, clientY: 50 });
      expect(onChange).toHaveBeenCalled();
      const written = onChange.mock.calls[0][0] as string;
      expect(JSON.parse(written).type).toBe('FeatureCollection');
      const read = frappeGeoJsonReads(written);
      expect(read).not.toBeNull();
      expect(read?.lat).not.toBeCloseTo(37.7749, 3);
    });
  });
});

describe('Geolocation search opens on intent, not on focus', () => {
  const resultsPanel = () => document.querySelector("[data-testid='geolocation-results']");

  it("a focus alone, as a cell editor's focus-into-panel gives, leaves the results closed", async () => {
    const result = renderWithProviders(
      <Geolocation label="Location" geocode={mockGeocode()} locationIcon={locationIcon} />,
    );
    const input = searchInput(result.container) as HTMLInputElement;
    input.focus();
    fireEvent.focus(input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(resultsPanel()).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('a press on the search still opens the results with Use my current location first', async () => {
    const result = renderWithProviders(
      <Geolocation label="Location" geocode={mockGeocode()} locationIcon={locationIcon} />,
    );
    fireEvent.click(searchInput(result.container) as HTMLInputElement);
    await waitFor(() => {
      expect(resultsPanel()).not.toBeNull();
    });
    expect((resultsPanel() as HTMLElement).firstElementChild?.getAttribute('data-testid')).toBe(
      'geolocation-use-location',
    );
  });

  it('ArrowDown on a focused search opens the results', async () => {
    const result = renderWithProviders(
      <Geolocation label="Location" geocode={mockGeocode()} locationIcon={locationIcon} />,
    );
    const input = searchInput(result.container) as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(resultsPanel()).not.toBeNull();
    });
  });
});
