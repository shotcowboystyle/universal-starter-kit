/**
 * MPO-237: a `dataSource` with no `baseURL` in scope is a misconfiguration,
 * not static mode. The card asked for a computed figure and there is nowhere
 * to compute it, so `config.value` must never be painted as the KPI: a wrong
 * number presented confidently is worse than a visible gap, because nothing
 * downstream can tell it was never computed.
 *
 * Static mode (no `dataSource` at all) is the documented, intended path and
 * is asserted here too, so the fix cannot over-correct into it.
 */

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeKPICard } from './FrappeKPICard';
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

const config = { id: 'open-todos', title: 'Open ToDos', value: 999, format: 'number' as const };

describe('FrappeKPICard with a dataSource and no baseURL (MPO-237)', () => {
  it('does not render config.value as though it were the computed figure', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeKPICard
        config={config}
        dataSource={{ doctype: 'ToDo' }}
      />,
    );

    expect(screen.queryByText('999')).toBeNull();
    expect(screen.getByText('Open ToDos is not configured')).toBeInTheDocument();
    expect(screen.getByText(/no Frappe baseURL is in scope/)).toBeInTheDocument();
  });

  it('logs a development warning naming the missing baseURL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeKPICard
        config={config}
        dataSource={{ doctype: 'ToDo' }}
      />,
    );

    const line = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(line).toContain('[frappe-ui] kpi-datasource-without-baseurl');
    expect(line).toContain('baseURL');
    expect(line).toContain('component=FrappeKPICard');
    expect(line).toContain('id=open-todos');
    expect(line).toContain('doctype=ToDo');
  });

  it('warns once per card, not once per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = renderWithProviders(
      <FrappeKPICard
        config={config}
        dataSource={{ doctype: 'ToDo' }}
      />,
    );
    rerender(
      <FrappeKPICard
        config={{ ...config }}
        dataSource={{ doctype: 'ToDo' }}
      />,
    );
    rerender(
      <FrappeKPICard
        config={{ ...config }}
        dataSource={{ doctype: 'ToDo' }}
      />,
    );

    const lines = warn.mock.calls.filter((call) => String(call[0]).includes('kpi-datasource-without-baseurl'));
    expect(lines).toHaveLength(1);
  });

  it('stays silent in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      renderWithProviders(
        <FrappeKPICard
          config={config}
          dataSource={{ doctype: 'ToDo' }}
        />,
      );
    } finally {
      process.env.NODE_ENV = previous;
    }

    expect(warn.mock.calls.filter((call) => String(call[0]).includes('kpi-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });
});

describe('FrappeKPICard configured paths stay untouched (MPO-237)', () => {
  it('renders config.value with no warning when no dataSource is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(<FrappeKPICard config={config} />);

    expect(screen.getByText('999')).toBeInTheDocument();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('kpi-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });

  it('computes the figure, and does not warn, when the provider supplies a baseURL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeProvider
        baseURL="http://test"
        fixtures={
          new InMemoryFixtureProvider({
            ToDo: [
              { name: 'TD-1', doctype: 'ToDo', status: 'Open' },
              { name: 'TD-2', doctype: 'ToDo', status: 'Open' },
            ],
          })
        }>
        <FrappeKPICard
          config={config}
          dataSource={{ doctype: 'ToDo' }}
        />
      </FrappeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(screen.queryByText('999')).toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('kpi-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });

  it('treats a fixture corpus as the data source when no baseURL is set (MPO-228)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithProviders(
      <FrappeProvider
        fixtures={
          new InMemoryFixtureProvider({
            ToDo: [
              { name: 'TD-1', doctype: 'ToDo', status: 'Open' },
              { name: 'TD-2', doctype: 'ToDo', status: 'Open' },
            ],
          })
        }>
        <FrappeKPICard
          config={config}
          dataSource={{ doctype: 'ToDo' }}
        />
      </FrappeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
    expect(screen.queryByText('999')).toBeNull();
    expect(screen.queryByText('Open ToDos is not configured')).toBeNull();
    expect(warn.mock.calls.filter((call) => String(call[0]).includes('kpi-datasource-without-baseurl'))).toHaveLength(
      0,
    );
  });
});
