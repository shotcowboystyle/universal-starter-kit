import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableCellContext } from '../../shared/table-cell-context';

import type { GeocodeFn, GeocodeResult, ReverseGeocodeFn } from './geocoder';

import { Geolocation } from './index';
import type { GeolocationProps } from './index';

const place = { lat: 60.16952, lng: 24.93545, label: 'Helsinki' };
const sydney = { lat: -33.8688, lng: 151.2093, label: 'Sydney' };
const helsinkiValue = JSON.stringify({ lat: place.lat, lng: place.lng });
const sydneyValue = JSON.stringify({ lat: sydney.lat, lng: sydney.lng });
const boundMap = ({ lat, lng }: { lat: number; lng: number }) => <span data-testid="bound-map">{`${lat},${lng}`}</span>;
const original = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { point_type: 'circle', radius: 10 },
      geometry: { type: 'Point', coordinates: [20, 10] },
    },
    {
      type: 'Feature',
      properties: { name: 'route' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
    },
  ],
});

const input = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("[aria-label='Search for a location']")!;
const deferred = <T,>() => {
  let settle!: (value: T) => void;
  // oxlint-disable-next-line promise/avoid-new -- a test deferred hands its resolver out of the executor
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
};

const editableOutsideCell = { inTableCell: false, isHeader: false, editable: true };
const editableInCell = { inTableCell: true, isHeader: false, editable: true };
const readOnlyOutsideCell = { inTableCell: false, isHeader: false, editable: false };
const readOnlyInCell = { inTableCell: true, isHeader: false, editable: false };
const Controlled = (props: GeolocationProps) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Geolocation
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      renderMap={({ lat, lng }) => (
        <span data-testid="map-center">
          {lat},{lng}
        </span>
      )}
    />
  );
};

describe('Geolocation salvage regressions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])('does not display a rejected controlled pick as fact (cell=%s)', async (cell) => {
    const onChange = vi.fn<(value: string) => void>();
    const props = {
      value: helsinkiValue,
      geocode: async () => [sydney],
      onChange,
      renderMap: boundMap,
    };
    const result = renderWithProviders(
      <TableCellContext.Provider value={editableOutsideCell}>
        <Geolocation {...props} />
      </TableCellContext.Provider>,
    );
    fireEvent.change(input(result.container), { target: { value: 'Sydney' } });
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-result-0']")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']")!);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(sydneyValue);
    expect(input(result.container).value).toBe('Sydney');
    result.rerender(
      <TableCellContext.Provider value={cell ? readOnlyInCell : readOnlyOutsideCell}>
        <Geolocation
          {...props}
          readOnly
        />
      </TableCellContext.Provider>,
    );
    const face = result.getByTestId(cell ? 'geolocation-cell-face' : 'geolocation-readonly-address');
    expect(face.textContent).toBe('60.16952, 24.93545');
    const boundMapText = cell ? null : result.getByTestId('bound-map').textContent;
    expect(boundMapText).toBe(cell ? null : '60.16952,24.93545');
  });

  it("shows the current pair while a new controlled value's address is pending", async () => {
    const pending = deferred<GeocodeResult | null>();
    const reverseGeocode = vi.fn<ReverseGeocodeFn>(async ({ lat }) =>
      lat === place.lat ? await Promise.resolve(place) : await pending.promise,
    );
    const props = { value: helsinkiValue, readOnly: true, reverseGeocode, renderMap: boundMap };
    const result = renderWithProviders(<Geolocation {...props} />);
    await waitFor(() => {
      expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('Helsinki');
    });
    result.rerender(
      <Geolocation
        {...props}
        value={sydneyValue}
      />,
    );
    expect(result.getByTestId('bound-map').textContent).toBe('-33.8688,151.2093');
    expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('-33.86880, 151.20930');
    await waitFor(() => {
      expect(reverseGeocode).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      pending.resolve(sydney);
    });
    expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('Sydney');
  });

  it("keeps the bound pair's resolved address when a different pick is rejected", async () => {
    const props = {
      value: helsinkiValue,
      geocode: async () => [sydney],
      reverseGeocode: async () => place,
      renderMap: boundMap,
    };
    const result = renderWithProviders(<Geolocation {...props} />);
    await waitFor(() => {
      expect(input(result.container).value).toBe('Helsinki');
    });
    fireEvent.change(input(result.container), { target: { value: 'Sydney' } });
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-result-0']")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']")!);
    result.rerender(
      <Geolocation
        {...props}
        readOnly
      />,
    );
    expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('Helsinki');
    expect(result.getByTestId('bound-map').textContent).toBe('60.16952,24.93545');
  });

  it('uses a picked address only after delayed acceptance and preserves a later typed draft', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const props = {
      value: helsinkiValue,
      geocode: async () => [sydney],
      onChange,
      renderMap: boundMap,
    };
    const result = renderWithProviders(<Geolocation {...props} />);
    fireEvent.change(input(result.container), { target: { value: 'Sydney' } });
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-result-0']")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[data-testid='geolocation-result-0']")!);
    result.rerender(
      <Geolocation
        {...props}
        readOnly
      />,
    );
    expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('60.16952, 24.93545');
    result.rerender(<Geolocation {...props} />);
    fireEvent.change(input(result.container), { target: { value: 'another draft' } });
    result.rerender(
      <Geolocation
        {...props}
        value={sydneyValue}
      />,
    );
    expect(input(result.container).value).toBe('another draft');
    expect(result.getByTestId('bound-map').textContent).toBe('-33.8688,151.2093');
    result.rerender(
      <Geolocation
        {...props}
        value={sydneyValue}
        readOnly
      />,
    );
    expect(result.getByTestId('geolocation-readonly-address').textContent).toBe('Sydney');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(sydneyValue);
  });

  it('preserves a typed draft across new bound coordinates and their reverse response', async () => {
    const pending = deferred<GeocodeResult | null>();
    const reverseGeocode = async ({ lat }: { lat: number }) =>
      lat === place.lat ? await Promise.resolve(place) : await pending.promise;
    const props = {
      value: helsinkiValue,
      geocode: async () => [],
      reverseGeocode,
      renderMap: boundMap,
    };
    const result = renderWithProviders(<Geolocation {...props} />);
    await waitFor(() => {
      expect(input(result.container).value).toBe('Helsinki');
    });
    fireEvent.change(input(result.container), { target: { value: 'independent draft' } });
    result.rerender(
      <Geolocation
        {...props}
        value={sydneyValue}
      />,
    );
    expect(input(result.container).value).toBe('independent draft');
    await act(async () => {
      pending.resolve(sydney);
    });
    expect(input(result.container).value).toBe('independent draft');
  });

  it.each(['Helsinki', '60.16952, 24.93545'])(
    'preserves Frappe features when picking %s and pans the controlled map',
    async (query) => {
      const onChange = vi.fn<(value: string) => void>();
      const result = renderWithProviders(
        <Controlled
          value={original}
          geocode={async () => [place]}
          onChange={onChange}
        />,
      );
      fireEvent.change(input(result.container), { target: { value: query } });
      const selector = query === 'Helsinki' ? 'geolocation-result-0' : 'geolocation-coord-result';
      await waitFor(() => {
        expect(document.querySelector(`[data-testid='${selector}']`)).not.toBeNull();
      });
      fireEvent.click(document.querySelector(`[data-testid='${selector}']`)!);
      await waitFor(() => {
        expect(result.getByTestId('map-center').textContent).toBe('60.16952,24.93545');
      });
      const typedValue = query === 'Helsinki' ? input(result.container).value : null;
      expect(typedValue).toBe(query === 'Helsinki' ? 'Helsinki' : null);
      const value = JSON.parse(onChange.mock.calls[0][0]);
      expect(value.type).toBe('FeatureCollection');
      expect(value.features[0].geometry.coordinates).toStrictEqual([place.lng, place.lat]);
      expect(value.features[0].properties).toStrictEqual({ point_type: 'circle', radius: 10 });
      expect(value.features[1]).toStrictEqual(JSON.parse(original).features[1]);
    },
  );

  it('ignores search responses after the query is cleared', async () => {
    const pending = deferred<GeocodeResult[]>();
    const geocode = vi.fn<GeocodeFn>(async () => await pending.promise);
    const result = renderWithProviders(<Geolocation geocode={geocode} />);
    fireEvent.change(input(result.container), { target: { value: 'old' } });
    await waitFor(() => {
      expect(geocode).toHaveBeenCalledWith({ query: 'old' });
    });
    fireEvent.change(input(result.container), { target: { value: '' } });
    await act(async () => {
      pending.resolve([place]);
    });
    expect(document.querySelector("[data-testid='geolocation-result-0']")).toBeNull();
  });

  it('ignores reverse responses after clearing a controlled value', async () => {
    const pending = deferred<GeocodeResult | null>();
    const reverseGeocode = vi.fn<ReverseGeocodeFn>(async () => await pending.promise);
    const result = renderWithProviders(
      <Controlled
        value={original}
        geocode={async () => []}
        reverseGeocode={reverseGeocode}
      />,
    );
    await waitFor(() => {
      expect(reverseGeocode).toHaveBeenCalledWith({ lat: 10, lng: 20 });
    });
    fireEvent.change(input(result.container), { target: { value: 'clear me' } });
    fireEvent.click(result.container.querySelector("[aria-label='Clear location']")!);
    await act(async () => {
      pending.resolve(place);
    });
    expect(input(result.container).value).toBe('');
    expect(result.container.textContent).toContain('No location set');
  });

  it('leaves a typed query alone when a reverse response arrives', async () => {
    const pending = deferred<GeocodeResult | null>();
    const result = renderWithProviders(
      <Geolocation
        value={original}
        geocode={async () => []}
        reverseGeocode={async () => await pending.promise}
      />,
    );
    fireEvent.change(input(result.container), { target: { value: 'Sydney' } });
    await act(async () => {
      pending.resolve(place);
    });
    expect(input(result.container).value).toBe('Sydney');
  });

  it('allows manual coordinates on an empty field without a provider', async () => {
    const result = renderWithProviders(<Controlled />);
    const trigger = result.container.querySelector("[aria-label='Edit coordinates']");
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);
    await waitFor(() => {
      expect(document.querySelector("[aria-label='Latitude']")).not.toBeNull();
    });
    fireEvent.change(document.querySelector("[aria-label='Latitude']")!, {
      target: { value: '10' },
    });
    expect(result.getByTestId('map-center').textContent).toBe('10,0');
  });

  it('opens a cell editor with manual coordinates and commits without a provider', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <TableCellContext.Provider value={editableInCell}>
        <Controlled
          value={original}
          onChange={onChange}
        />
      </TableCellContext.Provider>,
    );
    expect(result.container.querySelector("[data-testid='geolocation-map']")).toBeNull();
    expect(result.getByTestId('geolocation-cell-face').tabIndex).toBe(0);
    fireEvent.keyDown(result.getByTestId('geolocation-cell-face'), { key: 'Enter' });
    await waitFor(() => {
      expect(document.querySelector("[aria-label='Edit coordinates']")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[aria-label='Edit coordinates']")!);
    await waitFor(() => {
      expect(document.querySelector("[aria-label='Latitude']")).not.toBeNull();
    });
    fireEvent.change(document.querySelector("[aria-label='Latitude']")!, {
      target: { value: '11' },
    });
    expect(JSON.parse(onChange.mock.calls[0][0]).features[0].geometry.coordinates).toStrictEqual([20, 11]);
  });

  it('selects a search result with the keyboard', async () => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Controlled
        geocode={async () => [place]}
        onChange={onChange}
      />,
    );
    fireEvent.change(input(result.container), { target: { value: 'Helsinki' } });
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-result-0']")).not.toBeNull();
    });
    const row = document.querySelector<HTMLElement>("[data-testid='geolocation-result-0']")!;
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ lat: place.lat, lng: place.lng }));
    await waitFor(() => {
      expect(document.querySelector("[data-testid='geolocation-results']")).toBeNull();
    });
    expect(document.activeElement).toBe(input(result.container));
  });

  it.each(['Enter', ' '])('clears the selected value from the keyboard with %s', async (key) => {
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Controlled
        value={original}
        geocode={async () => []}
        onChange={onChange}
      />,
    );
    fireEvent.change(input(result.container), { target: { value: 'clear me' } });
    const clear = result.container.querySelector<HTMLElement>("[aria-label='Clear location']")!;
    expect(clear.tabIndex).toBe(0);
    fireEvent.keyDown(clear, { key });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(input(result.container).value).toBe('');
    expect(result.getByTestId('map-center').textContent).toBe('0,0');
    expect(document.activeElement).toBe(input(result.container));
    await waitFor(() => {
      expect(result.container.textContent).toContain('No location set');
    });
  });

  it('keeps the cell editor exposed when its input receives initial focus', async () => {
    const result = renderWithProviders(
      <TableCellContext.Provider value={editableInCell}>
        <Controlled
          value={original}
          geocode={async () => [place]}
        />
      </TableCellContext.Provider>,
    );
    fireEvent.keyDown(result.getByTestId('geolocation-cell-face'), { key: 'Enter' });
    await waitFor(() => {
      expect(document.querySelector("[aria-label='Search for a location']")).not.toBeNull();
    });
    fireEvent.focus(document.querySelector("[aria-label='Search for a location']")!);
    expect(document.querySelector("[data-testid='geolocation-results']")).toBeNull();
    expect(document.querySelector("[data-testid='geolocation-map']")).not.toBeNull();
  });

  it('does not overwrite Clear with a pending Locate response', async () => {
    let locate!: PositionCallback;
    const getCurrentPosition = vi.fn<(onPosition: PositionCallback) => void>((onPosition) => {
      locate = onPosition;
    });
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: { query: async () => ({ state: 'granted' }) },
    });
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Controlled
        value={original}
        geocode={async () => []}
        onChange={onChange}
      />,
    );
    fireEvent.click(result.container.querySelector("[aria-label='Locate']")!);
    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.anything(), expect.anything());
    });
    fireEvent.change(input(result.container), { target: { value: 'clear' } });
    fireEvent.click(result.container.querySelector("[aria-label='Clear location']")!);
    await act(async () => {
      locate({ coords: { latitude: 50, longitude: 30 } } as GeolocationPosition);
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('Locate retains the stock Frappe shape and existing features', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (onPosition: PositionCallback) => {
          onPosition({ coords: { latitude: 50, longitude: 30 } } as GeolocationPosition);
        },
      },
      permissions: { query: async () => ({ state: 'granted' }) },
    });
    const onChange = vi.fn<(value: string) => void>();
    const result = renderWithProviders(
      <Controlled
        value={original}
        onChange={onChange}
      />,
    );
    fireEvent.click(result.container.querySelector("[aria-label='Locate']")!);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.any(String));
    });
    const value = JSON.parse(onChange.mock.calls[0][0]);
    expect(value.type).toBe('FeatureCollection');
    expect(value.features[0].geometry.coordinates).toStrictEqual([30, 50]);
    expect(value.features[0].properties).toStrictEqual(JSON.parse(original).features[0].properties);
    expect(value.features[1]).toStrictEqual(JSON.parse(original).features[1]);
  });

  it.each([false, true])('pins have explicit theme ink (cell=%s)', (cell) => {
    const field = (
      <Geolocation
        value={original}
        readOnly
      />
    );
    const result = renderWithProviders(
      cell ? <TableCellContext.Provider value={readOnlyInCell}>{field}</TableCellContext.Provider> : field,
    );
    const glyph = result.container.querySelector(
      "[data-testid='geolocation-cell-face'] svg, [data-testid='geolocation-readonly-address'] svg",
    );
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('fill')).toBeTruthy();
    expect(glyph?.getAttribute('fill')).not.toBe('currentColor');
  });
});
