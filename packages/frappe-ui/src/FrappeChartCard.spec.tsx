/**
 * MPO-287: a `dataSource` with no data source in scope is a misconfiguration,
 * not static mode — the same defect MPO-237 fixed one component over. The
 * card asked for a computed series and there is nowhere to compute it, so
 * `config.data` must never be painted as the series: a plausible shape
 * presented confidently is worse than a visible gap, because nothing
 * downstream can tell it was never computed.
 *
 * Static mode (no `dataSource` at all) is the documented, intended path and
 * is asserted here too, so the fix cannot over-correct into it. A fixture
 * corpus is a data source (MPO-228), so it stands in for a baseURL and must
 * not trip the guard.
 *
 * The chart body itself is not assertable here: ChartSurface measures its
 * own width through `onLayout`, which never fires in happy-dom, so no SVG
 * reaches the DOM. Two things stand in. The card's plain title renders only
 * when a series reached `ChartCard` — the skeleton, the empty surface and
 * the not-configured surface each carry different text. And `formatLabel`
 * is called once per computed group, so spying on it proves whether the
 * aggregate ran at all.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeChartCard } from './FrappeChartCard';
import { FrappeProvider } from './FrappeProvider';
import { __resetFrappeDevWarnSeen } from './shared/devWarn';

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  __resetFrappeDevWarnSeen();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const config = {
  id: 'todo-by-status',
  title: 'ToDos by Status',
  type: 'bar' as const,
  data: [
    { label: 'Open', value: 41 },
    { label: 'Closed', value: 7 },
  ],
};

const dataSource = { doctype: 'ToDo', groupBy: 'status' };

const todos = [
  { name: 'TD-1', doctype: 'ToDo', status: 'Open' },
  { name: 'TD-2', doctype: 'ToDo', status: 'Open' },
  { name: 'TD-3', doctype: 'ToDo', status: 'Closed' },
];

describe('FrappeChartCard with a dataSource and no baseURL (MPO-287)', () => {
  it('does not render config.data as though it were the computed series', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeChartCard
        config={config}
        dataSource={dataSource}
      />,
    );

    expect(screen.queryByText('ToDos by Status')).toBeNull();
    expect(screen.getByText('ToDos by Status is not configured')).toBeInTheDocument();
    expect(screen.getByText(/no Frappe baseURL is in scope/)).toBeInTheDocument();
  });

  it('logs a development warning naming the missing baseURL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeChartCard
        config={config}
        dataSource={dataSource}
      />,
    );

    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('[frappe-ui] chart-datasource-without-baseurl');
    expect(line).toContain('baseURL');
    expect(line).toContain('component=FrappeChartCard');
    expect(line).toContain('id=todo-by-status');
    expect(line).toContain('doctype=ToDo');
  });

  it('warns once per card, not once per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderWithProviders(
      <FrappeChartCard
        config={config}
        dataSource={dataSource}
      />,
    );
    rerender(
      <FrappeChartCard
        config={{ ...config }}
        dataSource={dataSource}
      />,
    );
    rerender(
      <FrappeChartCard
        config={{ ...config }}
        dataSource={dataSource}
      />,
    );

    const lines = warn.mock.calls.filter((call) => String(call[0]).includes('chart-datasource-without-baseurl'));
    expect(lines).toHaveLength(1);
  });

  it('stays silent in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      renderWithProviders(
        <FrappeChartCard
          config={config}
          dataSource={dataSource}
        />,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }

    expect(warn.mock.calls.filter((call) => String(call[0]).includes('chart-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });
});

describe('FrappeChartCard configured paths stay untouched (MPO-287)', () => {
  it('renders config.data with no warning when no dataSource is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(<FrappeChartCard config={config} />);

    expect(screen.getByText('ToDos by Status')).toBeInTheDocument();
    expect(screen.queryByText('ToDos by Status is not configured')).toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('chart-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });

  it('computes the series, and does not warn, when the provider supplies a baseURL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const formatLabel = vi.fn((label: string) => label);
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={new InMemoryFixtureProvider({ ToDo: todos })}>
        <FrappeChartCard
          config={config}
          dataSource={{ ...dataSource, formatLabel }}
        />
      </FrappeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('ToDos by Status')).toBeInTheDocument();
    });
    expect([...new Set(formatLabel.mock.calls.map((call) => call[0]))].sort()).toEqual(['Closed', 'Open']);
    expect(screen.queryByText('ToDos by Status is not configured')).toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('chart-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });

  it('treats a fixture corpus as the data source when no baseURL is set (MPO-228)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const formatLabel = vi.fn((label: string) => label);
    renderWithProviders(
      <FrappeProvider fixtures={new InMemoryFixtureProvider({ ToDo: todos })}>
        <FrappeChartCard
          config={config}
          dataSource={{ ...dataSource, formatLabel }}
        />
      </FrappeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('ToDos by Status')).toBeInTheDocument();
    });
    expect([...new Set(formatLabel.mock.calls.map((call) => call[0]))].sort()).toEqual(['Closed', 'Open']);
    expect(screen.queryByText('ToDos by Status is not configured')).toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('chart-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });
});
